import { CompositeDisposable } from "atom";
import type { ModelInfo } from "./model-info";
import { createElement } from "./utils";

// A dropdown for the panel-local provider model choice. It deliberately owns only
// presentation: the view keeps the selected model and fetches the model list.
export class ModelSelector {
  readonly element: HTMLElement;
  private button: HTMLButtonElement;
  private menu: HTMLElement;
  private tooltips = new CompositeDisposable();
  private menuVisible = false;

  constructor(
    private readonly onSelect: (id: string) => void,
    private readonly disabled: () => boolean,
    private readonly disabledReason?: () => string | null,
    private readonly closeSiblings?: () => void,
  ) {
    this.element = createElement("div", { class: ["pulsar-assistant-config", "pulsar-assistant-model-selector"] });

    this.menu = createElement("div", { class: ["pulsar-assistant-picker-menu", "pulsar-assistant-model-menu"], style: { display: "none" } });
    this.menu.setAttribute("role", "menu");

    this.button = createElement("button", { class: ["btn", "pulsar-assistant-config-trigger", "pulsar-assistant-model-trigger"] });
    this.button.setAttribute("aria-haspopup", "true");
    this.button.setAttribute("aria-expanded", "false");
    this.button.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleMenu();
    });

    this.element.appendChild(this.menu);
    this.element.appendChild(this.button);
  }

  contains(node: Node): boolean {
    return this.element.contains(node);
  }

  focusButton(): void {
    this.button.focus();
  }

  get isOpen(): boolean {
    return this.menuVisible;
  }

  toggleMenu(): void {
    if (this.menuVisible) this.closeMenu();
    else this.openMenu();
  }

  openMenu(): void {
    if (this.button.disabled) return;
    this.closeSiblings?.();
    this.menuVisible = true;
    this.menu.style.display = "";
    this.button.setAttribute("aria-expanded", "true");
  }

  closeMenu(): void {
    if (!this.menuVisible) return;
    this.menuVisible = false;
    this.menu.style.display = "none";
    this.button.setAttribute("aria-expanded", "false");
  }

  updateDisabled(): void {
    this.button.disabled = this.disabled();
  }

  render(
    selectedId: string | null,
    models: ModelInfo[] | null,
    loading: boolean,
  ): void {
    this.closeMenu();
    this.tooltips.dispose();
    this.tooltips = new CompositeDisposable();

    this.menu.replaceChildren();

    if (loading) {
      this.button.textContent = selectedId ?? "Loading models\u2026";
      this.button.disabled = true;
      return;
    }

    if (!models) {
      this.button.textContent = selectedId ?? "Model list unavailable";
      this.button.disabled = true;
      const tip = atom.tooltips.add(this.button, {
        title: "Model list unavailable. Set the exact model in agent config.",
        placement: "top",
        trigger: "hover",
      });
      this.tooltips.add(tip);
      return;
    }

    this.button.textContent = selectedId ?? "Select model";
    this.updateDisabled();
    const disabledReason = this.disabledReason?.();
    if (disabledReason) {
      const tip = atom.tooltips.add(this.button, {
        title: disabledReason,
        placement: "top",
        trigger: "hover",
      });
      this.tooltips.add(tip);
    }

    for (const model of models) {
      const item = createElement("button", { class: ["pulsar-assistant-picker-item", "pulsar-assistant-model-item"] });
      item.setAttribute("role", "menuitem");
      if (model.id === selectedId) {
        item.classList.add("is-active");
        item.setAttribute("aria-current", "true");
      }
      item.textContent = model.id;
      if (model.description) {
        this.tooltips.add(
          atom.tooltips.add(item, {
            title: model.description,
            html: false,
            placement: "left",
            class: "pulsar-assistant-tooltip",
          }),
        );
      }
      item.addEventListener("click", () => {
        this.closeMenu();
        this.onSelect(model.id);
      });
      this.menu.appendChild(item);
    }
  }

  dispose(): void {
    this.closeMenu();
    this.tooltips.dispose();
    this.element.remove();
  }
}
