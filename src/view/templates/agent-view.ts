/** Static HTML skeletons for the agent view's control chrome. */

export const CONFIG_SELECTORS = `
  <div class="pulsar-assistant-config-selectors" style="display:none"></div>
`;

export const TURN_LIMIT_CONTROL = `
  <div class="pulsar-assistant-turn-limit">
    <label for="pulsar-assistant-turn-limit-input">Tool turns</label>
    <input id="pulsar-assistant-turn-limit-input" data-ref="input" type="number" min="1" max="1000" step="1" placeholder="200">
  </div>
`;

export const TOOL_DELAY_CONTROL = `
  <div class="pulsar-assistant-turn-limit pulsar-assistant-tool-delay">
    <label for="pulsar-assistant-tool-delay-input">Delay (ms)</label>
    <input id="pulsar-assistant-tool-delay-input" data-ref="input" type="number" min="100" max="60000" step="50" placeholder="500">
  </div>
`;

export function slashComposerHtml(menuId: string): string {
  return `
    <div class="pulsar-assistant-slash-wrap">
      <div class="pulsar-assistant-picker-menu pulsar-assistant-slash-menu" data-ref="menu" id="${menuId}" role="listbox" aria-label="Slash commands" style="display:none"></div>
      <div class="pulsar-assistant-slash-hint" data-ref="hint" style="display:none"></div>
    </div>
  `;
}
