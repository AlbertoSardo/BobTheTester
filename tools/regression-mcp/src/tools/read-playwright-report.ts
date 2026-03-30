import { readFile } from "node:fs/promises";

import { fileExists, findRepositoryRoot, loadToolingConfig, resolveFromRepoRoot } from "../config.js";
import type { ReadPlaywrightReportInput, ReadPlaywrightReportOutput } from "../types.js";
import { uniqueSortedNonEmpty } from "../utils/helpers.js";

function safeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function safeString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

interface ParsedSummary {
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
}

function summarizePlaywrightJson(payload: Record<string, unknown>): ParsedSummary {
  const warnings: string[] = [];
  const failures: string[] = [];
  const failedSpecFiles: string[] = [];

  let tests = 0;
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  let durationMs = 0;

  function parseTestResult(testRecord: Record<string, unknown>): {
    status: "passed" | "failed" | "skipped";
    durationMs: number;
    message: string;
  } {
    const results = Array.isArray(testRecord.results)
      ? testRecord.results.filter((entry) => typeof entry === "object" && entry !== null)
      : [];

    const lastResult =
      results.length > 0 ? (results[results.length - 1] as Record<string, unknown>) : undefined;
    const statusRaw = lastResult ? safeString(lastResult.status) : "";

    const status: "passed" | "failed" | "skipped" =
      statusRaw === "passed"
        ? "passed"
        : statusRaw === "skipped"
          ? "skipped"
          : statusRaw === "failed" || statusRaw === "timedOut" || statusRaw === "interrupted"
            ? "failed"
            : "passed";

    const errorRecord =
      lastResult && typeof lastResult.error === "object" && lastResult.error
        ? (lastResult.error as Record<string, unknown>)
        : undefined;

    const message =
      safeString(errorRecord?.message) ||
      safeString(errorRecord?.stack) ||
      safeString((testRecord as Record<string, unknown>).error);

    return {
      status,
      durationMs: safeNumber(lastResult?.duration),
      message,
    };
  }

  function walkSuite(suiteRecord: Record<string, unknown>, parentFile?: string): void {
    const suiteFile = safeString(suiteRecord.file) || parentFile;

    const specs = Array.isArray(suiteRecord.specs)
      ? suiteRecord.specs.filter((entry) => typeof entry === "object" && entry !== null)
      : [];

    for (const specEntry of specs) {
      const specRecord = specEntry as Record<string, unknown>;
      const specTitle = safeString(specRecord.title) || "Unnamed spec";
      const specFile = safeString(specRecord.file) || suiteFile;
      const specTests = Array.isArray(specRecord.tests)
        ? specRecord.tests.filter((entry) => typeof entry === "object" && entry !== null)
        : [];

      for (const testEntry of specTests) {
        const testRecord = testEntry as Record<string, unknown>;
        const titlePath = Array.isArray(testRecord.titlePath)
          ? testRecord.titlePath.filter((part) => typeof part === "string")
          : [];
        const testTitle =
          titlePath.length > 0
            ? titlePath.join(" > ")
            : safeString(testRecord.title) || safeString(specRecord.title) || "Unnamed test";

        const result = parseTestResult(testRecord);

        tests += 1;
        durationMs += result.durationMs;

        if (result.status === "passed") {
          passed += 1;
          continue;
        }

        if (result.status === "skipped") {
          skipped += 1;
          continue;
        }

        failed += 1;
        if (specFile) {
          failedSpecFiles.push(specFile);
        }

        const failurePrefix = specFile ? `${specFile}: ` : "";
        failures.push(
          result.message ? `${failurePrefix}${testTitle}: ${result.message}` : `${failurePrefix}${testTitle}`,
        );
      }

      if (specTests.length === 0) {
        warnings.push(`Spec '${specTitle}' has no test records in Playwright JSON report.`);
      }
    }

    const nestedSuites = Array.isArray(suiteRecord.suites)
      ? suiteRecord.suites.filter((entry) => typeof entry === "object" && entry !== null)
      : [];

    for (const nested of nestedSuites) {
      walkSuite(nested as Record<string, unknown>, suiteFile);
    }
  }

  if (!Array.isArray(payload.suites)) {
    warnings.push("JSON report is missing Playwright 'suites' array.");
  } else {
    for (const suite of payload.suites) {
      if (typeof suite !== "object" || suite === null) {
        continue;
      }

      walkSuite(suite as Record<string, unknown>);
    }
  }

  const statsRecord =
    typeof payload.stats === "object" && payload.stats
      ? (payload.stats as Record<string, unknown>)
      : undefined;

  if (statsRecord && safeNumber(statsRecord.duration) > 0 && durationMs === 0) {
    durationMs = safeNumber(statsRecord.duration);
  }

  return {
    totals: {
      tests,
      passed,
      failed,
      skipped,
      pending: 0,
      durationMs,
    },
    failures: uniqueSortedNonEmpty(failures),
    failedSpecFiles: uniqueSortedNonEmpty(failedSpecFiles),
    warnings: uniqueSortedNonEmpty(warnings),
  };
}

export async function readPlaywrightReport(
  input: ReadPlaywrightReportInput = {},
): Promise<ReadPlaywrightReportOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);
  const reportFormat = input.reportFormat ?? toolingConfig.playwright.reportFormat;
  const reportPath = resolveFromRepoRoot(repoRoot, input.reportPath ?? toolingConfig.playwright.reportPath);
  const warnings: string[] = [];

  if (!(await fileExists(reportPath))) {
    return {
      tool: "read_playwright_report",
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
      `Report format '${reportFormat}' is not supported. Only 'json' format is currently implemented. ` +
        `Configure reportFormat: "json" in tooling.json or pass reportFormat: "json" explicitly.`,
    );
    return {
      tool: "read_playwright_report",
      reportPath,
      reportFormat,
      status: "unsupported-format",
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

    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {
        tool: "read_playwright_report",
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
        warnings: ["JSON report payload is not an object."],
      };
    }

    const summary = summarizePlaywrightJson(parsed as Record<string, unknown>);
    return {
      tool: "read_playwright_report",
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
      tool: "read_playwright_report",
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
