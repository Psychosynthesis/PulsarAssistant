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

// src/view/empty-state-content.ts
var empty_state_content_exports = {};
__export(empty_state_content_exports, {
  AGENT_SETUP_EXAMPLES: () => AGENT_SETUP_EXAMPLES,
  chatPlaceholderContent: () => chatPlaceholderContent,
  resolveChatPlaceholderKind: () => resolveChatPlaceholderKind
});
module.exports = __toCommonJS(empty_state_content_exports);
function resolveChatPlaceholderKind(input) {
  if (input.busy || input.hasMessages) return "hidden";
  if (input.agentCount === 0) return "no-agents";
  if (input.hasFreshActiveSession) return "empty-session";
  if (input.sessionCount === 0) return "no-sessions";
  if (!input.hasActiveSession) return "pick-session";
  return "hidden";
}
var AGENT_SETUP_EXAMPLES = [
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
  "```"
].join("\n");
function chatPlaceholderContent(kind, context = {}) {
  if (kind === "hidden") return null;
  if (kind === "no-agents") {
    return {
      title: "No agent configured yet",
      body: [
        "Add at least one agent in **\u2699 \u2192 Edit configuration\u2026**, then reopen this panel.",
        "",
        "The examples below cover every supported provider type \u2014 keep the ones you need.",
        "",
        AGENT_SETUP_EXAMPLES
      ].join("\n"),
      action: "open-agents-settings"
    };
  }
  if (kind === "no-sessions") {
    const agent = context.agentName ? `**${context.agentName}**` : "an agent";
    return {
      title: "No sessions yet",
      body: `This project has no saved sessions yet. Pick ${agent} in the header and press **+** to start a new one.`,
      action: null
    };
  }
  if (kind === "empty-session") {
    return {
      title: "Session is empty",
      body: "Describe the task below and send it \u2014 the agent keeps working in this session.",
      action: null
    };
  }
  return {
    title: "Select a session",
    body: "Sessions of this project are listed above. Choose one, or press **+** to start a new session.",
    action: null
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  AGENT_SETUP_EXAMPLES,
  chatPlaceholderContent,
  resolveChatPlaceholderKind
});
//# sourceMappingURL=empty-state-content.js.map
