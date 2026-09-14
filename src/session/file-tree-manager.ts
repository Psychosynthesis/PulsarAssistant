import * as path from "path";
import {
  DEFAULT_PROJECT_SKIP_DIRS,
  ProjectFileTree,
  toPosixPath,
} from "../file-btree";
import {
  getProjectStorageDir,
  getProjectTreePath,
} from "../session-storage";
import type { EditorBackend, FileChangeEvent } from "../editor";

export class ProjectFileTreeManager {
  private fileTree: ProjectFileTree;
  private fileTreeSubscription: { dispose: () => void } | null = null;
  private pendingFileTreeUpdates = new Set<string>();
  private fileTreeBatchTimer: NodeJS.Timeout | null = null;
  private fileTreeSaveTimer: NodeJS.Timeout | null = null;
  private initPromise: Promise<void>;

  constructor(
    private readonly projectRoot: string,
    private readonly editor: EditorBackend,
  ) {
    this.fileTree = new ProjectFileTree(this.projectRoot);
    this.initPromise = this.initFileTree();
    this.subscribeToFileEvents();
  }

  getFileTree(): ProjectFileTree {
    return this.fileTree;
  }

  async ensureInitialized(): Promise<ProjectFileTree> {
    try {
      await this.initPromise;
    } catch {
      // ignore
    }
    return this.fileTree;
  }

  getStorageDir(): string {
    const configDir = this.editor.getConfigDirPath();
    return getProjectStorageDir(configDir, this.projectRoot);
  }

  private treeFilePath(): string {
    return getProjectTreePath(this.getStorageDir());
  }

  private async initFileTree(): Promise<void> {
    const treePath = this.treeFilePath();
    let loaded: ProjectFileTree | null = null;
    try {
      loaded = await ProjectFileTree.loadFromFile(treePath);
      if (loaded && loaded.size > 0) {
        this.fileTree = loaded;
      }
    } catch (err) {
      console.warn("[pulsar-assistant] failed to load tree.json, rescanning", err);
    }

    if (!loaded || this.fileTree.size === 0) {
      try {
        await this.fileTree.scanProject();
        await this.fileTree.saveToFile(treePath);
      } catch (err) {
        console.warn("[pulsar-assistant] background file tree scan failed", err);
      }
    } else {
      // If loaded from disk, schedule a background rescan to catch any outside changes
      setTimeout(() => {
        void this.fileTree
          .scanProject()
          .then(() => this.fileTree.saveToFile(treePath))
          .catch(() => {});
      }, 1500);
    }
  }

  private isPathInProject(targetPath: string): boolean {
    const rel = path.relative(this.projectRoot, targetPath);
    return !rel.startsWith("..") && !path.isAbsolute(rel);
  }

  private isPathIgnored(targetPath: string): boolean {
    const rel = toPosixPath(path.relative(this.projectRoot, targetPath));
    const segments = rel.split("/");
    for (const seg of segments) {
      if (DEFAULT_PROJECT_SKIP_DIRS.has(seg)) return true;
    }
    return false;
  }

  private subscribeToFileEvents(): void {
    const sub = this.editor.onDidChangeFiles((events: FileChangeEvent[]) => {
      this.handleFileEvents(events);
    });
    if (sub) {
      this.fileTreeSubscription = sub;
    }
  }

  private handleFileEvents(events: FileChangeEvent[]): void {
    let hasProjectChanges = false;
    for (const event of events) {
      if (
        event.oldPath &&
        this.isPathInProject(event.oldPath) &&
        !this.isPathIgnored(event.oldPath)
      ) {
        this.pendingFileTreeUpdates.add(event.oldPath);
        hasProjectChanges = true;
      }
      if (
        event.path &&
        this.isPathInProject(event.path) &&
        !this.isPathIgnored(event.path)
      ) {
        this.pendingFileTreeUpdates.add(event.path);
        hasProjectChanges = true;
      }
    }
    if (hasProjectChanges) {
      this.scheduleBatchTreeUpdates();
    }
  }

  private scheduleBatchTreeUpdates(): void {
    if (this.fileTreeBatchTimer) {
      clearTimeout(this.fileTreeBatchTimer);
    }
    this.fileTreeBatchTimer = setTimeout(() => {
      this.fileTreeBatchTimer = null;
      void this.processBatchTreeUpdates();
    }, 1500);
  }

  private async processBatchTreeUpdates(): Promise<void> {
    const updates = Array.from(this.pendingFileTreeUpdates);
    this.pendingFileTreeUpdates.clear();

    for (const filePath of updates) {
      await this.fileTree.updatePath(filePath);
    }

    this.scheduleTreeSave();
  }

  private scheduleTreeSave(): void {
    if (this.fileTreeSaveTimer) {
      clearTimeout(this.fileTreeSaveTimer);
    }
    this.fileTreeSaveTimer = setTimeout(() => {
      this.fileTreeSaveTimer = null;
      void this.fileTree.saveToFile(this.treeFilePath());
    }, 5000);
  }

  async notifyPathModified(filePath: string): Promise<void> {
    await this.fileTree.updatePath(filePath);
    this.scheduleTreeSave();
  }

  dispose(): void {
    if (this.fileTreeSubscription) {
      this.fileTreeSubscription.dispose();
      this.fileTreeSubscription = null;
    }
    if (this.fileTreeBatchTimer) {
      clearTimeout(this.fileTreeBatchTimer);
      this.fileTreeBatchTimer = null;
    }
    if (this.fileTreeSaveTimer) {
      clearTimeout(this.fileTreeSaveTimer);
      this.fileTreeSaveTimer = null;
    }
  }
}
