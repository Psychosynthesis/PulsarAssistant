import { listSessions, type StoredSessionSummary } from "../session-storage";

/**
 * Session stored for the project. Unlike backend listings this is
 * agent-agnostic: it covers sessions of every agent that ever ran here.
 */
export interface ProjectSessionEntry {
  id: string;
  title: string;
  agentId: string;
  model: string;
  /** Working directory the session was created in. */
  cwd: string;
  /** True when the record comes from our storage, not from an agent listing. */
  stored: boolean;
  createdAt: number;
  updatedAt: number;
  messageCount: number;
}

/** Session prepared for rendering in the sessions list. */
export interface ProjectSessionRow {
  id: string;
  title: string;
  time: string;
  cwd: string | null;
  /** Label of the owning agent; null when it is the active one. */
  agentLabel: string | null;
  deletable: boolean;
}

export interface ProjectSessionRowOptions {
  activeAgentId?: string | null;
  agentNames?: Record<string, string>;
  allowDelete?: boolean;
  now?: number;
}

export function toProjectSessionEntry(
  summary: StoredSessionSummary,
): ProjectSessionEntry {
  return {
    id: summary.id,
    title: summary.title || summary.id,
    agentId: summary.agentId || "",
    model: summary.model || "",
    cwd: summary.projectRoot || "",
    stored: true,
    createdAt: summary.createdAt || 0,
    updatedAt: summary.updatedAt || 0,
    messageCount: summary.messageCount || 0,
  };
}

/** Sessions stored on disk for the project, newest first. */
export async function listProjectSessions(
  projectStorageDir: string,
): Promise<ProjectSessionEntry[]> {
  const summaries = await listSessions(projectStorageDir);
  return sortProjectSessions(summaries.map(toProjectSessionEntry));
}

/** Merge by id; missing metadata is filled in but never overwritten blindly. */
export function mergeProjectSessions(
  base: ProjectSessionEntry[],
  extra: ProjectSessionEntry[],
): ProjectSessionEntry[] {
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
      incoming.messageCount,
    );
  }
  return sortProjectSessions([...byId.values()]);
}

export function sortProjectSessions(
  entries: ProjectSessionEntry[],
): ProjectSessionEntry[] {
  return [...entries].sort((a, b) => {
    if (b.updatedAt !== a.updatedAt) return b.updatedAt - a.updatedAt;
    return a.title.localeCompare(b.title);
  });
}

/** Render sessions for the list; foreign sessions are labeled, never disabled. */
export function describeProjectSessions(
  entries: ProjectSessionEntry[],
  options: ProjectSessionRowOptions = {},
): ProjectSessionRow[] {
  const activeAgentId = options.activeAgentId ?? null;
  const now = options.now ?? Date.now();
  return entries.map((entry) => {
    const isForeign = Boolean(
      activeAgentId && entry.agentId && entry.agentId !== activeAgentId,
    );
    // Every session in the list is selectable; the view switches the active
    // agent before opening a foreign one. Stored sessions are always deletable
    // from disk, no backend required; backend-only listings need their backend.
    return {
      id: entry.id,
      title: entry.title,
      time: formatSessionTime(entry.updatedAt, now),
      cwd: entry.cwd || null,
      agentLabel: isForeign
        ? options.agentNames?.[entry.agentId] || entry.agentId
        : null,
      deletable: entry.stored || (options.allowDelete ?? false),
    };
  });
}

export function formatSessionTime(
  updatedAt: number,
  now: number = Date.now(),
): string {
  if (!updatedAt) return "";
  const elapsed = now - updatedAt;
  if (elapsed < 60_000) return "just now";
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(updatedAt).toLocaleDateString();
}

/** Backend listings may report ISO strings, storage reports epoch millis. */
export function parseSessionTimestamp(
  value: string | number | null | undefined,
): number {
  if (typeof value === "number") return value;
  if (!value) return 0;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}
