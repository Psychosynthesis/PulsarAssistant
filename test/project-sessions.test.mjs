import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { saveSession } from "../lib/session-storage.js";
import {
  describeProjectSessions,
  formatSessionTime,
  listProjectSessions,
  mergeProjectSessions,
  parseSessionTimestamp,
  sortProjectSessions,
} from "../lib/session/project-sessions.js";

function storedSession(id, overrides = {}) {
  return {
    version: 1,
    id,
    projectRoot: "/fake/root",
    agentId: "local",
    model: "qwen2.5-coder-7b",
    title: id,
    createdAt: 1000,
    updatedAt: 1000,
    messages: [{ id: `${id}-msg`, timestamp: 1000, role: "system", content: "hi" }],
    ...overrides,
  };
}

test("listProjectSessions: reads stored sessions of every agent", async (t) => {
  const tmpDir = await fs.promises.mkdtemp(
    path.join(os.tmpdir(), "pulsar-project-sessions-"),
  );
  t.after(async () => {
    await fs.promises.rm(tmpDir, { recursive: true, force: true });
  });

  await saveSession(tmpDir, storedSession("sess-a", { updatedAt: 1000 }));
  await saveSession(
    tmpDir,
    storedSession("sess-b", {
      agentId: "copilot",
      updatedAt: 3000,
      title: "Second",
    }),
  );

  const sessions = await listProjectSessions(tmpDir);
  assert.deepEqual(
    sessions.map((session) => session.id),
    ["sess-b", "sess-a"],
  );
  assert.equal(sessions[0].agentId, "copilot");
  assert.equal(sessions[0].title, "Second");
  assert.equal(sessions[0].cwd, "/fake/root");
  assert.equal(sessions[0].stored, true);
});

test("listProjectSessions: missing storage dir yields no sessions", async () => {
  const sessions = await listProjectSessions("/definitely/missing/dir");
  assert.deepEqual(sessions, []);
});

test("mergeProjectSessions: keeps stored metadata and fills the gaps", () => {
  const stored = [
    {
      id: "sess-a",
      title: "Old title",
      agentId: "local",
      model: "gpt",
      cwd: "/project",
      createdAt: 10,
      updatedAt: 20,
      messageCount: 4,
    },
  ];
  const listed = [
    {
      id: "sess-a",
      title: "Fresh title",
      agentId: "",
      model: "",
      cwd: "/project",
      createdAt: 0,
      updatedAt: 99,
      messageCount: 0,
    },
    {
      id: "sess-cli",
      title: "CLI session",
      agentId: "copilot",
      model: "",
      cwd: "/project",
      createdAt: 0,
      updatedAt: 50,
      messageCount: 0,
    },
  ];

  const merged = mergeProjectSessions(stored, listed);
  assert.deepEqual(
    merged.map((session) => session.id),
    ["sess-a", "sess-cli"],
  );
  const first = merged.find((session) => session.id === "sess-a");
  assert.equal(first.title, "Fresh title");
  assert.equal(first.model, "gpt");
  assert.equal(first.updatedAt, 99);
  assert.equal(first.messageCount, 4);
});

test("sortProjectSessions: newest first, stable on equal timestamps", () => {
  const sessions = sortProjectSessions([
    { id: "b", title: "b", updatedAt: 5 },
    { id: "a", title: "a", updatedAt: 5 },
    { id: "c", title: "c", updatedAt: 9 },
  ]);
  assert.deepEqual(
    sessions.map((session) => session.id),
    ["c", "a", "b"],
  );
});

test("describeProjectSessions: every row is selectable; stored sessions are deletable regardless of agent", () => {
  const rows = describeProjectSessions(
    [
      {
        id: "mine",
        title: "Mine",
        agentId: "local",
        model: "",
        cwd: "/project",
        createdAt: 0,
        updatedAt: 0,
        messageCount: 0,
        stored: true,
      },
      {
        id: "theirs",
        title: "Theirs",
        agentId: "copilot",
        model: "",
        cwd: "/project",
        createdAt: 0,
        updatedAt: 0,
        messageCount: 0,
        stored: true,
      },
      {
        id: "remote-only",
        title: "Remote only",
        agentId: "local",
        model: "",
        cwd: "/project",
        createdAt: 0,
        updatedAt: 0,
        messageCount: 0,
        stored: false,
      },
    ],
    {
      activeAgentId: "local",
      agentNames: { copilot: "GitHub Copilot" },
      allowDelete: true,
      now: 0,
    },
  );

  assert.equal(rows[0].deletable, true);
  assert.equal(rows[0].agentLabel, null);

  assert.equal(rows[1].deletable, true);
  assert.equal(rows[1].agentLabel, "GitHub Copilot");

  assert.equal(rows[2].deletable, true);
  assert.equal(rows[2].agentLabel, null);
});

test("describeProjectSessions: backend-only sessions are not deletable without a backend", () => {
  const rows = describeProjectSessions(
    [
      {
        id: "remote-only",
        title: "Remote only",
        agentId: "local",
        model: "",
        cwd: "/project",
        createdAt: 0,
        updatedAt: 0,
        messageCount: 0,
        stored: false,
      },
    ],
    { activeAgentId: "local" },
  );

  assert.equal(rows[0].deletable, false);
});

test("describeProjectSessions: unknown agent ids fall back to the id", () => {
  const rows = describeProjectSessions(
    [
      {
        id: "theirs",
        title: "Theirs",
        agentId: "ghost",
        model: "",
        cwd: "/project",
        createdAt: 0,
        updatedAt: 0,
        messageCount: 0,
      },
    ],
    { activeAgentId: "local" },
  );
  assert.equal(rows[0].agentLabel, "ghost");
});

test("formatSessionTime: buckets elapsed time", () => {
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  assert.equal(formatSessionTime(0, 0), "");
  assert.equal(formatSessionTime(1000, 1000 + 30_000), "just now");
  assert.equal(formatSessionTime(1000, 1000 + 5 * minute), "5m ago");
  assert.equal(formatSessionTime(1000, 1000 + 3 * hour), "3h ago");
  assert.equal(formatSessionTime(1000, 1000 + 2 * day), "2d ago");
  assert.equal(formatSessionTime(1000, 1000 - minute), "just now");
});

test("parseSessionTimestamp: accepts ISO strings and epoch millis", () => {
  assert.equal(parseSessionTimestamp(1500), 1500);
  assert.equal(parseSessionTimestamp("1970-01-01T00:00:01.500Z"), 1500);
  assert.equal(parseSessionTimestamp("nonsense"), 0);
  assert.equal(parseSessionTimestamp(null), 0);
});
