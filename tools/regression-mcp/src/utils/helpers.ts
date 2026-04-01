import type { JsonValue } from "../types.js";

/**
 * Safely cast a JsonValue to a Record<string, JsonValue> if it is a plain object.
 * Returns undefined for null, arrays, non-objects, and undefined input.
 */
export function asObjectRecord(value: JsonValue | undefined): Record<string, JsonValue> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, JsonValue>;
}

/**
 * Extract string elements from a JsonValue array.
 * Non-string elements are silently dropped.
 */
export function asStringArray(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

/**
 * Extract string elements from a JsonValue array, also filtering out
 * whitespace-only and empty strings.
 */
export function asStringArrayStrict(value: JsonValue | undefined): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}
