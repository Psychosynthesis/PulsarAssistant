import {
  chatPlaceholderContent,
  type ChatPlaceholderKind,
} from "../empty-state-content";
import { renderMarkdown } from "../markdown";
import { elementFromHtml, ref } from "../utils";
import { CHAT_PLACEHOLDER } from "../templates/components";

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
    this.element = elementFromHtml(CHAT_PLACEHOLDER);
    this.titleEl = ref(this.element, "title");
    this.bodyEl = ref(this.element, "body");
    this.actionEl = ref<HTMLButtonElement>(this.element, "action");
    this.actionEl.addEventListener("click", () => {
      this.options.onOpenAgentSettings();
    });
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
