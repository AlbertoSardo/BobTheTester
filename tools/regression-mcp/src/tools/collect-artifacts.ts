import path from "node:path";
import { readFile } from "node:fs/promises";

import {
  fileExists,
  findRepositoryRoot,
  loadToolingConfig,
  resolveFromRepoRoot,
} from "../config.js";
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

    if (Array.isArray(record.runs)) {
      for (const run of record.runs) {
        if (typeof run !== "object" || run === null) {
          continue;
        }

        const runRecord = run as Record<string, unknown>;
        const specRecord =
          typeof runRecord.spec === "object" && runRecord.spec
            ? (runRecord.spec as Record<string, unknown>)
            : undefined;
        const specRelative =
          specRecord && typeof specRecord.relative === "string" ? specRecord.relative : undefined;

        const tests = Array.isArray(runRecord.tests)
          ? runRecord.tests.filter((test) => typeof test === "object" && test !== null)
          : [];

        const hasFailedTest = tests.some((test) => {
          const testRecord = test as Record<string, unknown>;
          return testRecord.state === "failed";
        });

        if (hasFailedTest && specRelative) {
          failedSpecFiles.push(normalizePath(specRelative));
        }
      }
    }

    if (Array.isArray(record.failures)) {
      for (const failure of record.failures) {
        if (typeof failure !== "object" || failure === null) {
          continue;
        }

        const failureRecord = failure as Record<string, unknown>;
        const file = failureRecord.file;
        if (typeof file === "string" && file.length > 0) {
          failedSpecFiles.push(normalizePath(file));
          continue;
        }

        const errRecord =
          typeof failureRecord.err === "object" && failureRecord.err
            ? (failureRecord.err as Record<string, unknown>)
            : undefined;
        const parsedStack = errRecord?.parsedStack;

        if (Array.isArray(parsedStack)) {
          for (const frame of parsedStack) {
            if (typeof frame !== "object" || frame === null) {
              continue;
            }

            const relativeFile = (frame as Record<string, unknown>).relativeFile;
            if (typeof relativeFile === "string" && relativeFile.startsWith("cypress/")) {
              failedSpecFiles.push(normalizePath(relativeFile));
              break;
            }
          }
        }
      }
    }

    return toSortedUnique(failedSpecFiles);
  } catch {
    return [];
  }
}

export async function collectArtifacts(
  input: CollectArtifactsInput = {},
): Promise<CollectArtifactsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);

  const screenshotsDir = resolveFromRepoRoot(
    repoRoot,
    input.screenshotsDir ?? toolingConfig.cypress.screenshotsDir,
  );
  const videosDir = resolveFromRepoRoot(repoRoot, input.videosDir ?? toolingConfig.cypress.videosDir);
  const resultsDir = resolveFromRepoRoot(repoRoot, input.resultsDir ?? toolingConfig.cypress.resultsDir);
  const reportPath = resolveFromRepoRoot(repoRoot, input.reportPath ?? toolingConfig.cypress.reportPath);

  const [screenshotsAbs, videosAbs, reportsAbs] = await Promise.all([
    listIfExists(screenshotsDir),
    listIfExists(videosDir),
    listIfExists(resultsDir),
  ]);
  const failedSpecFiles = await readFailedSpecFiles(reportPath);

  const toRelative = (filePath: string): string => normalizePath(path.relative(repoRoot, filePath));

  const screenshots = toSortedUnique(screenshotsAbs.map(toRelative));
  const videos = toSortedUnique(videosAbs.map(toRelative));
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
  if (!(await fileExists(screenshotsDir))) {
    missingDirectories.push(screenshotsDir);
  }
  if (!(await fileExists(videosDir))) {
    missingDirectories.push(videosDir);
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
