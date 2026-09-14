import * as path from "path";
import { parseCommandLine } from "./util";

// Pure agent-registry logic. NO `atom` import so it can be unit-tested via the
// built lib/agent-config.js (like util.ts). All atom.config glue lives at the
// call sites and delegates here.

export type AgentType = "openai" | "acp" | "cursor";

interface BaseAgentConfig {
  name: string;
}

export type OpenAiAgentConfig = BaseAgentConfig & {
  type: "openai";
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
  model?: string;
  modelsUrl?: string;
  stream?: boolean;
};

export type AcpAgentConfig = BaseAgentConfig & {
  type: "acp";
  command: string;
};

export type CursorAgentConfig = BaseAgentConfig & {
  type: "cursor";
  baseUrl: string;
  apiKey: string;
  defaultModel: string;
  mode?: "agent" | "plan";
  autoCreatePR?: boolean;
  workOnCurrentBranch?: boolean;
};

export type Agent = OpenAiAgentConfig | AcpAgentConfig | CursorAgentConfig;

export interface AgentsConfig {
  activeAgentId?: string;
  agents: Record<string, Agent>;
  [key: string]: unknown;
}

export type AcpLaunchTarget = {
  id: string;
  name: string;
  kind: "acp";
  command: string;
};

export type OpenaiLaunchTarget = {
  id: string;
  name: string;
  kind: "openai";
  baseUrl: string;
  apiKey: string;
  model: string;
  modelsUrl: string;
  stream: boolean;
};

export type CursorLaunchTarget = {
  id: string;
  name: string;
  kind: "cursor";
  baseUrl: string;
  apiKey: string;
  model: string;
  mode: "agent" | "plan";
  autoCreatePR: boolean;
  workOnCurrentBranch: boolean;
};

export type LaunchTarget = AcpLaunchTarget | OpenaiLaunchTarget | CursorLaunchTarget;

export type ResolveReason = "ok" | "no-agents" | "unset-or-invalid";

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (Array.isArray(a) || Array.isArray(b)) {
    if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) {
      return false;
    }
    return a.every((item, i) => deepEqual(item, b[i]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    if (keys.length !== Object.keys(b).length) return false;
    return keys.every(
      (key) => key in b && deepEqual(a[key], (b as Record<string, unknown>)[key]),
    );
  }
  return false;
}

function optionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
}

function hasOpenAiModel(entry: Record<string, unknown>): boolean {
  return !!(optionalString(entry.defaultModel) || optionalString(entry.model));
}

function agentType(entry: Record<string, unknown>): AgentType | null {
  if (entry.type === "openai") return "openai";
  if (entry.type === "cursor") return "cursor";
  if (entry.type === "acp" || entry.type === "command") return "acp";
  if (optionalString(entry.baseUrl) && hasOpenAiModel(entry)) return "openai";
  if (optionalString(entry.command)) return "acp";
  return null;
}

function isUsableAgent(entry: Record<string, unknown>): boolean {
  const type = agentType(entry);
  if (type === "openai") {
    return !!(optionalString(entry.baseUrl) && hasOpenAiModel(entry));
  }
  if (type === "cursor") {
    return !!optionalString(entry.defaultModel);
  }
  if (type === "acp") return !!optionalString(entry.command);
  return false;
}

function normalizeAgent(
  id: string,
  entry: Record<string, unknown>,
): Agent | null {
  if (!isUsableAgent(entry)) return null;
  const name =
    typeof entry.name === "string" && entry.name.trim() !== ""
      ? entry.name
      : id;
  const type = agentType(entry);
  if (!type) return null;

  if (type === "acp") {
    const agent = {
      ...(entry as Record<string, unknown>),
      name,
      type: "acp",
    } as AcpAgentConfig;
    const command = optionalString(entry.command);
    if (command) agent.command = command;
    return agent;
  }

  if (type === "cursor") {
    const agent = {
      ...(entry as Record<string, unknown>),
      name,
      type: "cursor",
    } as CursorAgentConfig;
    agent.baseUrl =
      optionalString(entry.baseUrl)?.trim().replace(/\/+$/, "") ??
      "https://api.cursor.com/v1";
    const defaultModel = optionalString(entry.defaultModel);
    if (defaultModel) agent.defaultModel = defaultModel;
    agent.mode = entry.mode === "plan" ? "plan" : "agent";
    agent.autoCreatePR = entry.autoCreatePR === true;
    agent.workOnCurrentBranch = entry.workOnCurrentBranch === true;
    return agent;
  }

  const agent = {
    ...(entry as Record<string, unknown>),
    name,
    type: "openai",
  } as OpenAiAgentConfig;
  if (agent.baseUrl) agent.baseUrl = agent.baseUrl.trim().replace(/\/+$/, "");
  const defaultModel = optionalString(entry.defaultModel);
  if (defaultModel) agent.defaultModel = defaultModel;
  else delete agent.defaultModel;
  const model = optionalString(entry.model);
  if (model) agent.model = model;
  else delete agent.model;
  const modelsUrl = optionalString(entry.modelsUrl);
  if (modelsUrl) agent.modelsUrl = modelsUrl;
  else delete agent.modelsUrl;
  return agent;
}

// Defensive coercion: tolerate undefined/non-object/garbage, drop invalid
// agent entries, and preserve unknown top-level and per-agent fields.
export function normalizeAgentsConfig(raw: unknown): AgentsConfig {
  const source = isObject(raw) ? raw : {};

  const agents: Record<string, Agent> = {};
  const rawAgents = isObject(source.agents) ? source.agents : {};
  for (const [id, entry] of Object.entries(rawAgents)) {
    if (!id || !isObject(entry)) continue;
    const agent = normalizeAgent(id, entry);
    if (!agent) continue;
    agents[id] = agent;
  }

  const config = { ...source, agents } as AgentsConfig;

  if (
    typeof source.activeAgentId === "string" &&
    source.activeAgentId.trim() !== ""
  ) {
    config.activeAgentId = source.activeAgentId;
  } else {
    delete config.activeAgentId;
  }

  return config;
}

// STRICT launch resolution. `preferredId` is panel-local (serialized with the
// dock item). Global `activeAgentId` is only the default for a newly opened
// panel — never a map of project paths.
export function resolveAgent(
  config: AgentsConfig,
  preferredId?: string | null,
): {
  agent?: Agent;
  id?: string;
  reason: ResolveReason;
} {
  if (Object.keys(config.agents).length === 0) {
    return { reason: "no-agents" };
  }
  if (preferredId && config.agents[preferredId]) {
    return { agent: config.agents[preferredId], id: preferredId, reason: "ok" };
  }
  const id = config.activeAgentId;
  if (id && config.agents[id]) {
    return { agent: config.agents[id], id, reason: "ok" };
  }
  return { reason: "unset-or-invalid" };
}

export function resolveActiveAgent(config: AgentsConfig): {
  agent?: Agent;
  id?: string;
  reason: ResolveReason;
} {
  return resolveAgent(config);
}

export function toLaunchTarget(
  id: string,
  agent: Agent,
  model?: string,
): LaunchTarget {
  const type = agent.type ?? ((agent as AcpAgentConfig).command ? "acp" : "openai");

  if (type === "cursor") {
    const cursorAgent = agent as CursorAgentConfig;
    const baseUrl =
      optionalString(cursorAgent.baseUrl)?.replace(/\/+$/, "") ??
      "https://api.cursor.com/v1";
    const effectiveModel =
      optionalString(model) ?? optionalString(cursorAgent.defaultModel);
    if (!baseUrl || !effectiveModel) {
      throw new Error(
        `Cursor agent "${cursorAgent.name}" is missing baseUrl or defaultModel. Edit the agent config.`,
      );
    }
    const apiKey = optionalString(cursorAgent.apiKey);
    if (!apiKey) {
      throw new Error(
        `Cursor agent "${cursorAgent.name}" has no API key. Set apiKey.`,
      );
    }
    return {
      id,
      name: cursorAgent.name,
      kind: "cursor",
      baseUrl,
      apiKey,
      model: effectiveModel,
      mode: cursorAgent.mode === "plan" ? "plan" : "agent",
      autoCreatePR: cursorAgent.autoCreatePR === true,
      workOnCurrentBranch: cursorAgent.workOnCurrentBranch === true,
    };
  }

  if (type === "openai") {
    const openaiAgent = agent as OpenAiAgentConfig;
    const baseUrl = optionalString(openaiAgent.baseUrl)?.replace(/\/+$/, "");
    const configuredModel =
      optionalString(openaiAgent.defaultModel) ?? optionalString(openaiAgent.model);
    const effectiveModel = optionalString(model) ?? configuredModel;
    if (!baseUrl || !effectiveModel) {
      throw new Error(
        `API "${openaiAgent.name}" is missing baseUrl or defaultModel. Edit the agent config.`,
      );
    }
    const apiKey = optionalString(openaiAgent.apiKey);
    if (!apiKey) {
      throw new Error(`API "${openaiAgent.name}" has no API key. Set apiKey.`);
    }
    const modelsUrl =
      optionalString(openaiAgent.modelsUrl) ?? `${baseUrl}/models`;
    return {
      id,
      name: openaiAgent.name,
      kind: "openai",
      baseUrl,
      apiKey,
      model: effectiveModel,
      modelsUrl,
      stream: openaiAgent.stream === true,
    };
  }

  const command = optionalString((agent as AcpAgentConfig).command);
  if (!command) {
    throw new Error(
      `Agent "${agent.name}" has no command. Edit the agent config.`,
    );
  }
  return { id, name: agent.name, kind: "acp", command };
}

export function groupAgents(
  agents: Record<string, Agent>,
): Array<{ type: AgentType; entries: Array<[string, Agent]> }> {
  const openai: Array<[string, Agent]> = [];
  const cursor: Array<[string, Agent]> = [];
  const acp: Array<[string, Agent]> = [];
  for (const entry of Object.entries(agents)) {
    if (entry[1].type === "openai") openai.push(entry);
    else if (entry[1].type === "cursor") cursor.push(entry);
    else acp.push(entry);
  }
  const groups: Array<{ type: AgentType; entries: Array<[string, Agent]> }> = [];
  if (openai.length > 0) groups.push({ type: "openai", entries: openai });
  if (cursor.length > 0) groups.push({ type: "cursor", entries: cursor });
  if (acp.length > 0) groups.push({ type: "acp", entries: acp });
  return groups;
}

export function launchTargetsEqual(
  a: LaunchTarget | null | undefined,
  b: LaunchTarget | null | undefined,
): boolean {
  if (!a || !b) return false;
  if (a.id !== b.id || a.kind !== b.kind) return false;
  if (a.kind === "acp" && b.kind === "acp") {
    return a.command === b.command;
  }
  if (a.kind === "openai" && b.kind === "openai") {
    return (
      a.baseUrl === b.baseUrl &&
      a.model === b.model &&
      a.apiKey === b.apiKey &&
      a.modelsUrl === b.modelsUrl &&
      a.stream === b.stream
    );
  }
  if (a.kind === "cursor" && b.kind === "cursor") {
    return (
      a.baseUrl === b.baseUrl &&
      a.model === b.model &&
      a.apiKey === b.apiKey &&
      a.mode === b.mode &&
      a.autoCreatePR === b.autoCreatePR &&
      a.workOnCurrentBranch === b.workOnCurrentBranch
    );
  }
  return false;
}

// True when the running agent's id is no longer present in the registry.
export function isLaunchedAgentStale(
  config: AgentsConfig,
  launchedSnapshotId: string | null | undefined,
): boolean {
  if (!launchedSnapshotId) return false;
  return !config.agents[launchedSnapshotId];
}

export function quoteCommandLine(args: string[]): string {
  return args
    .map((arg) => {
      if (arg.length === 0) return '""';
      if (/[\s"']/.test(arg)) {
        return `"${arg.replace(/"/g, '\\"')}"`;
      }
      return arg;
    })
    .join(" ");
}

export function patchCommandPath(
  command: string,
  oldPath: string,
  newPath: string,
): string {
  const parsed = parseCommandLine(command);
  if (parsed.length === 0) return command;
  const target = path.resolve(oldPath);
  const updated = parsed.map((token) => {
    if (path.resolve(token) === target) return newPath;
    return token;
  });
  return quoteCommandLine(updated);
}
