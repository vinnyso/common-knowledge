export function normalizeText(value) {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export function tokens(value) {
  return normalizeText(value).match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function overlappingTokens(left, right) {
  const rightSet = new Set(right);
  return [...new Set(left.filter((t) => rightSet.has(t)))].sort();
}

export function globCharacterClass(segment, start) {
  const end = segment.indexOf("]", start + 1);
  if (end === -1) return undefined;
  let contents = segment.slice(start + 1, end);
  const negated = contents.startsWith("!");
  if (negated) contents = contents.slice(1);
  if (contents.length === 0 || contents.includes("[")) return undefined;

  let expression = "";
  for (let index = 0; index < contents.length; index += 1) {
    const character = contents[index] ?? "";
    const rangeEnd = contents[index + 2] ?? "";
    if (
      character !== undefined &&
      contents[index + 1] === "-" &&
      rangeEnd !== undefined &&
      /^[A-Za-z0-9]$/.test(character) &&
      /^[A-Za-z0-9]$/.test(rangeEnd)
    ) {
      if (character.charCodeAt(0) > rangeEnd.charCodeAt(0)) return undefined;
      expression += `${character}-${rangeEnd}`;
      index += 2;
    } else {
      expression += character.replace(/[\\\]^\-]/g, "\\$&") ?? "";
    }
  }
  return { expression: `[${negated ? "^" : ""}${expression}]`, end };
}

const scopeRegexCache = new Map();

export function compileScopePattern(pattern) {
  const cached = scopeRegexCache.get(pattern);
  if (cached) return cached;

  const segments = pattern.split("/");
  let expression = "^";
  for (const [index, segment] of segments.entries()) {
    if (segment === "**") {
      expression += index === segments.length - 1 ? ".*" : "(?:[^/]+/)*";
      continue;
    }
    for (let characterIndex = 0; characterIndex < segment.length; characterIndex += 1) {
      const character = segment[characterIndex];
      if (character === "*") expression += "[^/]*";
      else if (character === "?") expression += "[^/]";
      else if (character === "[") {
        const characterClass = globCharacterClass(segment, characterIndex);
        if (characterClass === undefined) expression += "\\[";
        else {
          expression += characterClass.expression;
          characterIndex = characterClass.end;
        }
      } else {
        expression += (character ?? "").replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
      }
    }
    if (index < segments.length - 1) expression += "/";
  }

  const re = new RegExp(`${expression}$`);
  scopeRegexCache.set(pattern, re);
  return re;
}

export function scopeMatches(pattern, path) {
  const re = compileScopePattern(pattern);
  return re.test(path);
}

export const __testing = { compileScopePattern, scopeMatches, tokens, globCharacterClass, normalizeText };
