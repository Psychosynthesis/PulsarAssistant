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

// src/open-url.ts
var open_url_exports = {};
__export(open_url_exports, {
  isPublicAddress: () => isPublicAddress,
  openUrl: () => openUrl
});
module.exports = __toCommonJS(open_url_exports);
var dns = __toESM(require("dns"));
var http = __toESM(require("http"));
var https = __toESM(require("https"));
var net = __toESM(require("net"));
var MAX_BYTES = 128 * 1024;
var MAX_CHARS = 2e4;
var TIMEOUT_MS = 15e3;
var MAX_REDIRECTS = 5;
function isPublicAddress(address) {
  if (net.isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224) return false;
  if (a === 100 && b >= 64 && b <= 127) return false;
  if (a === 169 && b === 254) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 192 && (b === 168 || b === 0 || b === 88 && c === 99)) return false;
  if (a === 192 && b === 31 && c === 196) return false;
  if (a === 192 && b === 52 && c === 193) return false;
  if (a === 192 && b === 175 && c === 48) return false;
  if (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) return false;
  if (a === 203 && b === 0 && c === 113) return false;
  return true;
}
function parseUrl(raw) {
  let url;
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
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (net.isIP(hostname) && !isPublicAddress(hostname)) {
    throw new Error("open_url cannot access local, private or non-public network addresses.");
  }
  return url;
}
function lookupPublic(hostname, options, callback) {
  dns.lookup(hostname, { all: true, verbatim: true }, (error, addresses) => {
    if (error) return callback(error);
    const ipv4 = addresses.filter((entry) => entry.family === 4);
    if (!ipv4.length || ipv4.some((entry) => !isPublicAddress(entry.address))) {
      return callback(new Error("open_url cannot access local, private or non-public network addresses."));
    }
    const all = typeof options === "object" && options !== null && "all" in options && options.all;
    if (all) callback(null, ipv4);
    else callback(null, ipv4[0].address, ipv4[0].family);
  });
}
function requestPage(url, signal) {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(new Error("Cancelled."));
    const transport = url.protocol === "https:" ? https : http;
    const request = transport.get(url, {
      agent: false,
      lookup: lookupPublic,
      headers: { accept: "text/html, text/plain, application/xhtml+xml", "accept-encoding": "identity" }
    }, (response) => {
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
      if (contentType !== "text/plain" && contentType !== "text/html" && contentType !== "application/xhtml+xml") {
        response.destroy();
        return reject(new Error(`open_url does not support content type: ${contentType || "unknown"}.`));
      }
      if (response.headers["content-encoding"] && response.headers["content-encoding"] !== "identity") {
        response.destroy();
        return reject(new Error("open_url does not support compressed responses."));
      }
      const chunks = [];
      let size = 0;
      let truncated = false;
      response.on("data", (chunk) => {
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
          text = text.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ").replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, " ").replace(/<[^>]*>/g, " ").replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, "\n").trim();
        }
        if (text.length > MAX_CHARS) truncated = true;
        resolve({ text: text.slice(0, MAX_CHARS) + (truncated ? "\n[Content truncated]" : "") });
      };
      response.on("end", finish);
      response.on("error", reject);
      response.on("aborted", () => {
        if (!truncated) reject(new Error("open_url response was interrupted."));
      });
    });
    request.on("error", reject);
    const cancel = () => request.destroy(new Error("Cancelled."));
    signal.addEventListener("abort", cancel, { once: true });
    request.on("close", () => signal.removeEventListener("abort", cancel));
    if (signal.aborted) cancel();
  });
}
async function openUrl(raw, signal) {
  const timeout = new AbortController();
  const cancel = () => timeout.abort();
  if (signal.aborted) throw new Error("Cancelled.");
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timer = setTimeout(cancel, TIMEOUT_MS);
  try {
    let url = parseUrl(raw);
    for (let count = 0; count <= MAX_REDIRECTS; count++) {
      const page = await requestPage(url, timeout.signal);
      if (page.text !== void 0) return page.text;
      if (count === MAX_REDIRECTS) throw new Error("open_url exceeded the redirect limit.");
      url = parseUrl(new URL(page.redirect, url).href);
    }
    throw new Error("open_url exceeded the redirect limit.");
  } finally {
    clearTimeout(timer);
    signal.removeEventListener("abort", cancel);
  }
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  isPublicAddress,
  openUrl
});
//# sourceMappingURL=open-url.js.map
