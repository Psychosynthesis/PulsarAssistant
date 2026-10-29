import { CompositeDisposable } from "atom";
import { DEFAULT_TOOL_CALL_DELAY_MS, MAX_TOOL_ITERATIONS, TOOL_OUTPUT_COMPACT_INTERVAL } from "../../constants";
import type { OpenaiLaunchTarget } from "../../agent-config";
import type { ProjectPolicy } from "../../project-policy";
import {
  API_FORMAT_CONTROL,
  COMPACT_INTERVAL_CONTROL,
  REASONING_EFFORT_CONTROL,
  TOOL_DELAY_CONTROL,
  TURN_LIMIT_CONTROL,
  WEB_SEARCH_CONTROL,
} from "../templates/agent-view";
import { createElement, elementFromHtml, ref } from "../utils";

export interface AgentSettingsHost {
  closeOtherMenus(): void;
  openBuildCommand(): void;
  openTestCommand(): void;
  openProxySettings(): void;
  editConfiguration(): void;
  manageProjectsAndStorage(): void;
  getProjectPolicy(): ProjectPolicy;
  getTarget(): OpenaiLaunchTarget | null;
  setMaxTurnRequests(value: number | null): void;
  setToolCallDelay(value: number | null): void;
  setCompactInterval(value: number | null): void;
  setApiFormat(value: "chat-completions" | "responses"): void;
  setReasoningEffort(value: string): void;
  setWebSearch(value: "off" | "auto" | "native" | "local"): void;
  reportError(message: string): void;
}

export class AgentSettingsView {
  private readonly subscriptions = new CompositeDisposable();
  private readonly element: HTMLElement;
  private readonly button: HTMLButtonElement;
  private readonly menu: HTMLElement;
  private readonly controls: HTMLElement[];
  private readonly turnLimit: HTMLInputElement;
  private readonly toolDelay: HTMLInputElement;
  private readonly compactInterval: HTMLInputElement;
  private readonly apiFormat: HTMLSelectElement;
  private readonly reasoningEffort: HTMLSelectElement;
  private readonly webSearch: HTMLSelectElement;
  private open = false;

  constructor(private readonly host: AgentSettingsHost) {
    this.element = createElement("div", {
      class: "pulsar-assistant-settings-wrap",
      style: { position: "relative" },
    });
    this.button = createElement("button", { class: ["pulsar-assistant-settings-toggle", "pulsar-assistant-sessions-toggle", "icon", "icon-gear"] });
    this.button.setAttribute("aria-label", "Project settings");
    this.button.setAttribute("aria-haspopup", "menu");
    this.button.setAttribute("aria-expanded", "false");
    this.button.addEventListener("click", () => this.toggle());
    this.subscriptions.add(atom.tooltips.add(this.button, { title: "Project settings", placement: "bottom" }));

    this.menu = createElement("div", { class: ["pulsar-assistant-picker-menu", "pulsar-assistant-settings-menu"], style: { display: "none", left: "auto", right: "0" } });
    this.menu.setAttribute("role", "menu");
    this.menu.setAttribute("aria-label", "Project settings");
    this.addItem("Set build command…", () => host.openBuildCommand());
    this.addItem("Set test command…", () => host.openTestCommand());
    this.addItem("Set proxy…", () => host.openProxySettings());
    this.addItem("Edit configuration…", () => host.editConfiguration());
    this.addItem("Manage projects & storage…", () => host.manageProjectsAndStorage());
    this.element.appendChild(this.button);
    this.element.appendChild(this.menu);

    const onMouseDown = (event: MouseEvent) => {
      if (this.open && !this.element.contains(event.target as Node)) this.close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && this.open) {
        this.close();
        this.button.focus();
      }
    };
    document.addEventListener("mousedown", onMouseDown, true);
    document.addEventListener("keydown", onKeyDown);
    this.subscriptions.add({ dispose: () => document.removeEventListener("mousedown", onMouseDown, true) });
    this.subscriptions.add({ dispose: () => document.removeEventListener("keydown", onKeyDown) });

    const turnLimit = this.control(TURN_LIMIT_CONTROL,
      `Maximum tool calls in one turn for this project. Empty uses the default (${MAX_TOOL_ITERATIONS}).`);
    const toolDelay = this.control(TOOL_DELAY_CONTROL,
      `Mandatory delay (in milliseconds) between tool calls for this project to prevent rate limit (TPM/429) errors. Minimum 100ms. Empty uses ${DEFAULT_TOOL_CALL_DELAY_MS}ms.`);
    const compactInterval = this.control(COMPACT_INTERVAL_CONTROL,
      `Compact older tool outputs in context every N tool calls to conserve tokens. 0 disables automatic compaction. Empty uses the default (${TOOL_OUTPUT_COMPACT_INTERVAL}).`);
    const apiFormat = this.control(API_FORMAT_CONTROL,
      "API transport for this OpenAI agent. Use Responses for OpenAI reasoning models (o-series / gpt-5+) together with function tools. Changing it restarts the agent.");
    const reasoningEffort = this.control(REASONING_EFFORT_CONTROL,
      "Reasoning effort for reasoning models. Auto uses the provider default (or 'none' for Chat Completions with function tools). Changing it restarts the agent.");
    const webSearch = this.control(WEB_SEARCH_CONTROL,
      "Web search for this OpenAI agent. Native uses the provider's server-side search (OpenAI Responses); Local uses the DeepSeek Search & Fetch API. Changing it restarts the agent.");
    this.controls = [turnLimit, toolDelay, compactInterval, apiFormat, reasoningEffort, webSearch];
    this.turnLimit = ref<HTMLInputElement>(turnLimit, "input");
    this.toolDelay = ref<HTMLInputElement>(toolDelay, "input");
    this.compactInterval = ref<HTMLInputElement>(compactInterval, "input");
    this.apiFormat = ref<HTMLSelectElement>(apiFormat, "select");
    this.reasoningEffort = ref<HTMLSelectElement>(reasoningEffort, "select");
    this.webSearch = ref<HTMLSelectElement>(webSearch, "select");

    this.turnLimit.addEventListener("change", () => this.saveNumber(
      this.turnLimit, 1, 1000, "Tool turns must be a whole number from 1 to 1000.",
      (value) => host.setMaxTurnRequests(value),
    ));
    this.toolDelay.addEventListener("change", () => this.saveNumber(
      this.toolDelay, 100, Infinity, "Tool call delay must be an integer >= 100 ms.",
      (value) => host.setToolCallDelay(value),
    ));
    this.compactInterval.addEventListener("change", () => this.saveNumber(
      this.compactInterval, 0, Infinity, "Compact interval must be an integer >= 0.",
      (value) => host.setCompactInterval(value),
    ));
    this.apiFormat.addEventListener("change", () => host.setApiFormat(
      this.apiFormat.value as "chat-completions" | "responses",
    ));
    this.reasoningEffort.addEventListener("change", () => host.setReasoningEffort(this.reasoningEffort.value));
    this.webSearch.addEventListener("change", () => host.setWebSearch(
      this.webSearch.value as "off" | "auto" | "native" | "local",
    ));
  }

  getElement(): HTMLElement {
    return this.element;
  }

  getControls(): readonly HTMLElement[] {
    return this.controls;
  }

  refresh(): void {
    const policy = this.host.getProjectPolicy();
    this.turnLimit.value = policy.maxTurnRequests == null ? "" : String(policy.maxTurnRequests);
    this.toolDelay.value = policy.toolCallDelayMs == null ? "" : String(policy.toolCallDelayMs);
    this.compactInterval.value = policy.toolOutputCompactInterval == null ? "" : String(policy.toolOutputCompactInterval);
    const target = this.host.getTarget();
    for (const control of this.controls.slice(3)) control.style.display = target ? "" : "none";
    if (target) {
      this.apiFormat.value = target.apiFormat;
      this.reasoningEffort.value = target.reasoningEffort ?? "";
      this.webSearch.value = target.webSearch;
    }
  }

  close(): void {
    this.menu.style.display = "none";
    this.open = false;
    this.button.setAttribute("aria-expanded", "false");
  }

  dispose(): void {
    this.close();
    this.subscriptions.dispose();
  }

  private control(template: string, title: string): HTMLElement {
    const wrap = elementFromHtml(template);
    this.subscriptions.add(atom.tooltips.add(wrap, { title, placement: "top", trigger: "hover" }));
    return wrap;
  }

  private saveNumber(
    input: HTMLInputElement,
    min: number,
    max: number,
    error: string,
    save: (value: number | null) => void,
  ): void {
    const raw = input.value.trim();
    const value = raw ? Number(raw) : null;
    if (value !== null && (!Number.isInteger(value) || value < min || value > max)) {
      this.refresh();
      this.host.reportError(error);
      return;
    }
    save(value);
    this.refresh();
  }

  private toggle(): void {
    if (this.open) {
      this.close();
      return;
    }
    this.host.closeOtherMenus();
    this.menu.style.display = "";
    this.open = true;
    this.button.setAttribute("aria-expanded", "true");
  }

  private addItem(label: string, action: () => void): void {
    const item = createElement("button", { class: "pulsar-assistant-picker-item" });
    item.setAttribute("role", "menuitem");
    item.textContent = label;
    item.addEventListener("click", () => {
      this.close();
      action();
    });
    this.menu.appendChild(item);
  }
}
