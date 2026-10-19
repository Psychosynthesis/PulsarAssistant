import { Panel } from "atom";
import { createElement } from "../utils";

export type ProxyModalOptions = {
  currentUrl: string | null;
  onSave: (url: string | null) => void;
};

export class ProxyModal {
  private panel: Panel | null = null;
  readonly element: HTMLElement;
  private input!: HTMLInputElement;
  private keydownHandler: (event: KeyboardEvent) => void;

  constructor(private readonly options: ProxyModalOptions) {
    this.element = createElement("div", {
      class: [
        "pulsar-assistant-projects-modal",
        "pulsar-assistant-proxy-modal",
        "overlay",
        "modal",
      ],
      style: { maxWidth: "520px", overflow: "visible" },
    });

    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.close();
      }
    };
  }

  static show(options: ProxyModalOptions): ProxyModal {
    const modal = new ProxyModal(options);
    modal.render();
    modal.panel = atom.workspace.addModalPanel({
      item: modal.element,
      visible: true,
    });
    document.addEventListener("keydown", modal.keydownHandler, true);
    modal.input.focus();
    modal.input.select();
    return modal;
  }

  close(): void {
    document.removeEventListener("keydown", this.keydownHandler, true);
    this.panel?.destroy();
    this.panel = null;
    this.element.remove();
  }

  private save(): void {
    const url = this.input.value.trim();
    this.options.onSave(url.length > 0 ? url : null);
    this.close();
  }

  private render(): void {
    this.element.innerHTML = "";

    const header = createElement("div", {
      class: "pulsar-assistant-modal-header",
    });

    const title = createElement("h2", {
      class: "pulsar-assistant-modal-title",
    });
    title.textContent = "Set proxy";

    const closeBtn = createElement("button", {
      class: [
        "btn",
        "btn-default",
        "icon",
        "icon-x",
        "pulsar-assistant-modal-close",
      ],
    });
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    this.element.appendChild(header);

    const label = createElement("label", {
      class: "pulsar-assistant-proxy-label",
      style: { display: "block", marginBottom: "6px" },
    });
    label.textContent = "HTTP(S) proxy used for all model API requests";
    label.htmlFor = "pulsar-assistant-proxy-input";

    this.input = createElement("input", {
      id: "pulsar-assistant-proxy-input",
      class: [
        "input-text",
        "native-key-bindings",
        "pulsar-assistant-proxy-input",
      ],
      style: { width: "100%", boxSizing: "border-box" },
    });
    this.input.type = "text";
    this.input.placeholder = "http://user:pass@host:port";
    this.input.spellcheck = false;
    this.input.value = this.options.currentUrl ?? "";
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.save();
      }
    });

    const hint = createElement("div", {
      class: "pulsar-assistant-proxy-hint",
      style: {
        marginTop: "8px",
        color: "var(--text-color-subtle)",
        fontSize: "0.85em",
      },
    });
    hint.textContent =
      "http:// or https://, optionally with credentials (http://USER:PASS@HOST:PORT). Leave empty for a direct connection.";

    const actions = createElement("div", {
      class: "pulsar-assistant-modal-actions",
      style: {
        display: "flex",
        justifyContent: "flex-end",
        gap: "8px",
        marginTop: "16px",
      },
    });

    const cancelBtn = createElement("button", { class: "btn" });
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = createElement("button", {
      class: ["btn", "btn-primary"],
    });
    saveBtn.textContent = "Save";
    saveBtn.addEventListener("click", () => this.save());

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    this.element.appendChild(label);
    this.element.appendChild(this.input);
    this.element.appendChild(hint);
    this.element.appendChild(actions);
  }
}
