import { CompositeDisposable, Disposable } from "atom";
import type * as acp from "@agentclientprotocol/sdk";
import { createElement, elementFromHtml, ref } from "../utils";
import { slashWrapTemplate } from "../templates/agent-view";

export interface SlashComposerHost {
  /** True while a request is in flight — the menu must not open then. */
  isBusy(): boolean;
  /** Available commands for the currently active (ACP) backend. */
  getCommands(): acp.AvailableCommand[];
  /** Slash commands only exist for ACP backends; gate on the live target. */
  isEnabled(): boolean;
}

/**
 * Owns the `/` command picker rendered above the composer textarea:
 * filtering, keyboard navigation, hint display and outside-click dismissal.
 *
 * The host (AgentView) only has to supply the live command list and a busy
 * flag; every low-level DOM/keydown detail lives here.
 */
export class SlashComposer {
  readonly element: HTMLElement;
  private readonly menuId: string;
  private readonly menu: HTMLElement;
  private readonly hint: HTMLElement;
  private hintCommand: string | null = null;
  private matches: acp.AvailableCommand[] = [];
  private activeIndex = 0;
  private menuOpen = false;
  private readonly subscriptions = new CompositeDisposable();

  constructor(
    private readonly host: SlashComposerHost,
    private readonly input: HTMLTextAreaElement,
    private readonly onSelect: (command: acp.AvailableCommand) => void = () => {},
  ) {
    this.menuId = `pulsar-assistant-slash-menu-${Math.random().toString(36).slice(2, 9)}`;
    this.element = elementFromHtml(slashWrapTemplate(this.menuId));
    this.menu = ref(this.element, "menu");
    this.hint = ref(this.element, "hint");
    this.element.insertBefore(this.input, this.hint);
    this.input.setAttribute("aria-controls", this.menuId);

    const onDocPointerDown = (event: MouseEvent) => {
      if (this.menuOpen && !this.element.contains(event.target as Node)) {
        this.close();
      }
    };
    document.addEventListener("mousedown", onDocPointerDown, true);
    this.subscriptions.add(
      new Disposable(() =>
        document.removeEventListener("mousedown", onDocPointerDown, true),
      ),
    );
  }

  dispose(): void {
    this.subscriptions.dispose();
  }

  /** Re-read the textarea and re-render the picker for the current query. */
  update(): void {
    if (!this.host.isEnabled()) {
      this.close();
      this.hideHint();
      return;
    }
    if (
      !this.hintCommand ||
      !this.input.value.startsWith(`/${this.hintCommand} `)
    ) {
      this.hideHint();
    }
    const query = this.query();
    if (query === null || this.host.isBusy()) {
      this.close();
      return;
    }
    const lower = query.toLowerCase();
    const matches = this.host
      .getCommands()
      .filter((command) => command.name.toLowerCase().startsWith(lower));
    if (matches.length === 0) {
      this.close();
      return;
    }
    this.matches = matches;
    this.activeIndex = 0;
    this.menuOpen = true;
    this.renderMenu();
    this.menu.style.display = "";
  }

  /** Returns true when the key event was consumed by the picker. */
  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.host.isEnabled()) return false;
    if (!this.menuOpen || this.matches.length === 0) return false;
    switch (event.key) {
      case "ArrowDown":
        event.preventDefault();
        this.moveActive(1);
        return true;
      case "ArrowUp":
        event.preventDefault();
        this.moveActive(-1);
        return true;
      case "Enter":
      case "Tab":
        if (event.key === "Enter" && event.shiftKey) return false;
        event.preventDefault();
        this.accept(this.matches[this.activeIndex]);
        return true;
      case "Escape":
        event.preventDefault();
        this.close();
        return true;
      default:
        return false;
    }
  }

  close(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.matches = [];
    this.activeIndex = 0;
    this.menu.style.display = "none";
    this.menu.innerHTML = "";
    this.input.removeAttribute("aria-activedescendant");
  }

  hideHint(): void {
    this.hintCommand = null;
    this.hint.textContent = "";
    this.hint.style.display = "none";
  }

  private query(): string | null {
    const match = /^\/(\S*)$/.exec(this.input.value);
    return match ? match[1] : null;
  }

  private renderMenu(): void {
    this.menu.innerHTML = "";
    this.matches.forEach((command, index) => {
      const item = createElement("button", {
        class: [
          "pulsar-assistant-picker-item",
          "pulsar-assistant-slash-item",
        ],
        id: `${this.menuId}-item-${index}`,
      });
      item.setAttribute("role", "option");
      item.tabIndex = -1;

      const name = createElement("span", {
        class: "pulsar-assistant-slash-name",
      });
      name.textContent = `/${command.name}`;
      item.appendChild(name);
      if (command.description) {
        const desc = createElement("span", {
          class: "pulsar-assistant-slash-desc",
        });
        desc.textContent = command.description;
        item.appendChild(desc);
      }
      item.addEventListener("mousedown", (event) => {
        event.preventDefault();
        this.accept(command);
      });
      this.menu.appendChild(item);
    });
    this.applyActive();
  }

  private applyActive(): void {
    const items = Array.from(this.menu.children) as HTMLElement[];
    items.forEach((item, index) => {
      const active = index === this.activeIndex;
      item.classList.toggle("is-active", active);
      item.setAttribute("aria-selected", active ? "true" : "false");
      if (active) item.scrollIntoView({ block: "nearest" });
    });
    this.input.setAttribute(
      "aria-activedescendant",
      `${this.menuId}-item-${this.activeIndex}`,
    );
  }

  private moveActive(delta: number): void {
    const count = this.matches.length;
    if (count === 0) return;
    this.activeIndex = (this.activeIndex + delta + count) % count;
    this.applyActive();
  }

  private accept(command: acp.AvailableCommand): void {
    this.close();
    this.input.value = `/${command.name} `;
    this.input.focus();
    this.input.selectionStart = this.input.selectionEnd =
      this.input.value.length;
    if (command.description) this.showHint(command.name, command.description);
    this.onSelect(command);
  }

  private showHint(commandName: string, description: string): void {
    this.hintCommand = commandName;
    this.hint.textContent = description;
    this.hint.style.display = "";
  }
}
