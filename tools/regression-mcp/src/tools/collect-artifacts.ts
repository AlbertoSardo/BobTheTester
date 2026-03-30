import path from "node:path";
import { readFile } from "node:fs/promises";

import { fileExists, findRepositoryRoot, loadToolingConfig, resolveFromRepoRoot } from "../config.js";
import type { CollectArtifactsInput, CollectArtifactsOutput } from "../types.js";
import { listFilesRecursively, toSortedUnique } from "../utils/fs.js";

async function listIfExists(directory: string): Promise<string[]> {
  if (!(await fileExists(directory))) {
    return [];
  }

  return listFilesRecursively(directory);
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

async function readFailedSpecFiles(reportPath: string): Promise<string[]> {
  if (!(await fileExists(reportPath))) {
    return [];
  }

  try {
    const raw = await readFile(reportPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return [];
    }

    const record = parsed as Record<string, unknown>;
    const failedSpecFiles: string[] = [];

    function walkSuite(suiteRecord: Record<string, unknown>, parentFile?: string): void {
      const suiteFile =
        typeof suiteRecord.file === "string" && suiteRecord.file.length > 0 ? suiteRecord.file : parentFile;

      if (Array.isArray(suiteRecord.specs)) {
        for (const spec of suiteRecord.specs) {
          if (typeof spec !== "object" || spec === null) {
            continue;
          }

          const specRecord = spec as Record<string, unknown>;
          const specFile =
            typeof specRecord.file === "string" && specRecord.file.length > 0 ? specRecord.file : suiteFile;

          const tests = Array.isArray(specRecord.tests)
            ? specRecord.tests.filter((test) => typeof test === "object" && test !== null)
            : [];

          const hasFailedTest = tests.some((test) => {
            const testRecord = test as Record<string, unknown>;
            const results = Array.isArray(testRecord.results)
              ? testRecord.results.filter((result) => typeof result === "object" && result !== null)
              : [];

            if (results.length === 0) {
              return false;
            }

            const lastResult = results[results.length - 1] as Record<string, unknown>;
            const status = lastResult.status;
            return status === "failed" || status === "timedOut" || status === "interrupted";
          });

          if (hasFailedTest && specFile) {
            failedSpecFiles.push(normalizePath(specFile));
          }
        }
      }

      if (Array.isArray(suiteRecord.suites)) {
        for (const nested of suiteRecord.suites) {
          if (typeof nested !== "object" || nested === null) {
            continue;
          }

          walkSuite(nested as Record<string, unknown>, suiteFile);
        }
      }
    }

    if (Array.isArray(record.suites)) {
      for (const suite of record.suites) {
        if (typeof suite !== "object" || suite === null) {
          continue;
        }

        walkSuite(suite as Record<string, unknown>);
      }
    }

    return toSortedUnique(failedSpecFiles);
  } catch {
    return [];
  }
}

export async function collectArtifacts(input: CollectArtifactsInput = {}): Promise<CollectArtifactsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);

  const testResultsDir = resolveFromRepoRoot(
    repoRoot,
    input.screenshotsDir ?? toolingConfig.playwright.testResultsDir,
  );
  const tracesDir = resolveFromRepoRoot(repoRoot, input.videosDir ?? toolingConfig.playwright.tracesDir);
  const resultsDir = resolveFromRepoRoot(repoRoot, input.resultsDir ?? toolingConfig.playwright.resultsDir);
  const reportPath = resolveFromRepoRoot(repoRoot, input.reportPath ?? toolingConfig.playwright.reportPath);

  const [testResultsAbs, tracesAbs, reportsAbs] = await Promise.all([
    listIfExists(testResultsDir),
    listIfExists(tracesDir),
    listIfExists(resultsDir),
  ]);
  const failedSpecFiles = await readFailedSpecFiles(reportPath);

  const toRelative = (filePath: string): string => normalizePath(path.relative(repoRoot, filePath));

  const testResultsRelative = testResultsAbs.map(toRelative);
  const tracesRelative = tracesAbs.map(toRelative);

  const screenshots = toSortedUnique(
    testResultsRelative.filter((artifactPath) => /\.(png|jpg|jpeg)$/i.test(artifactPath)),
  );
  const videos = toSortedUnique(
    [...testResultsRelative, ...tracesRelative].filter((artifactPath) => /\.(webm|mp4)$/i.test(artifactPath)),
  );
  const reports = toSortedUnique(reportsAbs.map(toRelative));

  const failedSpecBasenames = toSortedUnique(
    failedSpecFiles.map((specFile) => path.basename(specFile)).filter((value) => value.length > 0),
  );

  const failedScreenshots = toSortedUnique(
    screenshots.filter((artifactPath) => {
      if (artifactPath.includes("(failed)")) {
        return true;
      }

      return failedSpecBasenames.some((basename) => artifactPath.includes(basename));
    }),
  );

  const failedVideos = toSortedUnique(
    videos.filter((artifactPath) =>
      failedSpecBasenames.some((basename) => artifactPath.includes(basename.replace(/\.[jt]s$/, ""))),
    ),
  );

  const warnings: string[] = [];
  if (failedScreenshots.length > 0 && failedVideos.length === 0 && videos.length > 0) {
    warnings.push(
      "Failed screenshots detected but failed videos could not be mapped deterministically; returning all videos.",
    );
  }

  const missingDirectories: string[] = [];
  if (!(await fileExists(testResultsDir))) {
    missingDirectories.push(testResultsDir);
  }
  if (!(await fileExists(tracesDir))) {
    missingDirectories.push(tracesDir);
  }
  if (!(await fileExists(resultsDir))) {
    missingDirectories.push(resultsDir);
  }

  return {
    tool: "collect_artifacts",
    screenshots,
    failedScreenshots,
    videos,
    failedVideos: failedVideos.length > 0 ? failedVideos : failedScreenshots.length > 0 ? videos : [],
    reports,
    missingDirectories: toSortedUnique(missingDirectories),
    warnings,
  };
}
