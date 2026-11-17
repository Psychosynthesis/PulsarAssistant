import * as dns from "dns";
import * as http from "http";
import * as https from "https";
import * as net from "net";

const MAX_BYTES = 512 * 1024;
const MAX_CHARS = 30000;
const TIMEOUT_MS = 15000;
const MAX_REDIRECTS = 3;

/** Permit only globally routable IPv4 addresses. IPv6 is deliberately rejected. */
export function isPublicAddress(address: string): boolean {
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0 || (b === 88 && c === 99))) return false;
  if (a === 192 && b === 31 && c === 196) return false;
  if (a === 192 && b === 52 && c === 193) return false;
  if (a === 192 && b === 175 && c === 48) return false;
  if (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}

function stripBrackets(hostname: string): string {
  return hostname.replace(/^\[|\]$/g, "");
}

function parseUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("open_url requires a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("open_url only supports HTTP and HTTPS URLs.");
  }
  if (url.username || url.password) throw new Error("open_url does not allow URL credentials.");
  if (url.port) {
    throw new Error("open_url only supports standard HTTP and HTTPS ports.");
  }
  const hostname = stripBrackets(url.hostname);
  if (net.isIP(hostname) && !isPublicAddress(hostname)) {
    throw new Error("open_url cannot access local, private or non-public network addresses.");
  }
  return url;
}

/**
 * Resolves a hostname to a publicly routable IPv4 address. The resolved set is
 * validated here and the connection is then made to that address directly, so
 * the request can never be routed to a private address by the resolver.
 */
function resolvePublicIpv4(hostname: string, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Cancelled."));
    dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
      if (signal.aborted) return reject(new Error("Cancelled."));
      if (error) return reject(error);
      const ipv4 = addresses.filter((entry) => entry.family === 4);
      if (!ipv4.length || ipv4.some((entry) => !isPublicAddress(entry.address))) {
        return reject(new Error("open_url cannot access local, private or non-public network addresses."));
      }
      resolve(ipv4[0].address);
    });
  });
}

function requestPage(url: URL, ip: string, signal: AbortSignal): Promise<{ redirect?: string; text?: string }> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Cancelled."));
    const isHttps = url.protocol === "https:";
    const port = isHttps ? 443 : 80;
    const baseOptions = {
      hostname: ip,
      port,
      path: url.pathname + url.search,
      method: "GET",
      agent: false,
      setHost: false,
      headers: {
        host: url.host,
        accept: "text/html, text/plain, application/xhtml+xml",
        "accept-encoding": "identity",
      },
    };
    const onResponse = (response: http.IncomingMessage) => {
      const status = response.statusCode ?? 0;
      if ([301, 302, 303, 307, 308].includes(status)) {
        const location = response.headers.location;
        response.destroy();
        if (!location) return reject(new Error("open_url redirect has no location."));
        return resolve({ redirect: location });
      }
      if (status < 200 || status >= 300) {
        response.destroy();
        return reject(new Error(`open_url HTTP error ${status}.`));
      }
      const contentType = (response.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
      const isText =
        contentType === "text/plain" ||
        contentType === "text/html" ||
        contentType === "application/xhtml+xml" ||
        contentType.startsWith("text/");
      const isJson =
        contentType === "application/json" ||
        contentType === "text/json" ||
        contentType.endsWith("+json");
      if (!isText && !isJson) {
        response.destroy();
        return reject(new Error(`open_url does not support content type: ${contentType || "unknown"}.`));
      }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
        response.destroy();
        return reject(new Error("open_url does not support compressed responses."));
      }
      const chunks: Buffer[] = [];
      let size = 0;
      let truncated = false;
      response.on("data", (chunk: Buffer) => {
        const remaining = MAX_BYTES - size;
        chunks.push(chunk.subarray(0, remaining));
        size += Math.min(chunk.length, remaining);
        if (chunk.length > remaining || size >= MAX_BYTES) {
          truncated = true;
          response.destroy();
          finish();
        }
      });
      const finish = () => {
        let text = Buffer.concat(chunks).toString("utf8");
        if (contentType !== "text/plain") {
          text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ")
            .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ")
            .replace(/<[^>]*>/g, " ")
            .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
            .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"')
            .replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
        }
        if (text.length > MAX_CHARS) truncated = true;
        resolve({ text: text.slice(0, MAX_CHARS) + (truncated ? "\n[Content truncated]" : "") });
      };
      response.on("end", finish);
      response.on("error", reject);
      response.on("aborted", () => { if (!truncated) reject(new Error("open_url response was interrupted.")); });
    };
    const request = isHttps
      ? https.get({ ...baseOptions, servername: stripBrackets(url.hostname) }, onResponse)
      : http.get(baseOptions, onResponse);
    request.on("error", reject);
    const cancel = () => request.destroy(new Error("Cancelled."));
    signal.addEventListener("abort", cancel, { once: true });
    request.on("close", () => signal.removeEventListener("abort", cancel));
    if (signal.aborted) cancel();
  });
}

/** Fetch a public page without cookies, credentials, or ambient proxy settings. */
export async function openUrl(raw: string, signal: AbortSignal): Promise<string> {
  const timeout = new AbortController();
  const cancel = () => timeout.abort();
  if (signal.aborted) throw new Error("Cancelled.");
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(cancel, TIMEOUT_MS);
  try {
    let url = parseUrl(raw);
    for (let count = 0; count <= MAX_REDIRECTS; count++) {
      const ip = await resolvePublicIpv4(stripBrackets(url.hostname), timeout.signal);
      const page = await requestPage(url, ip, timeout.signal);
      if (page.text !== undefined) return page.text;
      if (count === MAX_REDIRECTS) throw new Error("open_url exceeded the redirect limit.");
      url = parseUrl(new URL(page.redirect!, url).href);
    }
    throw new Error("open_url exceeded the redirect limit.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
