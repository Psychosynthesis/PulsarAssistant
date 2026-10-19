import * as path from "path";

/**
 * Canonical project path facade.
 *
 * Project-relative paths are always stored and compared as POSIX-style
 * strings (forward slashes), regardless of the platform the editor runs on.
 * This keeps persisted keys (e.g. pinned files, file tree keys) portable
 * between Windows and POSIX and prevents the classic Windows traps where a
 * backslash or a drive-letter case difference leaks into a `Set` or a JSON
 * key and silently breaks comparisons.
 */

/** Normalizes a relative path to use forward slashes on every platform. */
export function toPosixPath(relPath: string): string {
  return relPath.replace(/\\/g, "/");
}

/** True when a relative path escapes its root (`..`, absolute, or a drive). */
export function escapesRoot(rel: string): boolean {
  if (rel.startsWith("..")) return true;
  if (process.platform === "win32") {
    return /^[a-zA-Z]:/.test(rel) || path.isAbsolute(rel);
  }
  return path.isAbsolute(rel);
}

/**
 * Resolves a model- or user-provided path against a project root and returns a
 * canonical project-relative POSIX path. Throws when the target escapes the
 * root. Windows drive-letter casing is compared case-insensitively.
 */
export function toProjectRelativePath(root: string, filePath: string): string {
  const absRoot = path.resolve(root);
  const target = path.isAbsolute(filePath)
    ? path.resolve(filePath)
    : path.resolve(absRoot, filePath);

  const isWindows = process.platform === "win32";
  const cmpRoot = isWindows ? absRoot.toLowerCase() : absRoot;
  const cmpTarget = isWindows ? target.toLowerCase() : target;
  const rel = path.relative(cmpRoot, cmpTarget);

  if (escapesRoot(rel)) {
    throw new Error(`Path is outside the project: ${filePath}`);
  }
  return toPosixPath(rel);
}
