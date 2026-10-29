/**
 * Local web search and fetch helpers for the built-in agent.
 *
 * The `web_search` and `web_fetch` tools are executed client-side and use the
 * provider's own search API when one is available. Currently that means
 * DeepSeek's Search & Fetch endpoints; other providers can be added later by
 * implementing the same small backend shape.
 */

export type WebSearchResult = {
  title: string;
  url: string;
  snippet: string;
};

const DEEPSEEK_BASE_URL = "https://api.deepseek.com";
const MAX_FETCH_CHARS = 20000;
const MAX_SEARCH_RESULTS = 5;

function boundFetch(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  // Keep `this === window` so the renderer does not throw an Illegal
  // invocation when a bare fetch reference is called later.
  return globalThis.fetch(...args);
}

function isPrivateHostname(hostname: string): boolean {
  // URL.hostname keeps square brackets around IPv6 literals.
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost")) return true;
  if (h === "::1" || h === "::" || h === "0.0.0.0") return true;

  const parts = h.split(".").map((part) => Number(part));
  if (
    parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
  ) {
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
  }
  return false;
}

/**
 * Rejects URLs that point at loopback or private network ranges so the fetch
 * tool cannot be abused to reach the user's local network.
 */
export function assertSafeFetchUrl(rawUrl: string): void {
  let url: URL;
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
      "web_fetch cannot access local or private network addresses.",
    );
  }
}

function extractSearchResults(
  parsed: Record<string, unknown>,
): WebSearchResult[] {
  const candidates: unknown[] = [];
  const data = parsed.data;
  if (data && typeof data === "object") {
    const record = data as Record<string, unknown>;
    for (const key of ["search_results", "results", "items"]) {
      if (Array.isArray(record[key])) {
        candidates.push(...(record[key] as unknown[]));
      }
    }
  }
  for (const key of ["search_results", "results", "items"]) {
    if (Array.isArray(parsed[key])) {
      candidates.push(...(parsed[key] as unknown[]));
    }
  }

  const results: WebSearchResult[] = [];
  for (const item of candidates) {
    if (!item || typeof item !== "object") continue;
    const record = item as Record<string, unknown>;
    const title = typeof record.title === "string" ? record.title : "";
    const url =
      typeof record.url === "string"
        ? record.url
        : typeof record.link === "string"
          ? record.link
          : "";
    const snippet =
      typeof record.snippet === "string"
        ? record.snippet
        : typeof record.content === "string"
          ? record.content
          : typeof record.summary === "string"
            ? record.summary
            : "";
    if (url || title) {
      results.push({ title: title || url, url, snippet });
    }
  }
  return results;
}

export function formatSearchResults(
  results: WebSearchResult[],
  query: string,
  maxResults = MAX_SEARCH_RESULTS,
): string {
  const limited = results.slice(0, maxResults);
  if (limited.length === 0) {
    return `No web results found for "${query}".`;
  }
  const lines = limited.map((result, index) => {
    const snippet = (result.snippet || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 300);
    return `${index + 1}. ${result.title}\n   ${result.url}${snippet ? `\n   ${snippet}` : ""}`;
  });
  return `Web search results for "${query}":\n\n${lines.join("\n\n")}`;
}

async function parseDeepSeekResponse(
  response: Response,
  action: string,
): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `DeepSeek ${action} failed (${response.status}): ${text.slice(0, 200)}`,
    );
  }
  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    throw new Error(`DeepSeek ${action} returned non-JSON.`);
  }
}

export async function deepseekSearch(
  apiKey: string,
  query: string,
  signal: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<WebSearchResult[]> {
  const impl = fetchImpl ?? boundFetch;
  const response = await impl(`${DEEPSEEK_BASE_URL}/v1/tools/search`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ query }),
    signal,
  });
  const parsed = await parseDeepSeekResponse(response, "search");
  return extractSearchResults(parsed).slice(0, MAX_SEARCH_RESULTS);
}

export async function deepseekFetch(
  apiKey: string,
  rawUrl: string,
  signal: AbortSignal,
  fetchImpl?: typeof fetch,
): Promise<string> {
  assertSafeFetchUrl(rawUrl);
  const impl = fetchImpl ?? boundFetch;
  const response = await impl(`${DEEPSEEK_BASE_URL}/v1/tools/fetch`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ url: rawUrl }),
    signal,
  });
  const parsed = await parseDeepSeekResponse(response, "fetch");
  const data = parsed.data;
  const content =
    data && typeof data === "object"
      ? typeof (data as Record<string, unknown>).content === "string"
        ? ((data as Record<string, unknown>).content as string)
        : typeof (data as Record<string, unknown>).text === "string"
          ? ((data as Record<string, unknown>).text as string)
          : ""
      : "";
  return content.slice(0, MAX_FETCH_CHARS);
}
