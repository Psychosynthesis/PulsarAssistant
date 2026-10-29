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
  proxyAuthorizationHeader: () => proxyAuthorizationHeader,
  redactProxyUrl: () => redactProxyUrl
});
module.exports = __toCommonJS(proxy_fetch_exports);
var http = __toESM(require("http"));
var https = __toESM(require("https"));
var net = __toESM(require("net"));
var tls = __toESM(require("tls"));
var TUNNEL_TIMEOUT_MS = 15e3;
var TLS_TIMEOUT_MS = 15e3;
function stripBrackets(hostname) {
  return hostname.replace(/^\[|\]$/g, "");
}
function redactProxyUrl(raw) {
  const proxy = parseProxyUrl(raw);
  if (!proxy) return "";
  const auth = proxy.username !== void 0 ? "***:***@" : "";
  const host = proxy.host.includes(":") ? `[${proxy.host}]` : proxy.host;
  return `${proxy.protocol}//${auth}${host}:${proxy.port}`;
}
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
  if (url.pathname !== "/") return null;
  if (url.search || url.hash) return null;
  if (url.username === "" && url.password) return null;
  const port = url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;
  return {
    protocol: url.protocol,
    host: stripBrackets(url.hostname),
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
  const method = ((init == null ? void 0 : init.method) ?? "GET").toUpperCase();
  const headers = {};
  if (init == null ? void 0 : init.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  }
  let body = null;
  if ((init == null ? void 0 : init.body) != null) {
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
  return { method, url, headers, body, signal: (init == null ? void 0 : init.signal) ?? void 0 };
}
function targetPort(url) {
  return url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
}
function createProxyFetch(resolveProxyUrl) {
  const nativeFetch = (...args) => globalThis.fetch(...args);
  if (!resolveProxyUrl) return nativeFetch;
  return (input, init) => {
    const raw = resolveProxyUrl();
    if (!raw || !raw.trim()) return nativeFetch(input, init);
    const proxy = parseProxyUrl(raw);
    if (!proxy) {
      return Promise.reject(
        new Error(
          "Invalid proxy configuration. Expected http(s)://[user:pass@]host[:port]."
        )
      );
    }
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
    const authority = `${req.url.hostname}:${targetPort(req.url)}`;
    const tunnel = await openTunnel(proxy, authority, req.signal);
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
function openTunnel(proxy, authority, signal) {
  const transport = proxy.protocol === "https:" ? https : http;
  const auth = proxyAuthorizationHeader(proxy);
  return new Promise((resolve, reject) => {
    let settled = false;
    let removeAbort = null;
    const nodeReq = transport.request({
      hostname: stripBrackets(proxy.host),
      port: proxy.port,
      method: "CONNECT",
      path: authority,
      headers: {
        host: authority,
        ...auth ? { "proxy-authorization": auth } : {}
      },
      agent: false,
      setHost: false
    });
    const cleanup = () => {
      clearTimeout(timeout);
      removeAbort == null ? void 0 : removeAbort();
      nodeReq.removeListener("connect", onConnect);
      nodeReq.removeListener("error", onError);
      nodeReq.removeListener("close", onClose);
    };
    const finish = (err, socket) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(socket);
    };
    const onConnect = (res, socket, head) => {
      const code = res.statusCode ?? 0;
      if (code !== 200) {
        socket.destroy();
        if (code === 407) {
          finish(
            new Error(
              `Proxy authentication required (407) by ${proxy.host}:${proxy.port}. Check the proxy username and password.`
            )
          );
        } else {
          finish(
            new Error(
              `Proxy CONNECT failed: HTTP ${code} ${res.statusMessage ?? ""}`.trim()
            )
          );
        }
        return;
      }
      if (head && head.length > 0) socket.unshift(head);
      finish(null, socket);
    };
    const onError = (err) => finish(err);
    const onClose = () => finish(
      new Error(
        `Proxy connection closed before CONNECT completed (${proxy.host}:${proxy.port}).`
      )
    );
    const timeout = setTimeout(() => {
      nodeReq.destroy(
        new Error(
          `Timed out establishing the proxy tunnel via ${proxy.host}:${proxy.port}.`
        )
      );
    }, TUNNEL_TIMEOUT_MS);
    nodeReq.on("connect", onConnect);
    nodeReq.once("error", onError);
    nodeReq.once("close", onClose);
    removeAbort = abortWhen(signal, () => {
      nodeReq.destroy(new Error("Aborted"));
    });
    if (!(signal == null ? void 0 : signal.aborted)) nodeReq.end();
  });
}
function wrapTls(socket, servername, signal) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let removeAbort = null;
    const hostname = stripBrackets(servername);
    const options = {
      socket,
      rejectUnauthorized: true,
      ...hostname && !net.isIP(hostname) ? { servername: hostname } : {}
    };
    const tlsSocket = tls.connect(options);
    const cleanup = () => {
      clearTimeout(timeout);
      removeAbort == null ? void 0 : removeAbort();
      tlsSocket.removeListener("secureConnect", onSecure);
      tlsSocket.removeListener("error", onError);
      tlsSocket.removeListener("close", onClose);
    };
    const finish = (err) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) {
        socket.destroy();
        reject(err);
      } else {
        resolve(tlsSocket);
      }
    };
    const onSecure = () => finish(null);
    const onError = (err) => finish(err);
    const onClose = () => finish(
      new Error(
        `TLS handshake closed before it completed (${hostname}).`
      )
    );
    const timeout = setTimeout(() => {
      socket.destroy();
      tlsSocket.destroy(
        new Error(`Timed out establishing TLS to ${hostname}.`)
      );
    }, TLS_TIMEOUT_MS);
    tlsSocket.once("secureConnect", onSecure);
    tlsSocket.once("error", onError);
    tlsSocket.once("close", onClose);
    removeAbort = abortWhen(signal, () => {
      socket.destroy();
      tlsSocket.destroy(new Error("Aborted"));
    });
  });
}
function wireRequest(nodeReq, req, reject) {
  var _a;
  nodeReq.once("error", reject);
  if ((_a = req.signal) == null ? void 0 : _a.aborted) {
    nodeReq.destroy(new Error("Aborted"));
    return;
  }
  let removeAbort = null;
  if (req.signal) {
    removeAbort = abortWhen(
      req.signal,
      () => nodeReq.destroy(new Error("Aborted"))
    );
    nodeReq.once("close", () => removeAbort == null ? void 0 : removeAbort());
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
        hostname: stripBrackets(proxy.host),
        port: proxy.port,
        method: req.method,
        path: req.url.toString(),
        headers,
        setHost: false
      },
      (res) => resolve(toWebResponse(res, req.signal))
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
        host: stripBrackets(req.url.hostname),
        port,
        method: req.method,
        path: req.url.pathname + req.url.search,
        headers,
        setHost: false,
        agent
      },
      (res) => resolve(toWebResponse(res, req.signal))
    );
    wireRequest(nodeReq, req, reject);
  });
}
function toWebResponse(res, signal) {
  const headers = {};
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === void 0) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }
  let settled = false;
  let cleanup = null;
  const body = new ReadableStream({
    start(controller) {
      let removeAbort = null;
      cleanup = () => {
        removeAbort == null ? void 0 : removeAbort();
        res.removeListener("data", onData);
        res.removeListener("end", onEnd);
        res.removeListener("aborted", onAborted);
        res.removeListener("error", onError);
        res.removeListener("close", onClose);
      };
      const finish = (err) => {
        if (settled) return;
        settled = true;
        cleanup == null ? void 0 : cleanup();
        if (err) controller.error(err);
        else controller.close();
      };
      const onData = (chunk) => {
        if (settled) return;
        controller.enqueue(new Uint8Array(chunk));
        res.pause();
      };
      const onEnd = () => finish();
      const onAborted = () => finish(new Error("Response body aborted before completion."));
      const onError = (err) => finish(err);
      const onClose = () => {
        if (settled) return;
        if (res.complete) return;
        finish(new Error("Response stream closed before completion."));
      };
      const onAbortSignal = () => {
        res.destroy(new Error("Aborted"));
      };
      removeAbort = signal ? abortWhen(signal, onAbortSignal) : null;
      if (res.aborted) {
        finish(new Error("Response body aborted before completion."));
        return;
      }
      if (res.complete) {
        finish();
        return;
      }
      res.on("data", onData);
      res.once("end", onEnd);
      res.once("aborted", onAborted);
      res.once("error", onError);
      res.once("close", onClose);
      res.pause();
    },
    pull() {
      res.resume();
    },
    cancel() {
      settled = true;
      cleanup == null ? void 0 : cleanup();
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
  proxyAuthorizationHeader,
  redactProxyUrl
});
//# sourceMappingURL=proxy-fetch.js.map
