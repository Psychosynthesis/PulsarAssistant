import { test } from "node:test";
import assert from "node:assert/strict";
import {
  assertSafeFetchUrl,
  deepseekFetch,
  deepseekSearch,
  formatSearchResults,
} from "../lib/web-search.js";
import { executeTool } from "../lib/builtin/tools.js";

test("assertSafeFetchUrl: blocks loopback and private addresses", () => {
  assert.throws(() => assertSafeFetchUrl("http://localhost:8080/x"), /private/);
  assert.throws(() => assertSafeFetchUrl("http://127.0.0.1/x"), /private/);
  assert.throws(() => assertSafeFetchUrl("http://10.0.0.5/x"), /private/);
  assert.throws(() => assertSafeFetchUrl("http://192.168.1.10/x"), /private/);
  assert.throws(() => assertSafeFetchUrl("http://169.254.0.1/x"), /private/);
  assert.throws(() => assertSafeFetchUrl("http://172.16.0.1/x"), /private/);
  assert.throws(() => assertSafeFetchUrl("http://[::1]/x"), /private/);
});

test("assertSafeFetchUrl: rejects non-http schemes and invalid urls", () => {
  assert.throws(() => assertSafeFetchUrl("file:///etc/passwd"), /http/);
  assert.throws(() => assertSafeFetchUrl("not a url"), /valid/);
});

test("assertSafeFetchUrl: allows public http(s) urls", () => {
  assert.doesNotThrow(() => assertSafeFetchUrl("https://example.com/a"));
  assert.doesNotThrow(() => assertSafeFetchUrl("http://example.org"));
});

test("formatSearchResults: formats and caps results", () => {
  const results = [
    { title: "One", url: "https://one.example", snippet: "first   snippet" },
    { title: "Two", url: "https://two.example", snippet: "second" },
  ];
  const output = formatSearchResults(results, "query");
  assert.match(output, /Web search results for "query"/);
  assert.match(output, /One/);
  assert.match(output, /https:\/\/one\.example/);
  assert.match(output, /first snippet/);
  assert.match(output, /Two/);
});

test("formatSearchResults: reports no results", () => {
  assert.equal(formatSearchResults([], "query"), 'No web results found for "query".');
});

test("deepseekSearch: normalizes DeepSeek search results", async () => {
  let capturedBody = null;
  const fetchImpl = async (url, init) => {
    assert.equal(url, "https://api.deepseek.com/v1/tools/search");
    capturedBody = JSON.parse(String(init.body));
    return new Response(
      JSON.stringify({
        data: {
          search_results: [
            { title: "A", url: "https://a.example", snippet: "s1" },
            { title: "", link: "https://b.example", content: "s2" },
          ],
        },
      }),
      { status: 200 },
    );
  };
  const results = await deepseekSearch(
    "k",
    "hello",
    new AbortController().signal,
    fetchImpl,
  );
  assert.equal(capturedBody.query, "hello");
  assert.deepEqual(results, [
    { title: "A", url: "https://a.example", snippet: "s1" },
    { title: "https://b.example", url: "https://b.example", snippet: "s2" },
  ]);
});

test("deepseekFetch: fetches content and enforces the SSRF guard", async () => {
  let callCount = 0;
  const fetchImpl = async (_url, init) => {
    callCount += 1;
    assert.equal(JSON.parse(String(init.body)).url, "https://example.com/x");
    return new Response(
      JSON.stringify({ data: { content: "page body" } }),
      { status: 200 },
    );
  };
  const content = await deepseekFetch(
    "k",
    "https://example.com/x",
    new AbortController().signal,
    fetchImpl,
  );
  assert.equal(content, "page body");
  assert.equal(callCount, 1);

  await assert.rejects(
    deepseekFetch("k", "http://10.1.2.3/x", new AbortController().signal, fetchImpl),
    /private/,
  );
  assert.equal(callCount, 1, "the SSRF guard must reject before any request");
});

function makeCtx(overrides = {}) {
  return {
    host: { sessionUpdate: async () => {} },
    sessionId: "s1",
    cwd: process.cwd(),
    signal: new AbortController().signal,
    policy: {
      allowCommands: false,
      testCommand: null,
      buildCommand: null,
      maxTurnRequests: null,
      toolCallDelayMs: null,
      toolOutputCompactInterval: null,
    },
    ...overrides,
  };
}

test("executeTool web_search: formats results returned by the backend", async () => {
  const result = await executeTool(
    makeCtx({
      webSearch: {
        search: async (query) => [
          { title: "A", url: "https://a.example", snippet: "s1" },
        ],
      },
    }),
    "web_search",
    JSON.stringify({ query: "hello" }),
  );
  assert.match(result.output, /Web search results for "hello"/);
  assert.match(result.output, /https:\/\/a\.example/);
});

test("executeTool web_search: errors when the backend is unavailable", async () => {
  await assert.rejects(
    executeTool(makeCtx(), "web_search", JSON.stringify({ query: "hello" })),
    /not available/,
  );
});

test("executeTool web_fetch: returns fetched content", async () => {
  const result = await executeTool(
    makeCtx({
      webFetch: { fetch: async () => "body" },
    }),
    "web_fetch",
    JSON.stringify({ url: "https://example.com/x" }),
  );
  assert.equal(result.output, "body");
});
