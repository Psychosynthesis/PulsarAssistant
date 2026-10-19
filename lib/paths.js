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

// src/paths.ts
var paths_exports = {};
__export(paths_exports, {
  escapesRoot: () => escapesRoot,
  toPosixPath: () => toPosixPath,
  toProjectRelativePath: () => toProjectRelativePath
});
module.exports = __toCommonJS(paths_exports);
var path = __toESM(require("path"));
function toPosixPath(relPath) {
  return relPath.replace(/\\/g, "/");
}
function escapesRoot(rel) {
  if (rel.startsWith("..")) return true;
  if (process.platform === "win32") {
    return /^[a-zA-Z]:/.test(rel) || path.isAbsolute(rel);
  }
  return path.isAbsolute(rel);
}
function toProjectRelativePath(root, filePath) {
  const absRoot = path.resolve(root);
  const target = path.isAbsolute(filePath) ? path.resolve(filePath) : path.resolve(absRoot, filePath);
  const isWindows = process.platform === "win32";
  const cmpRoot = isWindows ? absRoot.toLowerCase() : absRoot;
  const cmpTarget = isWindows ? target.toLowerCase() : target;
  const rel = path.relative(cmpRoot, cmpTarget);
  if (escapesRoot(rel)) {
    throw new Error(`Path is outside the project: ${filePath}`);
  }
  return toPosixPath(rel);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  escapesRoot,
  toPosixPath,
  toProjectRelativePath
});
//# sourceMappingURL=paths.js.map
