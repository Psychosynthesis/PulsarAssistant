/** Static shells for the small view components. */

export const SESSION_LIST_TOGGLE = `
  <button
    class="pulsar-assistant-sessions-toggle icon icon-history"
    aria-label="Sessions"
    aria-haspopup="true"
    aria-expanded="false"
    style="display:none"
  ></button>
`;

export const SESSION_LIST_PANEL = `
  <div class="pulsar-assistant-sessions-list" style="display:none">
    <div class="pulsar-assistant-sessions-header">Sessions</div>
    <div class="pulsar-assistant-sessions-rows" data-ref="rows"></div>
  </div>
`;

export const SESSION_LIST_EMPTY = `
  <div class="pulsar-assistant-sessions-empty">No sessions yet.</div>
`;

export const SESSION_ROW = `
  <div class="pulsar-assistant-session-row">
    <button class="pulsar-assistant-session-entry" data-ref="entry" type="button">
      <span class="pulsar-assistant-session-title" data-ref="title"></span>
      <span class="pulsar-assistant-session-time" data-ref="time"></span>
      <span class="pulsar-assistant-session-agent" data-ref="agent"></span>
    </button>
    <button class="pulsar-assistant-session-delete icon icon-trashcan" data-ref="delete" type="button" aria-label="Delete session"></button>
  </div>
`;

export const CHAT_PLACEHOLDER = `
  <div class="pulsar-assistant-chat-placeholder" style="display:none">
    <div class="pulsar-assistant-chat-placeholder-card">
      <div class="pulsar-assistant-chat-placeholder-title" data-ref="title"></div>
      <div class="pulsar-assistant-chat-placeholder-body" data-ref="body"></div>
      <button
        class="btn btn-primary pulsar-assistant-chat-placeholder-action"
        data-ref="action"
      >Open agent settings</button>
    </div>
  </div>
`;
