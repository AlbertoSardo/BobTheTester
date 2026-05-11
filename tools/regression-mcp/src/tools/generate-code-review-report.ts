import { readFile } from "node:fs/promises";
import path from "node:path";

import {
  DEFAULT_CODE_REVIEW_POLICY_PATH,
  fileExists,
  findRepositoryRoot,
  loadCodeReviewPolicy,
  loadToolingConfig,
} from "../config.js";
import type {
  CodeReviewFinding,
  CodeReviewFindingCategory,
  CodeReviewFindingSeverity,
  CodeReviewReportInput,
  CodeReviewReportOutput,
  GetChangedFilesOutput,
  JsonValue,
  RiskLevel,
} from "../types.js";
import { execCommand, isGitRepository } from "../utils/git.js";
import { toRepoRelativePath, toSortedUnique } from "../utils/fs.js";
import { asObjectRecord } from "../utils/helpers.js";
import { matchesPattern, normalizeForMatch } from "../utils/pattern.js";
import { getChangedFiles } from "./get-changed-files.js";

interface AddedLine {
  lineNumber: number;
  content: string;
}

interface FileDiffData {
  addedLines: number;
  removedLines: number;
  addedLineEntries: AddedLine[];
}

interface SensitivePathRule {
  id: string;
  pattern: string;
  severity: CodeReviewFindingSeverity;
  message: string;
}

interface AddedLineCheckRule {
  id: string;
  pattern: string;
  flags: string;
  regex: RegExp;
  severity: CodeReviewFindingSeverity;
  message: string;
}

interface ParsedCodeReviewPolicy {
  maxChangedFiles: number;
  maxChangedLinesPerFile: number;
  sensitivePathRules: SensitivePathRule[];
  addedLineChecks: AddedLineCheckRule[];
}

const MAX_FINDINGS_PER_RULE_PER_FILE = 25;

const CODE_FILE_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".java",
  ".go",
  ".rb",
  ".php",
  ".cs",
  ".cpp",
  ".c",
  ".h",
  ".hpp",
  ".rs",
  ".kt",
  ".swift",
  ".scala",
  ".sh",
]);

function readOptionalNumber(
  value: JsonValue | undefined,
  fallback: number,
  keyName: string,
  warnings: string[],
): number {
  if (typeof value === "undefined") {
    return fallback;
  }

  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    warnings.push(`Policy field '${keyName}' is invalid. Using default value ${fallback}.`);
    return fallback;
  }

  return Math.floor(value);
}

function readSeverity(value: JsonValue | undefined): CodeReviewFindingSeverity | undefined {
  if (value !== "low" && value !== "medium" && value !== "high") {
    return undefined;
  }

  return value;
}

function normalizeDiffPath(rawPath: string): string {
  const trimmed = rawPath.trim();
  const replaced = trimmed.replace(/\{([^{}]+) => ([^{}]+)\}/g, "$2");

  if (replaced.includes(" => ")) {
    const parts = replaced.split(" => ");
    return normalizeForMatch(parts[parts.length - 1]);
  }

  return normalizeForMatch(replaced);
}

function parseNumstat(stdout: string): Map<string, { addedLines: number; removedLines: number }> {
  const results = new Map<string, { addedLines: number; removedLines: number }>();
  const lines = stdout
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const line of lines) {
    const match = /^([0-9-]+)\t([0-9-]+)\t(.+)$/.exec(line);
    if (!match) {
      continue;
    }

    const filePath = normalizeDiffPath(match[3]);
    const added = match[1] === "-" ? 0 : Number(match[1]);
    const removed = match[2] === "-" ? 0 : Number(match[2]);
    const existing = results.get(filePath);

    if (existing) {
      existing.addedLines += Number.isFinite(added) ? added : 0;
      existing.removedLines += Number.isFinite(removed) ? removed : 0;
      continue;
    }

    results.set(filePath, {
      addedLines: Number.isFinite(added) ? added : 0,
      removedLines: Number.isFinite(removed) ? removed : 0,
    });
  }

  return results;
}

function parseUnifiedAddedLines(stdout: string): Map<string, AddedLine[]> {
  const results = new Map<string, AddedLine[]>();
  const lines = stdout.split("\n");
  let currentFile: string | undefined;
  let currentTargetLine = 0;
  let inHunk = false;

  for (const rawLine of lines) {
    if (rawLine.startsWith("diff --git ")) {
      inHunk = false;
      currentTargetLine = 0;
      continue;
    }

    if (rawLine.startsWith("+++ ")) {
      if (rawLine === "+++ /dev/null") {
        currentFile = undefined;
        inHunk = false;
        continue;
      }

      if (rawLine.startsWith("+++ b/")) {
        currentFile = normalizeForMatch(rawLine.slice(6));
      } else {
        currentFile = normalizeForMatch(rawLine.slice(4));
      }
      inHunk = false;
      continue;
    }

    if (rawLine.startsWith("@@")) {
      const hunkMatch = /\+([0-9]+)(?:,([0-9]+))?/.exec(rawLine);
      if (!hunkMatch) {
        inHunk = false;
        continue;
      }

      currentTargetLine = Number(hunkMatch[1]);
      inHunk = Number.isFinite(currentTargetLine);
      continue;
    }

    if (!inHunk || !currentFile) {
      continue;
    }

    if (rawLine.startsWith("+") && !rawLine.startsWith("+++")) {
      const entries = results.get(currentFile) ?? [];
      entries.push({ lineNumber: currentTargetLine, content: rawLine.slice(1) });
      results.set(currentFile, entries);
      currentTargetLine += 1;
      continue;
    }

    if (rawLine.startsWith("-") && !rawLine.startsWith("---")) {
      continue;
    }

    if (rawLine.startsWith(" ")) {
      currentTargetLine += 1;
    }
  }

  return results;
}

async function scanWholeFileAsAddedLines(repoRoot: string, filePath: string): Promise<AddedLine[]> {
  const absolutePath = path.join(repoRoot, filePath);
  if (!(await fileExists(absolutePath))) {
    return [];
  }

  const content = await readFile(absolutePath, "utf-8");
  const lines = content.split("\n");
  return lines.map((line, index) => ({
    lineNumber: index + 1,
    content: line,
  }));
}

function extensionBucket(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();
  return extension.length > 0 ? extension : "<no-ext>";
}

function shouldApplyAddedLineChecks(filePath: string): boolean {
  return CODE_FILE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function deriveFindingBasedRiskLevel(counts: { low: number; medium: number; high: number }): RiskLevel {
  if (counts.high >= 2 || (counts.high >= 1 && counts.medium >= 2)) {
    return "critical";
  }

  if (counts.high >= 1) {
    return "high";
  }

  if (counts.medium >= 1) {
    return "medium";
  }

  return "low";
}

function parseCodeReviewPolicy(
  policy: { [key: string]: JsonValue },
  warnings: string[],
): ParsedCodeReviewPolicy {
  const maxChangedFiles = readOptionalNumber(policy.maxChangedFiles, 30, "maxChangedFiles", warnings);
  const maxChangedLinesPerFile = readOptionalNumber(
    policy.maxChangedLinesPerFile,
    400,
    "maxChangedLinesPerFile",
    warnings,
  );

  const sensitivePathRules: SensitivePathRule[] = [];
  if (Array.isArray(policy.sensitivePathRules)) {
    for (const rawRule of policy.sensitivePathRules) {
      const rule = asObjectRecord(rawRule);
      if (!rule) {
        continue;
      }

      const id = typeof rule.id === "string" ? rule.id : undefined;
      const pattern = typeof rule.pattern === "string" ? rule.pattern : undefined;
      const severity = readSeverity(rule.severity);
      const message = typeof rule.message === "string" ? rule.message : undefined;

      if (!id || !pattern || !severity || !message) {
        warnings.push("Ignored invalid sensitivePathRules entry in code-review policy.");
        continue;
      }

      sensitivePathRules.push({ id, pattern, severity, message });
    }
  }

  const addedLineChecks: AddedLineCheckRule[] = [];
  if (Array.isArray(policy.addedLineChecks)) {
    for (const rawRule of policy.addedLineChecks) {
      const rule = asObjectRecord(rawRule);
      if (!rule) {
        continue;
      }

      const id = typeof rule.id === "string" ? rule.id : undefined;
      const pattern = typeof rule.pattern === "string" ? rule.pattern : undefined;
      const flags = typeof rule.flags === "string" ? rule.flags : "";
      const severity = readSeverity(rule.severity);
      const message = typeof rule.message === "string" ? rule.message : undefined;

      if (!id || !pattern || !severity || !message) {
        warnings.push("Ignored invalid addedLineChecks entry in code-review policy.");
        continue;
      }

      try {
        const regex = new RegExp(pattern, flags);
        addedLineChecks.push({ id, pattern, flags, regex, severity, message });
      } catch {
        warnings.push(`Ignored invalid regex for addedLineChecks rule '${id}'.`);
      }
    }
  }

  return {
    maxChangedFiles,
    maxChangedLinesPerFile,
    sensitivePathRules,
    addedLineChecks,
  };
}

function createFinding(params: {
  ruleId: string;
  category: CodeReviewFindingCategory;
  severity: CodeReviewFindingSeverity;
  filePath: string;
  lineNumber?: number;
  message: string;
  evidence: string;
}): CodeReviewFinding {
  return {
    ruleId: params.ruleId,
    category: params.category,
    severity: params.severity,
    filePath: params.filePath,
    lineNumber: params.lineNumber,
    message: params.message,
    evidence: params.evidence,
  };
}

// ---------------------------------------------------------------------------
// Pipeline stage: acquire diff data from git
// ---------------------------------------------------------------------------

interface AcquiredDiffData {
  normalizedChangedFiles: string[];
  diffData: Map<string, FileDiffData>;
  changedFilesOutput: GetChangedFilesOutput | undefined;
}

async function acquireDiffData(
  repoRoot: string,
  baseRef: string,
  headRef: string,
  includeUntracked: boolean,
  changedFilesInput: string[] | undefined,
  warnings: string[],
): Promise<AcquiredDiffData> {
  let changedFilesOutput: GetChangedFilesOutput | undefined;

  if (!changedFilesInput) {
    changedFilesOutput = await getChangedFiles({
      baseRef,
      headRef,
      includeUntracked,
      repoRoot,
    });
  }

  const changedFiles =
    changedFilesInput ??
    toSortedUnique([
      ...(changedFilesOutput?.changedFiles ?? []),
      ...(changedFilesOutput?.untrackedFiles ?? []),
    ]).map((filePath) => toRepoRelativePath(repoRoot, filePath));

  const normalizedChangedFiles = toSortedUnique(changedFiles.map((filePath) => normalizeForMatch(filePath)));
  const diffData = new Map<string, FileDiffData>();

  for (const filePath of normalizedChangedFiles) {
    diffData.set(filePath, {
      addedLines: 0,
      removedLines: 0,
      addedLineEntries: [],
    });
  }

  const gitAvailable = await isGitRepository(repoRoot);
  const diffStatsFound = new Set<string>();
  let diffPayloadParsed = false;

  if (gitAvailable && normalizedChangedFiles.length > 0) {
    try {
      const numstatResult = await execCommand(
        "git",
        ["diff", "--numstat", `${baseRef}..${headRef}`, "--", ...normalizedChangedFiles],
        repoRoot,
      );
      const parsedNumstat = parseNumstat(numstatResult.stdout);

      for (const [filePath, stats] of parsedNumstat.entries()) {
        const target = diffData.get(filePath);
        if (!target) {
          continue;
        }

        target.addedLines = stats.addedLines;
        target.removedLines = stats.removedLines;
        diffStatsFound.add(filePath);
      }
    } catch (error) {
      warnings.push(
        `Unable to read git numstat for code review. Falling back to file scan where possible. ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    try {
      const unifiedResult = await execCommand(
        "git",
        ["diff", "--unified=0", `${baseRef}..${headRef}`, "--", ...normalizedChangedFiles],
        repoRoot,
      );
      const parsedAddedLines = parseUnifiedAddedLines(unifiedResult.stdout);

      for (const [filePath, entries] of parsedAddedLines.entries()) {
        const target = diffData.get(filePath);
        if (!target) {
          continue;
        }

        target.addedLineEntries = entries;
      }

      diffPayloadParsed = true;
    } catch (error) {
      warnings.push(
        `Unable to parse git diff payload for added-line checks. Falling back to full-file scan where possible. ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  if (!gitAvailable) {
    warnings.push("Current directory is not a git repository. Code review uses full-file scan fallback.");
  }

  for (const filePath of normalizedChangedFiles) {
    const target = diffData.get(filePath);
    if (!target) {
      continue;
    }

    const shouldFallbackToWholeFile =
      !diffStatsFound.has(filePath) ||
      (!diffPayloadParsed && target.addedLines > 0) ||
      target.addedLineEntries.length === 0;

    if (!shouldFallbackToWholeFile) {
      continue;
    }

    const fallbackLines = await scanWholeFileAsAddedLines(repoRoot, filePath);
    if (fallbackLines.length === 0) {
      continue;
    }

    target.addedLineEntries = fallbackLines;

    if (!diffStatsFound.has(filePath)) {
      target.addedLines = fallbackLines.length;
      target.removedLines = 0;
      warnings.push(
        `No git diff stats found for '${filePath}'. Treated entire file as added-lines scope for deterministic checks.`,
      );
      continue;
    }

    warnings.push(
      `No added-line payload available for '${filePath}'. Used full-file scan for deterministic line checks.`,
    );
  }

  return { normalizedChangedFiles, diffData, changedFilesOutput };
}

// ---------------------------------------------------------------------------
// Pipeline stage: scan files for findings
// ---------------------------------------------------------------------------

interface ScanResults {
  sensitivePathChanges: CodeReviewFinding[];
  addedLineFindings: CodeReviewFinding[];
  oversizedChangeFindings: CodeReviewFinding[];
}

function scanForFindings(
  normalizedChangedFiles: string[],
  diffData: Map<string, FileDiffData>,
  parsedPolicy: ParsedCodeReviewPolicy,
): ScanResults {
  const sensitivePathChanges: CodeReviewFinding[] = [];
  for (const filePath of normalizedChangedFiles) {
    for (const rule of parsedPolicy.sensitivePathRules) {
      if (!matchesPattern(filePath, rule.pattern)) {
        continue;
      }

      sensitivePathChanges.push(
        createFinding({
          ruleId: rule.id,
          category: "sensitive-path",
          severity: rule.severity,
          filePath,
          message: rule.message,
          evidence: `Matched sensitive path pattern '${rule.pattern}'.`,
        }),
      );
    }
  }

  const addedLineFindings: CodeReviewFinding[] = [];
  const findingCapCounts = new Map<string, number>();

  for (const filePath of normalizedChangedFiles) {
    const target = diffData.get(filePath);
    if (!target || target.addedLineEntries.length === 0) {
      continue;
    }

    if (!shouldApplyAddedLineChecks(filePath)) {
      continue;
    }

    for (const lineEntry of target.addedLineEntries) {
      for (const rule of parsedPolicy.addedLineChecks) {
        // Reset lastIndex to avoid stateful regex bugs with global/sticky flags
        rule.regex.lastIndex = 0;
        if (!rule.regex.test(lineEntry.content)) {
          continue;
        }

        const findingKey = `${filePath}::${rule.id}`;
        const seenCount = findingCapCounts.get(findingKey) ?? 0;
        if (seenCount >= MAX_FINDINGS_PER_RULE_PER_FILE) {
          continue;
        }

        findingCapCounts.set(findingKey, seenCount + 1);
        addedLineFindings.push(
          createFinding({
            ruleId: rule.id,
            category: "added-line-check",
            severity: rule.severity,
            filePath,
            lineNumber: lineEntry.lineNumber,
            message: rule.message,
            evidence: `Matched pattern '${rule.pattern}' on added line: ${lineEntry.content}`,
          }),
        );
      }
    }
  }

  const oversizedChangeFindings: CodeReviewFinding[] = [];
  for (const filePath of normalizedChangedFiles) {
    const target = diffData.get(filePath);
    if (!target) {
      continue;
    }

    const totalChangedLines = target.addedLines + target.removedLines;
    if (totalChangedLines <= parsedPolicy.maxChangedLinesPerFile) {
      continue;
    }

    oversizedChangeFindings.push(
      createFinding({
        ruleId: "max-changed-lines-per-file",
        category: "diff-size",
        severity: "medium",
        filePath,
        message: `File exceeds maxChangedLinesPerFile threshold (${parsedPolicy.maxChangedLinesPerFile}).`,
        evidence: `Changed lines: ${totalChangedLines} (added ${target.addedLines}, removed ${target.removedLines}).`,
      }),
    );
  }

  if (normalizedChangedFiles.length > parsedPolicy.maxChangedFiles) {
    oversizedChangeFindings.push(
      createFinding({
        ruleId: "max-changed-files",
        category: "diff-size",
        severity: "medium",
        filePath: "<repo>",
        message: `Change set exceeds maxChangedFiles threshold (${parsedPolicy.maxChangedFiles}).`,
        evidence: `Changed files: ${normalizedChangedFiles.length}.`,
      }),
    );
  }

  return { sensitivePathChanges, addedLineFindings, oversizedChangeFindings };
}

// ---------------------------------------------------------------------------
// Main pipeline coordinator
// ---------------------------------------------------------------------------

export async function generateCodeReviewReport(
  input: CodeReviewReportInput = {},
): Promise<CodeReviewReportOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const includeUntracked = input.includeUntracked ?? true;
  const policyPath = input.policyPath ?? DEFAULT_CODE_REVIEW_POLICY_PATH;
  const warnings: string[] = [];

  const { config: toolingConfig } = await loadToolingConfig(repoRoot);
  const baseRef = input.baseRef ?? toolingConfig.git.defaultBaseRef;
  const headRef = input.headRef ?? toolingConfig.git.defaultHeadRef;

  const { path: resolvedPolicyPath, policy } = await loadCodeReviewPolicy(
    repoRoot,
    policyPath,
    toolingConfig.configRoot,
  );
  const parsedPolicy = parseCodeReviewPolicy(policy, warnings);

  const changedFilesInput = Array.isArray(input.changedFiles)
    ? toSortedUnique(input.changedFiles.map((filePath) => toRepoRelativePath(repoRoot, filePath)))
    : undefined;

  // Stage 1: acquire diff data
  const { normalizedChangedFiles, diffData, changedFilesOutput } = await acquireDiffData(
    repoRoot,
    baseRef,
    headRef,
    includeUntracked,
    changedFilesInput,
    warnings,
  );

  // Stage 2: scan for findings
  const { sensitivePathChanges, addedLineFindings, oversizedChangeFindings } = scanForFindings(
    normalizedChangedFiles,
    diffData,
    parsedPolicy,
  );

  // Stage 3: aggregate results
  const allFindings = [...sensitivePathChanges, ...addedLineFindings, ...oversizedChangeFindings];
  const findingCounts = {
    low: allFindings.filter((finding) => finding.severity === "low").length,
    medium: allFindings.filter((finding) => finding.severity === "medium").length,
    high: allFindings.filter((finding) => finding.severity === "high").length,
    total: allFindings.length,
  };

  const riskLevel = deriveFindingBasedRiskLevel(findingCounts);

  const recommendedActions = toSortedUnique(
    [
      findingCounts.high > 0 ? "Resolve all high-severity code-review findings before merge." : "",
      findingCounts.medium > 0
        ? "Address medium-severity findings or explicitly document approved waivers."
        : "",
      sensitivePathChanges.length > 0
        ? "Request domain-owner approval for sensitive path changes before merge."
        : "",
      addedLineFindings.length > 0
        ? "Remove temporary debugging markers and unsafe directives from added lines."
        : "",
      oversizedChangeFindings.length > 0
        ? "Split oversized changes or attach focused validation evidence in the PR description."
        : "",
      allFindings.length === 0
        ? "No deterministic code-review findings detected. Continue with semantic human review."
        : "",
    ].filter((value) => value.length > 0),
  );

  const byExtension: Record<string, number> = {};
  for (const filePath of normalizedChangedFiles) {
    const bucket = extensionBucket(filePath);
    byExtension[bucket] = (byExtension[bucket] ?? 0) + 1;
  }

  const perFile = normalizedChangedFiles
    .map((filePath) => {
      const target = diffData.get(filePath) ?? {
        addedLines: 0,
        removedLines: 0,
      };

      return {
        filePath,
        addedLines: target.addedLines,
        removedLines: target.removedLines,
        totalChangedLines: target.addedLines + target.removedLines,
      };
    })
    .sort((a, b) => a.filePath.localeCompare(b.filePath));

  const totalAddedLines = perFile.reduce((sum, item) => sum + item.addedLines, 0);
  const totalRemovedLines = perFile.reduce((sum, item) => sum + item.removedLines, 0);

  return {
    tool: "generate_code_review_report",
    version: 1,
    generatedAt: new Date().toISOString(),
    repoRoot,
    policyPath: resolvedPolicyPath,
    inputs: {
      baseRef,
      headRef,
      includeUntracked,
      changedFiles: normalizedChangedFiles,
    },
    changedFiles: normalizedChangedFiles,
    summary: {
      totalFiles: normalizedChangedFiles.length,
      byExtension,
      totalAddedLines,
      totalRemovedLines,
      perFile,
    },
    findings: {
      sensitivePathChanges,
      addedLineFindings,
      oversizedChangeFindings,
    },
    findingCounts,
    riskLevel,
    recommendedActions,
    warnings: toSortedUnique([...(changedFilesOutput?.warnings ?? []), ...warnings]),
  };
}
