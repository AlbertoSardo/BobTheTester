import path from "node:path";

import {
  DEFAULT_BUSINESS_POLICY_PATH,
  DEFAULT_FLOW_MAP_PATH,
  findRepositoryRoot,
  loadBusinessReviewPolicy,
  loadFlowMapConfig,
  loadToolingConfig,
} from "../config.js";
import { toSortedUnique } from "../utils/fs.js";
import { asObjectRecord } from "../utils/helpers.js";
import { matchesPattern, normalizeForMatch } from "../utils/pattern.js";
import { getChangedFiles } from "./get-changed-files.js";

export interface SuggestFlowMapPatternsInput {
  changedFiles?: string[];
  policyPath?: string;
  flowMapPath?: string;
  baseRef?: string;
  headRef?: string;
  includeUntracked?: boolean;
  repoRoot?: string;
}

export interface PatternSuggestion {
  flowId: string;
  currentPatterns: string[];
  suggestedPatterns: string[];
  reason: string;
  unmatchedFiles: string[];
}

export interface SuggestFlowMapPatternsOutput {
  tool: "suggest_flow_map_patterns";
  suggestions: PatternSuggestion[];
  unmappedFiles: string[];
  warnings: string[];
}

export async function suggestFlowMapPatterns(
  input: SuggestFlowMapPatternsInput = {},
): Promise<SuggestFlowMapPatternsOutput> {
  const repoRoot = await findRepositoryRoot(input.repoRoot ?? process.cwd());
  const { config: toolingConfig } = await loadToolingConfig(repoRoot);
  const configRoot = toolingConfig.configRoot;
  const warnings: string[] = [];

  // Load policy to get known flow IDs
  const { policy } = await loadBusinessReviewPolicy(
    repoRoot,
    input.policyPath ?? DEFAULT_BUSINESS_POLICY_PATH,
    configRoot,
  );
  const flowsRecord = asObjectRecord(policy.flows) ?? {};
  const knownFlowIds = Object.keys(flowsRecord);

  // Load existing flow-map
  const { config: flowMapConfig } = await loadFlowMapConfig(
    repoRoot,
    input.flowMapPath ?? DEFAULT_FLOW_MAP_PATH,
    configRoot,
  );

  // Resolve changed files
  let changedFiles: string[];
  if (Array.isArray(input.changedFiles) && input.changedFiles.length > 0) {
    changedFiles = toSortedUnique(input.changedFiles);
  } else {
    const result = await getChangedFiles({
      baseRef: input.baseRef,
      headRef: input.headRef,
      includeUntracked: input.includeUntracked ?? true,
      repoRoot,
    });
    changedFiles = toSortedUnique([...result.changedFiles, ...result.untrackedFiles]);
  }

  // Find which files are unmapped
  const unmappedFiles: string[] = [];
  for (const file of changedFiles) {
    const normalized = normalizeForMatch(file);
    let matched = false;
    for (const mapping of flowMapConfig.mappings ?? []) {
      for (const pattern of mapping.filePatterns ?? []) {
        if (matchesPattern(normalized, normalizeForMatch(pattern))) {
          matched = true;
          break;
        }
      }
      if (matched) break;
    }
    if (!matched) {
      unmappedFiles.push(file);
    }
  }

  // For each flow, check if any changed files SHOULD match but don't.
  // Strategy: look at directory names in changed files and compare with flow IDs.
  const suggestions: PatternSuggestion[] = [];

  for (const flowId of knownFlowIds) {
    const existingMapping = (flowMapConfig.mappings ?? []).find((m) => m.flowId === flowId);
    const currentPatterns = existingMapping?.filePatterns ?? [];

    // Find files that might belong to this flow based on directory/file name similarity
    const flowWords = flowId.toLowerCase().split("-");
    const suggestedPatterns: string[] = [];
    const matchedUnmapped: string[] = [];

    for (const file of unmappedFiles) {
      const fileLower = file.toLowerCase();
      const pathParts = fileLower.split("/");

      // Check if any path segment contains flow-related words
      const isRelated = flowWords.some((word) =>
        pathParts.some(
          (part) =>
            part.includes(word) ||
            // Also check common English equivalents
            (word === "visita" && part.includes("visit")) ||
            (word === "entrata" && (part.includes("entry") || part.includes("entryexam"))) ||
            (word === "allergie" && part.includes("allerg")) ||
            (word === "prescrizioni" && part.includes("prescri")) ||
            (word === "campagne" && part.includes("campaign")) ||
            (word === "documenti" && part.includes("document")) ||
            (word === "laboratorio" && part.includes("lab")),
        ),
      );

      if (isRelated) {
        matchedUnmapped.push(file);
        // Derive a glob pattern from the file path
        const dir = path.dirname(file);
        const pattern = dir + "/**";
        if (
          !suggestedPatterns.includes(pattern) &&
          !currentPatterns.some((p) => normalizeForMatch(p) === normalizeForMatch(pattern))
        ) {
          suggestedPatterns.push(pattern);
        }
      }
    }

    if (suggestedPatterns.length > 0) {
      suggestions.push({
        flowId,
        currentPatterns,
        suggestedPatterns: toSortedUnique(suggestedPatterns),
        reason: `${matchedUnmapped.length} changed file(s) appear related to flow '${flowId}' but are not matched by current patterns.`,
        unmatchedFiles: toSortedUnique(matchedUnmapped),
      });
    }
  }

  return {
    tool: "suggest_flow_map_patterns",
    suggestions,
    unmappedFiles: toSortedUnique(unmappedFiles),
    warnings,
  };
}
