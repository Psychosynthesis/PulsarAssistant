"use strict";

const path = require("path");

function normalizeInputPath(raw) {
  if (raw === null || raw === void 0) return ".";
  let str = String(raw).trim();
  if (!str) return ".";

  if (
    (str.startsWith('"') && str.endsWith('"')) ||
    (str.startsWith("'") && str.endsWith("'"))
  ) {
    str = str.slice(1, -1).trim();
  }

  str = str.replace(/\\\//g, "/");
  str = str.replace(/\\\\/g, "\\");
  str = str.replace(/\/{2,}/g, "/");

  if (/^[a-zA-Z]:[/\\]/.test(str)) {
    return str;
  }

  str = str.replace(/^[/\\]+/, "");
  str = str.replace(/^\.[/\\]+/, "");
  return str.trim() || ".";
}

function normalizeSearchText(raw) {
  if (raw === null || raw === void 0) return "";
  const str = String(raw);
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

function resolveSafeProjectPath(cwd, requested) {
  const root = path.resolve(cwd);
  const normalized = normalizeInputPath(requested);

  let target;
  if (/^[a-zA-Z]:[/\\]/.test(normalized) || (process.platform !== "win32" && path.isAbsolute(normalized))) {
    target = path.resolve(normalized);
  } else {
    target = path.resolve(root, normalized);
  }

  const isWindows = process.platform === "win32";
  const normRoot = isWindows ? root.toLowerCase() : root;
  const normTarget = isWindows ? target.toLowerCase() : target;
  const rel = path.relative(normRoot, normTarget);

  if (rel.startsWith("..") || (isWindows ? /^[a-zA-Z]:/.test(rel) : path.isAbsolute(rel))) {
    throw new Error(`Path is outside the project: ${String(requested)}`);
  }

  return target;
}

function robustReplace(current, search, replace, replaceAll = true) {
  if (!search) {
    throw new Error("Search text cannot be empty.");
  }

  // Level 1: exact literal match
  if (current.includes(search)) {
    const parts = current.split(search);
    const count = parts.length - 1;
    if (!replaceAll && count > 1) {
      const newContent = current.replace(search, replace);
      return { newContent, count: 1 };
    }
    return { newContent: parts.join(replace), count };
  }

  // Level 2: Line-ending normalization (\r\n vs \n)
  const origHasCrlf = current.includes("\r\n");
  const normCurrent = current.replace(/\r\n/g, "\n");
  const normSearch = search.replace(/\r\n/g, "\n");
  const normReplace = replace.replace(/\r\n/g, "\n");

  if (normCurrent.includes(normSearch)) {
    let replaced;
    let count;
    if (replaceAll) {
      const parts = normCurrent.split(normSearch);
      count = parts.length - 1;
      replaced = parts.join(normReplace);
    } else {
      replaced = normCurrent.replace(normSearch, normReplace);
      count = 1;
    }
    const finalContent = origHasCrlf ? replaced.replace(/\n/g, "\r\n") : replaced;
    return { newContent: finalContent, count };
  }

  // Level 3: Unescape literal \n, \t, etc. in search text
  const unescapedSearch = normalizeSearchText(search).replace(/\r\n/g, "\n");
  const unescapedReplace = normalizeSearchText(replace).replace(/\r\n/g, "\n");

  if (normCurrent.includes(unescapedSearch)) {
    let replaced;
    let count;
    if (replaceAll) {
      const parts = normCurrent.split(unescapedSearch);
      count = parts.length - 1;
      replaced = parts.join(unescapedReplace);
    } else {
      replaced = normCurrent.replace(unescapedSearch, unescapedReplace);
      count = 1;
    }
    const finalContent = origHasCrlf ? replaced.replace(/\n/g, "\r\n") : replaced;
    return { newContent: finalContent, count };
  }

  // Level 4: Trailing whitespace tolerance on each line
  const trimTrailingLines = (s) =>
    s
      .replace(/\r\n/g, "\n")
      .split("\n")
      .map((l) => l.trimEnd())
      .join("\n");

  const trimmedCurrent = trimTrailingLines(current);
  const trimmedSearch = trimTrailingLines(search);

  if (trimmedCurrent.includes(trimmedSearch)) {
    const currentLines = current.replace(/\r\n/g, "\n").split("\n");
    const searchLines = search.replace(/\r\n/g, "\n").split("\n");
    const searchLinesTrimmed = searchLines.map((l) => l.trimEnd());

    let matchIdx = -1;
    for (let i = 0; i <= currentLines.length - searchLines.length; i++) {
      let matched = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (currentLines[i + j].trimEnd() !== searchLinesTrimmed[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        matchIdx = i;
        break;
      }
    }

    if (matchIdx !== -1) {
      const before = currentLines.slice(0, matchIdx);
      const after = currentLines.slice(matchIdx + searchLines.length);
      const repLines = replace.replace(/\r\n/g, "\n").split("\n");
      const combined = [...before, ...repLines, ...after];
      const joined = combined.join(origHasCrlf ? "\r\n" : "\n");
      return { newContent: joined, count: 1 };
    }
  }

  throw new Error(`Search text not found. Preview:\n${search.slice(0, 150)}`);
}

module.exports = {
  normalizeInputPath,
  normalizeSearchText,
  resolveSafeProjectPath,
  robustReplace,
};
