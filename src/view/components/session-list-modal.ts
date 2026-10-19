import { CompositeDisposable, Disposable, Panel } from "atom";
import { elementFromHtml, ref } from "../utils";
import { SESSION_LIST_EMPTY, SESSION_LIST_TOGGLE } from "../templates/components";
import { renderSessionRows, type SessionListHost } from "./session-list-view";

const SESSION_MODAL_SHELL = `
  <div class="pulsar-assistant-session-modal">
    <div class="pulsar-assistant-sessions-header">Sessions</div>
    <div class="pulsar-assistant-sessions-rows" data-ref="rows"></div>
  </div>
`;

/**
 * Sessions button plus the modal dialog it opens. Wraps the shared row
 * renderer in an atom.workspace modal panel (same pattern as the other modal
 * dialogs) instead of anchoring an inline panel to the chat view.
 */
export class SessionListModal {
  private readonly toggle: HTMLButtonElement;
  private readonly tooltips = new Set<Disposable>();
  private readonly toggleTooltip: Disposable;
  private readonly keydownHandler: (event: KeyboardEvent) => void;
  private modal: Panel | null = null;
  private rowsHost: HTMLElement | null = null;
  private available = false;
  private busy = false;

  constructor(
    private readonly host: SessionListHost,
    private readonly subscriptions: CompositeDisposable,
  ) {
    this.toggle = elementFromHtml<HTMLButtonElement>(SESSION_LIST_TOGGLE);
    this.toggleTooltip = this.host.addTooltip(this.toggle, "Sessions");
    this.toggle.addEventListener("click", () => this.toggleModal());
    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") this.close();
    };
  }

  getToggleElement(): HTMLButtonElement {
    return this.toggle;
  }

  setBusy(busy: boolean): void {
    this.busy = busy;
    this.toggle.disabled = busy;
  }

  /** Opens the dialog when there is something to list. */
  openIfAvailable(): void {
    if (this.modal || !this.available || this.busy) return;
    this.open();
  }

  refresh(): void {
    this.available = this.host.getSessions().length > 0;
    this.toggle.style.display = this.available ? "" : "none";
    this.toggle.setAttribute("aria-expanded", String(Boolean(this.modal)));

    if (!this.rowsHost) return;
    this.renderRows(this.rowsHost);
    if (this.host.getSessions().length === 0) this.close();
  }

  dispose(): void {
    this.close();
    for (const tooltip of this.tooltips) tooltip.dispose();
    this.tooltips.clear();
    this.toggleTooltip.dispose();
    this.toggle.remove();
  }

  private toggleModal(): void {
    if (this.modal) {
      this.close();
    } else {
      this.open();
    }
  }

  private open(): void {
    this.host.onOpen();
    const shell = elementFromHtml(SESSION_MODAL_SHELL);
    this.rowsHost = ref(shell, "rows");
    this.renderRows(this.rowsHost);
    if (this.host.getSessions().length === 0) {
      this.rowsHost.appendChild(elementFromHtml(SESSION_LIST_EMPTY));
    }

    this.modal = atom.workspace.addModalPanel({
      item: shell,
      visible: true,
      autoFocus: true,
    });
    document.addEventListener("keydown", this.keydownHandler);
    this.toggle.setAttribute("aria-expanded", "true");
  }

  close(): void {
    if (!this.modal) return;
    document.removeEventListener("keydown", this.keydownHandler);
    this.modal.destroy();
    this.modal = null;
    this.rowsHost = null;
    for (const tooltip of this.tooltips) tooltip.dispose();
    this.tooltips.clear();
    this.toggle.setAttribute("aria-expanded", "false");
  }

  private renderRows(rowsHost: HTMLElement): void {
    renderSessionRows(this.host, rowsHost, this.tooltips);
  }
}
