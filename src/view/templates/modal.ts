import { escapeHtml, formatBytes } from "../utils";

/** Static shell for {@link ProjectsStorageModal}. */
export const PROJECTS_STORAGE_MODAL_SHELL = `
  <div class="pulsar-assistant-modal-header">
    <h2 class="pulsar-assistant-modal-title">Pulsar Assistant: Projects &amp; Storage</h2>
    <button
      class="btn btn-default icon icon-x pulsar-assistant-modal-close"
      data-ref="close"
      aria-label="Close"
    ></button>
  </div>
  <div class="pulsar-assistant-modal-body" data-ref="body"></div>
`;

/** Static wrapper for the "Model Context Windows" section. */
export const MODEL_CONTEXT_WINDOWS_SECTION = `
  <div class="pulsar-assistant-modal-section">
    <div class="pulsar-assistant-section-header">
      <h3>Model Context Windows</h3>
      <button class="btn btn-sm" data-ref="edit">Edit in config.cson\u2026</button>
    </div>
    <p class="text-muted">
      Token context limits used for calculating dialog capacity. Add custom
      limits in config.cson under \`pulsar-assistant.modelContextWindows\`.
    </p>
    <div class="pulsar-assistant-table-scroll" data-ref="table-scroll"></div>
  </div>
`;

/** Static wrapper for the "Saved Projects & Storage" section. */
export const PROJECTS_STORAGE_SECTION = `
  <div class="pulsar-assistant-modal-section">
    <h3>Saved Projects &amp; Storage</h3>
    <p class="text-muted">
      Stored sessions, conversation history, and B-tree file indexing cache on disk.
    </p>
    <div class="text-muted" data-ref="loading">Scanning project storage\u2026</div>
  </div>
`;

/** Table header for the model context window list. */
export const CONTEXT_WINDOW_TABLE_HEAD = `
  <tr>
    <th>Model / Family</th>
    <th>Context Limit</th>
    <th>Source</th>
  </tr>
`;

export type ContextWindowSource = "custom" | "default" | "fallback";

export function contextWindowRowHtml(
  name: string,
  limit: number,
  source: ContextWindowSource,
): string {
  const nameHtml =
    source === "fallback"
      ? `<em>${escapeHtml(name)}</em>`
      : source === "custom"
        ? `<strong>${escapeHtml(name)}</strong>`
        : escapeHtml(name);

  const sourceHtml =
    source === "custom"
      ? '<span class="badge badge-info">custom</span>'
      : source === "default"
        ? '<span class="text-muted">default</span>'
        : '<span class="text-muted">fallback</span>';

  const rowClass =
    source === "custom" ? ' class="pulsar-assistant-table-custom-row"' : "";

  return `<tr${rowClass}>
    <td>${nameHtml}</td>
    <td>${limit.toLocaleString()} tokens</td>
    <td>${sourceHtml}</td>
  </tr>`;
}

export function projectStorageRowHtml(row: {
  projectRoot: string;
  sessionCount: number;
  hasTree: boolean;
  diskSizeBytes: number;
}): string {
  const sessions = row.sessionCount > 0 ? `${row.sessionCount} sessions` : "0";
  const tree = row.hasTree ? "tree.json" : "\u2014";

  return `<tr>
    <td class="pulsar-assistant-project-path" title="${escapeHtml(row.projectRoot)}">${escapeHtml(row.projectRoot)}</td>
    <td>${sessions}</td>
    <td>${tree}</td>
    <td>${formatBytes(row.diskSizeBytes)}</td>
  </tr>`;
}

/** Table header for the saved projects list. */
export const PROJECTS_TABLE_HEAD = `
  <tr>
    <th>Project Root</th>
    <th>Sessions</th>
    <th>Tree Index</th>
    <th>Disk Size</th>
    <th>Actions</th>
  </tr>
`;
