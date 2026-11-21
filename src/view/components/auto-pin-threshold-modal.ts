import { Panel } from "atom";
import { DEFAULT_AUTO_PIN_THRESHOLD } from "../../constants";
import { createElement } from "../utils";

export type AutoPinThresholdModalOptions = {
  projectRoot: string;
  currentThreshold: number | null;
  onSave: (threshold: number | null) => void;
};

export class AutoPinThresholdModal {
  private panel: Panel | null = null;
  readonly element: HTMLElement;
  private input!: HTMLInputElement;
  private errorEl!: HTMLElement;
  private keydownHandler: (event: KeyboardEvent) => void;

  constructor(private readonly options: AutoPinThresholdModalOptions) {
    this.element = createElement("div", {
      class: [
        "pulsar-assistant-projects-modal",
        "pulsar-assistant-test-command-modal",
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

  static show(options: AutoPinThresholdModalOptions): AutoPinThresholdModal {
    const modal = new AutoPinThresholdModal(options);
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
    const raw = this.input.value.trim();
    if (raw.length === 0) {
      this.options.onSave(null);
      this.close();
      return;
    }
    const parsed = Number(raw);
    if (!Number.isInteger(parsed) || parsed < 0) {
      this.errorEl.textContent = "Enter a whole number >= 0 (0 disables auto-pinning).";
      this.errorEl.style.display = "";
      return;
    }
    this.options.onSave(parsed);
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
    title.textContent = "Set auto-pin threshold";

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
      class: "pulsar-assistant-test-command-label",
      style: { display: "block", marginBottom: "6px" },
    });
    label.textContent = "Number of read_file calls before a file is auto-pinned";
    label.htmlFor = "pulsar-assistant-auto-pin-input";

    this.input = createElement("input", {
      id: "pulsar-assistant-auto-pin-input",
      class: [
        "input-text",
        "native-key-bindings",
        "pulsar-assistant-test-command-input",
      ],
      style: { width: "100%", boxSizing: "border-box" },
    });
    this.input.type = "number";
    this.input.min = "0";
    this.input.step = "1";
    this.input.placeholder = String(DEFAULT_AUTO_PIN_THRESHOLD);
    this.input.value =
      this.options.currentThreshold == null
        ? ""
        : String(this.options.currentThreshold);
    this.input.addEventListener("input", () => {
      this.errorEl.style.display = "none";
      this.errorEl.textContent = "";
    });
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.save();
      }
    });

    this.errorEl = createElement("div", {
      class: "text-error",
      style: { display: "none", marginTop: "6px", fontSize: "0.85em" },
    });

    const hint = createElement("div", {
      class: "pulsar-assistant-test-command-hint",
      style: {
        marginTop: "8px",
        color: "var(--text-color-subtle)",
        fontSize: "0.85em",
      },
    });
    hint.textContent = `Set 0 to disable auto-pinning for this project. Leave empty for the default (${DEFAULT_AUTO_PIN_THRESHOLD}).`;

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
    this.element.appendChild(this.errorEl);
    this.element.appendChild(hint);
    this.element.appendChild(actions);
  }
}
