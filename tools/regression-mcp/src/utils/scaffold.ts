import type { JsonValue, ScenarioImplementationStatus } from "../types.js";
import { toSortedUnique } from "./fs.js";
import { asObjectRecord, asStringArray } from "./helpers.js";

export const COVERAGE_TITLE_PREFIX = "covers: ";

interface CoverageMarkers {
  scenarioId?: string;
  status?: ScenarioImplementationStatus;
  hasScenarioIdMarker: boolean;
  hasStatusMarker: boolean;
}

export interface ParsedCoverageTitle extends CoverageMarkers {
  scenarioTitle: string;
}

function normalizeSlugPart(value: string): string {
  const normalized = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");

  return normalized.length > 0 ? normalized : "scenario";
}

export function toScenarioId(flowId: string, scenarioTitle: string): string {
  return `${normalizeSlugPart(flowId)}.${normalizeSlugPart(scenarioTitle)}`;
}

function parseMarkers(value: string): CoverageMarkers {
  const markers: CoverageMarkers = {
    scenarioId: undefined,
    status: undefined,
    hasScenarioIdMarker: false,
    hasStatusMarker: false,
  };

  const markerPattern = /\s+\[(scenario-id|status):([^\]]+)\]/g;
  let match = markerPattern.exec(value);

  while (match) {
    const markerKey = match[1];
    const markerValue = match[2].trim();

    if (markerKey === "scenario-id") {
      markers.hasScenarioIdMarker = true;
      if (markerValue.length > 0) {
        markers.scenarioId = markerValue;
      }
    }

    if (markerKey === "status") {
      markers.hasStatusMarker = true;
      if (markerValue === "scaffold" || markerValue === "implemented") {
        markers.status = markerValue;
      }
    }

    match = markerPattern.exec(value);
  }

  return markers;
}

export function parseCoverageTitle(title: string): ParsedCoverageTitle | undefined {
  if (!title.startsWith(COVERAGE_TITLE_PREFIX)) {
    return undefined;
  }

  const markerPattern = /\s+\[(scenario-id|status):([^\]]+)\]/g;
  const content = title.slice(COVERAGE_TITLE_PREFIX.length);
  const markers = parseMarkers(content);
  const scenarioTitle = content.replace(markerPattern, "").trim();

  return {
    scenarioTitle,
    ...markers,
  };
}

export function buildCoverageTitle(
  scenarioTitle: string,
  scenarioId: string,
  status: ScenarioImplementationStatus,
): string {
  return `${COVERAGE_TITLE_PREFIX}${scenarioTitle} [scenario-id:${scenarioId}] [status:${status}]`;
}

/**
 * Creates a fresh global RegExp for extracting test/it titles from spec file content.
 * Returns a new instance each time to avoid shared lastIndex state.
 */
export function createTestTitlePattern(): RegExp {
  return /\b(?:test|it)\s*\(\s*(?:"([^"\\]*(?:\\.[^"\\]*)*)"|'([^'\\]*(?:\\.[^'\\]*)*)'|`([^`\\]*(?:\\.[^`\\]*)*)`)\s*,/g;
}

/**
 * Extracts the test title string from a testTitlePattern match.
 * Returns the first defined capture group (double-quoted, single-quoted, or template literal).
 */
export function extractTestTitle(match: RegExpExecArray): string {
  return match[1] ?? match[2] ?? match[3] ?? "";
}

export function extractFlowCoverage(policy: Record<string, JsonValue>): Record<string, string[]> {
  const flowsRecord = asObjectRecord(policy.flows);
  if (!flowsRecord) {
    return {};
  }

  const coverageByFlow: Record<string, string[]> = {};

  for (const [flowId, flowPolicyValue] of Object.entries(flowsRecord)) {
    const flowPolicy = asObjectRecord(flowPolicyValue);
    coverageByFlow[flowId] = toSortedUnique(asStringArray(flowPolicy?.minimumRegressionCoverage));
  }

  return coverageByFlow;
}
