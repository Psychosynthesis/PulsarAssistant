import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AGENT_SETUP_EXAMPLES,
  chatPlaceholderContent,
  resolveChatPlaceholderKind,
} from "../lib/view/empty-state-content.js";

const base = {
  busy: false,
  hasMessages: false,
  agentCount: 1,
  sessionCount: 3,
  hasActiveSession: true,
  hasFreshActiveSession: false,
};

test("resolveChatPlaceholderKind: hides while talking", () => {
  assert.equal(
    resolveChatPlaceholderKind({ ...base, hasMessages: true, agentCount: 0 }),
    "hidden",
  );
  assert.equal(
    resolveChatPlaceholderKind({ ...base, busy: true, agentCount: 0 }),
    "hidden",
  );
});

test("resolveChatPlaceholderKind: first run asks for an agent", () => {
  assert.equal(
    resolveChatPlaceholderKind({
      ...base,
      agentCount: 0,
      sessionCount: 0,
      hasActiveSession: false,
    }),
    "no-agents",
  );
});

test("resolveChatPlaceholderKind: a fresh session explains itself", () => {
  assert.equal(
    resolveChatPlaceholderKind({ ...base, hasFreshActiveSession: true }),
    "empty-session",
  );
});

test("resolveChatPlaceholderKind: no sessions at all", () => {
  assert.equal(
    resolveChatPlaceholderKind({
      ...base,
      sessionCount: 0,
      hasActiveSession: false,
    }),
    "no-sessions",
  );
});

test("resolveChatPlaceholderKind: sessions exist but nothing is open", () => {
  assert.equal(
    resolveChatPlaceholderKind({ ...base, hasActiveSession: false }),
    "pick-session",
  );
});

test("resolveChatPlaceholderKind: already loaded session stays quiet", () => {
  assert.equal(resolveChatPlaceholderKind(base), "hidden");
});

test("chatPlaceholderContent: hidden has no content", () => {
  assert.equal(chatPlaceholderContent("hidden"), null);
});

test("chatPlaceholderContent: agent setup lists every provider example", () => {
  const content = chatPlaceholderContent("no-agents");
  assert.ok(content);
  assert.equal(content.action, "open-agents-settings");
  assert.equal(content.body.includes(AGENT_SETUP_EXAMPLES), true);
  for (const type of ['type: "openai"', 'type: "acp"', 'type: "cursor"']) {
    assert.equal(AGENT_SETUP_EXAMPLES.includes(type), true, type);
  }
});

test("chatPlaceholderContent: no sessions mentions the agent name", () => {
  const content = chatPlaceholderContent("no-sessions", {
    agentName: "Local llama.cpp",
  });
  assert.ok(content);
  assert.equal(content.action, null);
  assert.equal(content.body.includes("**Local llama.cpp**"), true);

  const fallback = chatPlaceholderContent("no-sessions");
  assert.equal(fallback.body.includes("an agent"), true);
});

test("chatPlaceholderContent: empty session guides the first prompt", () => {
  const content = chatPlaceholderContent("empty-session");
  assert.ok(content);
  assert.equal(content.title, "Session is empty");
  assert.equal(content.action, null);
});

test("chatPlaceholderContent: pick-session points at the list", () => {
  const content = chatPlaceholderContent("pick-session");
  assert.ok(content);
  assert.equal(content.title, "Select a session");
  assert.equal(content.action, null);
});
