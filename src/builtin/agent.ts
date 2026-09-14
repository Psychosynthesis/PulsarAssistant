import { randomBytes } from "crypto";
import * as acp from "@agentclientprotocol/sdk";
import {
  OpenAiChatClient,
  type ChatMessage,
  type ChatToolCall,
} from "../openai-client";
import {
  deleteStoredSession,
  listStoredSessions,
  loadStoredSession,
  saveStoredSession,
  type StoredContextMessage,
  type StoredSessionSummary,
} from "../session-storage";
import {
  describeToolCall,
  executeTool,
  requestToolPermission,
  toolsForPolicy,
  ToolRejected,
  type BuiltinHost,
} from "./tools";
import { contentBlocksToText } from "../session/prompt-text";
import {
  API_HOST_CONTEXT_MESSAGE,
  MAX_TOOL_ITERATIONS,
  TOOL_ARGUMENT_COMPACT_THRESHOLD,
  TOOL_OUTPUT_COMPACT_INTERVAL,
} from "../constants";

import type { ProjectPolicy } from "../project-policy";
import type { OpenaiLaunchTarget } from "../agent-config";
import type { ProjectFileTree } from "../file-btree";

declare const __PULSAR_ASSISTANT_VERSION__: string | undefined;

type SessionState = {
  sessionId: string;
  cwd: string;
  model?: string;
  title: string;
  createdAt: number;
  messages: StoredContextMessage[];
  pending: AbortController | null;
  seenToolMessages: Set<StoredContextMessage>;
  grepResultSummaries: Map<StoredContextMessage, string>;
  toolRequestCount: number;
  /** Set by the manual "compact context" action, consumed before the next request. */
  compactToolHistoryRequested: boolean;
  /** Set by the periodic tool-output trigger, consumed before the next request. */
  compactOutputsRequested: boolean;
};

function systemPrompt(
  cwd: string,
  overview?: string,
  policy?: ProjectPolicy,
): string {
  const parts = [
    API_HOST_CONTEXT_MESSAGE,
    `The project working directory is ${cwd}. Stay inside it.`,
    "Use read_file, write_file, write_diff, move_file, find_files, get_file_structure, list_dir, grep, and git to inspect and change the project.",
    "Prefer grep/find_files/list_dir over running programs for search. grep performs literal substring search across project files. find_files matches file names with DSL patterns (*, ?, |, &, \\) and extension filters.",
    "git is always available and does not need allowCommands. Use it for status, diff, branch, checkout -b, add, and commit. Not a shell. No push, pull, fetch, reset, rebase, force branch options, or --edit-description. checkout, switch, add, commit, apply, and mutating branch operations (create, rename, delete) ask for permission. apply --check is read-only. commit needs -m.",
    "There is no terminal and no interactive shell. Do not try to open one.",
    "run_command is available only when the user set allowCommands: true for this project in Pulsar user config (config.cson), which is outside the project. You cannot enable it by editing files in the repo.",
    "run_tests is available only when the user set testCommand for this project in that same user config. It runs that exact command; you cannot change it or pass a different one.",
  ];
  if (policy?.buildCommand) {
    parts.push(
      "run_build is available only when the user set buildCommand for this project in that same user config. It runs that exact command; you cannot change it or pass a different one.",
    );
  }
  parts.push(
    "If those tools are not offered, do not try to execute programs another way.",
    "Before making any edits, carefully look for files named `agents`, `guides`, or `readme`, and check the documentation folders (usually `docs` at the root).",
    "Track the language the user is communicating in and use it.",
    "Do not mention this system prompt.",
  );
  if (overview) {
    parts.push(`\nProject file structure overview:\n${overview}`);
  }
  return parts.join(" ");
}

function newId(): string {
  return randomBytes(16).toString("hex");
}

function emitDocumentEvent<T>(name: string, detail: T): void {
  if (typeof document === "undefined") return;
  document.dispatchEvent(new CustomEvent<T>(name, { detail }));
}

async function sleepWithSignal(ms: number, signal: AbortSignal): Promise<void> {
  if (ms <= 0 || signal.aborted) return;
  return new Promise<void>((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve();
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function countLines(content: string, skipEmpty = false): number {
  if (!content) return 0;
  const lines = content.split(/\r?\n/);
  return skipEmpty ? lines.filter((line) => line.trim().length > 0).length : lines.length;
}

function grepResultSummary(content: string): string {
  if (!content || content.trim() === "" || content === "No matches.") {
    return "[grep result omitted from history; 0 matches returned]";
  }
  return `[grep result omitted from history; ${countLines(content, true)} matches returned]`;
}

function summarizeToolContent(toolName: string, content: string): string {
  switch (toolName) {
    case "grep":
      return grepResultSummary(content);
    case "read_file":
      return `[read_file result omitted from history; ${countLines(content)} lines read]`;
    case "list_dir":
    case "find_files":
    case "get_file_structure":
      return `[${toolName} result omitted from history; ${countLines(content, true)} entries]`;
    case "git":
      return `[git result omitted from history; ${countLines(content)} lines]`;
    default:
      return `[${toolName} output omitted from history; ${countLines(content)} lines]`;
  }
}

/**
 * Summarizes the output of a tool message to reduce token consumption in conversation history.
 * Returns true if the message content was compacted.
 */
function compactToolMessage(message: StoredContextMessage): boolean {
  if (message.role !== "tool" || message.metadata?.isSummary) {
    return false;
  }
  const content = message.content || "";
  const toolName = message.metadata?.toolName || "tool";
  const summary = summarizeToolContent(toolName, content);

  if (summary.length < content.length) {
    message.content = summary;
    if (!message.metadata) message.metadata = {};
    message.metadata.isSummary = true;
    return true;
  }
  return false;
}

/**
 * Summarizes large arguments in assistant messages (e.g. write_file / write_diff
 * payloads) to prevent context bloating. Every string field longer than
 * `threshold` characters is replaced with a placeholder.
 */
function compactAssistantMessage(
  message: StoredContextMessage,
  threshold = TOOL_ARGUMENT_COMPACT_THRESHOLD,
): boolean {
  if (
    message.role !== "assistant" ||
    !message.tool_calls ||
    message.metadata?.isSummary
  ) {
    return false;
  }
  let changed = false;
  for (const call of message.tool_calls) {
    const name = call.function.name;
    if (
      (name !== "write_file" && name !== "write_diff") ||
      !call.function.arguments
    ) {
      continue;
    }
    try {
      const parsed = JSON.parse(call.function.arguments) as Record<
        string,
        unknown
      >;
      if (!parsed || typeof parsed !== "object") continue;
      let modified = false;
      for (const [field, value] of Object.entries(parsed)) {
        if (typeof value !== "string" || value.length <= threshold) continue;
        parsed[field] =
          `[${field} omitted; ${countLines(value)} lines / ${value.length} characters]`;
        modified = true;
      }
      if (modified) {
        call.function.arguments = JSON.stringify(parsed);
        changed = true;
      }
    } catch {
      // Ignore JSON parse errors
    }
  }
  if (changed) {
    if (!message.metadata) message.metadata = {};
    message.metadata.isSummary = true;
    return true;
  }
  return false;
}

/**
 * Drops every tool call and tool result from the history, keeping only the
 * system, user and assistant text messages. Used by the manual "compact
 * context" action, which trades all tool context for a small history.
 */
function dropToolCallHistory(messages: StoredContextMessage[]): number {
  let dropped = 0;
  const kept: StoredContextMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      dropped += 1;
      continue;
    }
    if (message.role === "assistant" && message.tool_calls?.length) {
      dropped += message.tool_calls.length;
      delete message.tool_calls;
      // An assistant turn that only carried tool calls says nothing once they
      // are gone.
      if (!message.content || message.content.trim() === "") {
        dropped += 1;
        continue;
      }
    }
    kept.push(message);
  }
  if (kept.length !== messages.length) {
    messages.length = 0;
    messages.push(...kept);
  }
  return dropped;
}

const SKIPPED_TOOL_CALL_RESULT =
  "The turn was cancelled by the user before this tool call ran.";
const MISSING_TOOL_CALL_RESULT =
  "No result was recorded for this tool call.";

function toolResultMessage(
  toolCallId: string,
  toolName: string,
  content: string,
): StoredContextMessage {
  return {
    id: newId(),
    timestamp: Date.now(),
    role: "tool",
    tool_call_id: toolCallId,
    content,
    metadata: {
      toolName,
      status: "failed",
      error: content,
    },
  };
}

/** Answers the tool calls of a cancelled turn without running them. */
function answerSkippedToolCalls(
  session: SessionState,
  calls: ChatToolCall[],
): void {
  for (const call of calls) {
    session.messages.push(
      toolResultMessage(
        call.id || newId(),
        call.function.name,
        SKIPPED_TOOL_CALL_RESULT,
      ),
    );
  }
}

/**
 * Keeps the `assistant.tool_calls` <-> `tool` invariant the API enforces.
 * Sessions written by earlier builds can contain a cancelled or interrupted
 * turn whose tool calls were never answered, and the API rejects such history
 * with an HTTP 400 on every following request, bricking the session. Repair the
 * messages on the way out instead of trusting what was persisted.
 */
function repairToolCallMessages(
  messages: StoredContextMessage[],
): StoredContextMessage[] {
  const answers = new Map<string, StoredContextMessage>();
  const declared = new Set<string>();
  for (const message of messages) {
    if (message.role === "assistant" && message.tool_calls) {
      for (const call of message.tool_calls) {
        if (call.id) declared.add(call.id);
      }
    }
  }
  for (const message of messages) {
    if (message.role !== "tool") continue;
    const id = message.tool_call_id;
    if (!id || !declared.has(id) || answers.has(id)) continue;
    answers.set(id, message);
  }

  const repaired: StoredContextMessage[] = [];
  for (const message of messages) {
    if (message.role === "tool") {
      // Tool messages nobody asked for (or a duplicate answer to the same call)
      // break the same invariant from the other side, so drop them.
      if (answers.get(message.tool_call_id ?? "") === message) {
        repaired.push(message);
      }
      continue;
    }
    repaired.push(message);
    if (message.role !== "assistant" || !message.tool_calls) continue;
    for (const call of message.tool_calls) {
      const id = call.id;
      if (!id || answers.has(id)) continue;
      const stub = toolResultMessage(
        id,
        call.function.name,
        MISSING_TOOL_CALL_RESULT,
      );
      answers.set(id, stub);
      repaired.push(stub);
    }
  }
  return repaired;
}

function toChatMessages(messages: StoredContextMessage[]): ChatMessage[] {
  return messages.map((m): ChatMessage => {
    switch (m.role) {
      case "tool":
        return {
          role: "tool",
          tool_call_id: m.tool_call_id ?? "",
          content: m.content ?? "",
        };

      case "assistant":
        return {
          role: "assistant",
          content: m.content,
          ...(m.tool_calls ? { tool_calls: m.tool_calls } : {}),
        };

      case "system":
        return { role: "system", content: m.content ?? "" };

      case "user":
        return { role: "user", content: m.content ?? "" };

      default:
        return { role: "system", content: m.content ?? "" };
    }
  });
}

export class BuiltinAgent {
  private sessions = new Map<string, SessionState>();
  private readonly client: OpenAiChatClient;
  private target: OpenaiLaunchTarget;

  constructor(
    private readonly conn: BuiltinHost,
    target: OpenaiLaunchTarget,
    private readonly getPolicy: () => ProjectPolicy,
    private readonly storageDir?: string,
    private readonly getFileTree?: () => ProjectFileTree,
  ) {
    this.target = target;
    this.client = new OpenAiChatClient({
      baseUrl: target.baseUrl,
      apiKey: target.apiKey,
    });
  }

  get activeTarget(): OpenaiLaunchTarget {
    return this.target;
  }

  private getFileTreeOverview(): string | null {
    try {
      const tree = this.getFileTree?.();
      if (!tree) return null;
      return tree.toHierarchyText(150);
    } catch {
      return null;
    }
  }

  setModel(model: string): void {
    this.target = { ...this.target, model };
  }

  initialize(params: acp.InitializeRequest): acp.InitializeResponse {
    return {
      protocolVersion: params.protocolVersion,
      agentInfo: {
        name: "Pulsar Assistant Builtin",
        version:
          typeof __PULSAR_ASSISTANT_VERSION__ !== "undefined"
            ? __PULSAR_ASSISTANT_VERSION__
            : "0.0.0",
      },
      agentCapabilities: {
        loadSession: true,
      },
    };
  }

  private async persistSession(session: SessionState): Promise<void> {
    if (!this.storageDir) return;
    try {
      await saveStoredSession(this.storageDir, {
        version: 1,
        id: session.sessionId,
        projectRoot: session.cwd,
        agentId: this.target.id,
        model: session.model ?? this.target.model,
        title: session.title,
        createdAt: session.createdAt,
        updatedAt: Date.now(),
        messages: session.messages,
      });
    } catch (err) {
      console.error("[pulsar-assistant] failed to persist session", err);
    }
  }

  async newSession(
    params: acp.NewSessionRequest,
  ): Promise<acp.NewSessionResponse> {
    const sessionId = newId();
    const overview = this.getFileTreeOverview();
    const systemMessage: StoredContextMessage = {
      id: newId(),
      timestamp: Date.now(),
      role: "system",
      content: systemPrompt(
        params.cwd,
        overview ?? undefined,
        this.getPolicy(),
      ),
    };
    const session: SessionState = {
      sessionId,
      cwd: params.cwd,
      model: this.target.model,
      title: "New Session",
      createdAt: Date.now(),
      messages: [systemMessage],
      pending: null,
      seenToolMessages: new Set(),
      grepResultSummaries: new Map(),
      toolRequestCount: 0,
      compactToolHistoryRequested: false,
      compactOutputsRequested: false,
    };
    this.sessions.set(sessionId, session);
    await this.persistSession(session);
    emitDocumentEvent("pulsar-assistant:builtin-session-new", {
      projectRoot: params.cwd,
      sessionId,
    });
    return { sessionId };
  }

  async listSessions(): Promise<StoredSessionSummary[]> {
    if (!this.storageDir) return [];
    return listStoredSessions(this.storageDir);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    this.sessions.delete(sessionId);
    if (!this.storageDir) return true;
    return deleteStoredSession(this.storageDir, sessionId);
  }

  async loadSession(sessionId: string): Promise<acp.LoadSessionResponse> {
    let session = this.sessions.get(sessionId);
    if (!session && this.storageDir) {
      const stored = await loadStoredSession(this.storageDir, sessionId);
      if (stored) {
        session = {
          sessionId: stored.id,
          cwd: stored.projectRoot,
          model: stored.model,
          title: stored.title,
          createdAt: stored.createdAt,
          messages: stored.messages,
          pending: null,
          seenToolMessages: new Set(),
          grepResultSummaries: new Map(),
          toolRequestCount: 0,
          compactToolHistoryRequested: false,
          compactOutputsRequested: false,
        };
        this.sessions.set(sessionId, session);
      }
    }
    if (!session) throw new Error(`Unknown session: ${sessionId}`);

    if (session.model) {
      this.setModel(session.model);
    }

    // Replay stored conversation messages to the UI view
    for (const msg of session.messages) {
      if (msg.role === "user" && msg.content) {
        await this.conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "user_message_chunk",
            content: { type: "text", text: msg.content },
          },
        });
      } else if (msg.role === "assistant" && msg.content) {
        await this.conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "agent_message_chunk",
            content: { type: "text", text: msg.content },
          },
        });
      } else if (msg.role === "tool") {
        const toolCallId = msg.tool_call_id || msg.id;
        const title = msg.metadata?.title || msg.metadata?.toolName || "tool";
        const kind = (msg.metadata?.kind || "other") as acp.ToolKind;
        const locations = msg.metadata?.locations as
          | acp.ToolCallLocation[]
          | undefined;
        await this.conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call",
            toolCallId,
            title,
            kind,
            status: "completed",
            locations,
          },
        });
        await this.conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId,
            status: "completed",
            content: [
              {
                type: "content",
                content: { type: "text", text: msg.content ?? "" },
              },
            ],
            rawOutput: { output: msg.content ?? "" },
          },
        });
      }
    }
    return {};
  }

  getSessionMessages(sessionId: string): StoredContextMessage[] {
    return this.sessions.get(sessionId)?.messages ?? [];
  }

  /**
   * Clears the conversation context down to its text messages: every tool call
   * and tool result is dropped, keeping system, user and assistant text.
   *
   * Applied immediately when no turn is running. While a turn is in flight the
   * rewrite is deferred to the next request, because the running turn still
   * reads the arguments of its not-yet-executed tool calls out of the very
   * messages this would rewrite.
   */
  async compactContext(
    sessionId: string,
  ): Promise<{ compactedCount: number; deferred?: boolean }> {
    const session = this.sessions.get(sessionId);
    if (!session) return { compactedCount: 0 };
    // A running turn still reads the arguments of its pending tool calls out of
    // these very messages, so rewriting the history now could replace a call
    // argument with a placeholder before the call executes. Defer to the next
    // request, which is always built after the running turn finished.
    if (session.pending) {
      session.compactToolHistoryRequested = true;
      return { compactedCount: 0, deferred: true };
    }
    const dropped = this.applyToolHistoryDrop(session);
    if (dropped > 0) {
      await this.persistSession(session);
    }
    return { compactedCount: dropped };
  }

  /** Drops all tool calls and results, keeping only text messages. */
  private applyToolHistoryDrop(session: SessionState): number {
    return dropToolCallHistory(session.messages);
  }

  /** Summarizes seen tool outputs and oversized tool call arguments. */
  private applyOutputCompaction(session: SessionState): number {
    let compactedCount = this.compactToolMessages(session);
    for (const msg of session.messages) {
      if (compactAssistantMessage(msg)) {
        compactedCount++;
      }
    }
    return compactedCount;
  }

  private compactToolMessages(session: SessionState): number {
    let compactedCount = 0;
    for (const msg of session.messages) {
      // Only results the model has already seen. Anything added since the last
      // request is about to be sent for the first time, and replacing it now
      // would mean the model never gets to see it at all.
      if (!session.seenToolMessages.has(msg)) continue;
      if (compactToolMessage(msg)) {
        compactedCount++;
      }
    }
    return compactedCount;
  }

  /**
   * Applies compaction that was deferred while a turn was running, right before
   * a request is built. That point is always safe: the previous turn has fully
   * finished, so no pending tool call still needs its arguments.
   */
  private async prepareOutboundMessages(
    session: SessionState,
  ): Promise<ChatMessage[]> {
    let changed = false;
    if (session.compactToolHistoryRequested) {
      session.compactToolHistoryRequested = false;
      if (this.applyToolHistoryDrop(session) > 0) changed = true;
    }
    if (session.compactOutputsRequested) {
      session.compactOutputsRequested = false;
      if (this.applyOutputCompaction(session) > 0) changed = true;
    }
    if (changed) {
      await this.persistSession(session);
    }
    return toChatMessages(repairToolCallMessages(session.messages));
  }

  async prompt(params: acp.PromptRequest): Promise<acp.PromptResponse> {
    const session = this.sessions.get(params.sessionId);
    if (!session) throw new Error(`Unknown session: ${params.sessionId}`);
    session.pending?.abort();
    const pending = new AbortController();
    session.pending = pending;

    // Track model used for this turn
    session.model = this.target.model;

    // Refresh file tree overview in system message if it was empty initially
    if (session.messages.length > 0 && session.messages[0].role === "system") {
      const currentContent = session.messages[0].content || "";
      if (
        !currentContent.includes("Project file structure overview:") ||
        currentContent.includes("(empty project)")
      ) {
        const overview = this.getFileTreeOverview();
        if (overview && overview !== "(empty project)") {
          session.messages[0].content = systemPrompt(
            session.cwd,
            overview,
            this.getPolicy(),
          );
        }
      }
    }

    const text = contentBlocksToText(params.prompt);
    const userMessage: StoredContextMessage = {
      id: newId(),
      timestamp: Date.now(),
      role: "user",
      content: text || "(empty prompt)",
    };
    session.messages.push(userMessage);
    if (session.title === "New Session" && text) {
      session.title = text.slice(0, 40).trim();
    }
    try {
      const response = await this.runTurn(
        params.sessionId,
        session,
        pending.signal,
      );
      await this.persistSession(session);
      return response;
    } catch (error) {
      await this.persistSession(session);
      if (pending.signal.aborted) return { stopReason: "cancelled" };
      throw error;
    } finally {
      if (session.pending === pending) session.pending = null;
    }
  }

  async cancel(params: acp.CancelNotification): Promise<void> {
    this.sessions.get(params.sessionId)?.pending?.abort();
  }

  private maxTurnRequests(): number {
    const configured = this.getPolicy().maxTurnRequests;
    if (configured == null) return MAX_TOOL_ITERATIONS;
    return Math.max(1, Math.min(1000, Math.trunc(configured)));
  }

  private async runTurn(
    sessionId: string,
    session: SessionState,
    signal: AbortSignal,
  ): Promise<acp.PromptResponse> {
    const maxIterations = this.maxTurnRequests();
    for (let i = 0; i < maxIterations; i++) {
      if (signal.aborted) return { stopReason: "cancelled" };
      const messages = await this.prepareOutboundMessages(session);
      let assistantText = "";
      let toolCalls: ChatToolCall[] | null = null;
      for await (const event of this.client.complete(
        {
          model: this.target.model,
          messages,
          tools: toolsForPolicy(this.getPolicy()),
          tool_choice: "auto",
        },
        signal,
        {
          onResponse: (usage) => {
            emitDocumentEvent("pulsar-assistant:api-traffic", {
              projectRoot: session.cwd,
              sessionId,
              requestBytes: usage.requestBytes,
              responseBytes: usage.responseBytes,
            });
          },
        },
      )) {
        if (event.type === "thought" && event.text) {
          this.conn.onThought?.(event.text);
        } else if (event.type === "text" && event.text) {
          assistantText = `${assistantText}${event.text}`;
          await this.conn.sessionUpdate({
            sessionId,
            update: {
              sessionUpdate: "agent_message_chunk",
              content: { type: "text", text: event.text },
            },
          });
        } else if (event.type === "tool_calls") {
          toolCalls = event.calls;
        }
      }
      // The request completed successfully, so every tool message included in
      // it has now been seen by the model. Compact the ones we don't want to
      // send again in full on subsequent API calls.
      this.markSeenToolMessages(session);
      if (!toolCalls || toolCalls.length === 0) {
        session.messages.push({
          id: newId(),
          timestamp: Date.now(),
          role: "assistant",
          content: assistantText,
        });
        return { stopReason: "end_turn" };
      }
      session.messages.push({
        id: newId(),
        timestamp: Date.now(),
        role: "assistant",
        content: assistantText || null,
        tool_calls: toolCalls,
      });
      for (let index = 0; index < toolCalls.length; index += 1) {
        const call = toolCalls[index];
        const delayMs = this.getPolicy().toolCallDelayMs ?? 500;
        if (!signal.aborted && delayMs > 0) {
          await sleepWithSignal(delayMs, signal);
        }
        if (signal.aborted) {
          // The assistant message above is already in the history, and the API
          // rejects a request whose `tool_calls` are not all answered by `tool`
          // messages. Answer the calls we are not going to run, so a cancelled
          // turn cannot corrupt the session.
          answerSkippedToolCalls(session, toolCalls.slice(index));
          return { stopReason: "cancelled" };
        }
        await this.handleToolCall(sessionId, session, call, signal);
      }
    }
    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "agent_message_chunk",
        content: {
          type: "text",
          text: "Stopped after too many tool calls in one turn.",
        },
      },
    });
    return { stopReason: "max_turn_requests" };
  }

  private markSeenToolMessages(session: SessionState): void {
    for (const message of session.messages) {
      if (message.role !== "tool") continue;
      if (session.seenToolMessages.has(message)) {
        continue;
      }
      session.seenToolMessages.add(message);
      const summary = session.grepResultSummaries.get(message);
      if (summary !== undefined) {
        message.content = summary;
        if (message.metadata) message.metadata.isSummary = true;
      }
    }
  }

  private async handleToolCall(
    sessionId: string,
    session: SessionState,
    call: ChatToolCall,
    signal: AbortSignal,
  ): Promise<void> {
    session.toolRequestCount += 1;
    try {
      await this.handleToolCallInner(sessionId, session, call, signal);
    } finally {
      if (session.toolRequestCount >= TOOL_OUTPUT_COMPACT_INTERVAL) {
        session.toolRequestCount = 0;
        // Applied before the next request rather than here: the assistant
        // message that carries these calls may still have unexecuted calls whose
        // arguments must stay intact.
        session.compactOutputsRequested = true;
      }
    }
  }

  private async handleToolCallInner(
    sessionId: string,
    session: SessionState,
    call: ChatToolCall,
    signal: AbortSignal,
  ): Promise<void> {
    const toolCallId = call.id || newId();
    let meta;
    try {
      meta = describeToolCall(
        call.function.name,
        call.function.arguments,
        session.cwd,
        this.getPolicy(),
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      session.messages.push({
        id: newId(),
        timestamp: Date.now(),
        role: "tool",
        tool_call_id: toolCallId,
        content: message,
        metadata: {
          toolName: call.function.name,
          status: "failed",
          error: message,
        },
      });
      return;
    }

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "tool_call",
        toolCallId,
        title: meta.title,
        kind: meta.kind,
        status: "pending",
        locations: meta.locations,
        rawInput: meta.rawInput,
      },
    });

    if (meta.needsPermission) {
      const allowed = await requestToolPermission(
        this.conn,
        sessionId,
        toolCallId,
        meta,
      );
      if (!allowed) {
        await this.conn.sessionUpdate({
          sessionId,
          update: {
            sessionUpdate: "tool_call_update",
            toolCallId,
            status: "failed",
            content: [
              {
                type: "content",
                content: { type: "text", text: "Rejected by the user." },
              },
            ],
            rawOutput: { error: "Permission rejected by the user." },
          },
        });
        session.messages.push({
          id: newId(),
          timestamp: Date.now(),
          role: "tool",
          tool_call_id: toolCallId,
          content: "The user rejected this tool call.",
          metadata: {
            toolName: call.function.name,
            title: meta.title,
            kind: meta.kind,
            status: "failed",
            error: "Rejected by the user.",
          },
        });
        return;
      }
    }

    await this.conn.sessionUpdate({
      sessionId,
      update: {
        sessionUpdate: "tool_call_update",
        toolCallId,
        status: "in_progress",
      },
    });

    try {
      const result = await executeTool(
        this.conn,
        sessionId,
        call.function.name,
        call.function.arguments,
        session.cwd,
        signal,
        this.getPolicy(),
        this.getFileTree ? this.getFileTree() : null,
      );
      await this.conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "completed",
          content: result.content ?? [
            {
              type: "content",
              content: { type: "text", text: result.output },
            },
          ],
          rawOutput: { output: result.output },
        },
      });
      const toolMessage: StoredContextMessage = {
        id: newId(),
        timestamp: Date.now(),
        role: "tool",
        tool_call_id: toolCallId,
        content: result.output,
        metadata: {
          toolName: call.function.name,
          title: meta.title,
          kind: meta.kind,
          locations: meta.locations,
          status: "completed",
        },
      };
      if (call.function.name === "grep") {
        session.grepResultSummaries.set(
          toolMessage,
          grepResultSummary(result.output),
        );
      }
      session.messages.push(toolMessage);
    } catch (error) {
      if (error instanceof ToolRejected) {
        session.messages.push({
          id: newId(),
          timestamp: Date.now(),
          role: "tool",
          tool_call_id: toolCallId,
          content: error.message,
          metadata: {
            toolName: call.function.name,
            title: meta.title,
            kind: meta.kind,
            status: "failed",
            error: error.message,
          },
        });
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      await this.conn.sessionUpdate({
        sessionId,
        update: {
          sessionUpdate: "tool_call_update",
          toolCallId,
          status: "failed",
          content: [
            { type: "content", content: { type: "text", text: message } },
          ],
          rawOutput: { error: message },
        },
      });
      session.messages.push({
        id: newId(),
        timestamp: Date.now(),
        role: "tool",
        tool_call_id: toolCallId,
        content: message,
        metadata: {
          toolName: call.function.name,
          title: meta.title,
          kind: meta.kind,
          status: "failed",
          error: message,
        },
      });
    }
  }
}
