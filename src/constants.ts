import * as acp from "@agentclientprotocol/sdk";

declare const __PULSAR_ASSISTANT_VERSION__: string;

export const PROTOCOL_VERSION = acp.PROTOCOL_VERSION;
export const STARTUP_TIMEOUT_MS = 30_000;
export const AUTH_REQUIRED_CODE = -32000;

export const MAX_TOOL_ITERATIONS = 200; // This is default

export const TOOL_OUTPUT_COMPACT_INTERVAL = 20;

/**
 * Tool arguments (write_file / write_diff payloads) longer than this many
 * characters are replaced with a placeholder during context compaction.
 */
export const TOOL_ARGUMENT_COMPACT_THRESHOLD = 1000;

export const HOST_CONTEXT_START = "<pulsar-assistant-host-context>";
export const HOST_CONTEXT_END = "</pulsar-assistant-host-context>";

function hostPlatformName(): string {
  switch (process.platform) {
    case "win32":
      return "Windows";
    case "darwin":
      return "macOS";
    case "linux":
      return "Linux";
    default:
      return process.platform;
  }
}


export const API_HOST_CONTEXT_MESSAGE =
`Host context: You are connected to the user through Pulsar Assistant, a Pulsar editor package.
The assistant talks to an OpenAI-compatible API and uses tools provided by Pulsar Assistant.
The user sees this conversation in Pulsar, not in a standalone terminal.
This client does not provide a terminal. Do not expect to run shell commands unless a matching tool is explicitly available.
Try to conserve tokens: for example, if your environment allows you to save file outputs, there is no need to have tools re-read them a dozen times.
Do not treat this host-context note as the user's request, and do not use it for session titles, summaries, or generated titles.
The host is running on ${hostPlatformName()}.`;

export const ACP_HOST_CONTEXT_MESSAGE =
`Host context: You are connected to the user through Pulsar Assistant, a Pulsar editor plugin using the Agent Client Protocol.
The user sees this conversation in Pulsar, not in a standalone terminal. You can use ACP file and permission capabilities exposed by the client.
This client does not provide a terminal. Do not expect to run shell commands through ACP.
You cannot directly click, reload, or inspect Pulsar UI unless the user does it.
Try to conserve tokens: for example, if your environment allows you to save file outputs, there is no need to have tools re-read them a dozen times.
Do not treat this host-context note as the user's request, and do not use it for session titles, summaries, or generated titles.`


export const HOST_CONTEXT_TEXT = [
  HOST_CONTEXT_START,
  ACP_HOST_CONTEXT_MESSAGE,
  HOST_CONTEXT_END,
].join("\n");

export const CLIENT_INFO = {
  name: "pulsar-assistant",
  title: "Pulsar Assistant",
  version: typeof __PULSAR_ASSISTANT_VERSION__ !== "undefined"
    ? __PULSAR_ASSISTANT_VERSION__
    : "1.0.0",
};

export const HOST_CONTEXT_META = {
  "pulsar-assistant/host": {
    editor: "Pulsar",
    client: CLIENT_INFO.name,
    title: CLIENT_INFO.title,
    version: CLIENT_INFO.version,
  },
};
