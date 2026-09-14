import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import {
  normalizeInputPath,
  normalizeSearchText,
  resolveSafeProjectPath,
  robustReplace,
} from "../lib/input-normalize.js";

test("normalizeInputPath: strips quotes and normalizes slashes", () => {
  assert.equal(normalizeInputPath('"src/view/agent-view.ts"'), "src/view/agent-view.ts");
  assert.equal(normalizeInputPath("'src/view/agent-view.ts'"), "src/view/agent-view.ts");
  assert.equal(normalizeInputPath("src\\/view\\/agent-view.ts"), "src/view/agent-view.ts");
  assert.equal(normalizeInputPath("src\\\\view\\\\agent-view.ts"), "src\\view\\agent-view.ts");
  assert.equal(normalizeInputPath("src//view//agent-view.ts"), "src/view/agent-view.ts");
});

test("normalizeInputPath: strips leading slashes and relative dots", () => {
  assert.equal(normalizeInputPath("/src/index.ts"), "src/index.ts");
  assert.equal(normalizeInputPath("\\src\\index.ts"), "src\\index.ts");
  assert.equal(normalizeInputPath("./src/index.ts"), "src/index.ts");
  assert.equal(normalizeInputPath(""), ".");
  assert.equal(normalizeInputPath(null), ".");
  assert.equal(normalizeInputPath(undefined), ".");
});

test("normalizeSearchText: unescapes literal backslash-n when no real newlines", () => {
  assert.equal(normalizeSearchText("hello\\nworld"), "hello\nworld");
  assert.equal(normalizeSearchText("hello\\tworld"), "hello\tworld");
  assert.equal(normalizeSearchText('say \\"hi\\"'), 'say "hi"');
  assert.equal(normalizeSearchText("real\nnewline"), "real\nnewline");
});

test("resolveSafeProjectPath: resolves paths inside project", () => {
  const cwd = path.resolve("/tmp/project");
  assert.equal(resolveSafeProjectPath(cwd, "src/main.ts"), path.join(cwd, "src/main.ts"));
  assert.equal(resolveSafeProjectPath(cwd, "/src/main.ts"), path.join(cwd, "src/main.ts"));
  assert.equal(resolveSafeProjectPath(cwd, "./src/main.ts"), path.join(cwd, "src/main.ts"));
});

test("resolveSafeProjectPath: throws on paths escaping project", () => {
  const cwd = path.resolve("/tmp/project");
  assert.throws(() => resolveSafeProjectPath(cwd, "../outside.ts"), /Path is outside the project/);
});

test("robustReplace: exact match replaces text", () => {
  const current = "const a = 1;\nconst b = 2;\n";
  const result = robustReplace(current, "const b = 2;", "const b = 42;");
  assert.equal(result.newContent, "const a = 1;\nconst b = 42;\n");
  assert.equal(result.count, 1);
});

test("robustReplace: CRLF file matched with LF searchText", () => {
  const current = "const a = 1;\r\nconst b = 2;\r\nconst c = 3;\r\n";
  const search = "const b = 2;\nconst c = 3;";
  const replace = "const b = 20;\nconst c = 30;";
  const result = robustReplace(current, search, replace);
  assert.equal(result.newContent, "const a = 1;\r\nconst b = 20;\r\nconst c = 30;\r\n");
  assert.equal(result.count, 1);
});

test("robustReplace: trailing whitespace tolerance", () => {
  const current = "function test() {  \n  return 42;\n}\n";
  const search = "function test() {\n  return 42;\n}";
  const replace = "function test() {\n  return 100;\n}";
  const result = robustReplace(current, search, replace);
  assert.equal(result.newContent, "function test() {\n  return 100;\n}\n");
});
