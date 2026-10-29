import { test } from "node:test";
import assert from "node:assert/strict";
import { executeTool } from "../lib/builtin/tools.js";

function makeContext(initial = "alpha\nbeta\ngamma\n") {
  let text = initial;
  let writes = 0;
  const ctx = {
    cwd: process.cwd(),
    sessionId: "test",
    signal: new AbortController().signal,
    policy: {
      allowCommands: false,
      testCommand: null,
      buildCommand: null,
      maxTurnRequests: null,
      toolCallDelayMs: null,
      toolOutputCompactInterval: null,
    },
    fileTree: null,
    host: {
      readTextFile: async () => ({ content: text }),
      writeTextFile: async ({ content }) => { text = content; writes++; },
    },
  };
  return {
    ctx,
    getText: () => text,
    getWrites: () => writes,
    edit: (args) => executeTool(ctx, "write_diff", JSON.stringify({ path: "file.txt", ...args })),
  };
}

test("write_diff: search-only mode edits the requested text", async () => {
  const state = makeContext();
  await state.edit({ search: "beta", replace: "B" });
  assert.equal(state.getText(), "alpha\nB\ngamma\n");
});

test("write_diff: rejects search combined with a line range without writing", async () => {
  const state = makeContext();
  await assert.rejects(
    state.edit({ startLine: 1, endLine: 1, search: "beta", replace: "B" }),
    /cannot combine.*search/i,
  );
  assert.equal(state.getText(), "alpha\nbeta\ngamma\n");
  assert.equal(state.getWrites(), 0);
});

test("write_diff: rejects invalid or out-of-bounds ranges without writing", async () => {
  const state = makeContext();
  for (const args of [
    { startLine: 0, replace: "X" },
    { startLine: 2, endLine: 1, replace: "X" },
    { startLine: 20, replace: "X" },
    { startLine: 1, endLine: 20, replace: "X" },
    { startLine: 1.5, replace: "X" },
    { endLine: 2, replace: "X" },
    { startLine: 1, all: true, replace: "X" },
  ]) {
    await assert.rejects(state.edit(args), /write_diff/);
  }
  assert.equal(state.getText(), "alpha\nbeta\ngamma\n");
  assert.equal(state.getWrites(), 0);
});

test("write_diff: requires a replacement but permits an explicit empty deletion", async () => {
  const state = makeContext();
  await assert.rejects(state.edit({ search: "beta" }), /requires.*replace/i);
  await assert.rejects(
    state.edit({ search: "beta", replace: "B", content: "C" }),
    /conflicting/i,
  );
  assert.equal(state.getWrites(), 0);
  await state.edit({ search: "beta\n", replace: "" });
  assert.equal(state.getText(), "alpha\ngamma\n");
});

test("write_diff: propagates read errors instead of overwriting the file", async () => {
  const state = makeContext();
  state.ctx.host.readTextFile = async () => { throw new Error("read failed"); };
  await assert.rejects(state.edit({ startLine: 1, replace: "X" }), /read failed/);
  assert.equal(state.getWrites(), 0);
});
