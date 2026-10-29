import { test } from "node:test";
import assert from "node:assert/strict";
import * as http from "node:http";
import {
  createProxyFetch,
  parseProxyUrl,
  proxyAuthorizationHeader,
  redactProxyUrl,
} from "../lib/proxy-fetch.js";

test("parseProxyUrl: http with explicit port", () => {
  const proxy = parseProxyUrl("http://127.0.0.1:8080");
  assert.ok(proxy);
  assert.equal(proxy.protocol, "http:");
  assert.equal(proxy.host, "127.0.0.1");
  assert.equal(proxy.port, 8080);
  assert.equal(proxy.username, undefined);
});

test("parseProxyUrl: https defaults to port 443", () => {
  const proxy = parseProxyUrl("https://proxy.example.com");
  assert.ok(proxy);
  assert.equal(proxy.protocol, "https:");
  assert.equal(proxy.port, 443);
});

test("parseProxyUrl: scheme-less value defaults to http", () => {
  const proxy = parseProxyUrl("proxy.local:3128");
  assert.ok(proxy);
  assert.equal(proxy.protocol, "http:");
  assert.equal(proxy.host, "proxy.local");
  assert.equal(proxy.port, 3128);
});

test("parseProxyUrl: decodes embedded credentials", () => {
  const proxy = parseProxyUrl("https://user%40corp:p%40ss@10.0.0.1:9999");
  assert.ok(proxy);
  assert.equal(proxy.protocol, "https:");
  assert.equal(proxy.host, "10.0.0.1");
  assert.equal(proxy.port, 9999);
  assert.equal(proxy.username, "user@corp");
  assert.equal(proxy.password, "p@ss");
});

test("parseProxyUrl: rejects empty, malformed and unsupported values", () => {
  assert.equal(parseProxyUrl(""), null);
  assert.equal(parseProxyUrl(null), null);
  assert.equal(parseProxyUrl(undefined), null);
  assert.equal(parseProxyUrl("ftp://host:21"), null);
  assert.equal(parseProxyUrl("http://:8080"), null);
  assert.equal(parseProxyUrl("http://host:99999"), null);
});

test("proxyAuthorizationHeader: emits Basic credentials only when present", () => {
  const withCreds = parseProxyUrl("http://alice:secret@host:8080");
  assert.ok(withCreds);
  assert.equal(
    proxyAuthorizationHeader(withCreds),
    `Basic ${Buffer.from("alice:secret").toString("base64")}`,
  );

  const anonymous = parseProxyUrl("http://host:8080");
  assert.ok(anonymous);
  assert.equal(proxyAuthorizationHeader(anonymous), undefined);
});

test("redactProxyUrl: strips credentials and keeps host/port", () => {
  assert.equal(
    redactProxyUrl("http://alice:secret@host:8080"),
    "http://***:***@host:8080",
  );
  assert.equal(redactProxyUrl("https://host:8443"), "https://host:8443");
  assert.equal(redactProxyUrl(""), "");
  assert.equal(redactProxyUrl(null), "");
});

test("parseProxyUrl: rejects path, query, hash and empty username", () => {
  assert.equal(parseProxyUrl("http://host:8080/path"), null);
  assert.equal(parseProxyUrl("http://host:8080?x=1"), null);
  assert.equal(parseProxyUrl("http://host:8080#frag"), null);
  assert.equal(parseProxyUrl("http://:pass@host:8080"), null);
});

test("createProxyFetch: invalid non-empty config throws instead of bypassing the proxy", async () => {
  const fetchWithProxy = createProxyFetch(() => "not a valid proxy");
  await assert.rejects(
    fetchWithProxy("https://example.com/resource"),
    /Invalid proxy configuration/,
  );
});

test("proxyFetch: CONNECT request-target includes the destination port", async () => {
  let connectTarget = null;
  const proxy = http.createServer();
  proxy.on("connect", (req, socket) => {
    connectTarget = req.url;
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    socket.end();
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  const port = proxy.address().port;

  const fetchWithProxy = createProxyFetch(() => `http://127.0.0.1:${port}`);
  await assert.rejects(fetchWithProxy("https://example.com/resource"));

  proxy.close();
  assert.equal(connectTarget, "example.com:443");
});
