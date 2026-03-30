import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { fileExists, findRepositoryRoot, loadToolingConfig, resolveFromRepoRoot } from "../config.js";
import type { RunPlaywrightInput, RunPlaywrightOutput } from "../types.js";

interface CommandExecution {
  exitCode: number;
  stdout: string;
  stderr: string;
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
        if (record.stats || record.suites || record.errors || record.config) {
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

async function writeJsonReporterOutput(
  stdout: string,
  reportPath: string,
): Promise<{ wroteReport: boolean; warning?: string }> {
  const parsedReports = findMatchingJsonBlocks(stdout);
  if (parsedReports.length === 0) {
    return {
      wroteReport: false,
      warning: "Unable to extract JSON reporter payload from Playwright stdout; report file was not written.",
    };
  }

  const reportPayload =
    parsedReports.find((report) => report.suites || report.stats || report.errors) ??
    parsedReports[parsedReports.length - 1];

  await writeFile(reportPath, JSON.stringify(reportPayload, null, 2), "utf-8");
  return { wroteReport: true };
}

async function runCommand(
  command: string,
  args: string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<CommandExecution> {
  return new Promise<CommandExecution>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env,
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

export async function runPlaywright(input: RunPlaywrightInput): Promise<RunPlaywrightOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);

  const dryRun = input.dryRun ?? true;
  const reportFormat = input.reportFormat ?? toolingConfig.playwright.reportFormat;
  const reportPath = resolveFromRepoRoot(repoRoot, input.reportPath ?? toolingConfig.playwright.reportPath);
  const command = toolingConfig.playwright.command;
  const args = [...toolingConfig.playwright.commandArgs, "test"];
  const warnings: string[] = [];

  const specs = Array.from(new Set(input.specs)).sort((a, b) => a.localeCompare(b));
  const startedAt = new Date();

  if (specs.length > 0) {
    args.push(...specs);
  } else {
    warnings.push(
      "No Playwright specs were selected. Skipped execution to avoid unintended full-suite Playwright runs.",
    );
  }

  const project = input.browser ?? toolingConfig.playwright.defaultProject;
  if (project) {
    args.push("--project", project);
  }

  if (input.headed === true) {
    args.push("--headed");
  }

  if (input.configFile) {
    args.push("--config", input.configFile);
  } else if (toolingConfig.playwright.configFile) {
    args.push("--config", toolingConfig.playwright.configFile);
  }

  if (reportFormat === "json") {
    args.push("--reporter", "json");
  } else if (reportFormat === "junit") {
    args.push("--reporter", "junit");
  } else {
    args.push("--reporter", "line");
  }

  if (Array.isArray(input.extraArgs) && input.extraArgs.length > 0) {
    args.push(...input.extraArgs);
  }

  if (specs.length === 0) {
    const finishedAt = new Date();
    return {
      tool: "run_playwright",
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

  if (dryRun) {
    const finishedAt = new Date();
    return {
      tool: "run_playwright",
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

    const commandEnv: NodeJS.ProcessEnv = { ...process.env };
    const nodeModulesPath = resolveFromRepoRoot(repoRoot, "tools/regression-mcp/node_modules");
    commandEnv.NODE_PATH = commandEnv.NODE_PATH
      ? `${nodeModulesPath}:${commandEnv.NODE_PATH}`
      : nodeModulesPath;
    if (reportFormat === "json") {
      commandEnv.PLAYWRIGHT_JSON_OUTPUT_NAME = reportPath;
    }
    if (reportFormat === "junit") {
      commandEnv.PLAYWRIGHT_JUNIT_OUTPUT_NAME = reportPath;
    }

    const result = await runCommand(command, args, repoRoot, commandEnv);
    const finishedAt = new Date();

    if (reportFormat === "json") {
      if (!(await fileExists(reportPath))) {
        const reportWrite = await writeJsonReporterOutput(result.stdout, reportPath);
        if (!reportWrite.wroteReport && reportWrite.warning) {
          warnings.push(reportWrite.warning);
        }
      }
    }

    return {
      tool: "run_playwright",
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
      tool: "run_playwright",
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
