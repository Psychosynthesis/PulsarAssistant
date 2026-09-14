import { createElement } from "../utils";

export class ComposerStatusBar {
  private element: HTMLElement;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    this.element = createElement("div", {
      class: "pulsar-assistant-composer-status-bar",
      style: {
        minHeight: "18px",
        fontSize: "11px",
        lineHeight: "18px",
        color: "#6c99bb",
        padding: "2px 8px 0 8px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        display: "none",
        userSelect: "text",
      },
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  /**
   * Shows a status note or reasoning thought.
   * If durationMs is provided, automatically clears after that duration.
   */
  setText(text: string, durationMs?: number): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      this.clear();
      return;
    }

    this.element.textContent = trimmed;
    this.element.title = trimmed;
    this.element.style.display = "block";

    if (durationMs && durationMs > 0) {
      this.timer = setTimeout(() => {
        this.clear();
      }, durationMs);
    }
  }

  clear(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.element.textContent = "";
    this.element.removeAttribute("title");
    this.element.style.display = "none";
  }
}
