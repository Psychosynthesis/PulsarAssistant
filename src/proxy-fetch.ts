import * as http from "http";
import * as https from "https";
import * as net from "net";
import * as tls from "tls";
import type { Duplex } from "stream";

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

const TUNNEL_TIMEOUT_MS = 15000;
const TLS_TIMEOUT_MS = 15000;

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "");
}

/**
 * Returns a log-safe proxy URL with credentials replaced by `***`.
 * Empty or unparsable input yields an empty string.
 */
export function redactProxyUrl(raw: string | null | undefined): string {
  const proxy = parseProxyUrl(raw);
  if (!proxy) return "";
  const auth = proxy.username !== undefined ? "***:***@" : "";
  const host = proxy.host.includes(":") ? `[${proxy.host}]` : proxy.host;
  return `${proxy.protocol}//${auth}${host}:${proxy.port}`;
}

/**
 * Parses a proxy URL. Accepts `http://` / `https://` schemes with optional
 * credentials (`http://USER:PASS@HOST:PORT`). A scheme-less value is treated as
 * `http://`. Returns `null` for empty or malformed input; rejects non-empty
 * path/query/hash and invalid ports or credentials.
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
  // A proxy URL must not carry a path, query or fragment.
  if (url.pathname !== "/") return null;
  if (url.search || url.hash) return null;
  // `http://:pass@host` has an empty username; treat it as malformed.
  if (url.username === "" && url.password) return null;

  const port = url.port
    ? Number(url.port)
    : url.protocol === "https:"
      ? 443
      : 80;
  if (!Number.isInteger(port) || port <= 0 || port > 65535) return null;

  return {
    protocol: url.protocol,
    host: stripBrackets(url.hostname),
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
 * Builds a fetch-compatible function. When the resolver is omitted, requests go
 * through the native `globalThis.fetch` unchanged. When it returns an empty
 * value, the proxy is disabled. A non-empty but malformed value throws instead
 * of silently falling back to a direct connection. The resolver is called per
 * request, so config changes apply without restart.
 */
export function createProxyFetch(
  resolveProxyUrl?: () => string | null | undefined,
): typeof fetch {
  const nativeFetch = (
    ...args: Parameters<typeof fetch>
  ): Promise<Response> => globalThis.fetch(...args);

  if (!resolveProxyUrl) return nativeFetch;

  return (input, init) => {
    const raw = resolveProxyUrl();
    if (!raw || !raw.trim()) return nativeFetch(input, init);

    const proxy = parseProxyUrl(raw);
    if (!proxy) {
      // Keep the fetch-compatible contract: fail with a rejected promise, not
      // a synchronous throw.
      return Promise.reject(
        new Error(
          "Invalid proxy configuration. Expected http(s)://[user:pass@]host[:port].",
        ),
      );
    }
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
    // CONNECT request-target must include the destination port, even when it
    // is the scheme default (RFC 9112 §3.2.3).
    const authority = `${req.url.hostname}:${targetPort(req.url)}`;
    const tunnel = await openTunnel(proxy, authority, req.signal);
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

/**
 * Opens a proxy tunnel for an HTTPS destination using Node's native CONNECT
 * support (`http.request`/`https.request` with method `CONNECT` and the
 * `connect` event), rather than hand-writing the CONNECT exchange.
 */
function openTunnel(
  proxy: ProxyConfig,
  authority: string,
  signal: AbortSignal | undefined,
): Promise<net.Socket> {
  const transport = proxy.protocol === "https:" ? https : http;
  const auth = proxyAuthorizationHeader(proxy);

  return new Promise<net.Socket>((resolve, reject) => {
    let settled = false;
    let removeAbort: (() => void) | null = null;

    const nodeReq = transport.request({
      hostname: stripBrackets(proxy.host),
      port: proxy.port,
      method: "CONNECT",
      path: authority,
      headers: {
        host: authority,
        ...(auth ? { "proxy-authorization": auth } : {}),
      },
      agent: false,
      setHost: false,
    });

    const cleanup = () => {
      clearTimeout(timeout);
      removeAbort?.();
      nodeReq.removeListener("connect", onConnect);
      nodeReq.removeListener("error", onError);
      nodeReq.removeListener("close", onClose);
    };
    const finish = (err: Error | null, socket?: net.Socket) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve(socket as net.Socket);
    };

    const onConnect = (
      res: http.IncomingMessage,
      socket: Duplex,
      head: Buffer,
    ) => {
      const code = res.statusCode ?? 0;
      if (code !== 200) {
        socket.destroy();
        if (code === 407) {
          finish(
            new Error(
              `Proxy authentication required (407) by ${proxy.host}:${proxy.port}. Check the proxy username and password.`,
            ),
          );
        } else {
          finish(
            new Error(
              `Proxy CONNECT failed: HTTP ${code} ${res.statusMessage ?? ""}`.trim(),
            ),
          );
        }
        return;
      }
      // `head` holds any bytes already read after the CONNECT headers.
      if (head && head.length > 0) socket.unshift(head);
      finish(null, socket as net.Socket);
    };
    const onError = (err: Error) => finish(err);
    const onClose = () =>
      finish(
        new Error(
          `Proxy connection closed before CONNECT completed (${proxy.host}:${proxy.port}).`,
        ),
      );

    const timeout = setTimeout(() => {
      nodeReq.destroy(
        new Error(
          `Timed out establishing the proxy tunnel via ${proxy.host}:${proxy.port}.`,
        ),
      );
    }, TUNNEL_TIMEOUT_MS);

    nodeReq.on("connect", onConnect);
    nodeReq.once("error", onError);
    nodeReq.once("close", onClose);
    removeAbort = abortWhen(signal, () => {
      nodeReq.destroy(new Error("Aborted"));
    });
    if (!signal?.aborted) nodeReq.end();
  });
}

/**
 * Upgrades an established socket to TLS for the destination. The TLS socket
 * does not own the underlying connection until the handshake succeeds, so the
 * source socket is destroyed on failure. SNI is set only for DNS names, never
 * for IP literals.
 */
function wrapTls(
  socket: net.Socket,
  servername: string,
  signal: AbortSignal | undefined,
): Promise<tls.TLSSocket> {
  return new Promise<tls.TLSSocket>((resolve, reject) => {
    let settled = false;
    let removeAbort: (() => void) | null = null;
    const hostname = stripBrackets(servername);
    const options: tls.ConnectionOptions = {
      socket,
      rejectUnauthorized: true,
      ...(hostname && !net.isIP(hostname) ? { servername: hostname } : {}),
    };
    const tlsSocket = tls.connect(options);

    const cleanup = () => {
      clearTimeout(timeout);
      removeAbort?.();
      tlsSocket.removeListener("secureConnect", onSecure);
      tlsSocket.removeListener("error", onError);
      tlsSocket.removeListener("close", onClose);
    };
    const finish = (err: Error | null) => {
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
    const onError = (err: Error) => finish(err);
    const onClose = () =>
      finish(
        new Error(
          `TLS handshake closed before it completed (${hostname}).`,
        ),
      );

    const timeout = setTimeout(() => {
      socket.destroy();
      tlsSocket.destroy(
        new Error(`Timed out establishing TLS to ${hostname}.`),
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

function wireRequest(
  nodeReq: http.ClientRequest,
  req: NormalizedRequest,
  reject: (err: Error) => void,
): void {
  nodeReq.once("error", reject);
  if (req.signal?.aborted) {
    nodeReq.destroy(new Error("Aborted"));
    return;
  }
  let removeAbort: (() => void) | null = null;
  if (req.signal) {
    removeAbort = abortWhen(req.signal, () =>
      nodeReq.destroy(new Error("Aborted")),
    );
    // The request phase is done once the body is flushed; the response body is
    // cancelled separately inside toWebResponse.
    nodeReq.once("close", () => removeAbort?.());
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
        hostname: stripBrackets(proxy.host),
        port: proxy.port,
        method: req.method,
        path: req.url.toString(),
        headers,
        setHost: false,
      },
      (res) => resolve(toWebResponse(res, req.signal)),
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
        host: stripBrackets(req.url.hostname),
        port,
        method: req.method,
        path: req.url.pathname + req.url.search,
        headers,
        setHost: false,
        agent,
      },
      (res) => resolve(toWebResponse(res, req.signal)),
    );
    wireRequest(nodeReq, req, reject);
  });
}

function toWebResponse(
  res: http.IncomingMessage,
  signal: AbortSignal | undefined,
): Response {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(res.headers)) {
    if (value === undefined) continue;
    headers[key] = Array.isArray(value) ? value.join(", ") : String(value);
  }

  let settled = false;
  let cleanup: (() => void) | null = null;

  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      let removeAbort: (() => void) | null = null;

      cleanup = () => {
        removeAbort?.();
        res.removeListener("data", onData);
        res.removeListener("end", onEnd);
        res.removeListener("aborted", onAborted);
        res.removeListener("error", onError);
        res.removeListener("close", onClose);
      };
      const finish = (err?: Error) => {
        if (settled) return;
        settled = true;
        cleanup?.();
        if (err) controller.error(err);
        else controller.close();
      };

      const onData = (chunk: Buffer) => {
        if (settled) return;
        controller.enqueue(new Uint8Array(chunk));
        res.pause();
      };
      const onEnd = () => finish();
      const onAborted = () =>
        finish(new Error("Response body aborted before completion."));
      const onError = (err: Error) => finish(err);
      const onClose = () => {
        if (settled) return;
        // A normal completion emits `end` before `close`; `complete` guards
        // against treating an already-buffered aborted response as a clean end.
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
      cleanup?.();
      res.destroy();
    },
  });

  return new Response(body, {
    status: res.statusCode ?? 0,
    statusText: res.statusMessage ?? "",
    headers,
  });
}
