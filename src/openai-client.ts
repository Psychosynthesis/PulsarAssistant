export type ChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: ChatToolCall[];
      reasoning_content?: string | null;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type ChatTool = {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

export type ChatToolCall = {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
};

export type ChatRequest = {
  model: string;
  messages: ChatMessage[];
  tools?: ChatTool[];
  tool_choice?: "auto" | "none";
  reasoningEffort?: "none" | "low" | "medium" | "high";
  // When true, the Responses transport adds the server-side web_search tool.
  webSearch?: boolean;
};

export type WebSearchSource = {
  title: string;
  url: string;
};

export type ChatEvent =
  | { type: "text"; text: string }
  | { type: "thought"; text: string }
  | { type: "sources"; sources: WebSearchSource[] }
  | { type: "tool_calls"; calls: ChatToolCall[] }
  | { type: "done"; finishReason: string };

export type OpenAiResponseUsage = {
  requestBytes: number;
  responseBytes: number;
};

export type OpenAiClientOptions = {
  baseUrl: string;
  apiKey: string;
  // When true, POST with `stream: true` and parse SSE. The API does not have
  // to support this yet; keep false until it does. The event iterator is the
  // same either way so callers do not branch on transport.
  stream?: boolean;
  fetch?: typeof fetch;
  // When true (or when the resolver returns true), include_reasoning: true is
  // added to the POST body. Some providers only stream model thoughts when
  // explicitly asked to.
  includeReasoning?: boolean | (() => boolean);
};

export type OpenAiResponsesClientOptions = {
  baseUrl: string;
  apiKey: string;
  stream?: boolean;
  fetch?: typeof fetch;
  includeReasoning?: boolean | (() => boolean);
};

/**
 * Transport contract shared by the Chat Completions and Responses transports,
 * so the agent loop stays transport-agnostic.
 */
export type ChatClient = {
  complete(
    request: ChatRequest,
    signal: AbortSignal,
    options?: { onResponse?: (usage: OpenAiResponseUsage) => void },
  ): AsyncIterable<ChatEvent>;
};

export type OpenAiModelInfo = {
  id: string;
  description?: string;
};

export type FetchOpenAiModelsOptions = {
  baseUrl: string;
  apiKey: string;
  modelsUrl?: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

type ChatCompletionChoice = {
  finish_reason?: string | null;
  message?: {
    content?: string | null;
    reasoning_content?: string | null;
    thought?: string | null;
    thinking?: string | null;
    reasoning?: string | null;
    tool_calls?: ChatToolCall[];
  };
  delta?: {
    content?: string | null;
    reasoning_content?: string | null;
    thought?: string | null;
    thinking?: string | null;
    reasoning?: string | null;
    tool_calls?: Array<{
      index?: number;
      id?: string;
      type?: "function";
      function?: { name?: string; arguments?: string };
    }>;
  };
};

type ChatCompletionResponse = {
  choices?: ChatCompletionChoice[];
  error?: { message?: string };
};

type ModelsResponse = {
  data?: unknown;
  error?: { message?: string };
};

function extractReasoning(obj: Record<string, unknown> | undefined): {
  reasoningText: string | null;
  consumeContent: boolean;
} {
  if (!obj || typeof obj !== "object") {
    return { reasoningText: null, consumeContent: false };
  }

  const candidateKeys = [
    "reasoning_content",
    "reasoning",
    "reasoning_text",
    "reasoningText",
    "thoughts",
    "thinking",
    "thinking_process",
    "reasoningContent",
    "thought_content",
    "thoughtContent",
  ];
  for (const key of candidateKeys) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) {
      return { reasoningText: val, consumeContent: false };
    }
    if (val && typeof val === "object") {
      const textVal =
        (val as { text?: unknown; content?: unknown }).text ??
        (val as { text?: unknown; content?: unknown }).content;
      if (typeof textVal === "string" && textVal.length > 0) {
        return { reasoningText: textVal, consumeContent: false };
      }
    }
  }

  if (typeof obj.thought === "string" && obj.thought.length > 0) {
    return { reasoningText: obj.thought, consumeContent: false };
  }
  if (obj.thought && typeof obj.thought === "object") {
    const textVal =
      (obj.thought as { text?: unknown; content?: unknown }).text ??
      (obj.thought as { text?: unknown; content?: unknown }).content;
    if (typeof textVal === "string" && textVal.length > 0) {
      return { reasoningText: textVal, consumeContent: false };
    }
  }
  if (obj.thought === true) {
    const thoughtText =
      typeof obj.content === "string"
        ? obj.content
        : typeof obj.text === "string"
          ? obj.text
          : null;
    return { reasoningText: thoughtText, consumeContent: true };
  }

  if (Array.isArray(obj.parts)) {
    const thoughtParts: string[] = [];
    for (const part of obj.parts) {
      if (part && typeof part === "object") {
        const p = part as Record<string, unknown>;
        if (typeof p.thought === "string") {
          thoughtParts.push(p.thought);
        } else if (p.thought === true) {
          if (typeof p.text === "string") thoughtParts.push(p.text);
          else if (typeof p.content === "string") thoughtParts.push(p.content);
        }
      }
    }
    if (thoughtParts.length > 0) {
      return { reasoningText: thoughtParts.join(""), consumeContent: false };
    }
  }

  return { reasoningText: null, consumeContent: false };
}

class StreamingTagFilter {
  private inTag = false;
  private buffer = "";

  process(chunk: string): Array<{ type: "thought" | "text"; text: string }> {
    const results: Array<{ type: "thought" | "text"; text: string }> = [];
    this.buffer += chunk;

    while (this.buffer.length > 0) {
      if (!this.inTag) {
        const match = this.buffer.match(/<(think|thought|thinking|reasoning)>/i);
        if (match && match.index !== undefined) {
          const textBefore = this.buffer.slice(0, match.index);
          if (textBefore.length > 0) {
            results.push({ type: "text", text: textBefore });
          }
          this.inTag = true;
          this.buffer = this.buffer.slice(match.index + match[0].length);
        } else {
          const partialMatch = this.buffer.match(/<[a-z]{0,9}$/i);
          if (partialMatch && partialMatch.index !== undefined) {
            const safeText = this.buffer.slice(0, partialMatch.index);
            if (safeText.length > 0) {
              results.push({ type: "text", text: safeText });
            }
            this.buffer = this.buffer.slice(partialMatch.index);
            break;
          } else {
            results.push({ type: "text", text: this.buffer });
            this.buffer = "";
          }
        }
      } else {
        const match = this.buffer.match(/<\/(think|thought|thinking|reasoning)>/i);
        if (match && match.index !== undefined) {
          const thoughtBefore = this.buffer.slice(0, match.index);
          if (thoughtBefore.length > 0) {
            results.push({ type: "thought", text: thoughtBefore });
          }
          this.inTag = false;
          this.buffer = this.buffer.slice(match.index + match[0].length);
        } else {
          const partialMatch = this.buffer.match(/<\/[a-z]{0,9}$/i);
          if (partialMatch && partialMatch.index !== undefined) {
            const safeThought = this.buffer.slice(0, partialMatch.index);
            if (safeThought.length > 0) {
              results.push({ type: "thought", text: safeThought });
            }
            this.buffer = this.buffer.slice(partialMatch.index);
            break;
          } else {
            results.push({ type: "thought", text: this.buffer });
            this.buffer = "";
          }
        }
      }
    }
    return results;
  }

  flush(): Array<{ type: "thought" | "text"; text: string }> {
    const results: Array<{ type: "thought" | "text"; text: string }> = [];
    if (this.buffer.length > 0) {
      results.push({
        type: this.inTag ? "thought" : "text",
        text: this.buffer,
      });
      this.buffer = "";
    }
    return results;
  }
}

function boundFetch(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  // Window.fetch must keep `this === window`. Storing `fetch` and calling it
  // later is an Illegal invocation in Pulsar's renderer.
  return globalThis.fetch(...args);
}

function utf8ByteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function completionsUrl(baseUrl: string): string {
  return `${trimSlash(baseUrl)}/chat/completions`;
}

function responsesUrl(baseUrl: string): string {
  return `${trimSlash(baseUrl)}/responses`;
}

/**
 * True only for the official OpenAI API. Third-party gateways (OpenRouter,
 * DeepSeek, Groq, local engines) keep their own provider behaviour even when
 * they serve OpenAI-named models, so provider-specific request flags must not
 * be derived from the model id alone.
 */
function isOpenAiBaseUrl(baseUrl: string): boolean {
  try {
    return new URL(baseUrl).hostname === "api.openai.com";
  } catch {
    return false;
  }
}

/**
 * Conservative detection of OpenAI reasoning model families (o1/o3/o4 and
 * gpt-5 lines), used only for the Chat Completions stop-gap below. It never
 * selects the transport: transport is an explicit agent setting.
 */
function isOpenAiReasoningModel(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  return (
    /(^|[-/.])o\d/.test(normalized) ||
    /(^|[-/.])gpt-[5-9]/.test(normalized) ||
    normalized.includes("reasoning")
  );
}

export function formatApiErrorMessage(status: number, rawBody: string): string {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return `API error ${status}`;
  }
  let formattedDetails: string | null = null;
  try {
    const json = JSON.parse(trimmed);
    formattedDetails = JSON.stringify(json, null, 2);
  } catch {
    const stripped = trimmed.replace(/<[^>]*>/g, "").trim();
    if (stripped) {
      formattedDetails = stripped;
    }
  }

  if (formattedDetails) {
    return `API error ${status}\n\n${formattedDetails}`;
  }
  return `API error ${status}`;
}

export class OpenAiHttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "OpenAiHttpError";
  }
}

export class OpenAiModelsError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: string,
  ) {
    super(message);
    this.name = "OpenAiModelsError";
  }
}

export class OpenAiChatClient {
  private fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiClientOptions) {
    this.fetchImpl = options.fetch ?? boundFetch;
  }

  async *complete(
    request: ChatRequest,
    signal: AbortSignal,
    options: { onResponse?: (usage: OpenAiResponseUsage) => void } = {},
  ): AsyncIterable<ChatEvent> {
    if (this.options.stream) {
      yield* this.completeStream(request, signal, options);
    } else {
      yield* this.completeOnce(request, signal, options);
    }
  }

  private async *completeOnce(
    request: ChatRequest,
    signal: AbortSignal,
    options: { onResponse?: (usage: OpenAiResponseUsage) => void },
  ): AsyncIterable<ChatEvent> {
    const { response, requestBytes } = await this.post(request, false, signal);
    const text = await response.text();
    options.onResponse?.({
      requestBytes,
      responseBytes: utf8ByteLength(text),
    });
    if (!response.ok) {
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, text),
        response.status,
        text,
      );
    }
    let parsed: ChatCompletionResponse;
    try {
      parsed = JSON.parse(text) as ChatCompletionResponse;
    } catch {
      throw new OpenAiHttpError(
        `API returned non-JSON (${response.status})`,
        response.status,
        text,
      );
    }
    const choice = parsed.choices?.[0];
    const message = choice?.message;
    const reasoningInfo = extractReasoning(
      message as Record<string, unknown> | undefined,
    );
    let reasoning = reasoningInfo.reasoningText;
    let content = reasoningInfo.consumeContent
      ? ""
      : (message?.content ?? "");

    const inlineThinkRegex = /<(think|thought|thinking|reasoning)>([\s\S]*?)<\/\1>/gi;
    const tagThoughts: string[] = [];
    content = content
      .replace(inlineThinkRegex, (_: string, _tag: string, match: string) => {
        tagThoughts.push(match);
        return "";
      })
      // Removing a tag can leave behind stray blank lines (the tag was often
      // the only thing on its line). Collapse runs of 3+ newlines into a single
      // blank line and strip the leading/trailing whitespace.
      .replace(/[ \t]*\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n")
      .trim();

    if (tagThoughts.length > 0) {
      const combinedTagThought = tagThoughts.join("\n");
      reasoning = reasoning
        ? `${reasoning}\n${combinedTagThought}`
        : combinedTagThought;
    }

    if (reasoning) {
      yield { type: "thought", text: reasoning };
    }
    if (content) yield { type: "text", text: content };
    if (message?.tool_calls && message.tool_calls.length > 0) {
      yield { type: "tool_calls", calls: message.tool_calls };
    }
    yield { type: "done", finishReason: choice?.finish_reason || "stop" };
  }

  private async *completeStream(
    request: ChatRequest,
    signal: AbortSignal,
    options: { onResponse?: (usage: OpenAiResponseUsage) => void },
  ): AsyncIterable<ChatEvent> {
    const { response, requestBytes } = await this.post(request, true, signal);
    if (!response.ok) {
      const body = await response.text();
      options.onResponse?.({
        requestBytes,
        responseBytes: utf8ByteLength(body),
      });
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, body),
        response.status,
        body,
      );
    }
    if (!response.body) {
      throw new Error("API stream response had no body.");
    }
    const pending = new Map<
      number,
      { id: string; name: string; arguments: string }
    >();
    let finishReason = "stop";
    // Some gateways send the terminal choice chunk with `finish_reason` but
    // never emit `data: [DONE]` and keep the connection open. `finish_reason`
    // is the protocol's own end-of-generation signal, so stop on it instead of
    // waiting for `[DONE]` and hanging forever.
    let finishSeen = false;
    let receivedBytes = 0;
    const tagFilter = new StreamingTagFilter();
    for await (const payload of readSseData(
      response.body,
      signal,
      (bytes) => {
        receivedBytes += bytes;
      },
      () => finishSeen,
    )) {
      if (payload === "[DONE]") break;
      let parsed: ChatCompletionResponse;
      try {
        parsed = JSON.parse(payload) as ChatCompletionResponse;
      } catch {
        continue;
      }
      const choice = parsed.choices?.[0];
      if (!choice) continue;
      const delta = choice.delta as Record<string, unknown> | undefined;
      const deltaFinishReason = (delta as { finish_reason?: string } | undefined)
        ?.finish_reason;
      const choiceFinishReason = choice.finish_reason ?? deltaFinishReason;
      if (choiceFinishReason) finishReason = choiceFinishReason;
      const deltaReasoning = extractReasoning(delta);
      const reasoningInfo = deltaReasoning.reasoningText
        ? deltaReasoning
        : extractReasoning(choice as Record<string, unknown>);
      if (reasoningInfo.reasoningText) {
        yield { type: "thought", text: reasoningInfo.reasoningText };
      }
      if (!reasoningInfo.consumeContent && typeof delta?.content === "string") {
        for (const item of tagFilter.process(delta.content)) {
          yield item;
        }
      }
      for (const part of (delta?.tool_calls as any[]) ?? []) {
        const index = part.index ?? 0;
        const current = pending.get(index) ?? {
          id: "",
          name: "",
          arguments: "",
        };
        if (part.id) current.id = part.id;
        if (part.function?.name) current.name += part.function.name;
        if (part.function?.arguments) current.arguments += part.function.arguments;
        pending.set(index, current);
      }
      if (choiceFinishReason) finishSeen = true;
    }
    for (const item of tagFilter.flush()) {
      yield item;
    }
    if (pending.size > 0) {
      const calls: ChatToolCall[] = [...pending.values()].map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments },
      }));
      yield { type: "tool_calls", calls };
    }
    options.onResponse?.({
      requestBytes,
      responseBytes: receivedBytes,
    });
    yield { type: "done", finishReason };
  }

  private resolveIncludeReasoning(): boolean {
    const value = this.options.includeReasoning;
    if (typeof value === "function") {
      if (!value()) return false;
    } else if (value !== true) {
      return false;
    }
    // `include_reasoning` is a provider-specific flag (Gemini/DeepSeek-style
    // endpoints); the official OpenAI API rejects it as an unknown parameter.
    return !isOpenAiBaseUrl(this.options.baseUrl);
  }

  private resolveReasoningEffort(request: ChatRequest): string | undefined {
    if (request.reasoningEffort) return request.reasoningEffort;
    // Stop-gap for OpenAI reasoning models on Chat Completions: the API
    // applies reasoning_effort "medium" by default, which is incompatible with
    // function tools. Send "none" so tools keep working; full reasoning support
    // requires the Responses transport (agent apiFormat: "responses").
    if (
      isOpenAiBaseUrl(this.options.baseUrl) &&
      (request.tools?.length ?? 0) > 0 &&
      isOpenAiReasoningModel(request.model)
    ) {
      return "none";
    }
    return undefined;
  }

  private async post(
    request: ChatRequest,
    stream: boolean,
    signal: AbortSignal,
  ): Promise<{ response: Response; requestBytes: number }> {
    const url = completionsUrl(this.options.baseUrl);
    const includeReasoning = this.resolveIncludeReasoning();
    const reasoningEffort = this.resolveReasoningEffort(request);
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      ...(request.tools?.length ? { tools: request.tools } : {}),
      ...(request.tool_choice ? { tool_choice: request.tool_choice } : {}),
      stream,
      ...(includeReasoning ? { include_reasoning: true } : {}),
      ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    });
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body,
      signal,
    });
    return { response, requestBytes: utf8ByteLength(body) };
  }
}

type ResponsesInputItem =
  | {
      role: "system" | "user" | "assistant";
      content: Array<{ type: "input_text"; text: string }>;
    }
  | {
      type: "function_call";
      call_id: string;
      name: string;
      arguments: string;
    }
  | {
      type: "function_call_output";
      call_id: string;
      output: string;
    };

type ResponsesTool =
  | {
      type: "function";
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    }
  | { type: "web_search" };

type ResponsesBody = {
  status?: string;
  output?: unknown[];
  error?: { message?: string };
};

function toResponsesInput(messages: ChatMessage[]): ResponsesInputItem[] {
  const items: ResponsesInputItem[] = [];
  for (const message of messages) {
    if (message.role === "system" || message.role === "user") {
      items.push({
        role: message.role,
        content: [{ type: "input_text", text: message.content }],
      });
    } else if (message.role === "assistant") {
      const content = message.content ?? "";
      if (content.trim().length > 0) {
        items.push({
          role: "assistant",
          content: [{ type: "input_text", text: content }],
        });
      }
      for (const call of message.tool_calls ?? []) {
        items.push({
          type: "function_call",
          call_id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
        });
      }
    } else if (message.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: message.content,
      });
    }
  }
  return items;
}

function toResponsesTools(
  tools?: ChatTool[],
  webSearch = false,
): ResponsesTool[] | undefined {
  const items: ResponsesTool[] = (tools ?? []).map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters,
  }));
  if (webSearch) {
    items.push({ type: "web_search" });
  }
  return items.length > 0 ? items : undefined;
}

function extractWebSearchSources(
  record: Record<string, unknown>,
): WebSearchSource[] {
  const results = record.results;
  if (!Array.isArray(results)) return [];
  const sources: WebSearchSource[] = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const title = typeof r.title === "string" ? r.title : "";
    const url =
      typeof r.url === "string"
        ? r.url
        : typeof r.link === "string"
          ? r.link
          : "";
    if (url || title) {
      sources.push({ title: title || url, url });
    }
  }
  return sources;
}

/**
 * OpenAI Responses API transport. Emits the same `ChatEvent` stream contract
 * as the Chat Completions transport, so the agent loop only differs in how
 * history and tool calls are encoded for the wire.
 */
export class OpenAiResponsesClient implements ChatClient {
  private fetchImpl: typeof fetch;

  constructor(private readonly options: OpenAiResponsesClientOptions) {
    this.fetchImpl = options.fetch ?? boundFetch;
  }

  async *complete(
    request: ChatRequest,
    signal: AbortSignal,
    options: { onResponse?: (usage: OpenAiResponseUsage) => void } = {},
  ): AsyncIterable<ChatEvent> {
    if (this.options.stream) {
      yield* this.completeStream(request, signal, options);
    } else {
      yield* this.completeOnce(request, signal, options);
    }
  }

  private async *completeOnce(
    request: ChatRequest,
    signal: AbortSignal,
    options: { onResponse?: (usage: OpenAiResponseUsage) => void },
  ): AsyncIterable<ChatEvent> {
    const { response, requestBytes } = await this.post(request, false, signal);
    const text = await response.text();
    options.onResponse?.({
      requestBytes,
      responseBytes: utf8ByteLength(text),
    });
    if (!response.ok) {
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, text),
        response.status,
        text,
      );
    }
    let parsed: ResponsesBody;
    try {
      parsed = JSON.parse(text) as ResponsesBody;
    } catch {
      throw new OpenAiHttpError(
        `API returned non-JSON (${response.status})`,
        response.status,
        text,
      );
    }
    if (parsed.error?.message) {
      throw new OpenAiHttpError(parsed.error.message, response.status, text);
    }

    const output = Array.isArray(parsed.output) ? parsed.output : [];
    const thoughts: string[] = [];
    const textParts: string[] = [];
    const calls: ChatToolCall[] = [];
    const sources: WebSearchSource[] = [];

    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const record = item as Record<string, unknown>;
      if (record.type === "reasoning") {
        const summary = record.summary;
        if (Array.isArray(summary)) {
          for (const part of summary) {
            const p = part as Record<string, unknown>;
            if (p?.type === "summary_text" && typeof p.text === "string") {
              thoughts.push(p.text);
            }
          }
        }
      } else if (record.type === "message" && record.role === "assistant") {
        const content = record.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const p = part as Record<string, unknown>;
            if (p?.type === "output_text" && typeof p.text === "string") {
              textParts.push(p.text);
            }
          }
        }
      } else if (record.type === "function_call") {
        const callId =
          typeof record.call_id === "string" ? record.call_id : "";
        const name = typeof record.name === "string" ? record.name : "";
        const argumentsText =
          typeof record.arguments === "string" ? record.arguments : "{}";
        calls.push({
          id: callId,
          type: "function",
          function: { name, arguments: argumentsText },
        });
      } else if (record.type === "web_search_call") {
        sources.push(...extractWebSearchSources(record));
      }
    }

    if (thoughts.length > 0) {
      yield { type: "thought", text: thoughts.join("\n") };
    }
    const assistantText = textParts.join("");
    if (assistantText) {
      yield { type: "text", text: assistantText };
    }
    if (sources.length > 0) {
      yield { type: "sources", sources };
    }
    if (calls.length > 0) {
      yield { type: "tool_calls", calls };
    }
    yield { type: "done", finishReason: "stop" };
  }

  private async *completeStream(
    request: ChatRequest,
    signal: AbortSignal,
    options: { onResponse?: (usage: OpenAiResponseUsage) => void },
  ): AsyncIterable<ChatEvent> {
    const { response, requestBytes } = await this.post(request, true, signal);
    if (!response.ok) {
      const body = await response.text();
      options.onResponse?.({
        requestBytes,
        responseBytes: utf8ByteLength(body),
      });
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, body),
        response.status,
        body,
      );
    }
    if (!response.body) {
      throw new Error("API stream response had no body.");
    }

    let receivedBytes = 0;
    let finished = false;
    const calls: ChatToolCall[] = [];
    const sources: WebSearchSource[] = [];
    const pendingCalls = new Map<string, { name: string; arguments: string }>();

    for await (const payload of readSseData(
      response.body,
      signal,
      (bytes) => {
        receivedBytes += bytes;
      },
      () => finished,
    )) {
      if (payload === "[DONE]") break;
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(payload) as Record<string, unknown>;
      } catch {
        continue;
      }
      const type = typeof parsed.type === "string" ? parsed.type : "";

      if (type === "response.output_text.delta") {
        const delta = this.eventDelta(parsed);
        if (delta) yield { type: "text", text: delta };
      } else if (type === "response.reasoning_summary_text.delta") {
        const delta = this.eventDelta(parsed);
        if (delta) yield { type: "thought", text: delta };
      } else if (type === "response.function_call_arguments.delta") {
        const itemId = this.eventItemId(parsed);
        const delta = this.eventDelta(parsed);
        const current = pendingCalls.get(itemId) ?? { name: "", arguments: "" };
        current.arguments += delta;
        pendingCalls.set(itemId, current);
      } else if (type === "response.output_item.added") {
        const item = parsed.item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (record.type === "function_call") {
            const itemId = typeof record.id === "string" ? record.id : "";
            const name = typeof record.name === "string" ? record.name : "";
            pendingCalls.set(itemId, { name, arguments: "" });
          }
        }
      } else if (type === "response.output_item.done") {
        const item = parsed.item;
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          if (record.type === "function_call") {
            const itemId = typeof record.id === "string" ? record.id : "";
            const name = typeof record.name === "string" ? record.name : "";
            const args = typeof record.arguments === "string" ? record.arguments : "";
            const pending = pendingCalls.get(itemId);
            pendingCalls.delete(itemId);
            calls.push({
              id: itemId,
              type: "function",
              function: {
                name: name || pending?.name || "",
                arguments: args.length > 0 ? args : (pending?.arguments ?? ""),
              },
            });
          } else if (record.type === "web_search_call") {
            sources.push(...extractWebSearchSources(record));
          }
        }
      } else if (type === "response.completed") {
        finished = true;
      } else if (type === "response.failed" || type === "error") {
        throw new OpenAiHttpError(
          OpenAiResponsesClient.streamError(parsed),
          response.status,
          JSON.stringify(parsed),
        );
      }
    }

    for (const [id, call] of pendingCalls) {
      if (call.name) {
        calls.push({
          id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        });
      }
    }

    options.onResponse?.({
      requestBytes,
      responseBytes: receivedBytes,
    });
    if (sources.length > 0) yield { type: "sources", sources };
    if (calls.length > 0) yield { type: "tool_calls", calls };
    yield { type: "done", finishReason: "stop" };
  }

  private eventDelta(parsed: Record<string, unknown>): string {
    return typeof parsed.delta === "string" ? parsed.delta : "";
  }

  private eventItemId(parsed: Record<string, unknown>): string {
    return typeof parsed.item_id === "string" ? parsed.item_id : "";
  }

  private static streamError(parsed: Record<string, unknown>): string {
    const error = parsed.error;
    if (error && typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      if (typeof message === "string" && message.length > 0) return message;
    }
    const message = typeof parsed.message === "string" ? parsed.message : "";
    return message || "Responses API stream failed.";
  }

  private resolveIncludeReasoning(): boolean {
    const value = this.options.includeReasoning;
    if (typeof value === "function") return value();
    return value === true;
  }

  private resolveReasoning(request: ChatRequest): {
    effort?: "none" | "low" | "medium" | "high";
    summary: "auto" | "none";
  } | undefined {
    // `reasoning` is only meaningful for reasoning models; sending it to a
    // non-reasoning model is rejected by the API.
    if (!isOpenAiReasoningModel(request.model)) return undefined;
    return {
      ...(request.reasoningEffort ? { effort: request.reasoningEffort } : {}),
      summary: this.resolveIncludeReasoning() ? "auto" : "none",
    };
  }

  private async post(
    request: ChatRequest,
    stream: boolean,
    signal: AbortSignal,
  ): Promise<{ response: Response; requestBytes: number }> {
    const tools = toResponsesTools(request.tools, request.webSearch === true);
    const reasoning = this.resolveReasoning(request);
    const body = JSON.stringify({
      model: request.model,
      input: toResponsesInput(request.messages),
      ...(tools ? { tools } : {}),
      ...(reasoning ? { reasoning } : {}),
      stream,
    });
    const response = await this.fetchImpl(responsesUrl(this.options.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body,
      signal,
    });
    return { response, requestBytes: utf8ByteLength(body) };
  }
}

export async function fetchOpenAiModels(
  options: FetchOpenAiModelsOptions,
): Promise<OpenAiModelInfo[]> {
  const fetchImpl = options.fetch ?? boundFetch;
  const url = trimSlash(
    options.modelsUrl ?? `${trimSlash(options.baseUrl)}/models`,
  );
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
    },
    signal: options.signal,
  });
  const text = await response.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OpenAiModelsError(
      `Model list returned non-JSON (${response.status})`,
      response.status,
      text,
    );
  }
  const object: ModelsResponse =
    parsed && typeof parsed === "object"
      ? (parsed as ModelsResponse)
      : {};
  if (!response.ok) {
    throw new OpenAiModelsError(
      object.error?.message || `Model list error ${response.status}`,
      response.status,
      text,
    );
  }

  const rawData = Array.isArray(object.data) ? object.data : [];
  const models: OpenAiModelInfo[] = [];
  for (const item of rawData) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    const description =
      typeof item.description === "string" && item.description.trim() !== ""
        ? item.description.trim()
        : undefined;
    models.push(description ? { id, description } : { id });
  }
  if (models.length === 0) {
    throw new OpenAiModelsError("Model list is empty.", response.status, text);
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}

async function* readSseData(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
  onBytes?: (bytes: number) => void,
  stop?: () => boolean,
): AsyncIterable<string> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  // reader.read() does not observe `signal` on its own, so cancelling the
  // reader is what actually unblocks a hung read when the caller aborts.
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  const onAbort = () => cancel();
  signal.addEventListener("abort", onAbort, { once: true });

  try {
    outer: while (true) {
      if (signal.aborted || stop?.()) break;
      const { done, value } = await reader.read();
      if (signal.aborted) break;
      if (done) break;
      onBytes?.(value.byteLength);
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let separator: number;
      while ((separator = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = sseData(raw);
        if (data === null) continue;
        yield data;
        if (signal.aborted || stop?.()) {
          break outer;
        }
      }
    }
    if (!signal.aborted && !stop?.()) {
      const trailing = sseData(buffer);
      if (trailing !== null) yield trailing;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}

function sseData(chunk: string): string | null {
  const lines = chunk.split("\n");
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}
