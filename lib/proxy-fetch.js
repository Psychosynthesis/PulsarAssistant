"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
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
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/proxy-fetch.ts
var proxy_fetch_exports = {};
__export(proxy_fetch_exports, {
  createProxyFetch: () => createProxyFetch,
  parseProxyUrl: () => parseProxyUrl,
  proxyAuthorizationHeader: () => proxyAuthorizationHeader
});
module.exports = __toCommonJS(proxy_fetch_exports);
var http = __toESM(require("http"));
var https = __toESM(require("https"));
var net = __toESM(require("net"));
var tls = __toESM(require("tls"));
function parseProxyUrl(raw) {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  let value = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    value = `http://${value}`;
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return {
    protocol: url.protocol,
    host: url.hostname,
    port,
    ...url.username ? { username: decodeURIComponent(url.username) } : {},
    ...url.password ? { password: decodeURIComponent(url.password) } : {}
  };
}
function proxyAuthorizationHeader(proxy) {
  if (proxy.username === void 0) return void 0;
  const token = Buffer.from(
    `${proxy.username}:${proxy.password ?? ""}`,
    "utf8"
  ).toString("base64");
  return `Basic ${token}`;
}
function normalizeRequest(input, init) {
  const url = typeof input === "string" ? new URL(input) : input instanceof URL ? input : new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const headers = {};
  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  }
  let body = null;
  if (init?.body != null) {
    if (typeof init.body === "string") {
      body = Buffer.from(init.body, "utf8");
    } else if (init.body instanceof Uint8Array) {
      body = Buffer.from(init.body);
    } else if (init.body instanceof ArrayBuffer) {
      body = Buffer.from(new Uint8Array(init.body));
    } else {
      throw new Error("Unsupported request body type through proxy.");
    }
  }
  return { method, url, headers, body, signal: init?.signal ?? void 0 };
}
function targetPort(url) {
  return url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
}
function createProxyFetch(resolveProxyUrl) {
  const nativeFetch = (...args) => globalThis.fetch(...args);
  if (!resolveProxyUrl) return nativeFetch;
  return (input, init) => {
    const proxy = parseProxyUrl(resolveProxyUrl());
    if (!proxy) return nativeFetch(input, init);
    return proxyFetch(input, init, proxy);
  };
}
async function proxyFetch(input, init, proxy) {
  const req = normalizeRequest(input, init);
  if (req.url.protocol !== "http:" && req.url.protocol !== "https:") {
    throw new Error(`Unsupported protocol through proxy: ${req.url.protocol}`);
  }
  if (req.headers["accept-encoding"] === void 0) {
    req.headers["accept-encoding"] = "identity";
  }
  if (req.url.protocol === "https:") {
    const tunnel = await openTunnel(proxy, req.url.host, req.signal);
    const socket = await wrapTls(tunnel, req.url.hostname, req.signal);
    return requestOverSocket(socket, req, targetPort(req.url));
  }
  return requestAbsoluteForm(req, proxy);
}
function abortWhen(signal, onAbort) {
  if (!signal) return null;
  if (signal.aborted) {
    onAbort();
    return null;
  }
  const handler = () => onAbort();
  signal.addEventListener("abort", handler, { once: true });
  return () => signal.removeEventListener("abort", handler);
}
function connectTcp(host, port, signal) {
  return new Promise((resolve, reject) => {
    let removeAbort = null;
    const socket = net.connect({ host, port });
    socket.setNoDelay(true);
    socket.once("connect", () => {
      removeAbort?.();
      resolve(socket);
    });
    socket.once("error", reject);
    removeAbort = abortWhen(
      signal,
      () => socket.destroy(new Error("Aborted"))
    );
  });
}
function wrapTls(socket, servername, signal) {
  return new Promise((resolve, reject) => {
    let removeAbort = null;
    const tlsSocket = tls.connect({ socket, servername }, () => {
      removeAbort?.();
      resolve(tlsSocket);
    });
    tlsSocket.once("error", reject);
    removeAbort = abortWhen(
      signal,
      () => tlsSocket.destroy(new Error("Aborted"))
    );
  });
}
function sendConnect(socket, authority, proxy, signal) {
  return new Promise((resolve, reject) => {
    let removeAbort = null;
    const auth = proxyAuthorizationHeader(proxy);
    const head = `CONNECT ${authority} HTTP/1.1\r
Host: ${authority}\r
` + (auth ? `Proxy-Authorization: ${auth}\r
` : "") + `Proxy-Connection: keep-alive\r
\r
`;
    const cleanup = () => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      removeAbort?.();
    };
    const fail = (err) => {
      cleanup();
      socket.destroy();
      reject(err);
    };
    const onError = (err) => fail(err);
    let buffer = "";
    const onData = (chunk) => {
      buffer += chunk.toString("latin1");
      const idx = buffer.indexOf("\r\n\r\n");
      if (idx === -1) {
        if (buffer.length > 8192) fail(new Error("Proxy CONNECT response too large."));
        return;
      }
      const headText = buffer.slice(0, idx);
      const rest = buffer.slice(idx + 4);
      cleanup();
      const statusLine = headText.split("\r\n")[0] ?? "";
      const match = /^HTTP\/\d(?:\.\d)? (\d{3})/.exec(statusLine);
      const code = match ? Number(match[1]) : 0;
      if (code !== 200) {
        fail(new Error(`Proxy CONNECT failed: ${statusLine || code}`));
        return;
      }
      if (rest.length > 0) {
        socket.unshift(Buffer.from(rest, "latin1"));
      }
      resolve();
    };
    socket.on("data", onData);
    socket.once("error", onError);
    removeAbort = abortWhen(signal, () => fail(new Error("Aborted")));
    socket.write(head);
  });
}
async function openTunnel(proxy, authority, signal) {
  const base = await connectTcp(proxy.host, proxy.port, signal);
  const proxySocket = proxy.protocol === "https:" ? await wrapTls(base, proxy.host, signal) : base;
  try {
    await sendConnect(proxySocket, authority, proxy, signal);
    return proxySocket;
  } catch (err) {
    proxySocket.destroy();
    throw err;
  }
}
function wireRequest(nodeReq, req, reject) {
  nodeReq.once("error", reject);
  if (req.signal) {
    if (req.signal.aborted) {
      nodeReq.destroy(new Error("Aborted"));
    } else {
      const onAbort = () => nodeReq.destroy(new Error("Aborted"));
      req.signal.addEventListener("abort", onAbort, { once: true });
      nodeReq.once(
        "close",
        () => req.signal?.removeEventListener("abort", onAbort)
      );
    }
  }
  if (req.body) nodeReq.write(req.body);
  nodeReq.end();
}
function requestAbsoluteForm(req, proxy) {
  const transport = proxy.protocol === "https:" ? https : http;
  const headers = { ...req.headers };
  headers.host = req.url.host;
  const auth = proxyAuthorizationHeader(proxy);
  if (auth) headers["proxy-authorization"] = auth;
  return new Promise((resolve, reject) => {
    const nodeReq = transport.request(
      {
        host: proxy.host,
        port: proxy.port,
        method: req.method,
        path: req.url.toString(),
        headers,
        setHost: false
      },
      (res) => resolve(toWebResponse(res))
    );
    wireRequest(nodeReq, req, reject);
  });
}
function requestOverSocket(socket, req, port) {
  const headers = { ...req.headers };
  headers.host = req.url.host;
  if (req.body && headers["content-length"] === void 0) {
    headers["content-length"] = String(req.body.length);
  }
  return new Promise((resolve, reject) => {
    const agent = new http.Agent({ keepAlive: false });
    agent.createConnection = (() => socket);
    const nodeReq = http.request(
      {
        host: req.url.hostname,
        port,
        method: req.method,
        path: req.url.pathname + req.url.search,
        headers,
        setHost: false,
        agent
      },
      (res) => resolve(toWebResponse(res))
    );
    wireRequest(nodeReq, req, reject);
  });
}
function toWebResponse(res) {
  const headers = {};
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === void 0) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  const body = new ReadableStream({
    start(controller) {
      let settled = false;
      res.on("data", (chunk) => {
        if (!settled) controller.enqueue(new Uint8Array(chunk));
      });
      res.on("end", () => {
        if (settled) return;
        settled = true;
        controller.close();
      });
      res.on("error", (err) => {
        if (settled) return;
        settled = true;
        controller.error(err);
      });
    },
    cancel() {
      res.destroy();
    }
  });
  return new Response(body, {
    status: res.statusCode ?? 0,
    statusText: res.statusMessage ?? "",
    headers
  });
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  createProxyFetch,
  parseProxyUrl,
  proxyAuthorizationHeader
});
//# sourceMappingURL=proxy-fetch.js.map
