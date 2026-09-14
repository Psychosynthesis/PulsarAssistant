import type * as acp from "@agentclientprotocol/sdk";
import {
  completedPlanEntries,
  nextTurnActivePlanEntries,
} from "../../util";
import { createElement } from "../utils";

export interface PlanBarHost {
  onPlanChanged?: () => void;
  appendSnapshotToConversation: (card: HTMLElement) => void;
  scrollToBottom: () => void;
}

export class PlanBarView {
  private element: HTMLElement;
  private planExpanded = true;
  private activePlanEntries: acp.PlanEntry[] = [];
  private activePlanSessionId: string | null = null;
  private sessionPlanState = new Map<string, acp.PlanEntry[]>();
  private host: PlanBarHost;

  constructor(host: PlanBarHost) {
    this.host = host;
    this.element = createElement("div", { class: "pulsar-assistant-plan-bar", style: { display: "none" } });
  }

  getElement(): HTMLElement {
    return this.element;
  }

  get hasActivePlan(): boolean {
    return this.activePlanEntries.length > 0;
  }

  get entries(): acp.PlanEntry[] {
    return this.activePlanEntries;
  }

  clear(): void {
    this.activePlanEntries = [];
    this.activePlanSessionId = null;
    this.element.style.display = "none";
    this.element.replaceChildren();
    this.host.onPlanChanged?.();
  }

  clearActivePlan(): void {
    this.clear();
  }

  setActivePlan(
    entries: acp.PlanEntry[],
    sessionId: string | null = null,
  ): void {
    if (sessionId) {
      this.sessionPlanState.set(sessionId, entries);
    }
    this.activePlanSessionId = sessionId;
    this.activePlanEntries = entries;
    this.render();
    this.host.onPlanChanged?.();
  }

  syncSession(sessionId: string | null): void {
    this.activePlanSessionId = sessionId;
    if (sessionId && this.sessionPlanState.has(sessionId)) {
      this.activePlanEntries = this.sessionPlanState.get(sessionId)!;
      this.render();
    } else {
      this.activePlanEntries = [];
      this.element.style.display = "none";
      this.element.replaceChildren();
    }
    this.host.onPlanChanged?.();
  }

  removeSession(sessionId: string): void {
    this.sessionPlanState.delete(sessionId);
    if (this.activePlanSessionId === sessionId) {
      this.clear();
    }
  }

  snapshotCompletedPlan(): void {
    if (this.activePlanEntries.length === 0) return;

    const completed = completedPlanEntries(this.activePlanEntries);
    if (completed.length > 0) {
      const card = createElement("div", { class: "pulsar-assistant-plan-card" });
      card.dataset.completedCount = String(completed.length);

      const header = createElement("div", { class: "pulsar-assistant-plan-card-header" });

      const icon = createElement("span", { class: ["icon", "icon-tasklist"] });
      header.appendChild(icon);

      const title = createElement("span", { class: "pulsar-assistant-plan-card-title" });
      title.textContent = `Completed steps (${completed.length})`;
      header.appendChild(title);
      card.appendChild(header);

      const list = createElement("ul", { class: "pulsar-assistant-plan-card-list" });
      for (const entry of completed) {
        const item = createElement("li", { class: ["pulsar-assistant-plan-card-item", "is-completed"] });
        const checkIcon = createElement("span", { class: ["icon", "icon-check"] });
        item.appendChild(checkIcon);
        const text = createElement("span", { class: "pulsar-assistant-plan-card-text" });
        text.textContent = entry.content;
        item.appendChild(text);
        list.appendChild(item);
      }
      card.appendChild(list);

      this.host.appendSnapshotToConversation(card);
      this.host.scrollToBottom();
    }
  }

  clearCompletedActivePlanEntries(): void {
    this.activePlanEntries = nextTurnActivePlanEntries(this.activePlanEntries);
    if (this.activePlanSessionId) {
      this.sessionPlanState.set(
        this.activePlanSessionId,
        this.activePlanEntries,
      );
    }
    this.render();
    this.host.onPlanChanged?.();
  }

  onTurnCompleted(): void {
    this.snapshotCompletedPlan();
    this.clearCompletedActivePlanEntries();
  }

  private render(): void {
    if (this.activePlanEntries.length === 0) {
      this.element.style.display = "none";
      this.element.replaceChildren();
      return;
    }

    this.element.style.display = "";
    this.element.replaceChildren();

    const total = this.activePlanEntries.length;
    const completed = this.activePlanEntries.filter(
      (e) => e.status === "completed",
    ).length;
    const inProgress = this.activePlanEntries.filter(
      (e) => e.status === "in_progress",
    ).length;

    const summary = createElement("div", { class: "pulsar-assistant-plan-summary" });
    summary.addEventListener("click", () => {
      this.planExpanded = !this.planExpanded;
      this.render();
    });

    const chevron = createElement("span", { class: ["icon", this.planExpanded ? "icon-chevron-down" : "icon-chevron-right"] });
    summary.appendChild(chevron);

    const title = createElement("span", { class: "pulsar-assistant-plan-title" });
    title.textContent = `Plan (${completed}/${total} completed${
      inProgress ? `, ${inProgress} in progress` : ""
    })`;
    summary.appendChild(title);
    this.element.appendChild(summary);

    if (this.planExpanded) {
      const list = createElement("ul", { class: "pulsar-assistant-plan-list" });
      for (const entry of this.activePlanEntries) {
        const item = createElement("li", { class: ["pulsar-assistant-plan-entry", `status-${entry.status}`] });

        const statusIcon = createElement("span", { class: "icon" });
        if (entry.status === "completed") {
          statusIcon.classList.add("icon-check");
        } else if (entry.status === "in_progress") {
          statusIcon.classList.add("icon-sync", "pulsar-assistant-spin");
        } else {
          statusIcon.classList.add("icon-primitive-dot");
        }
        item.appendChild(statusIcon);

        const text = createElement("span", { class: "pulsar-assistant-plan-entry-text" });
        text.textContent = entry.content;
        item.appendChild(text);

        list.appendChild(item);
      }
      this.element.appendChild(list);
    }
  }
}
