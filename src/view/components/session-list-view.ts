import type { Disposable } from "atom";
import type { ProjectSessionRow } from "../../session/project-sessions";
import { elementFromHtml, ref } from "../utils";
import {
  SESSION_LIST_EMPTY,
  SESSION_LIST_PANEL,
  SESSION_LIST_TOGGLE,
  SESSION_ROW,
} from "../templates/components";

export interface SessionListHost {
  /** Rows to render; the host owns the data. */
  getSessions: () => ProjectSessionRow[];
  getActiveSessionId: () => string | null;
  /** Called whenever the panel is shown, so the host can refresh the data. */
  onOpen: () => void;
  onSelect: (id: string, cwd: string | null) => void;
  onDelete: (id: string, cwd: string | null) => void;
  addTooltip: (element: HTMLElement, title: string) => Disposable;
}

/** Render rows into `rowsHost`, replacing previous content and tooltips. */
export function renderSessionRows(
  host: SessionListHost,
  rowsHost: HTMLElement,
  tooltips: Set<Disposable>,
): void {
  for (const tooltip of tooltips) tooltip.dispose();
  tooltips.clear();
  rowsHost.replaceChildren();

  const sessions = host.getSessions();
  if (sessions.length === 0) {
    rowsHost.appendChild(elementFromHtml(SESSION_LIST_EMPTY));
    return;
  }

  const activeId = host.getActiveSessionId();
  for (const session of sessions) {
    rowsHost.appendChild(
      renderSessionRow(host, tooltips, session, session.id === activeId),
    );
  }
}

function renderSessionRow(
  host: SessionListHost,
  tooltips: Set<Disposable>,
  session: ProjectSessionRow,
  isActive: boolean,
): HTMLElement {
  const row = elementFromHtml(SESSION_ROW);
  const entry = ref<HTMLButtonElement>(row, "entry");
  const title = ref(row, "title");
  const time = ref(row, "time");
  const badge = ref(row, "agent");
  const deleteBtn = ref<HTMLButtonElement>(row, "delete");

  if (isActive) row.classList.add("is-active");
  if (session.agentLabel) {
    row.classList.add("is-foreign");
    row.dataset.agent = session.agentLabel;
  }

  if (isActive) entry.setAttribute("aria-current", "true");
  title.textContent = session.title;

  if (session.time) {
    time.textContent = session.time;
  } else {
    time.remove();
  }

  if (session.agentLabel) {
    badge.textContent = session.agentLabel;
    tooltips.add(
      host.addTooltip(
        entry,
        `Other agent: ${session.agentLabel}. Switch the agent to open this session.`,
      ),
    );
  } else {
    badge.remove();
  }

  if (!isActive) {
    entry.addEventListener("click", () =>
      host.onSelect(session.id, session.cwd),
    );
  } else {
    entry.disabled = true;
  }

  if (session.deletable) {
    tooltips.add(host.addTooltip(deleteBtn, "Delete session"));
    deleteBtn.addEventListener("click", (event) => {
      event.stopPropagation();
      host.onDelete(session.id, session.cwd);
    });
  } else {
    deleteBtn.remove();
  }

  return row;
}

/**
 * Sessions button plus the panel it toggles. Owns the DOM and the row
 * rendering; the host only supplies data and reactions.
 */
export class SessionListView {
  private readonly toggle: HTMLButtonElement;
  private readonly panel: HTMLElement;
  private readonly rowsHost: HTMLElement;
  private readonly tooltips = new Set<Disposable>();
  private readonly toggleTooltip: Disposable;
  private open = false;
  private available = false;
  private busy = false;

  constructor(private readonly host: SessionListHost) {
    this.toggle = elementFromHtml<HTMLButtonElement>(SESSION_LIST_TOGGLE);
    this.toggleTooltip = this.host.addTooltip(this.toggle, "Sessions");
    this.toggle.addEventListener("click", () => {
      if (this.open) {
        this.close();
      } else {
        this.openPanel();
      }
    });

    this.panel = elementFromHtml(SESSION_LIST_PANEL);
    this.rowsHost = ref(this.panel, "rows");
  }

  getToggleElement(): HTMLButtonElement {
    return this.toggle;
  }

  getPanelElement(): HTMLElement {
    return this.panel;
  }

  isOpen(): boolean {
    return this.open;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.toggle.disabled = busy;
  }

  openPanel(): void {
    if (this.open) return;
    this.open = true;
    this.host.onOpen();
    this.syncVisibility();
  }

  /** Opens the panel when there is something to list. */
  openIfAvailable(): void {
    if (this.open || !this.available) return;
    this.open = true;
    this.host.onOpen();
    this.syncVisibility();
  }

  close(): void {
    if (!this.open) return;
    this.open = false;
    this.syncVisibility();
  }

  /** Re-render rows; also drops the panel when nothing is left to show. */
  refresh(): void {
    renderSessionRows(this.host, this.rowsHost, this.tooltips);

    const sessions = this.host.getSessions();
    this.available = sessions.length > 0;
    if (!this.available) this.open = false;
    this.syncVisibility();
  }

  dispose(): void {
    for (const tooltip of this.tooltips) tooltip.dispose();
    this.tooltips.clear();
    this.toggleTooltip.dispose();
    this.toggle.remove();
    this.panel.remove();
  }

  private syncVisibility(): void {
    this.toggle.style.display = this.available ? "" : "none";
    this.toggle.setAttribute("aria-expanded", String(this.open));
    this.panel.style.display = this.open && this.available ? "" : "none";
    if (this.busy) this.toggle.disabled = true;
  }
}
