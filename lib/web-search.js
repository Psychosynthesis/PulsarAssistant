"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
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
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/web-search.ts
var web_search_exports = {};
__export(web_search_exports, {
  assertSafeFetchUrl: () => assertSafeFetchUrl,
  deepseekFetch: () => deepseekFetch,
  deepseekSearch: () => deepseekSearch,
  formatSearchResults: () => formatSearchResults
});
module.exports = __toCommonJS(web_search_exports);
var DEEPSEEK_BASE_URL = "https://api.deepseek.com";
var MAX_FETCH_CHARS = 2e4;
var MAX_SEARCH_RESULTS = 5;
function boundFetch(...args) {
  return globalThis.fetch(...args);
}
function isPrivateHostname(hostname) {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "::" || h === "0.0.0.0") return true;
  const parts = h.split(".").map((part) => Number(part));
  if (parts.length === 4 && parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}
function assertSafeFetchUrl(rawUrl) {
  let url;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new Error("web_fetch requires a valid absolute URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("web_fetch only supports http and https URLs.");
  }
  if (isPrivateHostname(url.hostname)) {
    throw new Error(
      "web_fetch cannot access local or private network addresses."
    );
  }
}
function extractSearchResults(parsed) {
  const candidates = [];
  const data = parsed.data;
  if (data && typeof data === "object") {
    const record = data;
    for (const key of ["search_results", "results", "items"]) {
      if (Array.isArray(record[key])) {
        candidates.push(...record[key]);
      }
    }
  }
  for (const key of ["search_results", "results", "items"]) {
    if (Array.isArray(parsed[key])) {
      candidates.push(...parsed[key]);
    }
  }
  const results = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const record = item;
    const title = typeof record.title === "string" ? record.title : "";
    const url = typeof record.url === "string" ? record.url : typeof record.link === "string" ? record.link : "";
    const snippet = typeof record.snippet === "string" ? record.snippet : typeof record.content === "string" ? record.content : typeof record.summary === "string" ? record.summary : "";
    if (url || title) {
      results.push({ title: title || url, url, snippet });
    }
  }
  return results;
}
function formatSearchResults(results, query, maxResults = MAX_SEARCH_RESULTS) {
  const limited = results.slice(0, maxResults);
  if (limited.length === 0) {
    return `No web results found for "${query}".`;
  }
  const lines = limited.map((result, index) => {
    const snippet = (result.snippet || "").replace(/\s+/g, " ").trim().slice(0, 300);
    return `${index + 1}. ${result.title}
   ${result.url}${snippet ? `
   ${snippet}` : ""}`;
  });
  return `Web search results for "${query}":

${lines.join("\n\n")}`;
}
async function parseDeepSeekResponse(response, action) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `DeepSeek ${action} failed (${response.status}): ${text.slice(0, 200)}`
    );
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`DeepSeek ${action} returned non-JSON.`);
  }
}
async function deepseekSearch(apiKey, query, signal, fetchImpl) {
  const impl = fetchImpl ?? boundFetch;
  const response = await impl(`${DEEPSEEK_BASE_URL}/v1/tools/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ query }),
    signal
  });
  const parsed = await parseDeepSeekResponse(response, "search");
  return extractSearchResults(parsed).slice(0, MAX_SEARCH_RESULTS);
}
async function deepseekFetch(apiKey, rawUrl, signal, fetchImpl) {
  assertSafeFetchUrl(rawUrl);
  const impl = fetchImpl ?? boundFetch;
  const response = await impl(`${DEEPSEEK_BASE_URL}/v1/tools/fetch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({ url: rawUrl }),
    signal
  });
  const parsed = await parseDeepSeekResponse(response, "fetch");
  const data = parsed.data;
  const content = data && typeof data === "object" ? typeof data.content === "string" ? data.content : typeof data.text === "string" ? data.text : "" : "";
  return content.slice(0, MAX_FETCH_CHARS);
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  assertSafeFetchUrl,
  deepseekFetch,
  deepseekSearch,
  formatSearchResults
});
//# sourceMappingURL=web-search.js.map
