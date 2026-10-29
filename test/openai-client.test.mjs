import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OpenAiChatClient,
  OpenAiResponsesClient,
  fetchOpenAiModels,
} from "../lib/openai-client.js";

test("OpenAiChatClient: non-stream complete yields text then done", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: "hello" },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [{ role: "user", content: "hi" }] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "text", text: "hello" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: non-stream complete yields tool_calls", async () => {
  const fetchImpl = async (_url, init) => {
    const body = JSON.parse(String(init.body));
    assert.equal(body.stream, false);
    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "tool_calls",
            message: {
              content: null,
              tool_calls: [
                {
                  id: "1",
                  type: "function",
                  function: { name: "read_file", arguments: "{\"path\":\"a.ts\"}" },
                },
              ],
            },
          },
        ],
      }),
      { status: 200 },
    );
  };
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.equal(events[0].type, "tool_calls");
  assert.equal(events[1].type, "done");
});

test("OpenAiChatClient: stream path parses SSE deltas", async () => {
  const sse = [
    "data: {\"choices\":[{\"delta\":{\"content\":\"Hel\"}}]}\n\n",
    "data: {\"choices\":[{\"delta\":{\"content\":\"lo\"}}]}\n\n",
    "data: [DONE]\n\n",
  ].join("");
  const fetchImpl = async () =>
    new Response(sse, {
      status: 200,
      headers: { "content-type": "text/event-stream" },
    });
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: true,
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [{ role: "user", content: "hi" }] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "text", text: "Hel" },
    { type: "text", text: "lo" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: stream path accepts CRLF SSE", async () => {
  const sse =
    "data: {\"choices\":[{\"delta\":{\"content\":\"Hi\"}}]}\r\n\r\n" +
    "data: [DONE]\r\n\r\n";
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: true,
    fetch: async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "text", text: "Hi" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: non-stream emits Gemini thought:true as thought, not text", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: { content: "reasoning trace", thought: true },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    { model: "gemini", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "reasoning trace" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: non-stream extracts <thinking>/<reasoning> tags into thought", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content:
                "<thinking>deep plan</thinking>\n\n<reasoning>more</reasoning>\nfinal answer",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "deep plan\nmore" },
    { type: "text", text: "final answer" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: extracts reasoning_content and thought object from message", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "final",
              reasoning_content: "traced",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "traced" },
    { type: "text", text: "final" },
    { type: "done", finishReason: "stop" },
  ]);

  const fetchThoughtObject = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "final",
              thought: { text: "object trace" },
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client2 = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchThoughtObject,
  });
  const events2 = [];
  for await (const event of client2.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    events2.push(event);
  }
  assert.deepEqual(events2, [
    { type: "thought", text: "object trace" },
    { type: "text", text: "final" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: sends include_reasoning when enabled", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
    includeReasoning: true,
  });
  for await (const _event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal(capturedBody.include_reasoning, true);
});

test("OpenAiChatClient: omits include_reasoning when disabled", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
    includeReasoning: false,
  });
  for await (const _event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal("include_reasoning" in capturedBody, false);
});

test("OpenAiChatClient: non-stream extracts <think>/<thought> tags into thought", async () => {
  const fetchImpl = async () =>
    new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "<think>step one</think>\n\n<thought>step two</thought>\nfinal answer",
            },
          },
        ],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "step one\nstep two" },
    { type: "text", text: "final answer" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: stream emits Gemini thought:true delta as thought", async () => {
  const sse = [
    'data: {"choices":[{"delta":{"thought":true,"content":"reasoning"}}]}\n\n',
    'data: {"choices":[{"delta":{"content":"final"}}]}\n\n',
    "data: [DONE]\n\n",
  ].join("");
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: true,
    fetch: async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  });
  const events = [];
  for await (const event of client.complete(
    { model: "gemini", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "reasoning" },
    { type: "text", text: "final" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiChatClient: stream splits <think>/<thought> tags from content", async () => {
  const sse = [
    'data: {"choices":[{"delta":{"content":"<think>step</think> final"}}]}\n\n',
    "data: [DONE]\n\n",
  ].join("");
  const client = new OpenAiChatClient({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    stream: true,
    fetch: async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  });
  const events = [];
  for await (const event of client.complete(
    { model: "dev", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "step" },
    { type: "text", text: " final" },
    { type: "done", finishReason: "stop" },
  ]);
});

test("fetchOpenAiModels: uses the default /models endpoint", async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://api.example/v1/models");
    assert.equal(init.headers.authorization, "Bearer k");
    return new Response(
      JSON.stringify({
        data: [
          { id: "b", description: "Second" },
          { id: "a" },
        ],
      }),
      { status: 200 },
    );
  };
  const models = await fetchOpenAiModels({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    fetch: fetchImpl,
  });
  assert.deepEqual(models, [
    { id: "a" },
    { id: "b", description: "Second" },
  ]);
});

test("fetchOpenAiModels: honors a custom modelsUrl", async () => {
  const fetchImpl = async (url) => {
    assert.equal(url, "https://example.com/custom/models");
    return new Response(JSON.stringify({ data: [{ id: "x" }] }), {
      status: 200,
    });
  };
  const models = await fetchOpenAiModels({
    baseUrl: "https://api.example/v1",
    apiKey: "k",
    modelsUrl: "https://example.com/custom/models",
    fetch: fetchImpl,
  });
  assert.deepEqual(models, [{ id: "x" }]);
});

test("fetchOpenAiModels: throws when the list is empty", async () => {
  const fetchImpl = async () =>
    new Response(JSON.stringify({ data: [] }), { status: 200 });
  await assert.rejects(
    fetchOpenAiModels({
      baseUrl: "https://api.example/v1",
      apiKey: "k",
      fetch: fetchImpl,
    }),
    /Model list is empty/,
  );
});

test("OpenAiChatClient: omits include_reasoning for the official OpenAI API", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiChatClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
    includeReasoning: true,
  });
  for await (const _event of client.complete(
    { model: "gpt-4o", messages: [] },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal("include_reasoning" in capturedBody, false);
});

test("OpenAiChatClient: sends reasoning_effort none for OpenAI reasoning models with tools", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiChatClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  for await (const _event of client.complete(
    {
      model: "gpt-5.6-luna",
      messages: [],
      tools: [{ type: "function", function: { name: "read_file", parameters: {} } }],
    },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal(capturedBody.reasoning_effort, "none");
});

test("OpenAiChatClient: sends reasoning_effort none for gpt-6.x reasoning models with tools", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiChatClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  for await (const _event of client.complete(
    {
      model: "gpt-6.1-terra",
      messages: [],
      tools: [{ type: "function", function: { name: "read_file", parameters: {} } }],
    },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal(capturedBody.reasoning_effort, "none");
});

test("OpenAiChatClient: does not add reasoning_effort for non-OpenAI providers", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ choices: [{ finish_reason: "stop", message: { content: "ok" } }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiChatClient({
    baseUrl: "https://api.deepseek.com/v1",
    apiKey: "k",
    stream: false,
    fetch: fetchImpl,
  });
  for await (const _event of client.complete(
    {
      model: "deepseek-chat",
      messages: [],
      tools: [{ type: "function", function: { name: "read_file", parameters: {} } }],
    },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal("reasoning_effort" in capturedBody, false);
});

test("OpenAiResponsesClient: posts to /responses and parses text, reasoning and function_call", async () => {
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(String(init.body));
    assert.equal(body.model, "gpt-5.6-luna");
    assert.equal(body.input[0].role, "user");
    assert.equal(body.input[0].content[0].text, "hi");
    assert.equal(body.tools[0].type, "function");
    assert.equal(body.tools[0].name, "read_file");
    return new Response(
      JSON.stringify({
        status: "incomplete",
        output: [
          { type: "reasoning", summary: [{ type: "summary_text", text: "plan" }] },
          { type: "message", role: "assistant", content: [{ type: "output_text", text: "final" }] },
          { type: "function_call", call_id: "c1", name: "read_file", arguments: '{"path":"a.ts"}' },
        ],
      }),
      { status: 200 },
    );
  };
  const client = new OpenAiResponsesClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    fetch: fetchImpl,
  });
  const events = [];
  for await (const event of client.complete(
    {
      model: "gpt-5.6-luna",
      messages: [{ role: "user", content: "hi" }],
      tools: [{ type: "function", function: { name: "read_file", parameters: {} } }],
    },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "plan" },
    { type: "text", text: "final" },
    {
      type: "tool_calls",
      calls: [
        { id: "c1", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } },
      ],
    },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiResponsesClient: maps function_call_output items from tool messages", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "done" }] }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiResponsesClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    fetch: fetchImpl,
  });
  for await (const _event of client.complete(
    {
      model: "gpt-5.6-luna",
      messages: [
        { role: "assistant", content: null, tool_calls: [{ id: "c1", type: "function", function: { name: "read_file", arguments: "{}" } }] },
        { role: "tool", tool_call_id: "c1", content: "file body" },
      ],
    },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal(capturedBody.input[0].type, "function_call");
  assert.equal(capturedBody.input[0].call_id, "c1");
  assert.equal(capturedBody.input[1].type, "function_call_output");
  assert.equal(capturedBody.input[1].call_id, "c1");
  assert.equal(capturedBody.input[1].output, "file body");
});

test("OpenAiResponsesClient: stream path parses SSE deltas", async () => {
  const sse = [
    'data: {"type":"response.output_item.added","item":{"id":"fc1","type":"function_call","name":"read_file"}}\n\n',
    'data: {"type":"response.function_call_arguments.delta","item_id":"fc1","delta":"{\\"path\\""}\n\n',
    'data: {"type":"response.function_call_arguments.delta","item_id":"fc1","delta":":\\"a.ts\\"}"}\n\n',
    'data: {"type":"response.output_item.done","item":{"id":"fc1","type":"function_call","name":"read_file","arguments":"{\\"path\\":\\"a.ts\\"}"}}\n\n',
    'data: {"type":"response.reasoning_summary_text.delta","delta":"think"}\n\n',
    'data: {"type":"response.output_text.delta","delta":"Hel"}\n\n',
    'data: {"type":"response.output_text.delta","delta":"lo"}\n\n',
    'data: {"type":"response.completed"}\n\n',
  ].join("");
  const client = new OpenAiResponsesClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    stream: true,
    fetch: async () =>
      new Response(sse, {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      }),
  });
  const events = [];
  for await (const event of client.complete(
    { model: "gpt-5.6-luna", messages: [] },
    new AbortController().signal,
  )) {
    events.push(event);
  }
  assert.deepEqual(events, [
    { type: "thought", text: "think" },
    { type: "text", text: "Hel" },
    { type: "text", text: "lo" },
    {
      type: "tool_calls",
      calls: [
        { id: "fc1", type: "function", function: { name: "read_file", arguments: '{"path":"a.ts"}' } },
      ],
    },
    { type: "done", finishReason: "stop" },
  ]);
});

test("OpenAiResponsesClient: maps reasoning effort and summary for reasoning models", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiResponsesClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    fetch: fetchImpl,
    includeReasoning: true,
  });
  for await (const _event of client.complete(
    { model: "gpt-5.6-luna", messages: [], reasoningEffort: "high" },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.deepEqual(capturedBody.reasoning, { effort: "high", summary: "auto" });

  const noThoughtsClient = new OpenAiResponsesClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    fetch: fetchImpl,
    includeReasoning: false,
  });
  for await (const _event of noThoughtsClient.complete(
    { model: "gpt-5.6-luna", messages: [] },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.deepEqual(capturedBody.reasoning, { summary: "none" });
});

test("OpenAiResponsesClient: does not send reasoning for non-reasoning models", async () => {
  let capturedBody = null;
  const fetchImpl = async (_url, init) => {
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({ status: "completed", output: [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "ok" }] }] }),
      { status: 200 },
    );
  };
  const client = new OpenAiResponsesClient({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "k",
    fetch: fetchImpl,
    includeReasoning: true,
  });
  for await (const _event of client.complete(
    { model: "gpt-4o", messages: [] },
    new AbortController().signal,
  )) {
    // drain
  }
  assert.equal("reasoning" in capturedBody, false);
});
