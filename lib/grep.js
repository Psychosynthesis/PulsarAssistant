"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/grep.ts
var grep_exports = {};
__export(grep_exports, {
  DEFAULT_MAX_FILE_BYTES: () => DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_RESULTS: () => DEFAULT_MAX_RESULTS,
  DEFAULT_SKIP_DIRS: () => DEFAULT_SKIP_DIRS,
  HARD_MAX_RESULTS: () => HARD_MAX_RESULTS,
  findFiles: () => findFiles,
  grepFiles: () => grepFiles,
  listDirectory: () => listDirectory,
  makeExtensionsMatcher: () => makeExtensionsMatcher,
  parseDslPattern: () => parseDslPattern
});
module.exports = __toCommonJS(grep_exports);
var fs2 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// src/project-uri.ts
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/input-normalize.ts
var path = __toESM(require("path"));
function normalizeInputPath(raw) {
  if (typeof raw !== "string") return "";
  let p = raw.trim();
  if (!p) return "";
  if (p.startsWith('"') && p.endsWith('"') || p.startsWith("'") && p.endsWith("'") || p.startsWith("`") && p.endsWith("`")) {
    p = p.slice(1, -1).trim();
  }
  p = p.replace(/\\\//g, "/");
  const isWinDrive = /^[a-zA-Z]:[/\\]/.test(p);
  p = p.replace(/\\/g, "/");
  p = p.replace(/\/+/g, "/");
  if (!isWinDrive && p.startsWith("/")) {
    p = p.replace(/^\/+/, "");
  }
  p = p.replace(/^\.\//, "");
  return p;
}
function resolveSafeProjectPath(cwd, requested) {
  const norm = normalizeInputPath(requested);
  if (!norm || norm === ".") {
    return path.resolve(cwd);
  }
  const root = path.resolve(cwd);
  const target = path.isAbsolute(norm) ? path.resolve(norm) : path.resolve(root, norm);
  const isWindows = process.platform === "win32";
  const normRoot = isWindows ? root.toLowerCase() : root;
  const normTarget = isWindows ? target.toLowerCase() : target;
  const rel = path.relative(normRoot, normTarget);
  if (rel.startsWith("..") || (isWindows ? /^[a-zA-Z]:/.test(rel) : path.isAbsolute(rel))) {
    throw new Error(`Path is outside the project: ${String(requested)}`);
  }
  return target;
}

// src/project-uri.ts
function resolveRealPath(filePath) {
  const target = path2.resolve(filePath);
  let current = target;
  const missing = [];
  while (true) {
    try {
      const real = fs.realpathSync(current);
      return missing.length > 0 ? path2.join(real, ...missing) : real;
    } catch (error) {
      const code = error.code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = path2.dirname(current);
      if (parent === current) return target;
      missing.unshift(path2.basename(current));
      current = parent;
    }
  }
}
function resolveInsideRoot(cwd, requested) {
  const target = resolveSafeProjectPath(cwd, requested);
  const root = path2.resolve(cwd);
  const realRoot = resolveRealPath(root);
  const realTarget = resolveRealPath(target);
  const isWindows = process.platform === "win32";
  const realRel = path2.relative(
    isWindows ? realRoot.toLowerCase() : realRoot,
    isWindows ? realTarget.toLowerCase() : realTarget
  );
  if (realRel.startsWith("..") || (isWindows ? /^[a-zA-Z]:/.test(realRel) : path2.isAbsolute(realRel))) {
    throw new Error(`Path is outside the project: ${requested}`);
  }
  return target;
}

// src/ignored-dirs.ts
var DEFAULT_IGNORED_DIRS = [
  // Version control
  ".git",
  ".hg",
  ".svn",
  ".jj",
  // Dependencies & package managers
  "node_modules",
  ".pnpm-store",
  ".yarn",
  "vendor",
  ".bundle",
  ".cargo",
  ".rustup",
  // Build outputs & caches
  "dist",
  "build",
  "out",
  ".output",
  "target",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".gradle",
  // Test coverage & reports
  "coverage",
  ".nyc_output",
  // Python environments & caches
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  // IDEs & editors
  ".idea",
  ".vscode",
  ".pulsar"
];
var DEFAULT_IGNORED_SET = new Set(DEFAULT_IGNORED_DIRS);
function buildIgnoredDirsSet(customDirs) {
  const set = new Set(DEFAULT_IGNORED_SET);
  if (customDirs) {
    for (const dir of customDirs) {
      const trimmed = dir.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return set;
}
function getConfiguredIgnoredDirs() {
  if (typeof atom !== "undefined" && atom?.config?.get) {
    const custom = atom.config.get("pulsar-assistant.ignoredDirectories");
    if (Array.isArray(custom)) {
      return buildIgnoredDirsSet(custom.filter((x) => typeof x === "string"));
    }
  }
  return new Set(DEFAULT_IGNORED_SET);
}

// src/grep.ts
var DEFAULT_SKIP_DIRS = buildIgnoredDirsSet();
var DEFAULT_MAX_FILE_BYTES = 1 * 1024 * 1024;
var DEFAULT_MAX_RESULTS = 100;
var HARD_MAX_RESULTS = 500;
function splitUnescaped(input, delimiter) {
  const parts = [];
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\\") {
      current += ch;
      if (i + 1 < input.length) {
        current += input[i + 1];
        i++;
      }
      continue;
    }
    if (ch === delimiter) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}
function atomToRegExp(atom2, caseInsensitive) {
  let regexStr = "^";
  let i = 0;
  while (i < atom2.length) {
    const ch = atom2[i];
    if (ch === "\\") {
      if (i + 1 < atom2.length) {
        const next = atom2[i + 1];
        if ("\\^$+{}()|[]*?.#".includes(next)) {
          regexStr += `\\${next}`;
        } else {
          regexStr += next;
        }
        i += 2;
        continue;
      } else {
        regexStr += "\\\\";
        i++;
        continue;
      }
    }
    if (ch === "*") {
      regexStr += ".*";
      i++;
      continue;
    }
    if (ch === "?") {
      regexStr += ".";
      i++;
      continue;
    }
    if ("\\^$+{}()|[]*.#".includes(ch)) {
      regexStr += `\\${ch}`;
    } else {
      regexStr += ch;
    }
    i++;
  }
  regexStr += "$";
  return new RegExp(regexStr, caseInsensitive ? "i" : "");
}
function parseDslPattern(pattern, caseInsensitive = false) {
  if (!pattern || !pattern.trim()) {
    return () => true;
  }
  const orBranches = splitUnescaped(pattern, "|").filter((s) => s.length > 0);
  if (orBranches.length === 0) {
    return () => true;
  }
  const compiledOrBranches = orBranches.map((branch) => {
    const andTerms = splitUnescaped(branch, "&").filter((s) => s.length > 0);
    return andTerms.map((term) => atomToRegExp(term, caseInsensitive));
  });
  return (basename3) => {
    return compiledOrBranches.some(
      (andTerms) => andTerms.every((regex) => regex.test(basename3))
    );
  };
}
function makeExtensionsMatcher(extensions, caseInsensitive = false) {
  if (!extensions || extensions.length === 0) {
    return () => true;
  }
  const normalized = extensions.map((ext) => {
    const trimmed = ext.trim().replace(/^\./, "");
    return caseInsensitive ? trimmed.toLowerCase() : trimmed;
  }).filter(Boolean);
  if (normalized.length === 0) return () => true;
  const set = new Set(normalized);
  return (basename3) => {
    const ext = path3.extname(basename3).replace(/^\./, "");
    const target = caseInsensitive ? ext.toLowerCase() : ext;
    return set.has(target);
  };
}
function looksBinary(buffer) {
  const check = buffer.subarray(0, 1024);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}
async function walkFiles(root, skipDirs, visit) {
  const stack = [
    { dir: root, relative: "" }
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = await fs2.promises.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolutePath = path3.join(current.dir, entry.name);
      const relativePath = current.relative ? path3.join(current.relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        stack.push({ dir: absolutePath, relative: relativePath });
        continue;
      }
      if (!entry.isFile()) continue;
      const keepGoing = await visit(absolutePath, relativePath);
      if (keepGoing === false) return;
    }
  }
}
async function findFiles(options) {
  const cwd = path3.resolve(options.cwd);
  const normalizedSearch = normalizeInputPath(options.searchPath ?? ".");
  const searchRoot = resolveInsideRoot(cwd, normalizedSearch || ".");
  const skipDirs = options.skipDirs ?? getConfiguredIgnoredDirs();
  const maxResults = Math.max(
    1,
    Math.min(options.maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS)
  );
  const dslMatcher = parseDslPattern(options.pattern, options.caseInsensitive === true);
  const extMatcher = makeExtensionsMatcher(options.extensions, options.caseInsensitive === true);
  const matches = [];
  const searchRel = path3.relative(cwd, searchRoot).replace(/\\/g, "/");
  if (options.fileTree && options.fileTree.size > 0) {
    const all = searchRel === "" || searchRel === "." ? options.fileTree.listAll() : options.fileTree.findInDirectory(searchRel);
    for (const item of all) {
      if (item.isDirectory) continue;
      const basename3 = path3.posix.basename(item.path);
      if (dslMatcher(basename3) && extMatcher(basename3)) {
        matches.push(path3.resolve(cwd, item.path));
        if (matches.length >= maxResults) break;
      }
    }
    if (all.length > 0 || matches.length > 0) {
      return matches;
    }
  }
  await walkFiles(searchRoot, skipDirs, async (absolutePath) => {
    const basename3 = path3.basename(absolutePath);
    if (!dslMatcher(basename3) || !extMatcher(basename3)) return;
    matches.push(absolutePath);
    if (matches.length >= maxResults) return false;
  });
  return matches;
}
async function grepFiles(options) {
  const cwd = path3.resolve(options.cwd);
  const normalizedSearch = normalizeInputPath(options.searchPath ?? ".");
  const searchRoot = resolveInsideRoot(cwd, normalizedSearch || ".");
  const skipDirs = options.skipDirs ?? getConfiguredIgnoredDirs();
  const maxResults = Math.max(
    1,
    Math.min(options.maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS)
  );
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const matches = [];
  const query = options.caseInsensitive ? options.query.toLowerCase() : options.query;
  if (!query) {
    return matches;
  }
  let searchStat = null;
  try {
    searchStat = await fs2.promises.stat(searchRoot);
  } catch {
    return matches;
  }
  if (searchStat.isFile()) {
    await searchSingleFile(searchRoot);
    return matches;
  }
  async function searchSingleFile(absolutePath) {
    let stat;
    try {
      stat = await fs2.promises.stat(absolutePath);
    } catch {
      return;
    }
    if (stat.size > maxFileBytes) return;
    let buffer;
    try {
      buffer = await fs2.promises.readFile(absolutePath);
    } catch {
      return;
    }
    if (looksBinary(buffer)) return;
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const target = options.caseInsensitive ? line.toLowerCase() : line;
      if (!target.includes(query)) continue;
      matches.push({
        path: absolutePath,
        line: i + 1,
        text: lines[i].length > 400 ? `${lines[i].slice(0, 400)}\u2026` : lines[i]
      });
      if (matches.length >= maxResults) return false;
    }
  }
  const searchRel = path3.relative(cwd, searchRoot).replace(/\\/g, "/");
  if (options.fileTree && options.fileTree.size > 0) {
    const all = searchRel === "" || searchRel === "." ? options.fileTree.listAll() : options.fileTree.findInDirectory(searchRel);
    for (const item of all) {
      if (item.isDirectory) continue;
      const abs = path3.resolve(cwd, item.path);
      const keep = await searchSingleFile(abs);
      if (keep === false) break;
    }
    if (all.length > 0 || matches.length > 0) {
      return matches;
    }
  }
  await walkFiles(searchRoot, skipDirs, async (absolutePath) => {
    const keep = await searchSingleFile(absolutePath);
    if (keep === false) return false;
  });
  return matches;
}
async function listDirectory(dirPath) {
  const entries = await fs2.promises.readdir(dirPath, { withFileTypes: true });
  const listed = entries.map((entry) => {
    let type = "other";
    if (entry.isDirectory()) type = "directory";
    else if (entry.isFile()) type = "file";
    return { name: entry.name, type };
  });
  listed.sort((a, b) => a.name.localeCompare(b.name));
  return listed;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_MAX_FILE_BYTES,
  DEFAULT_MAX_RESULTS,
  DEFAULT_SKIP_DIRS,
  HARD_MAX_RESULTS,
  findFiles,
  grepFiles,
  listDirectory,
  makeExtensionsMatcher,
  parseDslPattern
});
//# sourceMappingURL=grep.js.map
