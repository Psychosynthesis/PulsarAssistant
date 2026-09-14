import { test } from "node:test";
import assert from "node:assert/strict";
// Imports the built bundle, not src/agent-config.ts: tests run on Pulsar's Node
// (20.16, per .nvmrc), which can't execute TypeScript. `npm run build` emits
// lib/agent-config.js.
import {
  groupAgents,
  isLaunchedAgentStale,
  launchTargetsEqual,
  normalizeAgentsConfig,
  resolveAgent,
  resolveActiveAgent,
  toLaunchTarget,
} from "../lib/agent-config.js";

// ---------------------------------------------------------------------------
// normalizeAgentsConfig
// ---------------------------------------------------------------------------

test("normalizeAgentsConfig: tolerates undefined and non-objects", () => {
  for (const raw of [undefined, null, 42, "x", []]) {
    const config = normalizeAgentsConfig(raw);
    assert.deepEqual(config.agents, {});
    assert.equal(config.version, undefined);
    assert.equal(config.activeAgentId, undefined);
  }
});

test("normalizeAgentsConfig: drops invalid agent entries", () => {
  const config = normalizeAgentsConfig({
    agents: {
      good: { name: "Good", command: "good --acp" },
      noCommand: { name: "No command" },
      emptyCommand: { name: "Empty", command: "   " },
      notObject: "nope",
    },
  });
  assert.deepEqual(Object.keys(config.agents), ["good"]);
  assert.deepEqual(config.agents.good, {
    name: "Good",
    type: "acp",
    command: "good --acp",
  });
});

test("normalizeAgentsConfig: defaults a missing name to the id", () => {
  const config = normalizeAgentsConfig({
    agents: { foo: { command: "foo --acp" } },
  });
  assert.equal(config.agents.foo.name, "foo");
});

test("normalizeAgentsConfig: preserves unknown fields", () => {
  const config = normalizeAgentsConfig({
    version: 1,
    future: "keep-me",
    agents: { foo: { name: "Foo", command: "foo", env: { A: "1" } } },
  });
  assert.equal(config.future, "keep-me");
  assert.equal(config.version, 1);
  assert.deepEqual(config.agents.foo.env, { A: "1" });
});

test("normalizeAgentsConfig: drops an empty activeAgentId", () => {
  assert.equal(normalizeAgentsConfig({ activeAgentId: "  " }).activeAgentId, undefined);
});

// ---------------------------------------------------------------------------
// resolveActiveAgent (STRICT)
// ---------------------------------------------------------------------------

test("resolveActiveAgent: ok when activeAgentId is set and present", () => {
  const config = normalizeAgentsConfig({
    activeAgentId: "a",
    agents: { a: { name: "A", command: "a" } },
  });
  const resolved = resolveActiveAgent(config);
  assert.equal(resolved.reason, "ok");
  assert.equal(resolved.id, "a");
  assert.equal(resolved.agent.command, "a");
});

test("resolveActiveAgent: no-agents when registry is empty", () => {
  assert.equal(resolveActiveAgent(normalizeAgentsConfig({})).reason, "no-agents");
});

test("resolveActiveAgent: STRICT — never falls back to the first agent", () => {
  const config = normalizeAgentsConfig({
    agents: {
      a: { name: "A", command: "a" },
      b: { name: "B", command: "b" },
    },
  });
  const resolved = resolveActiveAgent(config);
  assert.equal(resolved.reason, "unset-or-invalid");
  assert.equal(resolved.agent, undefined);
  assert.equal(resolved.id, undefined);
});

test("resolveActiveAgent: unset-or-invalid when activeAgentId points nowhere", () => {
  const config = normalizeAgentsConfig({
    activeAgentId: "gone",
    agents: { a: { name: "A", command: "a" } },
  });
  assert.equal(resolveActiveAgent(config).reason, "unset-or-invalid");
});

// ---------------------------------------------------------------------------
// isLaunchedAgentStale
// ---------------------------------------------------------------------------

test("isLaunchedAgentStale: true when the launched id is gone", () => {
  const config = normalizeAgentsConfig({ agents: { a: { name: "A", command: "a" } } });
  assert.equal(isLaunchedAgentStale(config, "b"), true);
});

test("isLaunchedAgentStale: false when the launched id is still present", () => {
  const config = normalizeAgentsConfig({ agents: { a: { name: "A", command: "a" } } });
  assert.equal(isLaunchedAgentStale(config, "a"), false);
});

test("isLaunchedAgentStale: false when no agent is launched", () => {
  const config = normalizeAgentsConfig({ agents: {} });
  assert.equal(isLaunchedAgentStale(config, null), false);
  assert.equal(isLaunchedAgentStale(config, undefined), false);
});

test("normalizeAgentsConfig: keeps an OpenAI-compatible API without a command", () => {
  const config = normalizeAgentsConfig({
    agents: {
      ours: {
        name: "Ours",
        type: "openai",
        baseUrl: "https://api.example/v1/",
        model: "dev",
        apiKey: "k",
      },
    },
  });
  assert.equal(config.agents.ours.type, "openai");
  assert.equal(config.agents.ours.baseUrl, "https://api.example/v1");
  assert.equal(config.agents.ours.model, "dev");
  assert.equal(config.agents.ours.command, undefined);
});

test("normalizeAgentsConfig: drops openai entries missing model or baseUrl", () => {
  const config = normalizeAgentsConfig({
    agents: {
      noModel: { type: "openai", baseUrl: "https://api.example/v1" },
      noUrl: { type: "openai", model: "dev" },
    },
  });
  assert.deepEqual(config.agents, {});
});

test("resolveAgent: prefers the panel-local id over the global default", () => {
  const config = normalizeAgentsConfig({
    activeAgentId: "a",
    agents: {
      a: { name: "A", command: "a" },
      b: { name: "B", command: "b" },
    },
  });
  const resolved = resolveAgent(config, "b");
  assert.equal(resolved.id, "b");
  assert.equal(resolved.reason, "ok");
});

test("resolveAgent: falls back to the global default when the panel id is gone", () => {
  const config = normalizeAgentsConfig({
    activeAgentId: "a",
    agents: { a: { name: "A", command: "a" } },
  });
  assert.equal(resolveAgent(config, "gone").id, "a");
});

test("toLaunchTarget: openai reads the API key from config", () => {
  const config = normalizeAgentsConfig({
    agents: {
      ours: {
        name: "Ours",
        type: "openai",
        baseUrl: "https://api.example/v1",
        model: "dev",
        apiKey: "secret",
      },
    },
  });
  const target = toLaunchTarget("ours", config.agents.ours);
  assert.equal(target.kind, "openai");
  if (target.kind === "openai") {
    assert.equal(target.apiKey, "secret");
    assert.equal(target.stream, false);
  }
});

test("toLaunchTarget: command fallback keeps the spawn command", () => {
  const target = toLaunchTarget("copilot", {
    name: "GitHub Copilot",
    command: "copilot --acp --stdio",
  });
  assert.equal(target.kind, "acp");
  if (target.kind === "acp") {
    assert.equal(target.command, "copilot --acp --stdio");
  }
});

test("normalizeAgentsConfig: maps type command to acp", () => {
  const config = normalizeAgentsConfig({
    agents: { old: { name: "Old", type: "command", command: "old --acp" } },
  });
  assert.equal(config.agents.old.type, "acp");
});

test("groupAgents: API group then ACP, preserving key order", () => {
  const config = normalizeAgentsConfig({
    agents: {
      copilot: { name: "GitHub Copilot", command: "copilot --acp --stdio" },
      ours: {
        name: "Ours",
        type: "openai",
        baseUrl: "https://api.example/v1",
        model: "dev",
        apiKey: "k",
      },
      vibe: { name: "Vibe", type: "acp", command: "vibe --acp" },
    },
  });
  const groups = groupAgents(config.agents);
  assert.deepEqual(
    groups.map((group) => [group.type, group.entries.map(([id]) => id)]),
    [
      ["openai", ["ours"]],
      ["acp", ["copilot", "vibe"]],
    ],
  );
});

test("groupAgents: openai, cursor, then acp", () => {
  const config = normalizeAgentsConfig({
    agents: {
      vibe: { name: "Vibe", type: "acp", command: "vibe --acp" },
      cursor: {
        name: "Cursor",
        type: "cursor",
        baseUrl: "https://cursor.example/api",
        defaultModel: "cursor-agent",
        apiKey: "k",
      },
      ours: {
        name: "Ours",
        type: "openai",
        baseUrl: "https://api.example/v1",
        model: "dev",
        apiKey: "k",
      },
    },
  });
  const groups = groupAgents(config.agents);
  assert.deepEqual(
    groups.map((group) => [group.type, group.entries.map(([id]) => id)]),
    [
      ["openai", ["ours"]],
      ["cursor", ["cursor"]],
      ["acp", ["vibe"]],
    ],
  );
});

test("toLaunchTarget: cursor resolves model and defaults mode to agent", () => {
  const config = normalizeAgentsConfig({
    agents: {
      cursor: {
        name: "Cursor",
        type: "cursor",
        baseUrl: "https://cursor.example/api/",
        defaultModel: "cursor-agent",
        apiKey: "k",
      },
    },
  });
  const target = toLaunchTarget("cursor", config.agents.cursor);
  assert.equal(target.kind, "cursor");
  if (target.kind === "cursor") {
    assert.equal(target.baseUrl, "https://cursor.example/api");
    assert.equal(target.model, "cursor-agent");
    assert.equal(target.mode, "agent");
    assert.equal(target.autoCreatePR, false);
  }
});

test("toLaunchTarget: cursor honors an explicit panel model and plan mode", () => {
  const target = toLaunchTarget(
    "cursor",
    {
      name: "Cursor",
      type: "cursor",
      baseUrl: "https://cursor.example/api",
      defaultModel: "cursor-agent",
      apiKey: "k",
      mode: "plan",
      autoCreatePR: true,
      workOnCurrentBranch: true,
    },
    "picked",
  );
  assert.equal(target.kind, "cursor");
  if (target.kind === "cursor") {
    assert.equal(target.model, "picked");
    assert.equal(target.mode, "plan");
    assert.equal(target.autoCreatePR, true);
    assert.equal(target.workOnCurrentBranch, true);
  }
});

test("launchTargetsEqual: openai identity includes model and key", () => {
  const a = toLaunchTarget(
    "ours",
    { name: "Ours", type: "openai", baseUrl: "https://x", model: "m", apiKey: "k" },
  );
  const b = toLaunchTarget(
    "ours",
    { name: "Ours", type: "openai", baseUrl: "https://x", model: "m", apiKey: "k" },
  );
  const c = toLaunchTarget(
    "ours",
    { name: "Ours", type: "openai", baseUrl: "https://x", model: "m", apiKey: "other" },
  );
  assert.equal(launchTargetsEqual(a, b), true);
  assert.equal(launchTargetsEqual(a, c), false);
});

test("toLaunchTarget: openai defaults model to defaultModel over legacy model", () => {
  const target = toLaunchTarget(
    "ours",
    {
      name: "Ours",
      type: "openai",
      baseUrl: "https://api.example/v1/",
      defaultModel: "prod",
      model: "legacy",
      apiKey: "k",
    },
  );
  assert.equal(target.kind, "openai");
  if (target.kind === "openai") {
    assert.equal(target.model, "prod");
    assert.equal(target.modelsUrl, "https://api.example/v1/models");
  }
});

test("toLaunchTarget: openai accepts an explicit panel model", () => {
  const target = toLaunchTarget(
    "ours",
    {
      name: "Ours",
      type: "openai",
      baseUrl: "https://api.example/v1",
      defaultModel: "prod",
      apiKey: "k",
    },
    "chosen",
  );
  assert.equal(target.kind, "openai");
  if (target.kind === "openai") {
    assert.equal(target.model, "chosen");
  }
});

test("toLaunchTarget: openai honors a custom modelsUrl", () => {
  const target = toLaunchTarget(
    "ours",
    {
      name: "Ours",
      type: "openai",
      baseUrl: "https://api.example/v1",
      defaultModel: "prod",
      apiKey: "k",
      modelsUrl: "https://example.com/custom/models",
    },
  );
  assert.equal(target.kind, "openai");
  if (target.kind === "openai") {
    assert.equal(target.modelsUrl, "https://example.com/custom/models");
  }
});
