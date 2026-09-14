/**
 * Content of the empty chat window. Pure module: no DOM, no atom, so the
 * decision logic and the texts are unit-testable.
 */

export type ChatPlaceholderKind =
  | "hidden"
  | "no-agents"
  | "no-sessions"
  | "pick-session"
  | "empty-session";

export interface ChatPlaceholderInput {
  /** A turn is being generated or the session is switching. */
  busy: boolean;
  /** The conversation area already has rows. */
  hasMessages: boolean;
  agentCount: number;
  sessionCount: number;
  hasActiveSession: boolean;
  /** The active session exists and is known to hold no messages yet. */
  hasFreshActiveSession: boolean;
}

export interface ChatPlaceholderContent {
  title: string;
  body: string;
  action: "open-agents-settings" | null;
}

/** Which hint belongs in the chat window right now. */
export function resolveChatPlaceholderKind(
  input: ChatPlaceholderInput,
): ChatPlaceholderKind {
  if (input.busy || input.hasMessages) return "hidden";
  if (input.agentCount === 0) return "no-agents";
  if (input.hasFreshActiveSession) return "empty-session";
  if (input.sessionCount === 0) return "no-sessions";
  if (!input.hasActiveSession) return "pick-session";
  return "hidden";
}

export const AGENT_SETUP_EXAMPLES = [
  "```cson",
  '"*":',
  '  "pulsar-assistant":',
  "    agents:",
  "      # Any OpenAI-compatible endpoint (llama.cpp, Ollama, LM Studio, OpenAI, ...)",
  "      local:",
  '        type: "openai"',
  '        name: "Local llama.cpp"',
  '        baseUrl: "http://127.0.0.1:8080/v1"',
  '        apiKey: "sk-local"',
  '        defaultModel: "qwen2.5-coder-7b"',
  "",
  "      # ACP-compatible CLI agent",
  "      copilot:",
  '        type: "acp"',
  '        name: "GitHub Copilot"',
  '        command: "copilot --acp --stdio"',
  "",
  "      # Cursor Cloud Agents",
  "      cursor:",
  '        type: "cursor"',
  '        name: "Cursor Cloud"',
  '        baseUrl: "https://api.cursor.com/v1"',
  '        apiKey: "YOUR_CURSOR_API_KEY"',
  '        defaultModel: "claude-4-sonnet"',
  "```",
].join("\n");

export function chatPlaceholderContent(
  kind: ChatPlaceholderKind,
  context: { agentName?: string } = {},
): ChatPlaceholderContent | null {
  if (kind === "hidden") return null;

  if (kind === "no-agents") {
    return {
      title: "No agent configured yet",
      body: [
        "Add at least one agent in **\u2699 \u2192 Edit configuration\u2026**, then reopen this panel.",
        "",
        "The examples below cover every supported provider type \u2014 keep the ones you need.",
        "",
        AGENT_SETUP_EXAMPLES,
      ].join("\n"),
      action: "open-agents-settings",
    };
  }

  if (kind === "no-sessions") {
    const agent = context.agentName ? `**${context.agentName}**` : "an agent";
    return {
      title: "No sessions yet",
      body: `This project has no saved sessions yet. Pick ${agent} in the header and press **+** to start a new one.`,
      action: null,
    };
  }

  if (kind === "empty-session") {
    return {
      title: "Session is empty",
      body: "Describe the task below and send it \u2014 the agent keeps working in this session.",
      action: null,
    };
  }

  return {
    title: "Select a session",
    body: "Sessions of this project are listed above. Choose one, or press **+** to start a new session.",
    action: null,
  };
}
