import * as path from "path";
import * as acp from "@agentclientprotocol/sdk";
import { parseCommandLine, runCapturedProcess } from "../util";
import { findFiles, grepFiles, listDirectory } from "../grep";
import { planGitCommand } from "../git-command";
import { resolveInsideRoot } from "../project-uri";
import { normalizeInputPath, robustReplace } from "../input-normalize";
import { ProjectFileTree } from "../file-btree";
import { toPosixPath } from "../paths";
import type { ProjectPolicy } from "../project-policy";
import type { ChatTool } from "../openai-client";

export const TOOL_DEFINITIONS: ChatTool[] = [
  {
    type: "function",
    function: {
      name: "read_file",
      description:
        "Read a text file in the project. Path may be absolute or relative to the project root.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          line: {
            type: "integer",
            description:
              "1-based start line. Omit to read from the start. This is a line number, not a byte offset.",
          },
          limit: {
            type: "integer",
            description:
              "Maximum number of lines to return (a count, not an end line: the slice spans line..line+limit-1).",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description:
        "Create or fully overwrite a text file in the project. Pass `content` with the complete new file contents (this replaces the entire file). For targeted edits (search/replace or line ranges) use write_diff. Writing inside .git is not allowed.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          content: {
            type: "string",
            description:
              "Complete new file contents. Replaces the whole file, so include every line — do not pass partial content.",
          },
        },
        required: ["path", "content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "write_diff",
      description:
        "Apply a targeted edit to a file. Pass `path` and either `startLine` (with optional `endLine`) and `replace` (or `content`), or `search` and `replace`.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description: "Project-relative or absolute path to the file.",
          },
          startLine: {
            type: "integer",
            description: "1-based start line of the range to replace.",
          },
          endLine: {
            type: "integer",
            description:
              "1-based end line of the range to replace (defaults to startLine).",
          },
          search: {
            type: "string",
            description: "Exact text or lines to find and replace in the file.",
          },
          replace: {
            type: "string",
            description: "New text to replace the specified lines or search text.",
          },
          content: {
            type: "string",
            description: "Alias for `replace`.",
          },
          all: {
            type: "boolean",
            description:
              "If true, replace all occurrences of `search`. Defaults to false.",
          },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description:
        "Move a file within the project. Both source and destination must stay inside the project; destination must not already exist.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourcePath: {
            type: "string",
            description:
              "Absolute or project-relative path of the file to move.",
          },
          destinationPath: {
            type: "string",
            description:
              "Absolute or project-relative destination path, including filename.",
          },
        },
        required: ["sourcePath", "destinationPath"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "find_files",
      description:
        "Find files matching a search pattern and/or extensions. Pattern supports DSL: * (wildcard), ? (single character), | (OR), & (AND), \\ (escape special chars). Pattern matches file basename only. Works fast using project index.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description:
              "Directory to search in, relative to project root. Defaults to '.' (root).",
          },
          pattern: {
            type: "string",
            description:
              "DSL search pattern (*, ?, |, &, \\). Applied to file basename.",
          },
          extensions: {
            type: "array",
            items: { type: "string" },
            description:
              "Optional list of file extensions to filter by (e.g. ['ts', 'js'] or ['.ts', '.js']).",
          },
          caseInsensitive: {
            type: "boolean",
            description:
              "Case-insensitive matching for pattern and extensions.",
          },
          maxResults: {
            type: "integer",
            description: "Maximum number of files to return (default 100).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_file_structure",
      description:
        "Get project file structure using TSV line protocol (F\\t<path>\\tsize=<bytes>). Supports directory and depth filtering.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description:
              "Directory to get structure for, relative to project root. Defaults to '.' (entire project).",
          },
          depth: {
            type: "integer",
            description:
              "Maximum depth of folder nesting to display (default 5).",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List files and directories in a project folder.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
        },
        required: ["path"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "grep",
      description:
        "Fast literal substring search in file contents (no regex, no glob).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Literal text to search for (substring).",
          },
          pattern: {
            type: "string",
            description: "Alias for query.",
          },
          path: {
            type: "string",
            description:
              "Directory or file to search in, relative to project root. Defaults to '.'.",
          },
          caseInsensitive: { type: "boolean" },
          maxResults: { type: "integer" },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "git",
      description:
        "Run git in the project root. Always available; does not need allowCommands. Pass arguments after git, e.g. status, diff, branch, checkout -b topic, add -A, commit -m \"msg\". Not a shell. No push, pull, fetch, reset, rebase, force branch options, or --edit-description. checkout, switch, add, commit, apply, and mutating branch operations (create, rename, delete) ask for permission. apply --check is read-only. commit needs -m.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: {
            type: "string",
            description:
              'Arguments after git, e.g. status or checkout -b topic. You may include a leading "git".',
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description:
        "Run a process in the project when the user has enabled allowCommands for this folder in Pulsar user config (not in the repo). Pass the executable and arguments as a single command line (quoted paths allowed). Not a shell.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string" },
          cwd: {
            type: "string",
            description: "Optional working directory inside the project.",
          },
        },
        required: ["command"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description:
        "Run the test command the user configured for this project in Pulsar user config (testCommand). You cannot choose or change the command.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "run_build",
      description:
        "Run the build command the user configured for this project in Pulsar user config (buildCommand). You cannot choose or change the command.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {},
      },
    },
  },
  {
    type: "function",
    function: {
      name: "unpin_file",
      description:
        "Unpin a previously pinned file from the project context once work on it is complete. Important! Don't forget to detach the files once the task is complete.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description:
              "Project-relative or absolute path of the file to unpin.",
          },
        },
        required: ["path"],
      },
    },
  },
];

export function toolsForPolicy(policy: ProjectPolicy): ChatTool[] {
  return TOOL_DEFINITIONS.filter((tool) => {
    const name = tool.function.name;
    if (name === "run_command") return policy.allowCommands;
    if (name === "run_tests") return !!policy.testCommand;
    if (name === "run_build") return !!policy.buildCommand;
    return true;
  });
}

export type ToolKind = acp.ToolKind;

export type BuiltinHost = {
  sessionUpdate(
    params: acp.SessionNotification,
  ): Promise<void>;
  requestPermission(
    params: acp.RequestPermissionRequest,
  ): Promise<acp.RequestPermissionResponse>;
  readTextFile(
    params: acp.ReadTextFileRequest,
  ): Promise<acp.ReadTextFileResponse>;
  writeTextFile(
    params: acp.WriteTextFileRequest,
  ): Promise<acp.WriteTextFileResponse | void>;
  moveTextFile(params: {
    sessionId: acp.SessionId;
    sourcePath: string;
    destinationPath: string;
  }): Promise<void>;
  getPinnedFiles?: () => string[];
  unpinFile?: (path: string) => Promise<boolean>;
  onStatusNote?: (note: string) => void;
  onThought?: (thought: string) => void;
};

/**
 * Single typed environment passed to every tool handler. It carries the active
 * session, the editor backend primitives (host), the project policy and the
 * cancellation signal, so adding a new capability no longer means threading a
 * new parameter through every tool function.
 */
export type ToolExecutionContext = {
  host: BuiltinHost;
  sessionId: acp.SessionId;
  cwd: string;
  signal: AbortSignal;
  policy: ProjectPolicy;
  fileTree?: ProjectFileTree | null;
};

export type ToolMeta = {
  title: string;
  kind: ToolKind;
  locations?: acp.ToolCallLocation[];
  rawInput: Record<string, unknown>;
  needsPermission: boolean;
};

export type ToolSuccess = {
  output: string;
  content?: acp.ToolCallContent[];
};

export class ToolRejected extends Error {
  constructor(message = "The user rejected this tool call.") {
    super(message);
    this.name = "ToolRejected";
  }
}

function asRecord(raw: string): Record<string, unknown> {
  if (!raw.trim()) return {};
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return parsed as Record<string, unknown>;
}

function stringArg(args: Record<string, unknown>, key: string): string | undefined {
  const value = args[key];
  return typeof value === "string" ? value : undefined;
}

function intArg(args: Record<string, unknown>, key: string): number | undefined {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  // Some models emit numbers as JSON strings (e.g. {"line": "340"}). Coerce
  // them instead of silently ignoring them, which would make reads start from
  // line 1 and edits target the wrong range.
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
      return Math.trunc(Number(trimmed));
    }
  }
  return undefined;
}

function assertWritablePath(cwd: string, filePath: string): void {
  const rel = path.relative(path.resolve(cwd), filePath);
  if (rel === ".git" || rel.startsWith(`.git${path.sep}`)) {
    throw new Error(`Writing into .git is not allowed: ${filePath}`);
  }
}

function resolveToolPath(ctx: ToolExecutionContext, raw: string): string {
  return resolveInsideRoot(ctx.cwd, raw);
}

export function describeToolCall(
  name: string,
  rawArguments: string,
  ctx: ToolExecutionContext,
): ToolMeta {
  const { cwd, policy } = ctx;
  const args = asRecord(rawArguments);
  switch (name) {
    case "read_file": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      return {
        title: `Read ${path.basename(filePath)}`,
        kind: "read",
        locations: [{ path: filePath }],
        rawInput: { path: filePath, line: args.line, limit: args.limit },
        needsPermission: false,
      };
    }
    case "write_file": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      assertWritablePath(cwd, filePath);
      return {
        title: `Rewrite ${path.basename(filePath)}`,
        kind: "edit",
        locations: [{ path: filePath }],
        rawInput: { path: filePath, content: stringArg(args, "content") },
        needsPermission: true,
      };
    }
    case "write_diff": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      assertWritablePath(cwd, filePath);
      return {
        title: `Edit ${path.basename(filePath)}`,
        kind: "edit",
        locations: [{ path: filePath }],
        rawInput: args,
        needsPermission: true,
      };
    }
    case "move_file": {
      const sourcePath = resolveToolPath(
        ctx,
        stringArg(args, "sourcePath") ?? ".",
      );
      const destinationPath = resolveToolPath(
        ctx,
        stringArg(args, "destinationPath") ?? ".",
      );
      assertWritablePath(cwd, sourcePath);
      assertWritablePath(cwd, destinationPath);
      return {
        title: `Move ${path.basename(sourcePath)}`,
        kind: "edit",
        locations: [{ path: sourcePath }, { path: destinationPath }],
        rawInput: { sourcePath, destinationPath },
        needsPermission: true,
      };
    }
    case "find_files": {
      const pattern = stringArg(args, "pattern") ?? "*";
      const extensions = Array.isArray(args.extensions)
        ? args.extensions.join(",")
        : "";
      const searchPath = stringArg(args, "path") ?? ".";
      const desc = extensions ? `${pattern} (${extensions})` : pattern;
      return {
        title: `Find ${desc} in ${searchPath}`,
        kind: "search",
        rawInput: args,
        needsPermission: false,
      };
    }
    case "get_file_structure": {
      const searchPath = stringArg(args, "path") ?? ".";
      const depth = intArg(args, "depth") ?? 5;
      return {
        title: `Structure of ${searchPath} (depth ${depth})`,
        kind: "read",
        rawInput: args,
        needsPermission: false,
      };
    }
    case "list_dir": {
      const dirPath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      return {
        title: `List ${path.basename(dirPath) || dirPath}`,
        kind: "read",
        locations: [{ path: dirPath }],
        rawInput: { path: dirPath },
        needsPermission: false,
      };
    }
    case "grep": {
      const query =
        stringArg(args, "query") ?? stringArg(args, "pattern") ?? "";
      const searchPath = stringArg(args, "path") ?? ".";
      return {
        title: `Grep "${query}" in ${searchPath}`,
        kind: "search",
        rawInput: args,
        needsPermission: false,
      };
    }
    case "git": {
      const plan = planGitCommand(
        parseCommandLine(stringArg(args, "command") ?? ""),
      );
      return {
        title: plan.title,
        kind: plan.needsPermission ? "execute" : "read",
        rawInput: { command: plan.args.join(" ") },
        needsPermission: plan.needsPermission,
      };
    }
    case "run_command": {
      if (!policy.allowCommands) {
        throw new Error(
          "Commands are disabled for this project. Set allowCommands: true under pulsar-assistant.projects in Pulsar user config (not in the project folder).",
        );
      }
      const command = stringArg(args, "command") ?? "";
      return {
        title: command ? `Run ${command}` : "Run command",
        kind: "execute",
        rawInput: { command, cwd: stringArg(args, "cwd") ?? cwd },
        needsPermission: true,
      };
    }
    case "run_tests": {
      const command = policy.testCommand;
      if (!command) {
        throw new Error(
          "No test command configured. Set testCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder).",
        );
      }
      return {
        title: `Test ${command}`,
        kind: "execute",
        rawInput: { command },
        needsPermission: false,
      };
    }
    case "run_build": {
      const command = policy.buildCommand;
      if (!command) {
        throw new Error(
          "No build command configured. Set buildCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder).",
        );
      }
      return {
        title: `Build ${command}`,
        kind: "execute",
        rawInput: { command },
        needsPermission: false,
      };
    }
    case "unpin_file": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      return {
        title: `Unpin ${path.basename(filePath)}`,
        kind: "edit",
        locations: [{ path: filePath }],
        rawInput: { path: filePath },
        needsPermission: false,
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

export async function requestToolPermission(
  ctx: ToolExecutionContext,
  toolCallId: string,
  meta: ToolMeta,
): Promise<boolean> {
  const response = await ctx.host.requestPermission({
    sessionId: ctx.sessionId,
    toolCall: {
      toolCallId,
      title: meta.title,
      kind: meta.kind,
      status: "pending",
      locations: meta.locations,
      rawInput: meta.rawInput,
    },
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" },
    ],
  });
  if (response.outcome.outcome === "cancelled") return false;
  return response.outcome.optionId === "allow-once";
}

export async function executeTool(
  ctx: ToolExecutionContext,
  name: string,
  rawArguments: string,
): Promise<ToolSuccess> {
  if (ctx.signal.aborted) throw new Error("Cancelled.");
  const args = asRecord(rawArguments);
  switch (name) {
    case "read_file":
      return readFileTool(ctx, args);
    case "write_file":
      return writeFileTool(ctx, args);
    case "write_diff":
      return writeDiffTool(ctx, args);
    case "move_file":
      return moveFileTool(ctx, args);
    case "find_files":
      return findFilesTool(ctx, args);
    case "get_file_structure":
      return getFileStructureTool(ctx, args);
    case "list_dir":
      return listDirTool(ctx, args);
    case "grep":
      return grepTool(ctx, args);
    case "git":
      return gitTool(ctx, args);
    case "run_command":
      return runCommandTool(ctx, args);
    case "run_tests":
      return runTestsTool(ctx);
    case "run_build":
      return runBuildTool(ctx);
    case "unpin_file":
      return unpinFileTool(ctx, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}

async function unpinFileTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const rawPath = normalizeInputPath(stringArg(args, "path") ?? "");
  const filePath = resolveToolPath(ctx, rawPath);
  if (!ctx.host.unpinFile) {
    throw new Error("Pinned files are not supported by this backend.");
  }
  const removed = await ctx.host.unpinFile(filePath);
  if (!removed) {
    return {
      output: `File "${path.basename(filePath)}" was not pinned, nothing changed.`,
    };
  }
  return {
    output: `File "${path.basename(filePath)}" successfully unpinned from context.`,
  };
}

async function readFileTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  const result = await ctx.host.readTextFile({
    sessionId: ctx.sessionId,
    path: filePath,
    line: intArg(args, "line") ?? null,
    limit: intArg(args, "limit") ?? null,
  });
  return { output: result.content ?? "" };
}

/**
 * Matches systemic placeholders injected into conversation history, e.g.
 * `[read_file result omitted from history; ...]`,
 * `[grep result omitted from history; ...]`,
 * `[... output omitted from history ...]`,
 * `[SYSTEM NOTE: ...]`.
 *
 * The match is constrained to a single `[...]` span (no `]` inside) and to the
 * exact phrases the host injects. This avoids false positives when real code
 * mentions "omitted" inside brackets in a comment or string.
 */
const SYSTEMIC_MARKER_REGEX =
  /\[[^\]]*?(?:result omitted|output omitted|content omitted|SYSTEM NOTE)[^\]]*?\]/i;

function assertNoSystemicMarker(
  value: string | undefined,
  fieldName: string,
): void {
  if (!value) return;
  const match = value.match(SYSTEMIC_MARKER_REGEX);
  if (match) {
    throw new Error(
      `Cannot write file: contains systemic omission/compaction marker (${match[0]}). Provide actual code, do not write omitted markers into files.`,
    );
  }
}

async function writeFileTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  assertWritablePath(ctx.cwd, filePath);

  const fullContent = stringArg(args, "content");
  const searchText = stringArg(args, "searchText");
  const replaceText = stringArg(args, "replaceText");

  if (searchText !== undefined || replaceText !== undefined) {
    throw new Error(
      "write_file now only rewrites whole files. Use write_diff with `search`/`replace` or `startLine`/`endLine` for targeted edits.",
    );
  }

  assertNoSystemicMarker(fullContent, "content");

  if (fullContent === undefined) {
    throw new Error("write_file requires `content` (the complete new file).");
  }

  let oldText: string | null = null;
  try {
    const existing = await ctx.host.readTextFile({
      sessionId: ctx.sessionId,
      path: filePath,
    });
    oldText = existing.content ?? "";
  } catch {
    oldText = null;
  }

  await ctx.host.writeTextFile({
    sessionId: ctx.sessionId,
    path: filePath,
    content: fullContent,
  });
  return {
    output: `Wrote ${filePath}`,
    content: [
      { type: "diff", path: filePath, oldText, newText: fullContent },
    ],
  };
}

async function writeDiffTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  assertWritablePath(ctx.cwd, filePath);

  let oldText: string | null = null;
  try {
    const existing = await ctx.host.readTextFile({
      sessionId: ctx.sessionId,
      path: filePath,
    });
    oldText = existing.content ?? "";
  } catch {
    oldText = "";
  }

  const replaceText =
    stringArg(args, "replace") ?? stringArg(args, "content") ?? "";
  const startLine = intArg(args, "startLine");
  const endLine = intArg(args, "endLine") ?? startLine;
  const search = stringArg(args, "search") ?? stringArg(args, "searchText");

  assertNoSystemicMarker(replaceText, "replace");
  assertNoSystemicMarker(search, "search");

  let newContent: string;
  let summary: string;

  if (startLine !== undefined) {
    if (startLine < 1) {
      throw new Error("write_diff `startLine` must be >= 1.");
    }
    const safeEndLine =
      endLine !== undefined ? Math.max(startLine, endLine) : startLine;

    const current = oldText ?? "";
    const usesCrlf = current.includes("\r\n");
    const eol = usesCrlf ? "\r\n" : "\n";
    const lines = current.split(/\r?\n/);

    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(safeEndLine);
    const replacementLines =
      replaceText.length > 0 ? replaceText.split(/\r?\n/) : [];

    const combined = [...before, ...replacementLines, ...after];
    newContent = combined.join(eol);
    summary = `Replaced lines ${startLine}-${safeEndLine} in ${filePath}`;
  } else if (search !== undefined) {
    if (search.length === 0) {
      throw new Error("write_diff `search` must not be empty.");
    }
    const replaceAll = args.all === true;
    const res = robustReplace(oldText ?? "", search, replaceText, replaceAll);
    newContent = res.newContent;
    summary = `Replaced ${res.count} occurrence${res.count === 1 ? "" : "s"} in ${filePath}`;
  } else {
    throw new Error(
      "write_diff requires either `startLine` (with optional `endLine`) or `search`, along with `replace`.",
    );
  }

  await ctx.host.writeTextFile({
    sessionId: ctx.sessionId,
    path: filePath,
    content: newContent,
  });
  return {
    output: summary,
    content: [
      { type: "diff", path: filePath, oldText, newText: newContent },
    ],
  };
}

async function moveFileTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const sourcePath = resolveToolPath(
    ctx,
    stringArg(args, "sourcePath") ?? ".",
  );
  const destinationPath = resolveToolPath(
    ctx,
    stringArg(args, "destinationPath") ?? ".",
  );
  assertWritablePath(ctx.cwd, sourcePath);
  assertWritablePath(ctx.cwd, destinationPath);
  await ctx.host.moveTextFile({
    sessionId: ctx.sessionId,
    sourcePath,
    destinationPath,
  });
  return { output: `Moved ${sourcePath} -> ${destinationPath}` };
}

async function findFilesTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const pattern = stringArg(args, "pattern");
  const searchPath = stringArg(args, "path");
  const extensions = Array.isArray(args.extensions)
    ? (args.extensions.filter((x) => typeof x === "string") as string[])
    : undefined;
  const matches = await findFiles({
    pattern,
    extensions,
    cwd: ctx.cwd,
    searchPath,
    caseInsensitive: args.caseInsensitive === true,
    maxResults: intArg(args, "maxResults"),
    fileTree: ctx.fileTree,
  });
  if (matches.length === 0) return { output: "No files matched." };
  return { output: matches.join("\n") };
}

async function getFileStructureTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const searchPath = stringArg(args, "path") ?? ".";
  const depth = intArg(args, "depth") ?? 5;
  if (ctx.fileTree && ctx.fileTree.size > 0) {
    const text = ctx.fileTree.toHierarchyText(500, searchPath, depth);
    return { output: text };
  }
  const tree = new ProjectFileTree(ctx.cwd);
  await tree.scanProject();
  const text = tree.toHierarchyText(500, searchPath, depth);
  return { output: text };
}

async function grepTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const query = stringArg(args, "query") ?? stringArg(args, "pattern");
  if (!query) throw new Error("grep requires a query string.");
  const searchPath = stringArg(args, "path");
  const matches = await grepFiles({
    query,
    cwd: ctx.cwd,
    searchPath,
    caseInsensitive: args.caseInsensitive === true,
    maxResults: intArg(args, "maxResults"),
    fileTree: ctx.fileTree,
  });
  if (matches.length === 0) return { output: "No matches." };
  const lines = matches.map((match) => {
    const relPath = toPosixPath(path.relative(ctx.cwd, match.path));
    return `${relPath}:${match.line}:${match.text}`;
  });
  return { output: lines.join("\n") };
}

async function listDirTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const dirPath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  const entries = await listDirectory(dirPath);
  if (entries.length === 0) return { output: "(empty)" };
  const lines = entries.map((entry) =>
    entry.type === "directory" ? `${entry.name}/` : entry.name,
  );
  return { output: lines.join("\n") };
}

async function gitTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  const commandLine = stringArg(args, "command");
  if (!commandLine) throw new Error("git requires a command string.");
  const plan = planGitCommand(parseCommandLine(commandLine));
  return formatProcessResult(
    await runCapturedProcess({
      command: "git",
      args: plan.args,
      cwd: ctx.cwd,
      signal: ctx.signal,
    }),
  );
}

async function runCommandTool(
  ctx: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolSuccess> {
  if (!ctx.policy.allowCommands) {
    throw new Error(
      "Commands are disabled for this project. Set allowCommands: true under pulsar-assistant.projects in Pulsar user config (not in the project folder).",
    );
  }
  const commandLine = stringArg(args, "command");
  if (!commandLine) throw new Error("run_command requires a command string.");
  const argv = parseCommandLine(commandLine);
  const command = argv[0];
  if (!command) throw new Error("run_command command is empty.");
  const commandCwd = resolveToolPath(ctx, stringArg(args, "cwd") ?? ".");
  return formatProcessResult(
    await runCapturedProcess({
      command,
      args: argv.slice(1),
      cwd: commandCwd,
      signal: ctx.signal,
    }),
  );
}

/**
 * Runs a command from Pulsar user config through the platform shell.
 *
 * These commands are fixed by the user outside the project, so the model never
 * gets to influence them, and a shell is required for `&&` and for `npm` /
 * `tsc`, which are `.cmd` shims on Windows and need a shell to resolve them.
 * `run_command` deliberately keeps the shell-less argv path, because its
 * command line is model-provided.
 */
async function runConfiguredCommand(
  commandLine: string,
  cwd: string,
  signal: AbortSignal,
): Promise<ToolSuccess> {
  return formatProcessResult(
    await runCapturedProcess({
      command: commandLine,
      args: [],
      shell: true,
      // `tsc`, `npx` and friends live in node_modules/.bin and are not on PATH.
      pathDirs: [path.join(cwd, "node_modules", ".bin")],
      cwd,
      signal,
    }),
  );
}

async function runTestsTool(
  ctx: ToolExecutionContext,
): Promise<ToolSuccess> {
  const commandLine = ctx.policy.testCommand;
  if (!commandLine) {
    throw new Error(
      "No test command configured. Set testCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder).",
    );
  }
  if (!commandLine.trim()) throw new Error("Configured testCommand is empty.");
  return runConfiguredCommand(commandLine, ctx.cwd, ctx.signal);
}

async function runBuildTool(
  ctx: ToolExecutionContext,
): Promise<ToolSuccess> {
  const commandLine = ctx.policy.buildCommand;
  if (!commandLine) {
    throw new Error(
      "No build command configured. Set buildCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder).",
    );
  }
  if (!commandLine.trim()) throw new Error("Configured buildCommand is empty.");
  return runConfiguredCommand(commandLine, ctx.cwd, ctx.signal);
}

function formatProcessResult(result: {
  output: string;
  truncated: boolean;
  exitCode: number | null;
  signal: string | null;
}): ToolSuccess {
  const status =
    result.exitCode != null
      ? `exit ${result.exitCode}`
      : result.signal
        ? `signal ${result.signal}`
        : "exited";
  const truncated = result.truncated ? "\n(output truncated)" : "";
  return { output: `${status}\n${result.output}${truncated}`.trim() };
}
