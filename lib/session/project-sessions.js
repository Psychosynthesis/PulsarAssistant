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

// src/session/project-sessions.ts
var project_sessions_exports = {};
__export(project_sessions_exports, {
  describeProjectSessions: () => describeProjectSessions,
  formatSessionTime: () => formatSessionTime,
  listProjectSessions: () => listProjectSessions,
  mergeProjectSessions: () => mergeProjectSessions,
  parseSessionTimestamp: () => parseSessionTimestamp,
  sortProjectSessions: () => sortProjectSessions,
  toProjectSessionEntry: () => toProjectSessionEntry
});
module.exports = __toCommonJS(project_sessions_exports);

// src/session-storage.ts
var fs = __toESM(require("fs"));
var path = __toESM(require("path"));
function getSessionsDir(projectStorageDir) {
  return path.join(projectStorageDir, "sessions");
}
function safeSessionFileName(sessionId) {
  if (!/^[a-zA-Z0-9_-]+$/.test(sessionId)) {
    throw new Error(`Invalid sessionId: ${sessionId}`);
  }
  return `${sessionId}.json`;
}
function sessionFilePath(projectStorageDir, sessionId) {
  return path.join(getSessionsDir(projectStorageDir), safeSessionFileName(sessionId));
}
async function loadSession(projectStorageDir, sessionId) {
  let target;
  try {
    target = sessionFilePath(projectStorageDir, sessionId);
  } catch {
    return null;
  }
  try {
    const raw = await fs.promises.readFile(target, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version === 1 && Array.isArray(parsed.messages)) {
      return parsed;
    }
    return null;
  } catch (error) {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}
async function listSessions(projectStorageDir) {
  const sessionsDir = getSessionsDir(projectStorageDir);
  let entries;
  try {
    entries = await fs.promises.readdir(sessionsDir);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const summaries = [];
  for (const file of entries) {
    if (!file.endsWith(".json")) continue;
    const sessionId = file.slice(0, -5);
    try {
      const session = await loadSession(projectStorageDir, sessionId);
      if (session) {
        summaries.push({
          id: session.id,
          title: session.title || session.id,
          projectRoot: session.projectRoot,
          agentId: session.agentId,
          model: session.model,
          createdAt: session.createdAt,
          updatedAt: session.updatedAt,
          providerState: session.providerState,
          messageCount: session.messages.length
        });
      }
    } catch {
    }
  }
  summaries.sort((a, b) => b.updatedAt - a.updatedAt);
  return summaries;
}

// src/session/project-sessions.ts
function toProjectSessionEntry(summary) {
  return {
    id: summary.id,
    title: summary.title || summary.id,
    agentId: summary.agentId || "",
    model: summary.model || "",
    cwd: summary.projectRoot || "",
    stored: true,
    createdAt: summary.createdAt || 0,
    updatedAt: summary.updatedAt || 0,
    messageCount: summary.messageCount || 0
  };
}
async function listProjectSessions(projectStorageDir) {
  const summaries = await listSessions(projectStorageDir);
  return sortProjectSessions(summaries.map(toProjectSessionEntry));
}
function mergeProjectSessions(base, extra) {
  const byId = new Map(base.map((entry) => [entry.id, entry]));
  for (const incoming of extra) {
    const existing = byId.get(incoming.id);
    if (!existing) {
      byId.set(incoming.id, incoming);
      continue;
    }
    existing.title = incoming.title || existing.title;
    existing.agentId = existing.agentId || incoming.agentId;
    existing.model = existing.model || incoming.model;
    existing.cwd = existing.cwd || incoming.cwd;
    existing.stored = existing.stored || incoming.stored;
    existing.createdAt = existing.createdAt || incoming.createdAt;
    existing.updatedAt = Math.max(existing.updatedAt, incoming.updatedAt);
    existing.messageCount = Math.max(
      existing.messageCount,
      incoming.messageCount
    );
  }
  return sortProjectSessions([...byId.values()]);
}
function sortProjectSessions(entries) {
  return [...entries].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.title.localeCompare(b.title);
  });
}
function describeProjectSessions(entries, options = {}) {
  const activeAgentId = options.activeAgentId ?? null;
  const now = options.now ?? Date.now();
  return entries.map((entry) => {
    const isForeign = Boolean(
      activeAgentId && entry.agentId && entry.agentId !== activeAgentId
    );
    return {
      id: entry.id,
      title: entry.title,
      time: formatSessionTime(entry.updatedAt, now),
      cwd: entry.cwd || null,
      agentLabel: isForeign ? options.agentNames?.[entry.agentId] || entry.agentId : null,
      deletable: entry.stored || (options.allowDelete ?? false)
    };
  });
}
function formatSessionTime(updatedAt, now = Date.now()) {
  if (!updatedAt) return "";
  const elapsed = now - updatedAt;
  if (elapsed < 6e4) return "just now";
  const minutes = Math.floor(elapsed / 6e4);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(updatedAt).toLocaleDateString();
}
function parseSessionTimestamp(value) {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  describeProjectSessions,
  formatSessionTime,
  listProjectSessions,
  mergeProjectSessions,
  parseSessionTimestamp,
  sortProjectSessions,
  toProjectSessionEntry
});
//# sourceMappingURL=project-sessions.js.map
