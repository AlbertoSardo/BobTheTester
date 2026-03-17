import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { findRepositoryRoot, loadToolingConfig, resolveFromRepoRoot } from "../config.js";
import type { RunCypressInput, RunCypressOutput } from "../types.js";

interface CommandExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
}

interface MochaStats {
  suites?: number;
  tests?: number;
  passes?: number;
  pending?: number;
  failures?: number;
  duration?: number;
  start?: string;
  end?: string;
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function maybeParseJson(value: string): unknown | undefined {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

function findMatchingJsonBlocks(stdout: string): Record<string, unknown>[] {
  const matches: Record<string, unknown>[] = [];

  for (let start = 0; start < stdout.length; start += 1) {
    if (stdout[start] !== "{") {
      continue;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = start; index < stdout.length; index += 1) {
      const char = stdout[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (char === "\\") {
          escaped = true;
        } else if (char === '"') {
          inString = false;
        }
        continue;
      }

      if (char === '"') {
        inString = true;
        continue;
      }

      if (char === "{") {
        depth += 1;
        continue;
      }

      if (char === "}") {
        depth -= 1;
        if (depth !== 0) {
          continue;
        }

        const candidate = stdout.slice(start, index + 1);
        const parsed = maybeParseJson(candidate);
        if (!parsed || typeof parsed !== "object") {
          break;
        }

        const record = parsed as Record<string, unknown>;
        if (record.stats || record.runs || record.totalTests) {
          matches.push(record);
          start = index;
          break;
        }

        break;
      }
    }
  }

  return matches;
}

function aggregateMochaJsonReports(reports: Record<string, unknown>[]): Record<string, unknown> | undefined {
  const mochaReports = reports.filter((report) => typeof report.stats === "object" && report.stats !== null);
  if (mochaReports.length === 0) {
    return undefined;
  }

  if (mochaReports.length === 1) {
    return mochaReports[0];
  }

  let suites = 0;
  let tests = 0;
  let passes = 0;
  let pending = 0;
  let failures = 0;
  let duration = 0;

  const startTimes: string[] = [];
  const endTimes: string[] = [];
  const testsArray: unknown[] = [];
  const pendingArray: unknown[] = [];
  const failuresArray: unknown[] = [];
  const passesArray: unknown[] = [];

  for (const report of mochaReports) {
    const statsRecord = report.stats as MochaStats;
    suites += safeNumber(statsRecord.suites);
    tests += safeNumber(statsRecord.tests);
    passes += safeNumber(statsRecord.passes);
    pending += safeNumber(statsRecord.pending);
    failures += safeNumber(statsRecord.failures);
    duration += safeNumber(statsRecord.duration);

    const start = safeString(statsRecord.start);
    const end = safeString(statsRecord.end);
    if (start.length > 0) {
      startTimes.push(start);
    }
    if (end.length > 0) {
      endTimes.push(end);
    }

    if (Array.isArray(report.tests)) {
      testsArray.push(...report.tests);
    }
    if (Array.isArray(report.pending)) {
      pendingArray.push(...report.pending);
    }
    if (Array.isArray(report.failures)) {
      failuresArray.push(...report.failures);
    }
    if (Array.isArray(report.passes)) {
      passesArray.push(...report.passes);
    }
  }

  return {
    stats: {
      suites,
      tests,
      passes,
      pending,
      failures,
      start: startTimes.length > 0 ? startTimes.sort()[0] : "",
      end: endTimes.length > 0 ? endTimes.sort().reverse()[0] : "",
      duration,
    },
    tests: testsArray,
    pending: pendingArray,
    failures: failuresArray,
    passes: passesArray,
  };
}

async function writeJsonReporterOutput(
  stdout: string,
  reportPath: string,
): Promise<{ wroteReport: boolean; warning?: string }> {
  const parsedReports = findMatchingJsonBlocks(stdout);
  if (parsedReports.length === 0) {
    return {
      wroteReport: false,
      warning:
        "Unable to extract JSON reporter payload from Cypress stdout; report file was not written.",
    };
  }

  const aggregatedMocha = aggregateMochaJsonReports(parsedReports);
  const fallbackReport =
    parsedReports.find((report) => report.runs || report.totalTests) ?? parsedReports[parsedReports.length - 1];
  const reportPayload = aggregatedMocha ?? fallbackReport;

  await writeFile(reportPath, JSON.stringify(reportPayload, null, 2), "utf-8");
  return { wroteReport: true };
}

async function runCommand(command: string, args: string[], cwd: string): Promise<CommandExecution> {
  return new Promise<CommandExecution>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      resolve({
        exitCode: code ?? 1,
        stdout,
        stderr,
      });
    });
  });
}

export async function runCypress(input: RunCypressInput): Promise<RunCypressOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);

  const dryRun = input.dryRun ?? true;
  const reportFormat = input.reportFormat ?? toolingConfig.cypress.reportFormat;
  const reportPath = resolveFromRepoRoot(repoRoot, input.reportPath ?? toolingConfig.cypress.reportPath);
  const command = toolingConfig.cypress.command;
  const args = [...toolingConfig.cypress.commandArgs, "run"];
  const warnings: string[] = [];

  const specs = Array.from(new Set(input.specs)).sort((a, b) => a.localeCompare(b));

  if (specs.length > 0) {
    args.push("--spec", specs.join(","));
  } else {
    warnings.push("No Cypress specs were provided to run_cypress.");
  }

  const browser = input.browser ?? toolingConfig.cypress.defaultBrowser;
  if (browser) {
    args.push("--browser", browser);
  }

  if (input.headed === true) {
    args.push("--headed");
  }

  if (input.configFile) {
    args.push("--config-file", input.configFile);
  } else if (toolingConfig.cypress.configFile) {
    args.push("--config-file", toolingConfig.cypress.configFile);
  }

  if (reportFormat === "json") {
    const relativeReportPath = path.relative(repoRoot, reportPath).replace(/\\/g, "/");
    args.push("--reporter", "json");
    args.push("--reporter-options", `output=${relativeReportPath},overwrite=true`);
  } else {
    warnings.push(
      `Report format '${reportFormat}' is not configured for deterministic parsing. Prefer 'json'.`,
    );
  }

  if (Array.isArray(input.extraArgs) && input.extraArgs.length > 0) {
    args.push(...input.extraArgs);
  }

  const startedAt = new Date();

  if (dryRun) {
    const finishedAt = new Date();
    return {
      tool: "run_cypress",
      dryRun,
      command: [command, ...args],
      cwd: repoRoot,
      specs,
      reportPath,
      reportFormat,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      exitCode: null,
      status: "skipped",
      stdout: "",
      stderr: "",
      warnings,
    };
  }

  try {
    await mkdir(path.dirname(reportPath), { recursive: true });
    await rm(reportPath, { force: true });

    const result = await runCommand(command, args, repoRoot);
    const finishedAt = new Date();

    if (reportFormat === "json") {
      const reportWrite = await writeJsonReporterOutput(result.stdout, reportPath);
      if (!reportWrite.wroteReport && reportWrite.warning) {
        warnings.push(reportWrite.warning);
      }
    }

    return {
      tool: "run_cypress",
      dryRun,
      command: [command, ...args],
      cwd: repoRoot,
      specs,
      reportPath,
      reportFormat,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      exitCode: result.exitCode,
      status: result.exitCode === 0 ? "passed" : "failed",
      stdout: result.stdout,
      stderr: result.stderr,
      warnings,
    };
  } catch (error) {
    const finishedAt = new Date();
    return {
      tool: "run_cypress",
      dryRun,
      command: [command, ...args],
      cwd: repoRoot,
      specs,
      reportPath,
      reportFormat,
      startedAt: startedAt.toISOString(),
      finishedAt: finishedAt.toISOString(),
      durationMs: finishedAt.getTime() - startedAt.getTime(),
      exitCode: 1,
      status: "failed",
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error),
      warnings,
    };
  }
}
