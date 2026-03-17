import { readFile } from "node:fs/promises";

import {
  fileExists,
  findRepositoryRoot,
  loadToolingConfig,
  resolveFromRepoRoot,
} from "../config.js";
import type { ReadCypressReportInput, ReadCypressReportOutput } from "../types.js";

interface GenericStats {
  tests?: number;
  passes?: number;
  failures?: number;
  skipped?: number;
  pending?: number;
  duration?: number;
}

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value.length > 0))).sort((a, b) =>
    a.localeCompare(b),
  );
}

function parseMochaJsonReport(payload: Record<string, unknown>): {
  totals: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    durationMs: number;
  };
  failures: string[];
  failedSpecFiles: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const statsRecord = payload.stats;
  const stats = typeof statsRecord === "object" && statsRecord ? (statsRecord as GenericStats) : {};

  const failuresRaw = Array.isArray(payload.failures)
    ? payload.failures.filter((value) => typeof value === "object" && value !== null)
    : [];

  const failures: string[] = [];
  const failedSpecFiles: string[] = [];

  for (const failure of failuresRaw) {
    const entry = failure as Record<string, unknown>;
    const title = safeString(entry.fullTitle) || safeString(entry.title) || "Unnamed failure";
    let file = safeString(entry.file);

    const errorRecord = entry.err;
    const message =
      typeof errorRecord === "object" && errorRecord
        ? safeString((errorRecord as Record<string, unknown>).message)
        : "";

    if (!file && typeof errorRecord === "object" && errorRecord) {
      const parsedStack = (errorRecord as Record<string, unknown>).parsedStack;
      if (Array.isArray(parsedStack)) {
        for (const frame of parsedStack) {
          if (typeof frame !== "object" || frame === null) {
            continue;
          }

          const relativeFile = safeString((frame as Record<string, unknown>).relativeFile);
          if (relativeFile.startsWith("cypress/")) {
            file = relativeFile;
            break;
          }
        }
      }
    }

    failures.push(message ? `${title}: ${message}` : title);
    if (file) {
      failedSpecFiles.push(file);
    }
  }

  return {
    totals: {
      tests: safeNumber(stats.tests),
      passed: safeNumber(stats.passes),
      failed: safeNumber(stats.failures),
      skipped: safeNumber(stats.skipped),
      pending: safeNumber(stats.pending),
      durationMs: safeNumber(stats.duration),
    },
    failures: uniqueSorted(failures),
    failedSpecFiles: uniqueSorted(failedSpecFiles),
    warnings,
  };
}

function parseCypressModuleReport(payload: Record<string, unknown>): {
  totals: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    durationMs: number;
  };
  failures: string[];
  failedSpecFiles: string[];
  warnings: string[];
} {
  const warnings: string[] = [];
  const runsRaw = Array.isArray(payload.runs)
    ? payload.runs.filter((value) => typeof value === "object" && value !== null)
    : [];

  let tests = safeNumber(payload.totalTests);
  let passed = safeNumber(payload.totalPassed);
  let failed = safeNumber(payload.totalFailed);
  let skipped = safeNumber(payload.totalSkipped);
  let pending = safeNumber(payload.totalPending);
  let durationMs = safeNumber(payload.totalDuration);

  const failures: string[] = [];
  const failedSpecFiles: string[] = [];

  if (tests === 0 && runsRaw.length > 0) {
    for (const run of runsRaw) {
      const runRecord = run as Record<string, unknown>;
      const runStatsRecord = runRecord.stats;
      if (typeof runStatsRecord === "object" && runStatsRecord) {
        const runStats = runStatsRecord as GenericStats;
        tests += safeNumber(runStats.tests);
        passed += safeNumber(runStats.passes);
        failed += safeNumber(runStats.failures);
        skipped += safeNumber(runStats.skipped);
        pending += safeNumber(runStats.pending);
        durationMs += safeNumber(runStats.duration);
      }
    }
  }

  for (const run of runsRaw) {
    const runRecord = run as Record<string, unknown>;
    const specRecord =
      typeof runRecord.spec === "object" && runRecord.spec ? (runRecord.spec as Record<string, unknown>) : {};
    const specPath = safeString(specRecord.relative) || safeString(specRecord.name);

    const runTests = Array.isArray(runRecord.tests)
      ? runRecord.tests.filter((value) => typeof value === "object" && value !== null)
      : [];

    let runHasFailure = false;

    for (const test of runTests) {
      const testRecord = test as Record<string, unknown>;
      const state = safeString(testRecord.state);
      if (state !== "failed") {
        continue;
      }

      runHasFailure = true;
      const titleParts = Array.isArray(testRecord.title)
        ? (testRecord.title.filter((part) => typeof part === "string") as string[])
        : [];
      const title = titleParts.length > 0 ? titleParts.join(" > ") : "Unnamed failure";
      const message = safeString(testRecord.displayError);
      const prefix = specPath ? `${specPath}: ` : "";
      failures.push(message ? `${prefix}${title}: ${message}` : `${prefix}${title}`);
    }

    if (runHasFailure && specPath) {
      failedSpecFiles.push(specPath);
    }
  }

  return {
    totals: {
      tests,
      passed,
      failed,
      skipped,
      pending,
      durationMs,
    },
    failures: uniqueSorted(failures),
    failedSpecFiles: uniqueSorted(failedSpecFiles),
    warnings,
  };
}

function parseJsonSummary(payload: unknown): {
  totals: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    durationMs: number;
  };
  failures: string[];
  failedSpecFiles: string[];
  warnings: string[];
} {
  if (typeof payload !== "object" || payload === null) {
    return {
      totals: {
        tests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        durationMs: 0,
      },
      failures: [],
      failedSpecFiles: [],
      warnings: ["JSON report payload is not an object."],
    };
  }

  const record = payload as Record<string, unknown>;

  if (record.stats && typeof record.stats === "object") {
    return parseMochaJsonReport(record);
  }

  if (Array.isArray(record.runs)) {
    return parseCypressModuleReport(record);
  }

  return {
    totals: {
      tests: safeNumber(record.totalTests),
      passed: safeNumber(record.totalPassed),
      failed: safeNumber(record.totalFailed),
      skipped: safeNumber(record.totalSkipped),
      pending: safeNumber(record.totalPending),
      durationMs: safeNumber(record.totalDuration),
    },
    failures: [],
    failedSpecFiles: [],
    warnings: ["JSON report is missing recognized Cypress stats fields."],
  };
}

export async function readCypressReport(
  input: ReadCypressReportInput = {},
): Promise<ReadCypressReportOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);
  const reportFormat = input.reportFormat ?? toolingConfig.cypress.reportFormat;
  const reportPath = resolveFromRepoRoot(repoRoot, input.reportPath ?? toolingConfig.cypress.reportPath);
  const warnings: string[] = [];

  if (!(await fileExists(reportPath))) {
    return {
      tool: "read_cypress_report",
      reportPath,
      reportFormat,
      status: "missing",
      totals: {
        tests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        durationMs: 0,
      },
      failures: [],
      failedSpecFiles: [],
      warnings,
    };
  }

  if (reportFormat !== "json") {
    warnings.push(
      `TODO: ${reportFormat} parsing is not implemented yet. Returning stub response for now.`,
    );
    return {
      tool: "read_cypress_report",
      reportPath,
      reportFormat,
      status: "stub",
      totals: {
        tests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        durationMs: 0,
      },
      failures: [],
      failedSpecFiles: [],
      warnings,
    };
  }

  try {
    const raw = await readFile(reportPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    const summary = parseJsonSummary(parsed);

    return {
      tool: "read_cypress_report",
      reportPath,
      reportFormat,
      status: "parsed",
      totals: summary.totals,
      failures: summary.failures,
      failedSpecFiles: summary.failedSpecFiles,
      warnings: [...warnings, ...summary.warnings],
    };
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : String(error));
    return {
      tool: "read_cypress_report",
      reportPath,
      reportFormat,
      status: "invalid",
      totals: {
        tests: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        pending: 0,
        durationMs: 0,
      },
      failures: [],
      failedSpecFiles: [],
      warnings,
    };
  }
}
