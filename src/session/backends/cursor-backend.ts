import { randomBytes } from "crypto";
import type * as acp from "@agentclientprotocol/sdk";

import {
  deleteSession as deleteStoredSession,
  listSessions as listStoredSessions,
  loadSession as loadStoredSession,
  saveSession,
  type StoredContextMessage,
  type StoredSession,
} from "../../session-storage";
import { contentBlocksToText } from "../prompt-text";
import {
  CursorApiError,
  CursorClient,
  type CursorAgent,
  type CursorRun,
  type CursorStreamEvent,
  type RepositoryCache,
  parseCursorStreamEvent,
  readCursorSse,
  resolveCursorRepository,
  toToolCallStatus,
  validateWorkingTree,
} from "../../cursorClient";

import type { CursorLaunchTarget } from "../../agent-config";
import type { AgentEvent } from "../types";
import type { AgentBackend, BackendInitResult } from "./backend";

const CURSOR_AGENT_INFO: acp.Implementation = {
  name: "cursor-cloud-agents",
  title: "Cursor Cloud Agents",
  version: "1.0.0",
};

type CursorRemoteStatus =
  | "idle"
  | "active"
  | "archived"
  | "missing"
  | "unknown";

type CursorSessionState = {
  sessionId: string;
  cwd: string;
  remoteCreated: boolean;
  repositoryUrl?: string;
  startingRef?: string;
  latestRunId?: string;
  remoteStatus: CursorRemoteStatus;
  title: string;
  createdAt: number;
  messages: StoredContextMessage[];
  pending: AbortController | null;
};

type CursorRunResult = {
  text?: string;
  branch?: string;
  prUrl?: string;
};

function newId(): string {
  return randomBytes(16).toString("hex");
}

function extractRunId(
  response: Record<string, unknown>,
  _agentId: string,
): string | null {
  const candidates: unknown[] = [
    (response.run as Record<string, unknown> | undefined)?.id,
    response.runId,
    response.latestRunId,
    (response.agent as Record<string, unknown> | undefined)?.latestRunId,
  ];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return null;
}

function extractRunResult(run: CursorRun | undefined): CursorRunResult {
  if (!run) return {};
  const result = run.result;
  const runBranch = (run as Record<string, unknown>).branch;
  const runPrUrl = (run as Record<string, unknown>).prUrl;
  return {
    text: typeof result?.text === "string" ? result.text : undefined,
    branch:
      typeof result?.branch === "string"
        ? result.branch
        : typeof runBranch === "string"
          ? runBranch
          : undefined,
    prUrl:
      typeof result?.prUrl === "string"
        ? result.prUrl
        : typeof runPrUrl === "string"
          ? runPrUrl
          : undefined,
  };
}

function toolOutputText(raw: unknown): string {
  if (raw == null) return "";
  if (typeof raw === "string") return raw;
  try {
    return JSON.stringify(raw, null, 2);
  } catch {
    return String(raw);
  }
}

function cursorResultNote(result: CursorRunResult): string {
  const parts: string[] = [];
  if (result.branch) parts.push(`Branch: ${result.branch}`);
  if (result.prUrl) parts.push(`PR: ${result.prUrl}`);
  return parts.join("  ·  ");
}

function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", finish);
      resolve();
    };
    const timer = setTimeout(finish, ms);
    signal.addEventListener("abort", finish, { once: true });
    void timer;
  });
}

export class CursorBackend implements AgentBackend {
  private client: CursorClient | null = null;
  private sessions = new Map<string, CursorSessionState>();
  private state: CursorSessionState | null = null;
  private repositoryCache: RepositoryCache = {
    loadedAt: 0,
    urls: new Set<string>(),
  };
  private activeRunId: string | null = null;

  sessionId: string | null = null;
  sessionCwd: string | null = null;

  constructor(
    public target: CursorLaunchTarget,
    private readonly projectRoot: string,
    private readonly storageDir: string,
    private readonly emit: (event: AgentEvent) => void,
  ) {}

  async start(cwd: string): Promise<BackendInitResult> {
    this.client = new CursorClient({
      baseUrl: this.target.baseUrl,
      apiKey: this.target.apiKey,
    });
    this.emit({
      type: "initialized",
      info: CURSOR_AGENT_INFO,
      capabilities: null,
      supportsImages: false,
    });

    // Sessions already stored for the project are left for the user to pick
    // from the sessions list; a new one is created only when there is none.
    const summaries = await listStoredSessions(this.storageDir);
    const hasStoredSessions = summaries.some(
      (summary) => summary.providerState?.kind === "cursor",
    );
    const sessionId = hasStoredSessions
      ? null
      : await this.createLocalSession(cwd);

    return {
      sessionId,
      cwd: this.sessionCwd ?? cwd,
      configOptions: null,
    };
  }

  private async createLocalSession(cwd: string): Promise<string> {
    const sessionId = `bc-${newId()}`;
    const state: CursorSessionState = {
      sessionId,
      cwd,
      remoteCreated: false,
      remoteStatus: "unknown",
      title: "New Session",
      createdAt: Date.now(),
      messages: [],
      pending: null,
    };
    this.sessions.set(sessionId, state);
    this.state = state;
    this.sessionId = sessionId;
    this.sessionCwd = cwd;
    await this.persist(state);
    return sessionId;
  }

  private async adoptStoredSession(
    stored: StoredSession,
    cwd: string,
  ): Promise<void> {
    if (stored.model) {
      this.target = { ...this.target, model: stored.model };
    }
    const provider = stored.providerState ?? {};
    const state: CursorSessionState = {
      sessionId: stored.id,
      cwd,
      remoteCreated: provider.remoteCreated === true,
      repositoryUrl:
        typeof provider.repositoryUrl === "string"
          ? provider.repositoryUrl
          : undefined,
      startingRef:
        typeof provider.startingRef === "string"
          ? provider.startingRef
          : undefined,
      latestRunId:
        typeof provider.latestRunId === "string"
          ? provider.latestRunId
          : undefined,
      remoteStatus: "unknown",
      title: stored.title || stored.id,
      createdAt: stored.createdAt,
      messages: stored.messages,
      pending: null,
    };
    this.sessions.set(stored.id, state);
    this.state = state;
    this.sessionId = stored.id;
    this.sessionCwd = cwd;
    await this.replaySession(state);
    void this.refreshRemoteAgentStatus(state);
  }

  private async replaySession(state: CursorSessionState): Promise<void> {
    for (const message of state.messages) {
      if (message.role === "user" && message.content) {
        this.emitUpdate({
          sessionUpdate: "user_message_chunk",
          content: { type: "text", text: message.content },
        });
      } else if (message.role === "assistant" && message.content) {
        this.emitUpdate({
          sessionUpdate: "agent_message_chunk",
          content: { type: "text", text: message.content },
        });
      } else if (message.role === "tool") {
        const toolCallId = message.tool_call_id || message.id;
        const title =
          message.metadata?.title || message.metadata?.toolName || "Tool Call";
        const kind = (message.metadata?.kind || "other") as acp.ToolKind;
        const locations = message.metadata?.locations as
          | acp.ToolCallLocation[]
          | undefined;
        this.emitUpdate({
          sessionUpdate: "tool_call",
          toolCallId,
          title,
          kind,
          status: "completed",
          locations,
        });
        this.emitUpdate({
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "completed",
          content: [
            {
              type: "content",
              content: { type: "text", text: message.content ?? "" },
            },
          ],
          rawOutput: { output: message.content ?? "" },
        });
      }
    }
  }

  private async refreshRemoteAgentStatus(
    state: CursorSessionState,
  ): Promise<void> {
    if (!this.client || !state.remoteCreated) return;
    try {
      const agent = await this.client.getAgent(state.sessionId);
      state.remoteStatus = remoteStatusFromAgent(agent);
      if (agent?.latestRunId) state.latestRunId = agent.latestRunId;
    } catch (error) {
      state.remoteStatus =
        error instanceof CursorApiError && error.status === 404
          ? "missing"
          : "unknown";
    }
  }

  private emitUpdate(update: acp.SessionUpdate): void {
    if (!this.sessionId) return;
    this.emit({ type: "update", sessionId: this.sessionId, update });
  }

  supportsImages(): boolean {
    return false;
  }

  supportsEmbeddedContext(): boolean {
    return false;
  }

  canListSessions(): boolean {
    return true;
  }

  canLoadSession(): boolean {
    return true;
  }

  canDeleteSession(): boolean {
    return true;
  }

  canSetModel(): boolean {
    return this.state?.remoteCreated !== true;
  }

  isSessionLoaded(id: string): boolean {
    return this.sessions.has(id);
  }

  activateCachedSession(id: string): void {
    const state = this.sessions.get(id);
    if (!state) return;
    this.sessionId = id;
    this.sessionCwd = state.cwd;
    this.state = state;
  }

  currentSessionConfigOptions(): acp.SessionConfigOption[] | null {
    return null;
  }

  currentAvailableCommands(): acp.AvailableCommand[] {
    return [];
  }

  async setConfigOption(): Promise<void> {
    throw new Error("Cursor Cloud Agents do not have ACP session config options.");
  }

  setModel(model: string): void {
    if (this.state?.remoteCreated === true) {
      throw new Error("Cursor model is fixed for this session.");
    }
    this.target = { ...this.target, model };
  }

  async prompt(prompt: acp.ContentBlock[]): Promise<acp.PromptResponse> {
    if (!this.client || !this.state || !this.sessionId) {
      throw new Error("Agent session is not ready.");
    }
    const state = this.state;
    const text = contentBlocksToText(prompt) || "(empty prompt)";
    const pending = new AbortController();
    state.pending = pending;

    let userMessageRecorded = false;
    const recordUserMessage = () => {
      if (userMessageRecorded) return;
      const userMessage: StoredContextMessage = {
        id: newId(),
        timestamp: Date.now(),
        role: "user",
        content: text,
      };
      state.messages.push(userMessage);
      if (state.title === "New Session" && text !== "(empty prompt)") {
        state.title = text.slice(0, 40).trim();
      }
      userMessageRecorded = true;
    };

    try {
      if (!state.remoteCreated) {
        await this.ensureRemoteCreated(
          state,
          text,
          pending.signal,
          recordUserMessage,
        );
      } else {
        await this.continueRemote(
          state,
          text,
          pending.signal,
          recordUserMessage,
        );
      }
      if (pending.signal.aborted) return { stopReason: "cancelled" };
      await this.persist(state);
      return { stopReason: "end_turn" };
    } catch (error) {
      if (userMessageRecorded) {
        await this.persist(state);
      }
      if (pending.signal.aborted) return { stopReason: "cancelled" };
      throw error;
    } finally {
      if (state.pending === pending) state.pending = null;
      this.activeRunId = null;
    }
  }

  private async ensureRemoteCreated(
    state: CursorSessionState,
    text: string,
    signal: AbortSignal,
    onRemoteCreated?: () => void,
  ): Promise<void> {
    const { branch } = await validateWorkingTree(this.projectRoot);
    const repositoryUrl = await resolveCursorRepository(
      this.projectRoot,
      () => this.client!.listRepositories(signal),
      this.repositoryCache,
    );

    const runId = await this.createAgentOnce(
      state,
      text,
      repositoryUrl,
      branch,
      signal,
    );
    state.remoteCreated = true;
    state.repositoryUrl = repositoryUrl;
    state.startingRef = branch;
    if (runId) state.latestRunId = runId;
    onRemoteCreated?.();
    await this.persist(state);

    if (runId) {
      await this.runStreamed(state, runId, signal);
    }
  }

  private async createAgentOnce(
    state: CursorSessionState,
    text: string,
    repositoryUrl: string,
    branch: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    try {
      const response = await this.client!.createAgent(
        {
          agentId: state.sessionId,
          prompt: { text },
          model: { id: this.target.model },
          repos: [{ url: repositoryUrl, startingRef: branch }],
          mode: this.target.mode,
          autoCreatePR: this.target.autoCreatePR,
          workOnCurrentBranch: this.target.workOnCurrentBranch,
        },
        signal,
      );
      return extractRunId(response, state.sessionId);
    } catch (error) {
      if (
        error instanceof CursorApiError &&
        error.status === 409 &&
        error.code === "agent_id_conflict"
      ) {
        const agent = await this.client!.getAgent(state.sessionId);
        return agent?.latestRunId ?? null;
      }
      throw error;
    }
  }

  private async continueRemote(
    state: CursorSessionState,
    text: string,
    signal: AbortSignal,
    onContinueStarted?: () => void,
  ): Promise<void> {
    await this.refreshRemoteAgentStatus(state);
    if (state.remoteStatus === "missing") {
      throw new Error(
        "Cursor Cloud Agent no longer exists.\nStart a new session.",
      );
    }
    if (state.remoteStatus === "archived") {
      await this.client!.unarchiveAgent(state.sessionId);
      state.remoteStatus = "idle";
    }

    const runId = await this.createRunOnce(state, text, signal);
    onContinueStarted?.();
    if (runId) {
      state.latestRunId = runId;
      await this.persist(state);
      await this.runStreamed(state, runId, signal);
    }
  }

  private async createRunOnce(
    state: CursorSessionState,
    text: string,
    signal: AbortSignal,
  ): Promise<string | null> {
    try {
      const run = await this.client!.createRun(
        state.sessionId,
        { prompt: { text } },
        signal,
      );
      return run?.id ?? null;
    } catch (error) {
      // The POST may have been applied even though the response was lost. The
      // agent record is the source of truth; use its newest run only when it
      // actually changed so genuine failures are never retried blindly.
      try {
        const agent = await this.client!.getAgent(state.sessionId);
        if (agent?.latestRunId && agent.latestRunId !== state.latestRunId) {
          return agent.latestRunId;
        }
      } catch {
        // Fall through to the original error.
      }
      throw error;
    }
  }

  private async runStreamed(
    state: CursorSessionState,
    runId: string,
    signal: AbortSignal,
  ): Promise<void> {
    this.activeRunId = runId;
    let streamedText = "";
    let lastEventId: string | undefined;
    let finalResult: CursorRunResult | null = null;
    const toolMessages = new Map<string, StoredContextMessage>();

    const handleEvent = (event: CursorStreamEvent): void => {
      switch (event.type) {
        case "assistant":
          streamedText += event.text;
          this.emitUpdate({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: event.text },
          });
          break;
        case "thinking":
          this.emitUpdate({
            sessionUpdate: "agent_thought_chunk",
            content: { type: "text", text: event.text },
          });
          break;
        case "tool_call": {
          const status = toToolCallStatus(event.status);
          this.emitUpdate({
            sessionUpdate: "tool_call",
            toolCallId: event.toolCallId,
            title: event.title,
            kind: "other",
            status,
            rawInput: event.rawInput,
          });
          const message: StoredContextMessage = {
            id: newId(),
            timestamp: Date.now(),
            role: "tool",
            content: "",
            tool_call_id: event.toolCallId,
            metadata: {
              title: event.title,
              kind: "other",
              status: "in_progress",
              rawInput: event.rawInput,
            },
          };
          toolMessages.set(event.toolCallId, message);
          break;
        }
        case "tool_call_update": {
          const status = toToolCallStatus(event.status);
          this.emitUpdate({
            sessionUpdate: "tool_call_update",
            toolCallId: event.toolCallId,
            status,
            rawOutput: event.rawOutput,
          });
          let message = toolMessages.get(event.toolCallId);
          if (!message) {
            message = {
              id: newId(),
              timestamp: Date.now(),
              role: "tool",
              content: "",
              tool_call_id: event.toolCallId,
              metadata: { kind: "other", status: "in_progress" },
            };
            toolMessages.set(event.toolCallId, message);
          }
          message.content = toolOutputText(event.rawOutput);
          if (message.metadata) {
            message.metadata.status = status;
            message.metadata.rawOutput = event.rawOutput;
          }
          break;
        }
        case "result":
          finalResult = {
            text: event.text,
            branch: event.branch,
            prUrl: event.prUrl,
          };
          break;
        case "unknown":
          break;
      }
    };

    const maxAttempts = 6;
    let attempts = 0;
    while (!signal.aborted && attempts < maxAttempts) {
      attempts += 1;
      try {
        const response = await this.client!.openRunStream(
          this.sessionId!,
          runId,
          signal,
          lastEventId,
        );
        for await (const envelope of readCursorSse(response, signal)) {
          if (envelope.id) lastEventId = envelope.id;
          handleEvent(parseCursorStreamEvent(envelope));
        }
        break;
      } catch (error) {
        if (signal.aborted) break;
        if (
          error instanceof CursorApiError &&
          (error.status === 410 || (error.status >= 400 && error.status < 500))
        ) {
          break;
        }
        await sleepWithSignal(250 * attempts, signal);
      }
    }

    if (!finalResult && !signal.aborted) {
      try {
        const run = await this.client!.getRun(this.sessionId!, runId);
        finalResult = extractRunResult(run);
        if (finalResult.text && !streamedText) {
          streamedText = finalResult.text;
          this.emitUpdate({
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: finalResult.text },
          });
        }
      } catch {
        // Keep whatever the stream already produced.
      }
    }

    for (const message of toolMessages.values()) {
      state.messages.push(message);
    }
    if (streamedText.trim()) {
      state.messages.push({
        id: newId(),
        timestamp: Date.now(),
        role: "assistant",
        content: streamedText.trim(),
      });
    }

    if (finalResult?.branch || finalResult?.prUrl) {
      this.emit({ type: "status-note", text: cursorResultNote(finalResult) });
    }
    await this.persist(state);
  }

  cancel(): void {
    const state = this.state;
    if (state?.pending) {
      state.pending.abort();
    }
    if (this.client && this.sessionId && state?.remoteCreated && this.activeRunId) {
      void this.client
        .cancelRun(this.sessionId, this.activeRunId)
        .catch(() => {});
    }
  }

  async newSession(cwd: string): Promise<acp.NewSessionResponse> {
    const sessionId = await this.createLocalSession(cwd);
    return { sessionId };
  }

  async loadSession(id: string, cwd: string): Promise<void> {
    const stored = await loadStoredSession(this.storageDir, id);
    if (!stored) {
      throw new Error(`Session not found: ${id}`);
    }
    if (stored.providerState?.kind !== "cursor") {
      throw new Error("That session belongs to a different backend.");
    }
    await this.adoptStoredSession(stored, cwd);
  }

  async deleteSession(
    id: string,
    _cwd: string,
  ): Promise<{ deletedActive: boolean }> {
    const state = this.sessions.get(id);
    if (state?.remoteCreated) {
      try {
        if (!this.client) throw new Error("Agent is not connected.");
        await this.client.archiveAgent(id);
      } catch (error) {
        if (!(error instanceof CursorApiError && error.status === 404)) {
          throw error;
        }
      }
    } else if (!state) {
      const stored = await loadStoredSession(this.storageDir, id);
      if (stored?.providerState?.remoteCreated === true) {
        try {
          if (!this.client) throw new Error("Agent is not connected.");
        await this.client.archiveAgent(id);
        } catch (error) {
          if (!(error instanceof CursorApiError && error.status === 404)) {
            throw error;
          }
        }
      }
    }
    const deletedActive = id === this.sessionId;
    await deleteStoredSession(this.storageDir, id);
    this.sessions.delete(id);
    if (deletedActive) {
      this.sessionId = null;
      this.sessionCwd = null;
      this.state = null;
    }
    return { deletedActive };
  }

  async listSessions(_cwd: string): Promise<acp.SessionInfo[]> {
    const summaries = await listStoredSessions(this.storageDir);
    return summaries
      .filter((summary) => summary.providerState?.kind === "cursor")
      .map((summary) => ({
        sessionId: summary.id,
        cwd: summary.projectRoot,
        title: summary.title,
        updatedAt: new Date(summary.updatedAt).toISOString(),
      }));
  }

  getSessionMessages(): StoredContextMessage[] {
    return this.state?.messages ?? [];
  }

  private async persist(state: CursorSessionState): Promise<void> {
    const stored: StoredSession = {
      version: 1,
      id: state.sessionId,
      projectRoot: state.cwd,
      agentId: this.target.id,
      model: this.target.model,
      title: state.title,
      createdAt: state.createdAt,
      updatedAt: Date.now(),
      messages: state.messages,
      providerState: {
        kind: "cursor",
        remoteCreated: state.remoteCreated,
        repositoryUrl: state.repositoryUrl,
        startingRef: state.startingRef,
        latestRunId: state.latestRunId,
      },
    };
    await saveSession(this.storageDir, stored);
  }

  dispose(): void {
    this.cancel();
    this.client = null;
    this.sessions.clear();
    this.state = null;
    this.sessionId = null;
    this.sessionCwd = null;
    this.activeRunId = null;
  }
}

function remoteStatusFromAgent(
  agent: CursorAgent | undefined,
): CursorRemoteStatus {
  if (!agent || typeof agent.status !== "string") return "unknown";
  const status = agent.status.toUpperCase();
  if (status === "ARCHIVED") return "archived";
  if (status === "IDLE") return "idle";
  if (status === "ACTIVE") return "active";
  return "unknown";
}
