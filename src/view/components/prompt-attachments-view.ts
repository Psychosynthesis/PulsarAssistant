import * as path from "path";
import { CompositeDisposable, type TextEditor } from "atom";
import { createElement } from "../utils";
import { fileUri } from "../../util";
import { findOpenEditorForPath, readFileFromDisk } from "../file-navigation";

/**
 * Context attached to the next prompt. Moved out of `agent-view.ts` together
 * with the whole attachments UI (menu, trigger, chips) so the view keeps only
 * the wiring.
 */
export type PendingContext =
  | { kind: "file"; path: string }
  | { kind: "selection"; path: string; rangeText: string };

export type MaterializedContext = {
  kind: "file" | "selection";
  label: string;
  uri: string;
  text: string;
};

export interface PromptAttachmentsHost {
  /** Resolves whether a path may be attached (inside the project roots). */
  isPathInProjectRoots(filePath: string): Promise<boolean>;
  /** Attachments only make sense for agents accepting inline context. */
  supportsEmbeddedContext(): boolean;
  /** The "+" popover is exclusive with the other header popovers. */
  closeOtherMenus(): void;
  onError(message: string): void;
  /** Called whenever the pending list changes (composer state refresh). */
  onItemsChanged(): void;
}

/**
 * Owns the "attach to prompt" control: the "+" popover, the pending context
 * list and the chips strip rendered above the composer.
 */
export class PromptAttachmentsView {
  private readonly subscriptions = new CompositeDisposable();
  private readonly control: HTMLElement;
  private readonly menu: HTMLElement;
  private readonly trigger: HTMLButtonElement;
  private readonly strip: HTMLElement;
  private readonly addSelectionItem: HTMLButtonElement;
  private readonly addFileItem: HTMLButtonElement;
  private menuVisible = false;
  private items: PendingContext[] = [];

  constructor(private readonly host: PromptAttachmentsHost) {
    this.control = this.buildControl();
    this.menu = this.control.querySelector(
      ".pulsar-assistant-config-menu",
    ) as HTMLElement;
    this.trigger = this.control.querySelector(
      ".pulsar-assistant-context-trigger",
    ) as HTMLButtonElement;
    this.addSelectionItem = this.menu.children[0] as HTMLButtonElement;
    this.addFileItem = this.menu.children[1] as HTMLButtonElement;

    this.strip = createElement("div", {
      class: "pulsar-assistant-context-strip",
      style: { display: "none" },
    });
  }

  /** The "+" control placed in the composer toolbar. */
  getControlElement(): HTMLElement {
    return this.control;
  }

  /** The chips strip rendered above the composer. */
  getStripElement(): HTMLElement {
    return this.strip;
  }

  getItems(): PendingContext[] {
    return this.items;
  }

  /** Enables or disables the trigger with the rest of the composer. */
  setEnabled(enabled: boolean): void {
    this.trigger.disabled = !enabled;
  }

  /** The control is only useful for agents accepting inline context. */
  setVisible(visible: boolean): void {
    this.control.style.display = visible ? "" : "none";
  }

  /** Re-evaluates the menu items against the currently active editor. */
  refresh(): void {
    this.refreshMenuItems();
  }

  clear(): void {
    this.items = [];
    this.renderStrip();
    this.refreshMenuItems();
    this.host.onItemsChanged();
  }

  close(): void {
    this.closeContextMenu();
  }

  dispose(): void {
    this.subscriptions.dispose();
    this.control.remove();
    this.strip.remove();
  }

  private buildControl(): HTMLElement {
    const wrapper = createElement("div", {
      class: ["pulsar-assistant-config", "pulsar-assistant-context"],
      style: { display: "none" },
    });

    const menu = createElement("div", {
      class: "pulsar-assistant-config-menu",
      style: { display: "none" },
    });
    menu.setAttribute("role", "menu");

    const addSelectionItem = this.makeMenuItem(
      "Current selection",
      "icon-code",
      () => {
        void this.addSelectionContext(
          atom.workspace.getCenter().getActiveTextEditor(),
        );
      },
    );
    const addFileItem = this.makeMenuItem("Current file", "icon-file", () => {
      void this.addActiveFileContext(
        atom.workspace.getCenter().getActiveTextEditor(),
      );
    });
    menu.appendChild(addSelectionItem);
    menu.appendChild(addFileItem);

    const trigger = createElement("button", {
      class: ["btn", "icon", "icon-plus", "pulsar-assistant-context-trigger"],
    });
    trigger.setAttribute("aria-label", "Attach to prompt");
    trigger.setAttribute("aria-haspopup", "true");
    trigger.setAttribute("aria-expanded", "false");
    this.subscriptions.add(
      atom.tooltips.add(trigger, {
        title: "Attach to prompt",
        placement: "top",
        trigger: "hover",
      }),
    );
    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      this.toggleContextMenu();
    });

    wrapper.appendChild(menu);
    wrapper.appendChild(trigger);

    const onDocClick = (event: MouseEvent) => {
      if (this.menuVisible && !wrapper.contains(event.target as Node))
        this.closeContextMenu();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.menuVisible) {
        this.closeContextMenu();
        trigger.focus();
      }
    };
    document.addEventListener("click", onDocClick);
    document.addEventListener("keydown", onKeyDown);
    this.subscriptions.add({
      dispose: () => {
        document.removeEventListener("click", onDocClick);
        document.removeEventListener("keydown", onKeyDown);
      },
    });

    return wrapper;
  }

  private makeMenuItem(
    label: string,
    iconClass: string,
    onClick: () => void,
  ): HTMLButtonElement {
    const item = createElement("button", {
      class: "pulsar-assistant-config-item",
    });
    item.setAttribute("role", "menuitem");
    const icon = createElement("span", { class: ["icon", iconClass] });
    item.appendChild(icon);
    const name = createElement("span", {
      class: "pulsar-assistant-config-name",
    });
    name.textContent = label;
    item.appendChild(name);
    item.addEventListener("click", () => {
      this.closeContextMenu();
      onClick();
    });
    return item;
  }

  private toggleContextMenu(): void {
    if (this.menuVisible) this.closeContextMenu();
    else this.openContextMenu();
  }

  private openContextMenu(): void {
    if (this.trigger.disabled) return;
    this.host.closeOtherMenus();
    this.refreshMenuItems();
    this.menuVisible = true;
    this.menu.style.display = "";
    this.trigger.setAttribute("aria-expanded", "true");
  }

  closeContextMenu(): void {
    if (!this.menuVisible) return;
    this.menuVisible = false;
    this.menu.style.display = "none";
    this.trigger.setAttribute("aria-expanded", "false");
  }

  private refreshMenuItems(): void {
    const editor = atom.workspace.getCenter().getActiveTextEditor();
    const hasFile = !!editor && !!editor.getPath();
    const embedded = this.host.supportsEmbeddedContext();

    this.addSelectionItem.style.display = embedded ? "" : "none";
    this.addSelectionItem.disabled =
      !hasFile || !editor || !this.lastNonEmptySelection(editor);

    this.addFileItem.style.display = embedded ? "" : "none";
    this.addFileItem.disabled = !hasFile;

    const anyEnabled =
      embedded &&
      (!this.addSelectionItem.disabled || !this.addFileItem.disabled);
    this.trigger.disabled = !anyEnabled;
  }

  private lastNonEmptySelection(editor: TextEditor): string | null {
    const selections = editor.getSelections();
    for (let i = selections.length - 1; i >= 0; i--) {
      const text = selections[i].getText();
      if (text.length > 0) return text;
    }
    return null;
  }

  async addSelectionContext(editor?: TextEditor): Promise<void> {
    const targetEditor =
      editor || atom.workspace.getCenter().getActiveTextEditor();
    if (!targetEditor) return;
    const filePath = targetEditor.getPath();
    if (!filePath) return;
    if (!(await this.host.isPathInProjectRoots(filePath))) {
      this.host.onError("Cannot attach file from outside the project.");
      return;
    }
    const range = targetEditor.getSelectedBufferRange();
    if (range.isEmpty()) return;
    const rangeText = `${range.start.row + 1}-${range.end.row + 1}`;
    this.items = this.items.filter((c) => {
      if (c.kind === "file" && c.path === filePath) return false;
      if (
        c.kind === "selection" &&
        c.path === filePath &&
        c.rangeText === rangeText
      )
        return false;
      return true;
    });
    this.items.push({ kind: "selection", path: filePath, rangeText });
    this.renderStrip();
  }

  async addActiveFileContext(editor?: TextEditor): Promise<void> {
    const targetEditor =
      editor || atom.workspace.getCenter().getActiveTextEditor();
    if (!targetEditor) return;
    const filePath = targetEditor.getPath();
    if (!filePath) return;
    if (!(await this.host.isPathInProjectRoots(filePath))) {
      this.host.onError("Cannot attach file from outside the project.");
      return;
    }
    this.items = this.items.filter((c) => !(c.path === filePath));
    this.items.push({ kind: "file", path: filePath });
    this.renderStrip();
  }

  private clearContext(): void {
    this.items = [];
    this.renderStrip();
  }

  private removeContextItem(index: number): void {
    this.items.splice(index, 1);
    this.renderStrip();
  }

  makeContextChip(
    kind: "file" | "selection",
    label: string,
  ): HTMLElement {
    const chip = createElement("span", {
      class: [
        "pulsar-assistant-context-chip",
        `pulsar-assistant-context-chip--${kind}`,
      ],
    });
    const icon = createElement("span", {
      class: [
        "icon",
        kind === "file" ? "icon-file" : "icon-code",
        "pulsar-assistant-context-chip-icon",
      ],
    });
    const labelSpan = createElement("span", {
      class: "pulsar-assistant-context-chip-label",
    });
    labelSpan.textContent = label;
    chip.appendChild(icon);
    chip.appendChild(labelSpan);
    return chip;
  }

  private renderStrip(): void {
    this.strip.innerHTML = "";
    if (this.items.length === 0) {
      this.strip.style.display = "none";
      this.host.onItemsChanged();
      return;
    }
    this.strip.style.display = "";
    this.items.forEach((item, index) => {
      const label =
        item.kind === "file"
          ? path.basename(item.path)
          : `${path.basename(item.path)}:${item.rangeText}`;
      const chip = this.makeContextChip(item.kind, label);
      const remove = createElement("button", {
        class: ["pulsar-assistant-context-chip-remove", "icon", "icon-x"],
      });
      remove.setAttribute("aria-label", `Remove ${label}`);
      remove.addEventListener("click", () => this.removeContextItem(index));
      chip.appendChild(remove);
      this.strip.appendChild(chip);
    });
    this.host.onItemsChanged();
  }

  /**
   * Turns the pending list into the payload handed to the agent. Throws when an
   * attachment escaped the project while it was pending.
   */
  async materialize(): Promise<MaterializedContext[]> {
    const result: MaterializedContext[] = [];
    for (const item of this.items) {
      if (!(await this.host.isPathInProjectRoots(item.path))) {
        throw new Error(`Attached file is no longer in project: ${item.path}`);
      }
      const editor = findOpenEditorForPath(item.path);
      const baseName = path.basename(item.path);
      if (item.kind === "file") {
        const text = editor
          ? editor.getText()
          : await readFileFromDisk(item.path);
        result.push({
          kind: "file",
          label: baseName,
          uri: fileUri(item.path),
          text,
        });
      } else {
        const parts = item.rangeText.split("-").map(Number);
        const startLine = parts[0] - 1;
        const endLine = parts[1] - 1;
        let text: string;
        if (editor) {
          text = editor.getTextInBufferRange([
            [startLine, 0],
            [endLine + 1, 0],
          ]);
        } else {
          const allLines = (await readFileFromDisk(item.path)).split("\n");
          text = allLines.slice(startLine, endLine + 1).join("\n");
        }
        result.push({
          kind: "selection",
          label: `${baseName}:${item.rangeText}`,
          uri: fileUri(item.path, { start: parts[0], end: parts[1] }),
          text,
        });
      }
    }
    return result;
  }
}
