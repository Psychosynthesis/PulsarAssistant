import * as fs from "fs";
import * as path from "path";
import { Panel } from "atom";
import {
  DEFAULT_MODEL_CONTEXT_WINDOWS,
  FALLBACK_CONTEXT_WINDOW,
} from "../token-estimate";
import { safeProjectKey } from "../session-storage";
import { elementFromHtml, ref } from "./utils";
import {
  CONTEXT_WINDOW_TABLE_HEAD,
  contextWindowRowHtml,
  MODEL_CONTEXT_WINDOWS_SECTION,
  PROJECTS_STORAGE_MODAL_SHELL,
  PROJECTS_STORAGE_SECTION,
  projectStorageRowHtml,
  PROJECTS_TABLE_HEAD,
} from "./templates/modal";

interface ProjectStorageItem {
  projectRoot: string;
  storageDir?: string;
  sessionCount: number;
  hasTree: boolean;
  diskSizeBytes: number;
  inConfig: boolean;
}

async function computeDirSize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await computeDirSize(full);
      } else if (entry.isFile()) {
        try {
          const st = await fs.promises.stat(full);
          total += st.size;
        } catch {}
      }
    }
  } catch {}
  return total;
}

async function scanProjectStorage(
  storageDir: string,
): Promise<{ projectRoot: string; sessionCount: number; hasTree: boolean }> {
  let projectRoot = "";
  let sessionCount = 0;
  let hasTree = false;

  // Check tree.json
  const treePath = path.join(storageDir, "tree.json");
  try {
    const raw = await fs.promises.readFile(treePath, "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.projectRoot === "string") {
      projectRoot = parsed.projectRoot;
      hasTree = true;
    }
  } catch {}

  // Check sessions
  const sessionsDir = path.join(storageDir, "sessions");
  try {
    const files = await fs.promises.readdir(sessionsDir);
    const sessionFiles = files.filter((f) => f.endsWith(".json"));
    sessionCount = sessionFiles.length;

    if (!projectRoot && sessionFiles.length > 0) {
      try {
        const rawFirst = await fs.promises.readFile(
          path.join(sessionsDir, sessionFiles[0]),
          "utf8",
        );
        const parsedFirst = JSON.parse(rawFirst);
        if (parsedFirst && typeof parsedFirst.projectRoot === "string") {
          projectRoot = parsedFirst.projectRoot;
        }
      } catch {}
    }
  } catch {}

  if (!projectRoot) {
    projectRoot = path.basename(storageDir);
  }

  return { projectRoot, sessionCount, hasTree };
}

export class ProjectsStorageModal {
  private panel: Panel | null = null;
  readonly element: HTMLElement;
  private keydownHandler: (event: KeyboardEvent) => void;

  constructor() {
    this.element = elementFromHtml(
      `<div class="pulsar-assistant-projects-modal overlay modal"></div>`,
    );

    this.keydownHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        this.close();
      }
    };
  }

  static show(): ProjectsStorageModal {
    const modal = new ProjectsStorageModal();
    modal.render();
    modal.panel = atom.workspace.addModalPanel({
      item: modal.element,
      visible: true,
    });
    document.addEventListener("keydown", modal.keydownHandler);
    return modal;
  }

  close(): void {
    document.removeEventListener("keydown", this.keydownHandler);
    if (this.panel) {
      this.panel.destroy();
      this.panel = null;
    }
    this.element.remove();
  }

  private async render(): Promise<void> {
    this.element.innerHTML = PROJECTS_STORAGE_MODAL_SHELL;

    const closeBtn = ref<HTMLButtonElement>(this.element, "close");
    closeBtn.addEventListener("click", () => this.close());

    const body = ref(this.element, "body");

    // Section 1: Model Context Windows
    this.renderContextWindowsSection(body);

    // Section 2: Projects & Storage
    await this.renderProjectsSection(body);
  }

  private renderContextWindowsSection(container: HTMLElement): void {
    const section = elementFromHtml(MODEL_CONTEXT_WINDOWS_SECTION);

    const editBtn = ref<HTMLButtonElement>(section, "edit");
    editBtn.addEventListener("click", () => {
      void atom.workspace.open(atom.config.getUserConfigPath());
    });

    const customWindows =
      (atom.config.get("pulsar-assistant.modelContextWindows") as
        | Record<string, number>
        | undefined) || {};

    const tableWrap = ref(section, "table-scroll");

    const tbodyRows: string[] = [];

    // Custom items first
    for (const [name, limit] of Object.entries(customWindows)) {
      if (typeof limit === "number") {
        tbodyRows.push(contextWindowRowHtml(name, limit, "custom"));
      }
    }

    // Default items
    for (const [name, limit] of Object.entries(DEFAULT_MODEL_CONTEXT_WINDOWS)) {
      tbodyRows.push(contextWindowRowHtml(name, limit, "default"));
    }

    // Fallback row
    tbodyRows.push(
      contextWindowRowHtml(
        "Fallback (other models)",
        FALLBACK_CONTEXT_WINDOW,
        "fallback",
      ),
    );

    tableWrap.innerHTML = `
      <table class="pulsar-assistant-table">
        <thead>${CONTEXT_WINDOW_TABLE_HEAD}</thead>
        <tbody>${tbodyRows.join("")}</tbody>
      </table>
    `;

    container.appendChild(section);
  }

  private async renderProjectsSection(container: HTMLElement): Promise<void> {
    const section = elementFromHtml(PROJECTS_STORAGE_SECTION);
    const loading = ref(section, "loading");
    container.appendChild(section);

    // Scan disk projects
    const configDir = atom.getConfigDirPath();
    const projectsBaseDir = path.join(
      configDir,
      "storage",
      "pulsar-assistant",
      "projects",
    );

    const projectItems = new Map<string, ProjectStorageItem>();

    try {
      const dirEntries = await fs.promises.readdir(projectsBaseDir, {
        withFileTypes: true,
      });
      for (const entry of dirEntries) {
        if (!entry.isDirectory()) continue;
        const projectStorageDir = path.join(projectsBaseDir, entry.name);
        const meta = await scanProjectStorage(projectStorageDir);
        const size = await computeDirSize(projectStorageDir);

        projectItems.set(meta.projectRoot, {
          projectRoot: meta.projectRoot,
          storageDir: projectStorageDir,
          sessionCount: meta.sessionCount,
          hasTree: meta.hasTree,
          diskSizeBytes: size,
          inConfig: false,
        });
      }
    } catch {}

    // Check config projects
    const configProjects =
      (atom.config.get("pulsar-assistant.projects") as
        | Record<string, unknown>
        | undefined) || {};

    for (const projectPath of Object.keys(configProjects)) {
      const existing = projectItems.get(projectPath);
      if (existing) {
        existing.inConfig = true;
      } else {
        const expectedDir = path.join(
          projectsBaseDir,
          safeProjectKey(projectPath),
        );
        let existsOnDisk = false;
        let size = 0;
        try {
          await fs.promises.access(expectedDir);
          existsOnDisk = true;
          size = await computeDirSize(expectedDir);
        } catch {}

        projectItems.set(projectPath, {
          projectRoot: projectPath,
          storageDir: existsOnDisk ? expectedDir : undefined,
          sessionCount: 0,
          hasTree: false,
          diskSizeBytes: size,
          inConfig: true,
        });
      }
    }

    loading.remove();

    if (projectItems.size === 0) {
      section.insertAdjacentHTML(
        "beforeend",
        '<div class="pulsar-assistant-empty-state">No stored projects or sessions found.</div>',
      );
      return;
    }

    const tableWrap = elementFromHtml(
      '<div class="pulsar-assistant-table-scroll"></div>',
    );

    const table = elementFromHtml(
      `<table class="pulsar-assistant-table"><thead>${PROJECTS_TABLE_HEAD}</thead></table>`,
    );

    const tbody = elementFromHtml("<tbody></tbody>");
    for (const item of Array.from(projectItems.values())) {
      const row = elementFromHtml(projectStorageRowHtml(item));

      const tdActions = elementFromHtml("<td></td>");
      const delBtn = elementFromHtml<HTMLButtonElement>(
        '<button class="btn btn-error btn-sm inline-block-tight icon icon-x" aria-label="Delete project data" title="Delete project data"></button>',
      );
      delBtn.addEventListener("click", () => {
        atom.confirm(
          {
            message: "Delete project data?",
            detail: `Are you sure you want to delete stored sessions and data for:\n${item.projectRoot}\n\nThis permanently removes cached sessions and configuration for this project.`,
            buttons: ["Delete", "Cancel"],
          },
          (response) => {
            if (response === 0) {
              void this.deleteProjectData(item, row);
            }
          },
        );
      });
      tdActions.appendChild(delBtn);
      row.appendChild(tdActions);
      tbody.appendChild(row);
    }

    table.appendChild(tbody);
    tableWrap.appendChild(table);
    section.appendChild(tableWrap);
  }

  private async deleteProjectData(
    item: ProjectStorageItem,
    rowElement: HTMLElement,
  ): Promise<void> {
    try {
      // 1. Remove storage directory from disk
      if (item.storageDir) {
        await fs.promises.rm(item.storageDir, { recursive: true, force: true });
      }

      // 2. Remove from pulsar-assistant.projects in user config
      const projects =
        (atom.config.get("pulsar-assistant.projects") as
          | Record<string, unknown>
          | undefined) || {};
      if (projects[item.projectRoot] !== undefined) {
        const updated = { ...projects };
        delete updated[item.projectRoot];
        atom.config.set("pulsar-assistant.projects", updated);
      }

      // 3. Remove row from table
      rowElement.remove();
      atom.notifications.addSuccess("Project storage deleted", {
        description: item.projectRoot,
      });
    } catch (err) {
      atom.notifications.addError("Failed to delete project storage", {
        description: err instanceof Error ? err.message : String(err),
      });
    }
  }
}
