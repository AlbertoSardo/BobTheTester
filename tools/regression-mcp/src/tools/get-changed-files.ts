import { findRepositoryRoot, loadToolingConfig } from "../config.js";
import type { GetChangedFilesInput, GetChangedFilesOutput } from "../types.js";
import { toSortedUnique } from "../utils/fs.js";
import { execCommand, isGitRepository } from "../utils/git.js";

function splitLines(value: string): string[] {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export async function getChangedFiles(
  input: GetChangedFilesInput = {},
): Promise<GetChangedFilesOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const warnings: string[] = [];

  if (!(await isGitRepository(repoRoot))) {
    warnings.push("Current directory is not a git repository.");
    return {
      tool: "get_changed_files",
      repoRoot,
      baseRef: "",
      headRef: "",
      changedFiles: [],
      untrackedFiles: [],
      warnings,
    };
  }

  const { config: toolingConfig } = await loadToolingConfig(repoRoot);
  const baseRef = input.baseRef ?? toolingConfig.git.defaultBaseRef;
  const headRef = input.headRef ?? toolingConfig.git.defaultHeadRef;

  const diffResult = await execCommand("git", ["diff", "--name-only", `${baseRef}..${headRef}`], repoRoot);
  const changedFiles = splitLines(diffResult.stdout);

  let untrackedFiles: string[] = [];
  if (input.includeUntracked === true) {
    const untrackedResult = await execCommand(
      "git",
      ["ls-files", "--others", "--exclude-standard"],
      repoRoot,
    );
    untrackedFiles = splitLines(untrackedResult.stdout);
  }

  return {
    tool: "get_changed_files",
    repoRoot,
    baseRef,
    headRef,
    changedFiles: toSortedUnique(changedFiles),
    untrackedFiles: toSortedUnique(untrackedFiles),
    warnings,
  };
}
