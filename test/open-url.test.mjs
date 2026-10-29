import { test } from "node:test";
import assert from "node:assert/strict";
import * as dns from "node:dns";
import { isPublicAddress, openUrl } from "../lib/open-url.js";
import { toolsForPolicy, executeTool } from "../lib/builtin/tools.js";

test("open_url: only public IPv4 addresses are allowed", () => {
  for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "100.64.0.1", "192.0.2.1", "198.18.0.1", "203.0.113.1", "224.0.0.1", "::1", "::ffff:127.0.0.1", "2606:4700:4700::1111"]) {
    assert.equal(isPublicAddress(address), false, address);
  }
  assert.equal(isPublicAddress("8.8.8.8"), true);
});

test("open_url: rejects unsafe URLs before connecting", async () => {
  const signal = new AbortController().signal;
  for (const url of ["file:///tmp/file", "http://127.0.0.1", "http://[::1]", "http://[::ffff:7f00:1]", "http://user:pass@example.com", "https://example.com:8080/"]) {
    await assert.rejects(openUrl(url, signal), /HTTP|network|credentials|ports/);
  }
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(openUrl("https://example.com", controller.signal), /Cancelled/);
});

test("open_url: validates DNS results used for the connection", async () => {
  const original = dns.default.lookup;
  try {
    dns.default.lookup = (_hostname, _options, callback) => {
      callback(null, [
        { address: "8.8.8.8", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]);
    };
    await assert.rejects(openUrl("http://public.example", new AbortController().signal), /network/);
  } finally {
    dns.default.lookup = original;
  }
});

test("open_url: is available independently of search configuration", async () => {
  const policy = { allowCommands: false, testCommand: null, buildCommand: null };
  assert.ok(toolsForPolicy(policy).some((tool) => tool.function.name === "open_url"));
  const ctx = { signal: new AbortController().signal, policy };
  await assert.rejects(executeTool(ctx, "open_url", JSON.stringify({ url: "http://127.0.0.1" })), /network/);
});
