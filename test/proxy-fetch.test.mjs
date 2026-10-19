import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseProxyUrl,
  proxyAuthorizationHeader,
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
