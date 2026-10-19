import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { executeTool } from "../lib/builtin/tools.js";
import { PulsarEditorBackend } from "../lib/editor/editor-backend.js";

const DENY_POLICY = {
  allowCommands: false,
  testCommand: null,
  buildCommand: null,
  maxTurnRequests: null,
  toolCallDelayMs: null,
  toolOutputCompactInterval: null,
};

function makeHost(backend) {
  return {
    sessionUpdate: async () => {},
    requestPermission: async () => ({
      outcome: { outcome: "selected", optionId: "allow-once" },
    }),
    readTextFile: async (params) =>
      backend.readTextFile(params.path, {
        line: params.line,
        limit: params.limit,
      }),
    writeTextFile: async (params) =>
      backend.writeTextFile(params.path, params.content),
    moveTextFile: async () => {},
  };
}

function makeCtx(host, cwd) {
  return {
    host,
    sessionId: "sess",
    cwd,
    signal: new AbortController().signal,
    policy: DENY_POLICY,
    fileTree: null,
  };
}

test("read_file: line is a 1-based start, limit is a count", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tools-line-"));
  const backend = new PulsarEditorBackend();
  const host = makeHost(backend);
  const file = path.join(tmpDir, "a.txt");
  const content = Array.from({ length: 5 }, (_, i) => `L${i + 1}`).join("\n") + "\n";
  await backend.writeTextFile(file, content);

  try {
    const full = await executeTool(
      makeCtx(host, tmpDir),
      "read_file",
      JSON.stringify({ path: file }),
    );
    assert.equal(full.output, "L1\nL2\nL3\nL4\nL5\n");

    const slice = await executeTool(
      makeCtx(host, tmpDir),
      "read_file",
      JSON.stringify({ path: file, line: 2, limit: 2 }),
    );
    assert.equal(slice.output, "L2\nL3");

    // Stringified numbers must not be silently ignored.
    const strSlice = await executeTool(
      makeCtx(host, tmpDir),
      "read_file",
      JSON.stringify({ path: file, line: "3", limit: "1" }),
    );
    assert.equal(strSlice.output, "L3");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("write_diff: startLine/endLine replace an inclusive 1-based range", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tools-line-"));
  const backend = new PulsarEditorBackend();
  const host = makeHost(backend);
  const file = path.join(tmpDir, "a.txt");
  await backend.writeTextFile(file, "a\nb\nc\nd\n");

  try {
    await executeTool(
      makeCtx(host, tmpDir),
      "write_diff",
      JSON.stringify({ path: file, startLine: 2, endLine: 3, replace: "X\nY" }),
    );
    assert.equal(
      await (await backend.readTextFile(file)).content,
      "a\nX\nY\nd\n",
    );

    // startLine only replaces a single line.
    await executeTool(
      makeCtx(host, tmpDir),
      "write_diff",
      JSON.stringify({ path: file, startLine: 1, replace: "HEAD" }),
    );
    assert.equal(
      await (await backend.readTextFile(file)).content,
      "HEAD\nX\nY\nd\n",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("write_diff: preserves CRLF line endings for line-range edits", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tools-line-"));
  const backend = new PulsarEditorBackend();
  const host = makeHost(backend);
  const file = path.join(tmpDir, "a.txt");
  await backend.writeTextFile(file, "a\r\nb\r\nc\r\n");

  try {
    await executeTool(
      makeCtx(host, tmpDir),
      "write_diff",
      JSON.stringify({ path: file, startLine: 2, replace: "B" }),
    );
    assert.equal(
      await (await backend.readTextFile(file)).content,
      "a\r\nB\r\nc\r\n",
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("write_file: full content overwrites the file", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tools-line-"));
  const backend = new PulsarEditorBackend();
  const host = makeHost(backend);
  const file = path.join(tmpDir, "a.txt");
  await backend.writeTextFile(file, "old\n");

  try {
    const result = await executeTool(
      makeCtx(host, tmpDir),
      "write_file",
      JSON.stringify({ path: file, content: "new\ncontents\n" }),
    );
    assert.equal(
      await (await backend.readTextFile(file)).content,
      "new\ncontents\n",
    );
    assert.match(result.output, /Wrote /);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("write_file: rejects searchText/replaceText and points to write_diff", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tools-line-"));
  const backend = new PulsarEditorBackend();
  const host = makeHost(backend);
  const file = path.join(tmpDir, "a.txt");
  await backend.writeTextFile(file, "x = 1\n");

  try {
    await assert.rejects(
      executeTool(
        makeCtx(host, tmpDir),
        "write_file",
        JSON.stringify({ path: file, searchText: "x", replaceText: "z" }),
      ),
      /use write_diff/i,
    );
    // File must remain untouched.
    assert.equal(await (await backend.readTextFile(file)).content, "x = 1\n");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
