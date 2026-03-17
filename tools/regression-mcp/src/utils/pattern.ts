const REGEX_SPECIAL = /[.+^${}()|[\]\\]/g;

function escapeRegex(value: string): string {
  return value.replace(REGEX_SPECIAL, "\\$&");
}

export function normalizeForMatch(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}

export function globToRegExp(pattern: string): RegExp {
  const normalizedPattern = normalizeForMatch(pattern);
  let regex = "^";

  for (let i = 0; i < normalizedPattern.length; i += 1) {
    const char = normalizedPattern[i];
    const nextChar = normalizedPattern[i + 1];

    if (char === "*" && nextChar === "*") {
      regex += ".*";
      i += 1;
      continue;
    }

    if (char === "*") {
      regex += "[^/]*";
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    regex += escapeRegex(char);
  }

  regex += "$";
  return new RegExp(regex);
}

export function matchesPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizeForMatch(filePath);
  const regex = globToRegExp(pattern);
  return regex.test(normalizedPath);
}
