import { createElement } from "../utils";

export interface PinnedFilesHost {
  getPinnedFiles: () => string[];
  unpinFile: (path: string) => Promise<boolean>;
}

/**
 * Horizontal strip of `📌 path/to/file ×` badges shown above the composer.
 * Owns its DOM and re-renders from the host's pinned-file list. The host only
 * supplies data and the unpin reaction.
 */
export class PinnedFilesView {
  private readonly element: HTMLElement;

  constructor(private readonly host: PinnedFilesHost) {
    this.element = createElement("div", {
      class: "pulsar-assistant-pinned-files",
      style: { display: "none" },
    });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  /** Re-renders badges; hides the strip when there is nothing pinned. */
  refresh(): void {
    const files = this.host.getPinnedFiles();
    this.element.replaceChildren();

    if (files.length === 0) {
      this.element.style.display = "none";
      return;
    }

    this.element.style.display = "";
    for (const file of files) {
      this.element.appendChild(this.renderBadge(file));
    }
  }

  private renderBadge(file: string): HTMLElement {
    const badge = createElement("span", {
      class: "pulsar-assistant-pinned-badge",
    });
    badge.appendChild(document.createTextNode(`\u{1F4CC} ${file} `));

    const remove = createElement("button", {
      class: "pulsar-assistant-pinned-remove",
    });
    remove.textContent = "\u00d7";
    remove.setAttribute("aria-label", `Unpin ${file}`);
    remove.addEventListener("click", () => {
      void this.host.unpinFile(file);
    });

    badge.appendChild(remove);
    return badge;
  }
}
