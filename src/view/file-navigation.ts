import * as path from "path";
import type { TextEditor } from "atom";

/**
 * Shared file helpers used by the attachments strip, the follow-agent mode and
 * the tool call "open file" links. Previously they lived in `agent-view.ts`.
 */

/** Predicate telling whether a path lives inside the project roots. */
export type PathChecker = (filePath: string) => Promise<boolean>;

export function samePath(
  a: string | undefined | null,
  b: string | undefined | null,
): boolean {
  if (!a || !b) return false;
  const resolvedA = path.resolve(a);
  const resolvedB = path.resolve(b);
  return process.platform === "win32"
    ? resolvedA.toLowerCase() === resolvedB.toLowerCase()
    : resolvedA === resolvedB;
}

export async function readFileFromDisk(filePath: string): Promise<string> {
  const fs = await import("fs/promises");
  return fs.readFile(filePath, "utf8");
}

export function findOpenEditorForPath(filePath: string): TextEditor | null {
  for (const editor of atom.workspace.getTextEditors()) {
    if (samePath(editor.getPath(), filePath)) return editor;
  }
  return null;
}

export async function isOpenableFile(
  filePath: string,
  isInProject: PathChecker,
): Promise<boolean> {
  if (!filePath || !path.isAbsolute(filePath)) return false;
  if (!(await isInProject(filePath))) return false;
  try {
    const fs = await import("fs/promises");
    const stat = await fs.stat(filePath);
    return stat.isFile();
  } catch {
    return false;
  }
}

export async function openLocation(
  filePath: string,
  line: number | null | undefined,
  isInProject: PathChecker,
): Promise<void> {
  if (!(await isOpenableFile(filePath, isInProject))) return;
  const editor = (await atom.workspace.open(filePath, {
    searchAllPanes: true,
    activatePane: true,
  })) as TextEditor | undefined;
  if (editor && typeof line === "number" && Number.isFinite(line)) {
    editor.setCursorBufferPosition([line, 0]);
    editor.scrollToCursorPosition({ center: true });
  }
}
