import * as path from "path";

/**
 * Normalizes a raw input path provided by LLM agents.
 * Strips surrounding quotes, unescapes escaped slashes, normalizes backslashes,
 * removes duplicate slashes, and strips leading slashes if they are not part of an
 * absolute Windows drive path.
 */
export function normalizeInputPath(raw: unknown): string {
  if (typeof raw !== "string") return "";
  let p = raw.trim();
  if (!p) return "";

  // Strip surrounding quotes if present (e.g. "path/to/file" or 'path/to/file')
  if (
    (p.startsWith('"') && p.endsWith('"')) ||
    (p.startsWith("'") && p.endsWith("'")) ||
    (p.startsWith("`") && p.endsWith("`"))
  ) {
    p = p.slice(1, -1).trim();
  }

  // Unescape backslash-escaped slashes (\/ -> /)
  p = p.replace(/\\\//g, "/");

  // If on Windows and starts with a drive letter (e.g. C: or c:\), preserve it
  const isWinDrive = /^[a-zA-Z]:[/\\]/.test(p);

  // Normalize all backslashes to forward slashes for uniform processing
  p = p.replace(/\\/g, "/");

  // Collapse duplicate slashes (e.g. foo//bar -> foo/bar)
  p = p.replace(/\/+/g, "/");

  // If it's not a Windows absolute drive path and starts with a slash,
  // models almost always mean relative to the project root (/src/foo -> src/foo)
  if (!isWinDrive && p.startsWith("/")) {
    p = p.replace(/^\/+/, "");
  }

  // Strip leading ./
  p = p.replace(/^\.\//, "");

  return p;
}

/**
 * Normalizes search text that an LLM agent might have provided with
 * escaped sequences (e.g. literal "\n" instead of an actual newline).
 */
export function normalizeSearchText(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const str = raw;
  if (!str.includes("\n") && !str.includes("\r") && /\\n|\\t|\\r|\\"|\\'/.test(str)) {
    return str
      .replace(/\\r\\n/g, "\r\n")
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'");
  }
  return str;
}

/**
 * Resolves a requested path safely inside project root.
 * Handles Windows drive casing differences, prevents directory traversal,
 * and strips root-relative leading slashes.
 */
export function resolveSafeProjectPath(cwd: string, requested: unknown): string {
  const norm = normalizeInputPath(requested);
  if (!norm || norm === ".") {
    return path.resolve(cwd);
  }

  const root = path.resolve(cwd);
  const target = path.isAbsolute(norm) ? path.resolve(norm) : path.resolve(root, norm);

  // Compare paths with respect to Windows case-insensitivity
  const isWindows = process.platform === "win32";
  const normRoot = isWindows ? root.toLowerCase() : root;
  const normTarget = isWindows ? target.toLowerCase() : target;

  const rel = path.relative(normRoot, normTarget);
  if (rel.startsWith("..") || (isWindows ? /^[a-zA-Z]:/.test(rel) : path.isAbsolute(rel))) {
    throw new Error(`Path is outside the project: ${String(requested)}`);
  }

  return target;
}

/**
 * Robust string replacement that gracefully handles:
 * 1. Line ending differences (\r\n in file vs \n in LLM input).
 * 2. Unescaped literal escape sequences (e.g. "\n" vs newline).
 * 3. Trailing whitespace differences per line.
 */
export function robustReplace(
  current: string,
  search: string,
  replace: string,
  replaceAll = false,
): { newContent: string; count: number } {
  if (!search) {
    throw new Error("Search text cannot be empty.");
  }

  // Check original line endings
  const usesCrlf = current.includes("\r\n");

  // Level 1: Direct exact match
  let parts = current.split(search);
  if (parts.length > 1) {
    const count = replaceAll ? parts.length - 1 : 1;
    const newContent = replaceAll
      ? parts.join(replace)
      : parts[0] + replace + parts.slice(1).join(search);
    return { newContent, count };
  }

  // Level 2: Normalize line endings to \n
  const normCurrent = current.replace(/\r\n/g, "\n");
  const normSearch = search.replace(/\r\n/g, "\n");
  const normReplace = replace.replace(/\r\n/g, "\n");

  parts = normCurrent.split(normSearch);
  if (parts.length > 1) {
    const count = replaceAll ? parts.length - 1 : 1;
    let joined = replaceAll
      ? parts.join(normReplace)
      : parts[0] + normReplace + parts.slice(1).join(normSearch);

    if (usesCrlf) {
      joined = joined.replace(/\n/g, "\r\n");
    }
    return { newContent: joined, count };
  }

  // Level 3: Unescape literal \n, \t, \" in search and replace if they contain no actual newlines
  if (search.includes("\\n") && !search.includes("\n")) {
    const unescapedSearch = search
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"');
    const unescapedReplace = replace
      .replace(/\\n/g, "\n")
      .replace(/\\r/g, "\r")
      .replace(/\\t/g, "\t")
      .replace(/\\"/g, '"');

    const result = robustReplace(current, unescapedSearch, unescapedReplace, replaceAll);
    if (result.count > 0) return result;
  }

  // Level 4: Trailing whitespace tolerance (line-by-line match)
  const currentLines = normCurrent.split("\n");
  const searchLines = normSearch.split("\n");

  if (searchLines.length > 1 && searchLines.length <= currentLines.length) {
    const trimmedSearchLines = searchLines.map((l) => l.trimEnd());
    for (let i = 0; i <= currentLines.length - searchLines.length; i++) {
      let matched = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (currentLines[i + j].trimEnd() !== trimmedSearchLines[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        // Found match at line i
        const before = currentLines.slice(0, i);
        const after = currentLines.slice(i + searchLines.length);
        const replaceLines = normReplace.split("\n");
        let combined = [...before, ...replaceLines, ...after].join("\n");
        if (usesCrlf) {
          combined = combined.replace(/\n/g, "\r\n");
        }
        return { newContent: combined, count: 1 };
      }
    }
  }

  throw new Error("Search text not found in file.");
}
