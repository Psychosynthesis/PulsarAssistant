import { test } from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { resolveProjectPolicy } from "../lib/project-policy.js";

test("resolveProjectPolicy: denies when projects is missing", () => {
  const root = path.resolve("/tmp/app");
  assert.deepEqual(resolveProjectPolicy(root, undefined), {
    allowCommands: false,
    testCommand: null,
    buildCommand: null,
    maxTurnRequests: null,
    toolCallDelayMs: null,
    toolOutputCompactInterval: null,
    autoPinThreshold: null,
    includeUsage: null,
  });
});

test("resolveProjectPolicy: matches a configured project root", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [root]: { allowCommands: true, testCommand: "npm test", buildCommand: "npm run build" },
  });
  assert.equal(policy.allowCommands, true);
  assert.equal(policy.testCommand, "npm test");
  assert.equal(policy.buildCommand, "npm run build");
  assert.equal(policy.maxTurnRequests, null);
  assert.equal(policy.toolCallDelayMs, null);
  assert.equal(policy.toolOutputCompactInterval, null);
});

test("resolveProjectPolicy: reads buildCommand", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [root]: { buildCommand: "cargo build" },
  });
  assert.equal(policy.buildCommand, "cargo build");
  assert.equal(policy.testCommand, null);
});

test("resolveProjectPolicy: reads a positive maxTurnRequests", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [root]: { maxTurnRequests: 7 },
  });
  assert.equal(policy.maxTurnRequests, 7);
});

test("resolveProjectPolicy: ignores invalid maxTurnRequests", () => {
  const root = path.resolve("/tmp/app");
  for (const value of [0, -1, 1.5, "12", null, undefined]) {
    const policy = resolveProjectPolicy(root, {
      [root]: { maxTurnRequests: value },
    });
    assert.equal(policy.maxTurnRequests, null);
  }
});

test("resolveProjectPolicy: reads a positive toolCallDelayMs", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [root]: { toolCallDelayMs: 250 },
  });
  assert.equal(policy.toolCallDelayMs, 250);
});

test("resolveProjectPolicy: ignores invalid toolCallDelayMs", () => {
  const root = path.resolve("/tmp/app");
  for (const value of [0, -1, 1.5, "250", null, undefined]) {
    const policy = resolveProjectPolicy(root, {
      [root]: { toolCallDelayMs: value },
    });
    assert.equal(policy.toolCallDelayMs, null);
  }
});

test("resolveProjectPolicy: ignore allowCommands unless it is boolean true", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [root]: { allowCommands: "true", testCommand: "  ", buildCommand: "  " },
  });
  assert.equal(policy.allowCommands, false);
  assert.equal(policy.testCommand, null);
  assert.equal(policy.buildCommand, null);
});

test("resolveProjectPolicy: does not match a sibling folder", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [path.resolve("/tmp/other")]: {
      allowCommands: true,
      testCommand: "pytest",
      buildCommand: "make",
    },
  });
  assert.equal(policy.allowCommands, false);
  assert.equal(policy.testCommand, null);
  assert.equal(policy.buildCommand, null);
  assert.equal(policy.maxTurnRequests, null);
  assert.equal(policy.toolCallDelayMs, null);
  assert.equal(policy.toolOutputCompactInterval, null);
});

test("resolveProjectPolicy: reads a non-negative toolOutputCompactInterval (including 0)", () => {
  const root = path.resolve("/tmp/app");
  const policy0 = resolveProjectPolicy(root, {
    [root]: { toolOutputCompactInterval: 0 },
  });
  assert.equal(policy0.toolOutputCompactInterval, 0);

  const policy15 = resolveProjectPolicy(root, {
    [root]: { toolOutputCompactInterval: 15 },
  });
  assert.equal(policy15.toolOutputCompactInterval, 15);
});

test("resolveProjectPolicy: ignores invalid toolOutputCompactInterval", () => {
  const root = path.resolve("/tmp/app");
  for (const value of [-1, 1.5, "15", null, undefined, -10]) {
    const policy = resolveProjectPolicy(root, {
      [root]: { toolOutputCompactInterval: value },
    });
    assert.equal(policy.toolOutputCompactInterval, null);
  }
});

test("resolveProjectPolicy: reads a positive autoPinThreshold", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [root]: { autoPinThreshold: 3 },
  });
  assert.equal(policy.autoPinThreshold, 3);
});

test("resolveProjectPolicy: reads a zero autoPinThreshold (disables auto-pinning)", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(root, {
    [root]: { autoPinThreshold: 0 },
  });
  assert.equal(policy.autoPinThreshold, 0);
});

test("resolveProjectPolicy: ignores invalid autoPinThreshold", () => {
  const root = path.resolve("/tmp/app");
  for (const value of [-1, 1.5, "3", null, undefined]) {
    const policy = resolveProjectPolicy(root, {
      [root]: { autoPinThreshold: value },
    });
    assert.equal(policy.autoPinThreshold, null);
  }
});

test("resolveProjectPolicy: reads includeUsage as a boolean or defaults to null", () => {
  const root = path.resolve("/tmp/app");
  const enabled = resolveProjectPolicy(root, {
    [root]: { includeUsage: true },
  });
  assert.equal(enabled.includeUsage, true);

  const disabled = resolveProjectPolicy(root, {
    [root]: { includeUsage: false },
  });
  assert.equal(disabled.includeUsage, false);

  const unset = resolveProjectPolicy(root, {
    [root]: { allowCommands: true },
  });
  assert.equal(unset.includeUsage, null);
});

test("resolveProjectPolicy: matches equivalent path forms", () => {
  const root = path.resolve("/tmp/app");
  const policy = resolveProjectPolicy(`${root}${path.sep}`, {
    [path.join(root, ".")]: { allowCommands: true, testCommand: "go test", buildCommand: "go build" },
  });
  assert.equal(policy.allowCommands, true);
  assert.equal(policy.testCommand, "go test");
  assert.equal(policy.buildCommand, "go build");
});
