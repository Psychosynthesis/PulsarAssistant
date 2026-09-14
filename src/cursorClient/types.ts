// Pure Cursor Cloud Agents HTTP API types. Field names follow the Cursor API
// where known, but parsing stays defensive because the public schema is not
// pinned by this package. `[key: string]: unknown` keeps unknown response
// fields accessible without asserting a shape we do not control.

export type CursorModel = {
  id: string;
  description?: string;
};

export type CursorRepository = {
  url: string;
  [key: string]: unknown;
};

export type CursorAgent = {
  id: string;
  status?: string;
  latestRunId?: string;
  [key: string]: unknown;
};

export type CursorRun = {
  id: string;
  status?: string;
  result?: {
    text?: string;
    branch?: string;
    prUrl?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
};

export type CursorCreateAgentResponse = {
  agent?: CursorAgent;
  id?: string;
  agentId?: string;
  run?: CursorRun;
  latestRunId?: string;
  [key: string]: unknown;
};

export type CursorCreateAgentRequest = {
  agentId: string;
  prompt: { text: string };
  model: { id: string };
  repos: Array<{ url: string; startingRef?: string }>;
  mode?: "agent" | "plan";
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
};

export type CursorCreateRunRequest = {
  prompt: { text: string };
};

export type CursorSseEnvelope = {
  id?: string;
  event?: string;
  data: string;
};

export type CursorStreamEvent =
  | { type: "assistant"; text: string }
  | { type: "thinking"; text: string }
  | {
      type: "tool_call";
      toolCallId: string;
      title: string;
      status: string;
      rawInput?: unknown;
    }
  | {
      type: "tool_call_update";
      toolCallId: string;
      status: string;
      rawOutput?: unknown;
    }
  | {
      type: "result";
      text?: string;
      branch?: string;
      prUrl?: string;
      status?: string;
    }
  | { type: "unknown"; raw: unknown };

export class CursorApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly body?: string,
  ) {
    super(message);
    this.name = "CursorApiError";
  }
}
