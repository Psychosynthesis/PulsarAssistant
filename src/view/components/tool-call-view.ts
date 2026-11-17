import type * as acp from "@agentclientprotocol/sdk";
import type { Disposable } from "atom";
import { createElement } from "../utils";

export interface ToolView {
  element: HTMLElement;
  heading: HTMLElement;
  title: HTMLElement;
  status: HTMLElement;
  chevron: HTMLButtonElement;
  body: HTMLElement;
  details: HTMLElement;
  expanded: boolean;
  collapsible: boolean;
  location: acp.ToolCallLocation | null;
  locationTooltip: Disposable | null;
  pinButton: HTMLButtonElement | null;
  readFile: boolean;
}

export type ToolUpdate = {
  toolCallId: string;
  status?: acp.ToolCallStatus;
  title?: string;
  name?: string | null;
  kind?: acp.ToolKind;
  rawInput?: unknown;
  rawOutput?: unknown;
  content?: acp.ToolCallContent[];
  locations?: acp.ToolCallLocation[];
};

export interface ToolCallHost {
  openLocation: (path: string, line?: number) => Promise<void>;
  displayPath?: (path: string) => string;
  scheduleFollow?: (path: string, line?: number | null) => void;
  followAgent?: boolean;
  addTooltipDisposable: (d: Disposable) => void;
  onBeforeNewToolCall?: () => void;
  scrollToBottom: () => void;
  renderToolContent?: (item: acp.ToolCallContent) => HTMLElement;
  makeButton?: (label: string, onClick: () => void) => HTMLButtonElement;
  onDeleteToolCall?: (toolCallId: string) => void;
  pinFile?: (path: string) => void;
  isPinned?: (path: string) => boolean;
}

function setCollapsed(view: ToolView, collapsed: boolean): void {
  view.expanded = !collapsed;
  view.body.style.display = collapsed ? "none" : "";
  view.chevron.classList.toggle("expanded", !collapsed);
  view.chevron.setAttribute("aria-expanded", String(!collapsed));
  view.chevron.title = collapsed ? "Show details" : "Hide details";
}

function applyStatus(view: ToolView, status: string | undefined): void {
  const state = status || "pending";
  view.element.dataset.status = state;
  view.status.replaceChildren();
  if (state === "in_progress" || state === "pending") {
    view.status.appendChild(
      createElement("span", {
        class: ["icon", "icon-sync", "pulsar-assistant-spin"],
      }),
    );
  } else if (state === "failed") {
    view.status.appendChild(
      createElement("span", { class: ["icon", "icon-alert"] }),
    );
  }
}

export class ToolCallManager {
  private toolViews = new Map<string, ToolView>();
  private host: ToolCallHost;

  constructor(host: ToolCallHost) {
    this.host = host;
  }

  getToolView(id: string): ToolView | undefined {
    return this.toolViews.get(id);
  }

  clear(): void {
    for (const view of this.toolViews.values()) {
      view.locationTooltip?.dispose();
    }
    this.toolViews.clear();
  }

  renderToolContent(item: acp.ToolCallContent): HTMLElement {
    if (item.type === "content") {
      const block = item.content;
      if (block.type === "text") {
        const p = createElement("div", { class: "pulsar-assistant-tool-text" });
        p.textContent = block.text;
        return p;
      }
      const pre = createElement("pre", { class: "pulsar-assistant-code-block" });
      pre.textContent = JSON.stringify(block, null, 2);
      return pre;
    }
    if (item.type === "diff") {
      const diffEl = createElement("pre", { class: "pulsar-assistant-diff" });
      diffEl.textContent = item.newText;
      return diffEl;
    }
    const pre = createElement("pre", { class: "pulsar-assistant-code-block" });
    pre.textContent = JSON.stringify(item, null, 2);
    return pre;
  }

  renderToolCall(
    container: HTMLElement,
    toolCall: acp.ToolCall | ToolUpdate,
  ): HTMLElement {
    const existing = this.toolViews.get(toolCall.toolCallId);
    if (existing) {
      this.updateToolView(toolCall.toolCallId, toolCall);
      return existing.element;
    }

    this.host.onBeforeNewToolCall?.();

    const block = createElement("div", { class: "pulsar-assistant-tool" });
    block.dataset.toolCallId = toolCall.toolCallId;
    if (toolCall.kind) block.dataset.kind = toolCall.kind;

    const heading = createElement("div", { class: "pulsar-assistant-tool-heading" });

    const status = createElement("span", { class: "pulsar-assistant-tool-status" });

    const chevron = createElement("button", {
      class: "pulsar-assistant-tool-chevron",
      style: { display: "none" },
    });
    chevron.type = "button";
    chevron.textContent = "\u203a";
    chevron.title = "Show details";
    chevron.setAttribute("aria-expanded", "false");

    const title = createElement("span", { class: "pulsar-assistant-tool-title" });
    title.textContent = toolCall.title || "Tool Call";

    const details = createElement("span", { class: "pulsar-assistant-tool-details" });

    const deleteButton = createElement("button", {
      class: ["icon", "icon-trashcan", "pulsar-assistant-item-delete"],
    });
    deleteButton.type = "button";
    deleteButton.title = "Delete from context";
    deleteButton.addEventListener("click", (event) => {
      event.stopPropagation();
      this.host.onDeleteToolCall?.(toolCall.toolCallId);
    });

    heading.appendChild(status);
    heading.appendChild(chevron);
    heading.appendChild(title);
    heading.appendChild(details);
    heading.appendChild(deleteButton);
    block.appendChild(heading);

    const body = createElement("div", { class: "pulsar-assistant-tool-body" });
    block.appendChild(body);

    const toolView: ToolView = {
      element: block,
      heading,
      title,
      status,
      chevron,
      body,
      details,
      expanded: false,
      collapsible: false,
      location: null,
      locationTooltip: null,
      pinButton: null,
      readFile: false,
    };
    this.toolViews.set(toolCall.toolCallId, toolView);

    chevron.addEventListener("click", () => {
      setCollapsed(toolView, toolView.expanded);
      this.host.scrollToBottom();
    });

    this.updateToolView(toolCall.toolCallId, {
      toolCallId: toolCall.toolCallId,
      status: toolCall.status,
      title: toolCall.title,
      name: toolCall.name,
      kind: toolCall.kind,
      rawInput: toolCall.rawInput,
      rawOutput: toolCall.rawOutput,
      content: toolCall.content,
      locations: toolCall.locations,
    });

    container.appendChild(block);
    this.host.scrollToBottom();
    return block;
  }

  updateToolView(id: string, update: ToolUpdate): void {
    const view = this.toolViews.get(id);
    if (!view) return;

    if (update.title) {
      view.title.textContent = update.title;
    }

    if (update.kind) {
      view.element.dataset.kind = update.kind;
    }

    if (update.status) {
      applyStatus(view, update.status);
    }

    if (update.locations && update.locations.length > 0) {
      const loc = update.locations[0];
      view.location = loc;
      if (this.host.followAgent && loc.path) {
        const validLine =
          typeof loc.line === "number" &&
          Number.isSafeInteger(loc.line) &&
          loc.line >= 0
            ? loc.line
            : null;
        try {
          this.host.scheduleFollow?.(loc.path, validLine);
        } catch (error) {
          console.error("[pulsar-assistant] follow scheduling failed", error);
        }
      }
      if (!view.heading.querySelector(".pulsar-assistant-location")) {
        const link = createElement("button", {
          class: ["btn-link", "pulsar-assistant-location", "pulsar-assistant-tool-location"],
        });
        const lineSuffix = loc.line != null ? `:${loc.line}` : "";
        const displayPath = this.host.displayPath
          ? this.host.displayPath(loc.path)
          : loc.path;
        link.textContent = `${displayPath}${lineSuffix}`;
        link.addEventListener("click", (e) => {
          e.stopPropagation();
          this.host.openLocation(loc.path, loc.line ?? undefined);
        });
        view.details.appendChild(link);
      }

      view.readFile =
        update.name === "read_file" ||
        (typeof update.title === "string" && update.title.startsWith("Read "));
    }

    this.syncPinState(view);

    const hasContent = update.content && update.content.length > 0;
    const hasRaw = update.rawInput != null || update.rawOutput != null;
    if (!hasContent && !hasRaw) return;

    view.body.replaceChildren();
    if (hasContent) {
      for (const item of update.content!) {
        view.body.appendChild(
          this.host.renderToolContent
            ? this.host.renderToolContent(item)
            : this.renderToolContent(item),
        );
      }
    } else if (update.rawInput != null || update.rawOutput != null) {
      if (update.rawInput != null) {
        const pre = createElement("pre", { class: "pulsar-assistant-code-block" });
        pre.textContent =
          typeof update.rawInput === "string"
            ? update.rawInput
            : JSON.stringify(update.rawInput, null, 2);
        view.body.appendChild(pre);
      }
      if (update.rawOutput != null) {
        const pre = createElement("pre", { class: "pulsar-assistant-code-block" });
        pre.textContent =
          typeof update.rawOutput === "string"
            ? update.rawOutput
            : JSON.stringify(update.rawOutput, null, 2);
        view.body.appendChild(pre);
      }
    }

    const wasCollapsible = view.collapsible;
    view.collapsible = true;
    view.chevron.style.display = "";
    if (!wasCollapsible) {
      setCollapsed(view, true);
    }
  }

  private syncPinState(view: ToolView): void {
    if (!view.readFile || !view.location || !this.host.pinFile) {
      if (view.pinButton) {
        view.pinButton.remove();
        view.pinButton = null;
      }
      return;
    }

    const pinned = this.host.isPinned?.(view.location.path) ?? false;

    if (!view.pinButton) {
      view.pinButton = createElement("button", {
        class: ["btn-link", "pulsar-assistant-pin"],
      });
      view.pinButton.type = "button";
      view.pinButton.addEventListener("click", (e) => {
        e.stopPropagation();
        if (view.location) this.host.pinFile?.(view.location.path);
      });
      view.details.appendChild(view.pinButton);
    }

    if (pinned) {
      view.pinButton.textContent = "\u{1F4CC} Pinned";
      view.pinButton.disabled = true;
      view.pinButton.classList.add("pinned");
      view.pinButton.title = "Pinned to context";
    } else {
      view.pinButton.textContent = "\u{1F4CC} Pin";
      view.pinButton.disabled = false;
      view.pinButton.classList.remove("pinned");
      view.pinButton.title = "Pin to context";
    }
  }

  refreshPinStates(): void {
    for (const view of this.toolViews.values()) {
      this.syncPinState(view);
    }
  }

  removeToolView(toolCallId: string): void {
    const view = this.toolViews.get(toolCallId);
    if (!view) return;
    view.locationTooltip?.dispose();
    view.element.remove();
    this.toolViews.delete(toolCallId);
  }
}
