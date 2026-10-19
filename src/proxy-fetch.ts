import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as tls from "tls";

/**
 * Optional HTTP(S) proxy transport for API requests.
 *
 * Pulsar runs package code in the Electron renderer, where `globalThis.fetch`
 * is Chromium's `window.fetch`. Chromium's fetch honours system proxy settings
 * but cannot take a per-request proxy URL with embedded credentials. This module
 * provides a dependency-free `fetch` replacement that routes every request
 * through an explicit `http://` or `https://` proxy, supporting the
 * `http://USER:PASS@HOST:PORT` credential form.
 *
 * HTTPS targets use the HTTP `CONNECT` method to open a tunnel (over TLS to the
 * proxy first when the proxy itself is `https://`), then negotiate TLS to the
 * destination. HTTP targets are sent in absolute-form to the proxy.
 */

export type ProxyConfig = {
  protocol: "http:" | "https:";
  host: string;
  port: number;
  username?: string;
  password?: string;
};

/**
 * Parses a proxy URL. Accepts `http://` / `https://` schemes with optional
 * credentials (`http://USER:PASS@HOST:PORT`). A scheme-less value is treated as
 * `http://`. Returns `null` for empty or malformed input.
 */
export function parseProxyUrl(
  raw: string | null | undefined,
): ProxyConfig | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  let value = trimmed;
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) {
    value = `http://${value}`;
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (!url.hostname) return null;

  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  return {
    protocol: url.protocol,
    host: url.hostname,
    port,
    ...(url.username
      ? { username: decodeURIComponent(url.username) }
      : {}),
    ...(url.password
      ? { password: decodeURIComponent(url.password) }
      : {}),
  };
}

/** The `Proxy-Authorization` header value for a proxy with credentials. */
export function proxyAuthorizationHeader(
  proxy: ProxyConfig,
): string | undefined {
  if (proxy.username === undefined) return undefined;
  const token = Buffer.from(
    `${proxy.username}:${proxy.password ?? ""}`,
    "utf8",
  ).toString("base64");
  return `Basic ${token}`;
}

type NormalizedRequest = {
  method: string;
  url: URL;
  headers: Record<string, string>;
  body: Buffer | null;
  signal?: AbortSignal;
};

function normalizeRequest(
  input: Parameters<typeof fetch>[0],
  init?: RequestInit,
): NormalizedRequest {
  const url =
    typeof input === "string"
      ? new URL(input)
      : input instanceof URL
        ? input
        : new URL(String(input));
  const method = (init?.method ?? "GET").toUpperCase();
  const headers: Record<string, string> = {};
  if (init?.headers) {
    const h = new Headers(init.headers);
    h.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });
  }
  let body: Buffer | null = null;
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
  return { method, url, headers, body, signal: init?.signal ?? undefined };
}

function targetPort(url: URL): number {
  return url.port ? Number(url.port) : url.protocol === "https:" ? 443 : 80;
}

/**
 * Builds a fetch-compatible function. When the resolver is omitted (or returns
 * an empty/unparsable value), requests go through the native `globalThis.fetch`
 * unchanged. Otherwise every request is routed through the configured proxy.
 * The resolver is called per request, so config changes apply without restart.
 */
export function createProxyFetch(
  resolveProxyUrl?: () => string | null | undefined,
): typeof fetch {
  const nativeFetch = (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> => globalThis.fetch(...args);

  if (!resolveProxyUrl) return nativeFetch;

  return (input, init) => {
    const proxy = parseProxyUrl(resolveProxyUrl());
    if (!proxy) return nativeFetch(input, init);
    return proxyFetch(input, init, proxy);
  };
}

async function proxyFetch(
  input: Parameters<typeof fetch>[0],
  init: RequestInit | undefined,
  proxy: ProxyConfig,
): Promise<Response> {
  const req = normalizeRequest(input, init);
  if (req.url.protocol !== "http:" && req.url.protocol !== "https:") {
    throw new Error(`Unsupported protocol through proxy: ${req.url.protocol}`);
  }
  // Prevent a transparent proxy from gzip-compressing the body, which the
  // Node transport would otherwise hand back as opaque bytes.
  if (req.headers["accept-encoding"] === undefined) {
    req.headers["accept-encoding"] = "identity";
  }

  if (req.url.protocol === "https:") {
    const tunnel = await openTunnel(proxy, req.url.host, req.signal);
    const socket = await wrapTls(tunnel, req.url.hostname, req.signal);
    return requestOverSocket(socket, req, targetPort(req.url));
  }
  return requestAbsoluteForm(req, proxy);
}

function abortWhen(
  signal: AbortSignal | undefined,
  onAbort: () => void,
): (() => void) | null {
  if (!signal) return null;
  if (signal.aborted) {
    onAbort();
    return null;
  }
  const handler = () => onAbort();
  signal.addEventListener("abort", handler, { once: true });
  return () => signal.removeEventListener("abort", handler);
}

function connectTcp(
  host: string,
  port: number,
  signal: AbortSignal | undefined,
): Promise<net.Socket> {
  return new Promise<net.Socket>((resolve, reject) => {
    let removeAbort: (() => void) | null = null;
    const socket = net.connect({ host, port });
    socket.setNoDelay(true);
    socket.once("connect", () => {
      removeAbort?.();
      resolve(socket);
    });
    socket.once("error", reject);
    removeAbort = abortWhen(signal, () =>
      socket.destroy(new Error("Aborted")),
    );
  });
}

function wrapTls(
  socket: net.Socket,
  servername: string,
  signal: AbortSignal | undefined,
): Promise<tls.TLSSocket> {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    let removeAbort: (() => void) | null = null;
    const tlsSocket = tls.connect({ socket, servername }, () => {
      removeAbort?.();
      resolve(tlsSocket);
    });
    tlsSocket.once("error", reject);
    removeAbort = abortWhen(signal, () =>
      tlsSocket.destroy(new Error("Aborted")),
    );
  });
}

function sendConnect(
  socket: net.Socket,
  authority: string,
  proxy: ProxyConfig,
  signal: AbortSignal | undefined,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let removeAbort: (() => void) | null = null;
    const auth = proxyAuthorizationHeader(proxy);
    const head =
      `CONNECT ${authority} HTTP/1.1\r\n` +
      `Host: ${authority}\r\n` +
      (auth ? `Proxy-Authorization: ${auth}\r\n` : "") +
      `Proxy-Connection: keep-alive\r\n\r\n`;

    const cleanup = () => {
      socket.removeListener("data", onData);
      socket.removeListener("error", onError);
      removeAbort?.();
    };

    const fail = (err: Error) => {
      cleanup();
      socket.destroy();
      reject(err);
    };

    const onError = (err: Error) => fail(err);

    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("latin1");
      const idx = buffer.indexOf("\r\n\r\n");
      // The CONNECT head is small; accumulate until the separator arrives.
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

async function openTunnel(
  proxy: ProxyConfig,
  authority: string,
  signal: AbortSignal | undefined,
): Promise<net.Socket> {
  const base = await connectTcp(proxy.host, proxy.port, signal);
  const proxySocket =
    proxy.protocol === "https:" ? await wrapTls(base, proxy.host, signal) : base;
  try {
    await sendConnect(proxySocket, authority, proxy, signal);
    return proxySocket;
  } catch (err) {
    proxySocket.destroy();
    throw err;
  }
}

function wireRequest(
  nodeReq: http.ClientRequest,
  req: NormalizedRequest,
  reject: (err: Error) => void,
): void {
  nodeReq.once("error", reject);
  if (req.signal) {
    if (req.signal.aborted) {
      nodeReq.destroy(new Error("Aborted"));
    } else {
      const onAbort = () => nodeReq.destroy(new Error("Aborted"));
      req.signal.addEventListener("abort", onAbort, { once: true });
      nodeReq.once("close", () =>
        req.signal?.removeEventListener("abort", onAbort),
      );
    }
  }
  if (req.body) nodeReq.write(req.body);
  nodeReq.end();
}

function requestAbsoluteForm(
  req: NormalizedRequest,
  proxy: ProxyConfig,
): Promise<Response> {
  const transport = proxy.protocol === "https:" ? https : http;
  const headers = { ...req.headers };
  headers.host = req.url.host;
  const auth = proxyAuthorizationHeader(proxy);
  if (auth) headers["proxy-authorization"] = auth;

  return new Promise<Response>((resolve, reject) => {
    const nodeReq = transport.request(
      {
        host: proxy.host,
        port: proxy.port,
        method: req.method,
        path: req.url.toString(),
        headers,
        setHost: false,
      },
      (res) => resolve(toWebResponse(res)),
    );
    wireRequest(nodeReq, req, reject);
  });
}

function requestOverSocket(
  socket: net.Socket,
  req: NormalizedRequest,
  port: number,
): Promise<Response> {
  const headers = { ...req.headers };
  headers.host = req.url.host;
  if (req.body && headers["content-length"] === undefined) {
    headers["content-length"] = String(req.body.length);
  }

  return new Promise<Response>((resolve, reject) => {
    const agent = new http.Agent({ keepAlive: false });
    agent.createConnection = (() =>
      socket) as unknown as typeof agent.createConnection;

    const nodeReq = http.request(
      {
        host: req.url.hostname,
        port,
        method: req.method,
        path: req.url.pathname + req.url.search,
        headers,
        setHost: false,
        agent,
      },
      (res) => resolve(toWebResponse(res)),
    );
    wireRequest(nodeReq, req, reject);
  });
}

function toWebResponse(res: http.IncomingMessage): Response {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let settled = false;
      res.on("data", (chunk: Buffer) => {
        if (!settled) controller.enqueue(new Uint8Array(chunk));
      });
      res.on("end", () => {
        if (settled) return;
        settled = true;
        controller.close();
      });
      res.on("error", (err: Error) => {
        if (settled) return;
        settled = true;
        controller.error(err);
      });
    },
    cancel() {
      res.destroy();
    },
  });

  return new Response(body, {
    status: res.statusCode ?? 0,
    statusText: res.statusMessage ?? "",
    headers,
  });
}
