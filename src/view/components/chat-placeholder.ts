import {
  chatPlaceholderContent,
  type ChatPlaceholderKind,
} from "../empty-state-content";
import { renderMarkdown } from "../markdown";
import { createElement } from "../utils";

export interface ChatPlaceholderOptions {
  /** Same action as the settings menu item for editing the agent config. */
  onOpenAgentSettings: () => void;
  /** Name of the agent the user is about to start, when known. */
  agentName?: () => string | undefined;
}

/**
 * Hint shown in the middle of the chat window while there is nothing to read:
 * no agent configured, no sessions yet, or a session waiting to be picked.
 */
export class ChatPlaceholderView {
  private readonly element: HTMLElement;
  private readonly titleEl: HTMLElement;
  private readonly bodyEl: HTMLElement;
  private readonly actionEl: HTMLButtonElement;
  private kind: ChatPlaceholderKind = "hidden";

  constructor(private readonly options: ChatPlaceholderOptions) {
    this.element = createElement("div", {
      class: "pulsar-assistant-chat-placeholder",
    });
    this.element.style.display = "none";

    const card = createElement("div", {
      class: "pulsar-assistant-chat-placeholder-card",
    });
    this.titleEl = createElement("div", {
      class: "pulsar-assistant-chat-placeholder-title",
    });
    this.bodyEl = createElement("div", {
      class: "pulsar-assistant-chat-placeholder-body",
    });
    this.actionEl = createElement("button", {
      class: ["btn", "btn-primary", "pulsar-assistant-chat-placeholder-action"],
    });
    this.actionEl.textContent = "Open agent settings";
    this.actionEl.addEventListener("click", () => {
      this.options.onOpenAgentSettings();
    });

    card.appendChild(this.titleEl);
    card.appendChild(this.bodyEl);
    card.appendChild(this.actionEl);
    this.element.appendChild(card);
  }

  getElement(): HTMLElement {
    return this.element;
  }

  getKind(): ChatPlaceholderKind {
    return this.kind;
  }

  setState(kind: ChatPlaceholderKind): void {
    if (kind === this.kind) return;
    this.kind = kind;

    const content = chatPlaceholderContent(kind, {
      agentName: this.options.agentName?.(),
    });
    if (!content) {
      this.element.style.display = "none";
      this.bodyEl.innerHTML = "";
      return;
    }

    this.titleEl.textContent = content.title;
    this.bodyEl.innerHTML = "";
    renderMarkdown(this.bodyEl, content.body);
    this.actionEl.style.display = content.action ? "" : "none";
    this.element.style.display = "";
  }

  dispose(): void {
    this.element.remove();
  }
}
