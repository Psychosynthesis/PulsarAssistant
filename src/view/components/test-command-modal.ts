import { Panel } from "atom";
import { createElement } from "../utils";

export type ProjectCommandModalOptions = {
  projectRoot: string;
  title?: string;
  label?: string;
  placeholder?: string;
  currentCommand: string | null;
  onSave: (command: string | null) => void;
};

export class ProjectCommandModal {
  private panel: Panel | null = null;
  readonly element: HTMLElement;
  private input!: HTMLInputElement;
  private keydownHandler: (event: KeyboardEvent) => void;

  constructor(private readonly options: ProjectCommandModalOptions) {
    this.element = createElement("div", { class: ["pulsar-assistant-projects-modal", "pulsar-assistant-test-command-modal", "overlay", "modal"], style: { maxWidth: "520px", overflow: "visible" } });

    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        this.close();
      }
    };
  }

  static show(options: ProjectCommandModalOptions): ProjectCommandModal {
    const modal = new ProjectCommandModal(options);
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
    const command = this.input.value.trim();
    this.options.onSave(command.length > 0 ? command : null);
    this.close();
  }

  private render(): void {
    this.element.innerHTML = "";

    const header = createElement("div", { class: "pulsar-assistant-modal-header" });

    const title = createElement("h2", { class: "pulsar-assistant-modal-title" });
    title.textContent = this.options.title ?? "Set command";

    const closeBtn = createElement("button", { class: ["btn", "btn-default", "icon", "icon-x", "pulsar-assistant-modal-close"] });
    closeBtn.setAttribute("aria-label", "Close");
    closeBtn.addEventListener("click", () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);
    this.element.appendChild(header);

    const label = createElement("label", { class: "pulsar-assistant-test-command-label", style: { display: "block", marginBottom: "6px" } });
    label.textContent =
      this.options.label ?? "Command used by the tool in this project";
    label.htmlFor = "pulsar-assistant-test-command-input";

    this.input = createElement("input", { id: "pulsar-assistant-test-command-input", class: ["input-text", "native-key-bindings", "pulsar-assistant-test-command-input"], style: { width: "100%", boxSizing: "border-box" } });
    this.input.type = "text";
    this.input.placeholder = this.options.placeholder ?? "npm test";
    this.input.spellcheck = false;
    this.input.value = this.options.currentCommand ?? "";
    this.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.save();
      }
    });

    const hint = createElement("div", { class: "pulsar-assistant-test-command-hint", style: { marginTop: "8px", color: "var(--text-color-subtle)", fontSize: "0.85em" } });
    hint.textContent =
      "Run from the project root without a shell. Leave empty to clear.";

    const actions = createElement("div", { class: "pulsar-assistant-modal-actions", style: { display: "flex", justifyContent: "flex-end", gap: "8px", marginTop: "16px" } });

    const cancelBtn = createElement("button", { class: "btn" });
    cancelBtn.textContent = "Cancel";
    cancelBtn.addEventListener("click", () => this.close());

    const saveBtn = createElement("button", { class: ["btn", "btn-primary"] });
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

export type TestCommandModalOptions = ProjectCommandModalOptions;

export class BuildCommandModal {
  static show(options: ProjectCommandModalOptions): ProjectCommandModal {
    return ProjectCommandModal.show({
      ...options,
      title: options.title ?? "Set build command",
      label:
        options.label ?? "Command used by the run_build tool in this project",
      placeholder: options.placeholder ?? "npm run build",
    });
  }
}

export class TestCommandModal {
  static show(options: TestCommandModalOptions): ProjectCommandModal {
    return ProjectCommandModal.show({
      ...options,
      title: options.title ?? "Set test command",
      label:
        options.label ?? "Command used by the run_tests tool in this project",
      placeholder: options.placeholder ?? "npm test",
    });
  }
}
