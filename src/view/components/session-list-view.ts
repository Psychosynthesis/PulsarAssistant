import type { Disposable } from "atom";
import type { ProjectSessionRow } from "../../session/project-sessions";
import { createElement } from "../utils";

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
    this.toggle = createElement("button", {
      class: [
        "pulsar-assistant-sessions-toggle",
        "icon",
        "icon-history",
      ],
      style: { display: "none" },
    });
    this.toggle.setAttribute("aria-label", "Sessions");
    this.toggle.setAttribute("aria-haspopup", "true");
    this.toggle.setAttribute("aria-expanded", "false");
    this.toggleTooltip = this.host.addTooltip(this.toggle, "Sessions");
    this.toggle.addEventListener("click", () => {
      if (this.open) {
        this.close();
      } else {
        this.openPanel();
      }
    });

    this.panel = createElement("div", {
      class: "pulsar-assistant-sessions-list",
      style: { display: "none" },
    });
    const header = createElement("div", {
      class: "pulsar-assistant-sessions-header",
    });
    header.textContent = "Sessions";
    this.rowsHost = createElement("div", {
      class: "pulsar-assistant-sessions-rows",
    });
    this.panel.appendChild(header);
    this.panel.appendChild(this.rowsHost);
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
    for (const tooltip of this.tooltips) tooltip.dispose();
    this.tooltips.clear();
    this.rowsHost.innerHTML = "";

    const sessions = this.host.getSessions();
    this.available = sessions.length > 0;
    if (!this.available) this.open = false;

    if (sessions.length === 0) {
      const empty = createElement("div", {
        class: "pulsar-assistant-sessions-empty",
      });
      empty.textContent = "No sessions yet.";
      this.rowsHost.appendChild(empty);
      this.syncVisibility();
      return;
    }

    const activeId = this.host.getActiveSessionId();
    for (const session of sessions) {
      this.rowsHost.appendChild(this.renderRow(session, session.id === activeId));
    }
    this.syncVisibility();
  }

  dispose(): void {
    for (const tooltip of this.tooltips) tooltip.dispose();
    this.tooltips.clear();
    this.toggleTooltip.dispose();
    this.toggle.remove();
    this.panel.remove();
  }

  private renderRow(
    session: ProjectSessionRow,
    isActive: boolean,
  ): HTMLElement {
    const row = createElement("div", {
      class: "pulsar-assistant-session-row",
    });
    if (isActive) row.classList.add("is-active");
    if (!session.selectable) row.classList.add("is-foreign");
    if (session.agentLabel) row.dataset.agent = session.agentLabel;

    const entry = createElement("button", {
      class: "pulsar-assistant-session-entry",
    });
    entry.type = "button";
    if (isActive) entry.setAttribute("aria-current", "true");

    const title = createElement("span", {
      class: "pulsar-assistant-session-title",
    });
    title.textContent = session.title;
    entry.appendChild(title);

    if (session.time) {
      const time = createElement("span", {
        class: "pulsar-assistant-session-time",
      });
      time.textContent = session.time;
      entry.appendChild(time);
    }

    if (session.agentLabel) {
      const badge = createElement("span", {
        class: "pulsar-assistant-session-agent",
      });
      badge.textContent = session.agentLabel;
      entry.appendChild(badge);
      this.tooltips.add(
        this.host.addTooltip(
          entry,
          `Other agent: ${session.agentLabel}. Switch the agent to open this session.`,
        ),
      );
    } else if (!session.selectable) {
      this.tooltips.add(
        this.host.addTooltip(entry, "Start the agent to open this session."),
      );
    }

    if (session.selectable && !isActive) {
      entry.addEventListener("click", () =>
        this.host.onSelect(session.id, session.cwd),
      );
    } else {
      entry.disabled = true;
    }
    row.appendChild(entry);

    if (session.deletable) {
      const deleteBtn = createElement("button", {
        class: ["pulsar-assistant-session-delete", "icon", "icon-trashcan"],
      });
      deleteBtn.type = "button";
      deleteBtn.setAttribute("aria-label", "Delete session");
      this.tooltips.add(this.host.addTooltip(deleteBtn, "Delete session"));
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        this.host.onDelete(session.id, session.cwd);
      });
      row.appendChild(deleteBtn);
    }

    return row;
  }

  private syncVisibility(): void {
    this.toggle.style.display = this.available ? "" : "none";
    this.toggle.setAttribute("aria-expanded", String(this.open));
    this.panel.style.display = this.open && this.available ? "" : "none";
    if (this.busy) this.toggle.disabled = true;
  }
}
