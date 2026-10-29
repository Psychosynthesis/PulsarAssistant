"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/openai-client.ts
var openai_client_exports = {};
__export(openai_client_exports, {
  OpenAiChatClient: () => OpenAiChatClient,
  OpenAiHttpError: () => OpenAiHttpError,
  OpenAiModelsError: () => OpenAiModelsError,
  OpenAiResponsesClient: () => OpenAiResponsesClient,
  fetchOpenAiModels: () => fetchOpenAiModels,
  formatApiErrorMessage: () => formatApiErrorMessage
});
module.exports = __toCommonJS(openai_client_exports);
function extractReasoning(obj) {
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
    "thoughtContent"
  ];
  for (const key of candidateKeys) {
    const val = obj[key];
    if (typeof val === "string" && val.length > 0) {
      return { reasoningText: val, consumeContent: false };
    }
    if (val && typeof val === "object") {
      const textVal = val.text ?? val.content;
      if (typeof textVal === "string" && textVal.length > 0) {
        return { reasoningText: textVal, consumeContent: false };
      }
    }
  }
  if (typeof obj.thought === "string" && obj.thought.length > 0) {
    return { reasoningText: obj.thought, consumeContent: false };
  }
  if (obj.thought && typeof obj.thought === "object") {
    const textVal = obj.thought.text ?? obj.thought.content;
    if (typeof textVal === "string" && textVal.length > 0) {
      return { reasoningText: textVal, consumeContent: false };
    }
  }
  if (obj.thought === true) {
    const thoughtText = typeof obj.content === "string" ? obj.content : typeof obj.text === "string" ? obj.text : null;
    return { reasoningText: thoughtText, consumeContent: true };
  }
  if (Array.isArray(obj.parts)) {
    const thoughtParts = [];
    for (const part of obj.parts) {
      if (part && typeof part === "object") {
        const p = part;
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
var StreamingTagFilter = class {
  constructor() {
    this.inTag = false;
    this.buffer = "";
  }
  process(chunk) {
    const results = [];
    this.buffer += chunk;
    while (this.buffer.length > 0) {
      if (!this.inTag) {
        const match = this.buffer.match(/<(think|thought|thinking|reasoning)>/i);
        if (match && match.index !== void 0) {
          const textBefore = this.buffer.slice(0, match.index);
          if (textBefore.length > 0) {
            results.push({ type: "text", text: textBefore });
          }
          this.inTag = true;
          this.buffer = this.buffer.slice(match.index + match[0].length);
        } else {
          const partialMatch = this.buffer.match(/<[a-z]{0,9}$/i);
          if (partialMatch && partialMatch.index !== void 0) {
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
        if (match && match.index !== void 0) {
          const thoughtBefore = this.buffer.slice(0, match.index);
          if (thoughtBefore.length > 0) {
            results.push({ type: "thought", text: thoughtBefore });
          }
          this.inTag = false;
          this.buffer = this.buffer.slice(match.index + match[0].length);
        } else {
          const partialMatch = this.buffer.match(/<\/[a-z]{0,9}$/i);
          if (partialMatch && partialMatch.index !== void 0) {
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
  flush() {
    const results = [];
    if (this.buffer.length > 0) {
      results.push({
        type: this.inTag ? "thought" : "text",
        text: this.buffer
      });
      this.buffer = "";
    }
    return results;
  }
};
function boundFetch(...args) {
  return globalThis.fetch(...args);
}
function utf8ByteLength(text) {
  return new TextEncoder().encode(text).length;
}
function trimSlash(url) {
  return url.replace(/\/+$/, "");
}
function completionsUrl(baseUrl) {
  return `${trimSlash(baseUrl)}/chat/completions`;
}
function responsesUrl(baseUrl) {
  return `${trimSlash(baseUrl)}/responses`;
}
function isOpenAiBaseUrl(baseUrl) {
  try {
    return new URL(baseUrl).hostname === "api.openai.com";
  } catch {
    return false;
  }
}
function isOpenAiReasoningModel(model) {
  const normalized = model.trim().toLowerCase();
  if (!normalized) return false;
  return /(^|[-/.])o\d/.test(normalized) || /(^|[-/.])gpt-5/.test(normalized) || normalized.includes("reasoning");
}
function formatApiErrorMessage(status, rawBody) {
  const trimmed = rawBody.trim();
  if (!trimmed) {
    return `API error ${status}`;
  }
  let formattedDetails = null;
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
    return `API error ${status}

${formattedDetails}`;
  }
  return `API error ${status}`;
}
var OpenAiHttpError = class extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "OpenAiHttpError";
  }
};
var OpenAiModelsError = class extends Error {
  constructor(message, status, body) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "OpenAiModelsError";
  }
};
var OpenAiChatClient = class {
  constructor(options) {
    this.options = options;
    this.fetchImpl = options.fetch ?? boundFetch;
  }
  async *complete(request, signal, options = {}) {
    if (this.options.stream) {
      yield* this.completeStream(request, signal, options);
    } else {
      yield* this.completeOnce(request, signal, options);
    }
  }
  async *completeOnce(request, signal, options) {
    var _a, _b;
    const { response, requestBytes } = await this.post(request, false, signal);
    const text = await response.text();
    (_a = options.onResponse) == null ? void 0 : _a.call(options, {
      requestBytes,
      responseBytes: utf8ByteLength(text)
    });
    if (!response.ok) {
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, text),
        response.status,
        text
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OpenAiHttpError(
        `API returned non-JSON (${response.status})`,
        response.status,
        text
      );
    }
    const choice = (_b = parsed.choices) == null ? void 0 : _b[0];
    const message = choice == null ? void 0 : choice.message;
    const reasoningInfo = extractReasoning(
      message
    );
    let reasoning = reasoningInfo.reasoningText;
    let content = reasoningInfo.consumeContent ? "" : (message == null ? void 0 : message.content) ?? "";
    const inlineThinkRegex = /<(think|thought|thinking|reasoning)>([\s\S]*?)<\/\1>/gi;
    const tagThoughts = [];
    content = content.replace(inlineThinkRegex, (_, _tag, match) => {
      tagThoughts.push(match);
      return "";
    }).replace(/[ \t]*\n[ \t]*\n(?:[ \t]*\n)+/g, "\n\n").trim();
    if (tagThoughts.length > 0) {
      const combinedTagThought = tagThoughts.join("\n");
      reasoning = reasoning ? `${reasoning}
${combinedTagThought}` : combinedTagThought;
    }
    if (reasoning) {
      yield { type: "thought", text: reasoning };
    }
    if (content) yield { type: "text", text: content };
    if ((message == null ? void 0 : message.tool_calls) && message.tool_calls.length > 0) {
      yield { type: "tool_calls", calls: message.tool_calls };
    }
    yield { type: "done", finishReason: (choice == null ? void 0 : choice.finish_reason) || "stop" };
  }
  async *completeStream(request, signal, options) {
    var _a, _b, _c, _d, _e;
    const { response, requestBytes } = await this.post(request, true, signal);
    if (!response.ok) {
      const body = await response.text();
      (_a = options.onResponse) == null ? void 0 : _a.call(options, {
        requestBytes,
        responseBytes: utf8ByteLength(body)
      });
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, body),
        response.status,
        body
      );
    }
    if (!response.body) {
      throw new Error("API stream response had no body.");
    }
    const pending = /* @__PURE__ */ new Map();
    let finishReason = "stop";
    let finishSeen = false;
    let receivedBytes = 0;
    const tagFilter = new StreamingTagFilter();
    for await (const payload of readSseData(
      response.body,
      signal,
      (bytes) => {
        receivedBytes += bytes;
      },
      () => finishSeen
    )) {
      if (payload === "[DONE]") break;
      let parsed;
      try {
        parsed = JSON.parse(payload);
      } catch {
        continue;
      }
      const choice = (_b = parsed.choices) == null ? void 0 : _b[0];
      if (!choice) continue;
      const delta = choice.delta;
      const deltaFinishReason = delta == null ? void 0 : delta.finish_reason;
      const choiceFinishReason = choice.finish_reason ?? deltaFinishReason;
      if (choiceFinishReason) finishReason = choiceFinishReason;
      const deltaReasoning = extractReasoning(delta);
      const reasoningInfo = deltaReasoning.reasoningText ? deltaReasoning : extractReasoning(choice);
      if (reasoningInfo.reasoningText) {
        yield { type: "thought", text: reasoningInfo.reasoningText };
      }
      if (!reasoningInfo.consumeContent && typeof (delta == null ? void 0 : delta.content) === "string") {
        for (const item of tagFilter.process(delta.content)) {
          yield item;
        }
      }
      for (const part of (delta == null ? void 0 : delta.tool_calls) ?? []) {
        const index = part.index ?? 0;
        const current = pending.get(index) ?? {
          id: "",
          name: "",
          arguments: ""
        };
        if (part.id) current.id = part.id;
        if ((_c = part.function) == null ? void 0 : _c.name) current.name += part.function.name;
        if ((_d = part.function) == null ? void 0 : _d.arguments) current.arguments += part.function.arguments;
        pending.set(index, current);
      }
      if (choiceFinishReason) finishSeen = true;
    }
    for (const item of tagFilter.flush()) {
      yield item;
    }
    if (pending.size > 0) {
      const calls = [...pending.values()].map((call) => ({
        id: call.id,
        type: "function",
        function: { name: call.name, arguments: call.arguments }
      }));
      yield { type: "tool_calls", calls };
    }
    (_e = options.onResponse) == null ? void 0 : _e.call(options, {
      requestBytes,
      responseBytes: receivedBytes
    });
    yield { type: "done", finishReason };
  }
  resolveIncludeReasoning() {
    const value = this.options.includeReasoning;
    if (typeof value === "function") {
      if (!value()) return false;
    } else if (value !== true) {
      return false;
    }
    return !isOpenAiBaseUrl(this.options.baseUrl);
  }
  resolveReasoningEffort(request) {
    var _a;
    if (request.reasoningEffort) return request.reasoningEffort;
    if (isOpenAiBaseUrl(this.options.baseUrl) && (((_a = request.tools) == null ? void 0 : _a.length) ?? 0) > 0 && isOpenAiReasoningModel(request.model)) {
      return "none";
    }
    return void 0;
  }
  async post(request, stream, signal) {
    var _a;
    const url = completionsUrl(this.options.baseUrl);
    const includeReasoning = this.resolveIncludeReasoning();
    const reasoningEffort = this.resolveReasoningEffort(request);
    const body = JSON.stringify({
      model: request.model,
      messages: request.messages,
      ...((_a = request.tools) == null ? void 0 : _a.length) ? { tools: request.tools } : {},
      ...request.tool_choice ? { tool_choice: request.tool_choice } : {},
      stream,
      ...includeReasoning ? { include_reasoning: true } : {},
      ...reasoningEffort ? { reasoning_effort: reasoningEffort } : {}
    });
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body,
      signal
    });
    return { response, requestBytes: utf8ByteLength(body) };
  }
};
function toResponsesInput(messages) {
  const items = [];
  for (const message of messages) {
    if (message.role === "system" || message.role === "user") {
      items.push({
        role: message.role,
        content: [{ type: "input_text", text: message.content }]
      });
    } else if (message.role === "assistant") {
      const content = message.content ?? "";
      if (content.trim().length > 0) {
        items.push({
          role: "assistant",
          content: [{ type: "input_text", text: content }]
        });
      }
      for (const call of message.tool_calls ?? []) {
        items.push({
          type: "function_call",
          call_id: call.id,
          name: call.function.name,
          arguments: call.function.arguments
        });
      }
    } else if (message.role === "tool") {
      items.push({
        type: "function_call_output",
        call_id: message.tool_call_id,
        output: message.content
      });
    }
  }
  return items;
}
function toResponsesTools(tools, webSearch = false) {
  const items = (tools ?? []).map((tool) => ({
    type: "function",
    name: tool.function.name,
    description: tool.function.description,
    parameters: tool.function.parameters
  }));
  if (webSearch) {
    items.push({ type: "web_search" });
  }
  return items.length > 0 ? items : void 0;
}
function extractWebSearchSources(record) {
  const results = record.results;
  if (!Array.isArray(results)) return [];
  const sources = [];
  for (const item of results) {
    if (!item || typeof item !== "object") continue;
    const r = item;
    const title = typeof r.title === "string" ? r.title : "";
    const url = typeof r.url === "string" ? r.url : typeof r.link === "string" ? r.link : "";
    if (url || title) {
      sources.push({ title: title || url, url });
    }
  }
  return sources;
}
var OpenAiResponsesClient = class _OpenAiResponsesClient {
  constructor(options) {
    this.options = options;
    this.fetchImpl = options.fetch ?? boundFetch;
  }
  async *complete(request, signal, options = {}) {
    if (this.options.stream) {
      yield* this.completeStream(request, signal, options);
    } else {
      yield* this.completeOnce(request, signal, options);
    }
  }
  async *completeOnce(request, signal, options) {
    var _a, _b;
    const { response, requestBytes } = await this.post(request, false, signal);
    const text = await response.text();
    (_a = options.onResponse) == null ? void 0 : _a.call(options, {
      requestBytes,
      responseBytes: utf8ByteLength(text)
    });
    if (!response.ok) {
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, text),
        response.status,
        text
      );
    }
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw new OpenAiHttpError(
        `API returned non-JSON (${response.status})`,
        response.status,
        text
      );
    }
    if ((_b = parsed.error) == null ? void 0 : _b.message) {
      throw new OpenAiHttpError(parsed.error.message, response.status, text);
    }
    const output = Array.isArray(parsed.output) ? parsed.output : [];
    const thoughts = [];
    const textParts = [];
    const calls = [];
    const sources = [];
    for (const item of output) {
      if (!item || typeof item !== "object") continue;
      const record = item;
      if (record.type === "reasoning") {
        const summary = record.summary;
        if (Array.isArray(summary)) {
          for (const part of summary) {
            const p = part;
            if ((p == null ? void 0 : p.type) === "summary_text" && typeof p.text === "string") {
              thoughts.push(p.text);
            }
          }
        }
      } else if (record.type === "message" && record.role === "assistant") {
        const content = record.content;
        if (Array.isArray(content)) {
          for (const part of content) {
            const p = part;
            if ((p == null ? void 0 : p.type) === "output_text" && typeof p.text === "string") {
              textParts.push(p.text);
            }
          }
        }
      } else if (record.type === "function_call") {
        const callId = typeof record.call_id === "string" ? record.call_id : "";
        const name = typeof record.name === "string" ? record.name : "";
        const argumentsText = typeof record.arguments === "string" ? record.arguments : "{}";
        calls.push({
          id: callId,
          type: "function",
          function: { name, arguments: argumentsText }
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
  async *completeStream(request, signal, options) {
    var _a, _b;
    const { response, requestBytes } = await this.post(request, true, signal);
    if (!response.ok) {
      const body = await response.text();
      (_a = options.onResponse) == null ? void 0 : _a.call(options, {
        requestBytes,
        responseBytes: utf8ByteLength(body)
      });
      throw new OpenAiHttpError(
        formatApiErrorMessage(response.status, body),
        response.status,
        body
      );
    }
    if (!response.body) {
      throw new Error("API stream response had no body.");
    }
    let receivedBytes = 0;
    let finished = false;
    const calls = [];
    const sources = [];
    const pendingCalls = /* @__PURE__ */ new Map();
    for await (const payload of readSseData(
      response.body,
      signal,
      (bytes) => {
        receivedBytes += bytes;
      },
      () => finished
    )) {
      if (payload === "[DONE]") break;
      let parsed;
      try {
        parsed = JSON.parse(payload);
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
          const record = item;
          if (record.type === "function_call") {
            const itemId = typeof record.id === "string" ? record.id : "";
            const name = typeof record.name === "string" ? record.name : "";
            pendingCalls.set(itemId, { name, arguments: "" });
          }
        }
      } else if (type === "response.output_item.done") {
        const item = parsed.item;
        if (item && typeof item === "object") {
          const record = item;
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
                name: name || (pending == null ? void 0 : pending.name) || "",
                arguments: args.length > 0 ? args : (pending == null ? void 0 : pending.arguments) ?? ""
              }
            });
          } else if (record.type === "web_search_call") {
            sources.push(...extractWebSearchSources(record));
          }
        }
      } else if (type === "response.completed") {
        finished = true;
      } else if (type === "response.failed" || type === "error") {
        throw new OpenAiHttpError(
          _OpenAiResponsesClient.streamError(parsed),
          response.status,
          JSON.stringify(parsed)
        );
      }
    }
    for (const [id, call] of pendingCalls) {
      if (call.name) {
        calls.push({
          id,
          type: "function",
          function: { name: call.name, arguments: call.arguments }
        });
      }
    }
    (_b = options.onResponse) == null ? void 0 : _b.call(options, {
      requestBytes,
      responseBytes: receivedBytes
    });
    if (sources.length > 0) yield { type: "sources", sources };
    if (calls.length > 0) yield { type: "tool_calls", calls };
    yield { type: "done", finishReason: "stop" };
  }
  eventDelta(parsed) {
    return typeof parsed.delta === "string" ? parsed.delta : "";
  }
  eventItemId(parsed) {
    return typeof parsed.item_id === "string" ? parsed.item_id : "";
  }
  static streamError(parsed) {
    const error = parsed.error;
    if (error && typeof error === "object") {
      const message2 = error.message;
      if (typeof message2 === "string" && message2.length > 0) return message2;
    }
    const message = typeof parsed.message === "string" ? parsed.message : "";
    return message || "Responses API stream failed.";
  }
  resolveIncludeReasoning() {
    const value = this.options.includeReasoning;
    if (typeof value === "function") return value();
    return value === true;
  }
  resolveReasoning(request) {
    if (!isOpenAiReasoningModel(request.model)) return void 0;
    return {
      ...request.reasoningEffort ? { effort: request.reasoningEffort } : {},
      summary: this.resolveIncludeReasoning() ? "auto" : "none"
    };
  }
  async post(request, stream, signal) {
    const tools = toResponsesTools(request.tools, request.webSearch === true);
    const reasoning = this.resolveReasoning(request);
    const body = JSON.stringify({
      model: request.model,
      input: toResponsesInput(request.messages),
      ...tools ? { tools } : {},
      ...reasoning ? { reasoning } : {},
      stream
    });
    const response = await this.fetchImpl(responsesUrl(this.options.baseUrl), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`
      },
      body,
      signal
    });
    return { response, requestBytes: utf8ByteLength(body) };
  }
};
async function fetchOpenAiModels(options) {
  var _a;
  const fetchImpl = options.fetch ?? boundFetch;
  const url = trimSlash(
    options.modelsUrl ?? `${trimSlash(options.baseUrl)}/models`
  );
  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      authorization: `Bearer ${options.apiKey}`
    },
    signal: options.signal
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OpenAiModelsError(
      `Model list returned non-JSON (${response.status})`,
      response.status,
      text
    );
  }
  const object = parsed && typeof parsed === "object" ? parsed : {};
  if (!response.ok) {
    throw new OpenAiModelsError(
      ((_a = object.error) == null ? void 0 : _a.message) || `Model list error ${response.status}`,
      response.status,
      text
    );
  }
  const rawData = Array.isArray(object.data) ? object.data : [];
  const models = [];
  for (const item of rawData) {
    if (!item || typeof item !== "object") continue;
    const id = typeof item.id === "string" ? item.id.trim() : "";
    if (!id) continue;
    const description = typeof item.description === "string" && item.description.trim() !== "" ? item.description.trim() : void 0;
    models.push(description ? { id, description } : { id });
  }
  if (models.length === 0) {
    throw new OpenAiModelsError("Model list is empty.", response.status, text);
  }
  models.sort((a, b) => a.id.localeCompare(b.id));
  return models;
}
async function* readSseData(body, signal, onBytes, stop) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const cancel = () => {
    void reader.cancel().catch(() => {
    });
  };
  const onAbort = () => cancel();
  signal.addEventListener("abort", onAbort, { once: true });
  try {
    outer: while (true) {
      if (signal.aborted || (stop == null ? void 0 : stop())) break;
      const { done, value } = await reader.read();
      if (signal.aborted) break;
      if (done) break;
      onBytes == null ? void 0 : onBytes(value.byteLength);
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, "\n");
      let separator;
      while ((separator = buffer.indexOf("\n\n")) !== -1) {
        const raw = buffer.slice(0, separator);
        buffer = buffer.slice(separator + 2);
        const data = sseData(raw);
        if (data === null) continue;
        yield data;
        if (signal.aborted || (stop == null ? void 0 : stop())) {
          break outer;
        }
      }
    }
    if (!signal.aborted && !(stop == null ? void 0 : stop())) {
      const trailing = sseData(buffer);
      if (trailing !== null) yield trailing;
    }
  } finally {
    signal.removeEventListener("abort", onAbort);
    reader.releaseLock();
  }
}
function sseData(chunk) {
  const lines = chunk.split("\n");
  const dataLines = [];
  for (const line of lines) {
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  if (dataLines.length === 0) return null;
  return dataLines.join("\n");
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OpenAiChatClient,
  OpenAiHttpError,
  OpenAiModelsError,
  OpenAiResponsesClient,
  fetchOpenAiModels,
  formatApiErrorMessage
});
//# sourceMappingURL=openai-client.js.map
