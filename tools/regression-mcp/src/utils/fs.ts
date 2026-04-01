import { readdir } from "node:fs/promises";
import path from "node:path";

import { normalizeForMatch } from "./pattern.js";

export async function listFilesRecursively(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      const nestedFiles = await listFilesRecursively(fullPath);
      files.push(...nestedFiles);
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export function toSortedUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((a, b) => a.localeCompare(b));
}

export function toRepoRelativePath(repoRoot: string, filePath: string): string {
  const normalizedFile = path.normalize(filePath);
  if (!path.isAbsolute(normalizedFile)) {
    return normalizeForMatch(normalizedFile);
  }

  const relative = path.relative(repoRoot, normalizedFile);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    return normalizeForMatch(normalizedFile);
  }

  return normalizeForMatch(relative);
}
