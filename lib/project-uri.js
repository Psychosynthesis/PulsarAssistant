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

// src/project-uri.ts
var project_uri_exports = {};
__export(project_uri_exports, {
  PULSAR_ACP_AGENT_URI_PREFIX: () => PULSAR_ACP_AGENT_URI_PREFIX,
  normalizeProjectRoot: () => normalizeProjectRoot,
  parseAgentUri: () => parseAgentUri,
  projectFolderName: () => projectFolderName,
  resolveInsideRoot: () => resolveInsideRoot,
  sameProjectRoot: () => sameProjectRoot,
  uriForProject: () => uriForProject
});
module.exports = __toCommonJS(project_uri_exports);
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
var PULSAR_ACP_AGENT_URI_PREFIX = "atom://pulsar-assistant/project/";
function normalizeProjectRoot(projectRoot) {
  return path2.resolve(projectRoot);
}
function uriForProject(projectRoot) {
  return PULSAR_ACP_AGENT_URI_PREFIX + encodeURIComponent(normalizeProjectRoot(projectRoot));
}
function parseAgentUri(uri) {
  if (!uri.startsWith(PULSAR_ACP_AGENT_URI_PREFIX)) return null;
  try {
    const decoded = decodeURIComponent(
      uri.slice(PULSAR_ACP_AGENT_URI_PREFIX.length)
    );
    if (!decoded) return null;
    return normalizeProjectRoot(decoded);
  } catch {
    return null;
  }
}
function sameProjectRoot(a, b) {
  const left = normalizeProjectRoot(a);
  const right = normalizeProjectRoot(b);
  if (process.platform === "win32") {
    return left.toLowerCase() === right.toLowerCase();
  }
  return left === right;
}
function projectFolderName(projectRoot) {
  const base = path2.basename(normalizeProjectRoot(projectRoot));
  return base || projectRoot;
}
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
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  PULSAR_ACP_AGENT_URI_PREFIX,
  normalizeProjectRoot,
  parseAgentUri,
  projectFolderName,
  resolveInsideRoot,
  sameProjectRoot,
  uriForProject
});
//# sourceMappingURL=project-uri.js.map
