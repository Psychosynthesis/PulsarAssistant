import type { CursorSseEnvelope, CursorStreamEvent } from "./types";

function parseEnvelope(
  raw: string,
  previousId: string | undefined,
): CursorSseEnvelope | null {
  const lines = raw.split("\n");
  let id = previousId;
  let event: string | undefined;
  const dataLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith(":")) continue;
    if (line.startsWith("id:")) {
      const value = line.slice(3).trimStart();
      if (value) id = value;
      continue;
    }
    if (line.startsWith("event:")) {
      const value = line.slice(6).trimStart();
      if (value) event = value;
      continue;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }

  if (dataLines.length === 0) return null;
  return { id, event, data: dataLines.join("\n") };
}

export async function* readCursorSse(
  response: Response,
  signal: AbortSignal,
): AsyncIterable<CursorSseEnvelope> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Cursor stream response had no body.");
  }
  const decoder = new TextDecoder();
  let buffer = "";
  let lastEventId: string | undefined;
  try {
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let separator: number;
      while ((separator = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const envelope = parseEnvelope(raw, lastEventId);
        if (envelope) {
          if (envelope.id) lastEventId = envelope.id;
          yield envelope;
        }
      }
    }
    if (!signal.aborted && buffer.trim()) {
      const envelope = parseEnvelope(buffer, lastEventId);
      if (envelope) yield envelope;
    }
  } finally {
    reader.releaseLock();
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(
  data: Record<string, unknown> | null,
  keys: string[],
): string | undefined {
  if (!data) return undefined;
  for (const key of keys) {
    const value = data[key];
    if (typeof value === "string") return value;
  }
  return undefined;
}

export function parseCursorStreamEvent(
  envelope: CursorSseEnvelope,
): CursorStreamEvent {
  const raw = envelope.data;
  let data: Record<string, unknown> | null = null;
  if (raw.trim()) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (isObject(parsed)) data = parsed;
    } catch {
      // Keep data null and fall back to raw string below.
    }
  }

  const eventType =
    envelope.event ?? stringField(data, ["type", "event"]) ?? "message";

  switch (eventType) {
    case "assistant":
      return {
        type: "assistant",
        text:
          stringField(data, ["text", "delta", "content"]) ??
          (data ? "" : raw),
      };
    case "thinking":
      return {
        type: "thinking",
        text:
          stringField(data, ["text", "delta", "content"]) ??
          (data ? "" : raw),
      };
    case "tool_call": {
      const toolCallId =
        stringField(data, ["toolCallId", "tool_call_id", "id"]) ?? "tool";
      const title =
        stringField(data, ["title", "name", "toolName"]) ?? "Tool Call";
      const status =
        stringField(data, ["status"]) ?? "in_progress";
      return {
        type: "tool_call",
        toolCallId,
        title,
        status,
        rawInput:
          data?.input ?? data?.rawInput ?? data?.arguments ?? data?.raw_input,
      };
    }
    case "tool_call_update": {
      const toolCallId =
        stringField(data, ["toolCallId", "tool_call_id", "id"]) ?? "tool";
      const status =
        stringField(data, ["status"]) ?? "in_progress";
      return {
        type: "tool_call_update",
        toolCallId,
        status,
        rawOutput:
          data?.output ?? data?.rawOutput ?? data?.result ?? data?.raw_output,
      };
    }
    case "result": {
      const nested = isObject(data?.result) ? data?.result : undefined;
      return {
        type: "result",
        text: stringField(data, ["text", "output"]),
        branch:
          stringField(data, ["branch"]) ??
          (nested ? stringField(nested, ["branch"]) : undefined),
        prUrl:
          stringField(data, ["prUrl", "pr_url"]) ??
          (nested ? stringField(nested, ["prUrl", "pr_url"]) : undefined),
        status: stringField(data, ["status"]),
      };
    }
    default:
      return { type: "unknown", raw: data ?? raw };
  }
}

// Convenience guard used by callers that only care about named SSE events.
export function isStreamTextEvent(
  event: CursorStreamEvent,
): event is Extract<CursorStreamEvent, { type: "assistant" | "thinking" }> {
  return event.type === "assistant" || event.type === "thinking";
}

// Decodes a tool status into the ACP-compatible string the Pulsar tool view
// already understands. Cursor statuses are not pinned, so only collapse obvious
// terminal values and keep everything else as "in_progress".
export function toToolCallStatus(
  status: string | undefined,
): "in_progress" | "completed" | "failed" {
  const value = (status ?? "in_progress").toLowerCase();
  if (value === "completed" || value === "complete" || value === "done") {
    return "completed";
  }
  if (value === "failed" || value === "error" || value === "cancelled") {
    return "failed";
  }
  return "in_progress";
}
