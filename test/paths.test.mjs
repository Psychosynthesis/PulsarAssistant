import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  escapesRoot,
  toPosixPath,
  toProjectRelativePath,
} from "../lib/paths.js";

test("toPosixPath normalizes backslashes to forward slashes", () => {
  assert.equal(toPosixPath("src\\server.ts"), "src/server.ts");
  assert.equal(toPosixPath("src/server.ts"), "src/server.ts");
  assert.equal(toPosixPath(""), "");
});

test("escapesRoot detects escaping relative paths", () => {
  assert.equal(escapesRoot(".."), true);
  assert.equal(escapesRoot("../outside"), true);
  assert.equal(escapesRoot("src/a.ts"), false);
  assert.equal(escapesRoot(""), false);
});

test("toProjectRelativePath returns canonical posix relative paths", () => {
  const root = path.resolve("project");
  const file = path.join(root, "src", "server.ts");
  assert.equal(toProjectRelativePath(root, file), "src/server.ts");

  // A project-relative input is resolved against the root.
  assert.equal(toProjectRelativePath(root, "src/server.ts"), "src/server.ts");

  // Backslashes in a relative input are accepted.
  assert.equal(toProjectRelativePath(root, "src\\server.ts"), "src/server.ts");
});

test("toProjectRelativePath throws when the path escapes the root", () => {
  const root = path.resolve("project");
  const outside = path.resolve("elsewhere", "a.ts");
  assert.throws(
    () => toProjectRelativePath(root, outside),
    /outside the project/,
  );
});
