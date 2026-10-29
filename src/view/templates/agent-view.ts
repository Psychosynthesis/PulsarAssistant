/** Static HTML skeletons for the agent view's control chrome. */

import { DEFAULT_TOOL_CALL_DELAY_MS, MAX_TOOL_ITERATIONS, TOOL_OUTPUT_COMPACT_INTERVAL } from "../../constants";

export const CONFIG_SELECTORS = `
  <div class="pulsar-assistant-config-selectors" style="display:none"></div>
`;

export const TURN_LIMIT_CONTROL = `
  <div class="pulsar-assistant-turn-limit">
    <label for="pulsar-assistant-turn-limit-input">Tool turns</label>
    <input id="pulsar-assistant-turn-limit-input" data-ref="input" type="number" min="1" max="1000" step="1" placeholder="${MAX_TOOL_ITERATIONS}">
  </div>
`;

export const TOOL_DELAY_CONTROL = `
  <div class="pulsar-assistant-turn-limit pulsar-assistant-tool-delay">
    <label for="pulsar-assistant-tool-delay-input">Delay (ms)</label>
    <input id="pulsar-assistant-tool-delay-input" data-ref="input" type="number" min="100" max="60000" step="50" placeholder="${DEFAULT_TOOL_CALL_DELAY_MS}">
  </div>
`;

export const COMPACT_INTERVAL_CONTROL = `
  <div class="pulsar-assistant-turn-limit pulsar-assistant-compact-interval">
    <label for="pulsar-assistant-compact-interval-input" title="Compact tool outputs in context every N tool calls to conserve tokens (0 to disable)">Compact (calls)</label>
    <input id="pulsar-assistant-compact-interval-input" data-ref="input" type="number" min="0" max="1000" step="5" placeholder="${TOOL_OUTPUT_COMPACT_INTERVAL}" title="Compact tool outputs in context every N tool calls to conserve tokens (0 to disable)">
  </div>
`;

export const API_FORMAT_CONTROL = `
  <div class="pulsar-assistant-turn-limit pulsar-assistant-api-format">
    <label for="pulsar-assistant-api-format-select">API</label>
    <select id="pulsar-assistant-api-format-select" data-ref="select">
      <option value="chat-completions">Chat Completions</option>
      <option value="responses">Responses</option>
    </select>
  </div>
`;

export const REASONING_EFFORT_CONTROL = `
  <div class="pulsar-assistant-turn-limit pulsar-assistant-reasoning-effort">
    <label for="pulsar-assistant-reasoning-effort-select">Reasoning</label>
    <select id="pulsar-assistant-reasoning-effort-select" data-ref="select">
      <option value="">Auto</option>
      <option value="none">None</option>
      <option value="low">Low</option>
      <option value="medium">Medium</option>
      <option value="high">High</option>
    </select>
  </div>
`;

export const WEB_SEARCH_CONTROL = `
  <div class="pulsar-assistant-turn-limit pulsar-assistant-web-search">
    <label for="pulsar-assistant-web-search-select">Search</label>
    <select id="pulsar-assistant-web-search-select" data-ref="select">
      <option value="off">Off</option>
      <option value="auto">Auto</option>
      <option value="native">Native</option>
      <option value="local">Local</option>
    </select>
  </div>
`;

export function slashWrapTemplate(menuId: string): string {
  return `
    <div class="pulsar-assistant-slash-wrap">
      <div class="pulsar-assistant-picker-menu pulsar-assistant-slash-menu" data-ref="menu" id="${menuId}" role="listbox" aria-label="Slash commands" style="display:none"></div>
      <div class="pulsar-assistant-slash-hint" data-ref="hint" style="display:none"></div>
    </div>
  `;
}
