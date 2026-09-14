import type { ModelInfo } from "../view/model-info";
import {
  CursorAgent,
  CursorApiError,
  CursorCreateAgentRequest,
  CursorCreateAgentResponse,
  CursorCreateRunRequest,
  CursorModel,
  CursorRepository,
  CursorRun,
} from "./types";

export type CursorClientOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
};

function boundFetch(
  ...args: Parameters<typeof fetch>
): Promise<Response> {
  return globalThis.fetch(...args);
}

function trimSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function cursorApiError(
  status: number,
  text: string,
): CursorApiError {
  let message = text.trim();
  let code: string | undefined;
  try {
    const parsed = JSON.parse(text) as {
      error?: { code?: unknown; message?: unknown };
      code?: unknown;
      message?: unknown;
    };
    code =
      typeof parsed.error?.code === "string"
        ? parsed.error.code
        : typeof parsed.code === "string"
          ? parsed.code
          : undefined;
    const apiMessage =
      typeof parsed.error?.message === "string"
        ? parsed.error.message
        : typeof parsed.message === "string"
          ? parsed.message
          : undefined;
    if (apiMessage) message = apiMessage;
  } catch {
    // Keep the raw body.
  }
  return new CursorApiError(
    message || `Cursor API error ${status}`,
    status,
    code,
    text,
  );
}

export class CursorClient {
  private fetchImpl: typeof fetch;

  constructor(private readonly options: CursorClientOptions) {
    this.fetchImpl = options.fetch ?? boundFetch;
  }

  private url(path: string): string {
    return `${trimSlash(this.options.baseUrl)}${path}`;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      authorization: `Bearer ${this.options.apiKey}`,
      ...(extra ?? {}),
    };
  }

  private async request<T>(
    path: string,
    init: {
      method: "GET" | "POST";
      body?: unknown;
      signal?: AbortSignal;
      headers?: Record<string, string>;
    },
  ): Promise<T | undefined> {
    const hasBody = init.body !== undefined;
    const headers = this.headers({
      ...(hasBody ? { "content-type": "application/json" } : {}),
      ...(init.headers ?? {}),
    });
    const response = await this.fetchImpl(this.url(path), {
      method: init.method,
      headers,
      body: hasBody ? JSON.stringify(init.body) : undefined,
      signal: init.signal,
    });
    const text = await response.text();
    if (!response.ok) {
      throw cursorApiError(response.status, text);
    }
    if (!text.trim()) return undefined;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new CursorApiError(
        `Cursor returned non-JSON (${response.status}).`,
        response.status,
        undefined,
        text,
      );
    }
  }

  private async openStream(
    path: string,
    signal: AbortSignal,
    lastEventId?: string,
  ): Promise<Response> {
    const response = await this.fetchImpl(this.url(path), {
      method: "GET",
      headers: this.headers({
        accept: "text/event-stream",
        ...(lastEventId ? { "last-event-id": lastEventId } : {}),
      }),
      signal,
    });
    if (!response.ok) {
      const text = await response.text();
      throw cursorApiError(response.status, text);
    }
    return response;
  }

  async listModels(signal?: AbortSignal): Promise<CursorModel[]> {
    const response = await this.request<{ items?: CursorModel[] }>(
      "/models",
      { method: "GET", signal },
    );
    const items = Array.isArray(response?.items) ? response.items : [];
    return items.filter(
      (item): item is CursorModel =>
        !!item && typeof item.id === "string" && !!item.id.trim(),
    );
  }

  async listRepositories(signal?: AbortSignal): Promise<CursorRepository[]> {
    const response = await this.request<{ items?: CursorRepository[] }>(
      "/repositories",
      { method: "GET", signal },
    );
    const items = Array.isArray(response?.items) ? response.items : [];
    return items.filter(
      (item): item is CursorRepository =>
        !!item && typeof item.url === "string" && !!item.url.trim(),
    );
  }

  async createAgent(
    request: CursorCreateAgentRequest,
    signal?: AbortSignal,
  ): Promise<CursorCreateAgentResponse> {
    const response = await this.request<CursorCreateAgentResponse>(
      "/agents",
      { method: "POST", body: request, signal },
    );
    return response ?? {};
  }

  async getAgent(agentId: string): Promise<CursorAgent | undefined> {
    return this.request<CursorAgent>(
      `/agents/${encodeURIComponent(agentId)}`,
      { method: "GET" },
    );
  }

  async createRun(
    agentId: string,
    request: CursorCreateRunRequest,
    signal?: AbortSignal,
  ): Promise<CursorRun | undefined> {
    return this.request<CursorRun>(
      `/agents/${encodeURIComponent(agentId)}/runs`,
      { method: "POST", body: request, signal },
    );
  }

  async getRun(
    agentId: string,
    runId: string,
  ): Promise<CursorRun | undefined> {
    return this.request<CursorRun>(
      `/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}`,
      { method: "GET" },
    );
  }

  openRunStream(
    agentId: string,
    runId: string,
    signal: AbortSignal,
    lastEventId?: string,
  ): Promise<Response> {
    return this.openStream(
      `/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/stream`,
      signal,
      lastEventId,
    );
  }

  async cancelRun(agentId: string, runId: string): Promise<void> {
    await this.request<void>(
      `/agents/${encodeURIComponent(agentId)}/runs/${encodeURIComponent(runId)}/cancel`,
      { method: "POST" },
    );
  }

  async archiveAgent(agentId: string): Promise<void> {
    await this.request<void>(
      `/agents/${encodeURIComponent(agentId)}/archive`,
      { method: "POST" },
    );
  }

  async unarchiveAgent(agentId: string): Promise<void> {
    await this.request<void>(
      `/agents/${encodeURIComponent(agentId)}/unarchive`,
      { method: "POST" },
    );
  }
}

export type FetchCursorModelsOptions = {
  baseUrl: string;
  apiKey: string;
  fetch?: typeof fetch;
  signal?: AbortSignal;
};

export async function fetchCursorModels(
  options: FetchCursorModelsOptions,
): Promise<ModelInfo[]> {
  const client = new CursorClient({
    baseUrl: options.baseUrl,
    apiKey: options.apiKey,
    fetch: options.fetch,
  });
  const models = await client.listModels(options.signal);
  const result: ModelInfo[] = models.map((model) => ({
    id: model.id.trim(),
    ...(model.description?.trim() ? { description: model.description.trim() } : {}),
  }));
  if (result.length === 0) {
    throw new CursorApiError(
      "Cursor model list is empty.",
      200,
      "models_empty",
    );
  }
  result.sort((a, b) => a.id.localeCompare(b.id));
  return result;
}
