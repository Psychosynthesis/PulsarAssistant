const READ = new Set([
  "status",
  "diff",
  "log",
  "show",
  "branch",
  "blame",
  "rev-parse",
  "ls-files",
]);

const WRITE = new Set(["checkout", "switch", "add", "commit"]);

const ALLOWED = new Set([...READ, ...WRITE, "apply"]);

const BLOCKED_ANYWHERE = new Set([
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--bare",
  "--output",
  "-o",
]);

const BRANCH_BLOCKED_LONG = new Set(["--force", "--edit-description"]);
const BRANCH_BLOCKED_SHORT = new Set(["D", "M", "C", "f"]);

const BRANCH_READ_LONG_NO_VALUE = new Set([
  "--all",
  "--remotes",
  "--verbose",
  "--quiet",
  "--ignore-case",
  "--list",
  "--show-current",
  "--no-abbrev",
  "--no-column",
  "--no-color",
]);

const BRANCH_READ_LONG_WITH_OPT_VALUE = new Set([
  "--contains",
  "--no-contains",
  "--merged",
  "--no-merged",
  "--points-at",
  "--abbrev",
  "--column",
  "--color",
  "--sort",
  "--format",
]);

const BRANCH_READ_SHORT = new Set(["a", "r", "v", "q", "i", "l"]);

const APPLY_READ_FLAGS = new Set([
  "--check",
  "--numstat",
  "--stat",
  "--summary",
]);

const APPLY_INDEX_FLAGS = new Set(["--index", "--cached"]);

const APPLY_BLOCKED = new Set(["--unsafe-paths"]);

export type GitPlan = {
  args: string[];
  needsPermission: boolean;
  title: string;
};

function flagName(token: string): string {
  return token.split("=")[0];
}

function hasCommitMessage(argv: string[]): boolean {
  for (const token of argv) {
    if (token === "--") break;
    if (token === "-m" || token === "--message") return true;
    if (token.startsWith("--message=")) return true;
    if (/^-.*m/.test(token) && !token.startsWith("--")) return true;
  }
  return false;
}

function analyzeBranchArgs(args: string[]): { needsPermission: boolean } {
  const tokens = args.slice(1);
  let needsPermission = false;
  let hasListFlag = false;
  let positionalCount = 0;

  for (let idx = 0; idx < tokens.length; idx += 1) {
    const token = tokens[idx];
    if (token === "--") {
      positionalCount += tokens.length - idx - 1;
      break;
    }

    if (token.startsWith("--")) {
      const eqIdx = token.indexOf("=");
      const name = eqIdx >= 0 ? token.slice(0, eqIdx) : token;
      if (BRANCH_BLOCKED_LONG.has(name)) {
        throw new Error(`git branch option ${name} is not allowed.`);
      }
      if (name === "--list") {
        hasListFlag = true;
        continue;
      }
      if (BRANCH_READ_LONG_NO_VALUE.has(name)) {
        if (eqIdx >= 0) needsPermission = true;
        continue;
      }
      if (BRANCH_READ_LONG_WITH_OPT_VALUE.has(name)) {
        if (eqIdx < 0) {
          const next = tokens[idx + 1];
          if (next !== undefined && next !== "--" && !next.startsWith("-")) {
            idx += 1;
          }
        }
        continue;
      }
      needsPermission = true;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      for (const ch of token.slice(1)) {
        if (BRANCH_BLOCKED_SHORT.has(ch)) {
          throw new Error(`git branch option -${ch} is not allowed.`);
        }
        if (ch === "l") {
          hasListFlag = true;
        } else if (!BRANCH_READ_SHORT.has(ch)) {
          needsPermission = true;
        }
      }
      continue;
    }

    positionalCount += 1;
  }

  if (positionalCount > 0 && !hasListFlag) {
    needsPermission = true;
  }

  return { needsPermission };
}

function applyNeedsPermission(args: string[]): boolean {
  const tokens = args.slice(1);
  if (tokens.some((token) => APPLY_INDEX_FLAGS.has(flagName(token)))) {
    return true;
  }
  const hasReadFlag = tokens.some((token) =>
    APPLY_READ_FLAGS.has(flagName(token)),
  );
  return !hasReadFlag;
}

// `argv` is already split (no shell). A leading `git` token is ignored.
export function planGitCommand(argv: string[]): GitPlan {
  if (argv[0] === "git") argv = argv.slice(1);
  if (argv.length === 0) {
    throw new Error(
      'git requires arguments, e.g. status or checkout -b topic.',
    );
  }

  for (const token of argv) {
    if (token === "--") break;
    const flag = flagName(token);
    if (BLOCKED_ANYWHERE.has(flag)) {
      throw new Error(`git option ${flag} is not allowed.`);
    }
    if (!token.startsWith("--") && token.startsWith("-o") && token.length > 2) {
      throw new Error("git option -o is not allowed.");
    }
  }

  let i = 0;
  while (i < argv.length && argv[i].startsWith("-")) {
    const token = argv[i];
    const flag = flagName(token);
    if (flag === "-C" || (!token.startsWith("--") && token.startsWith("-C"))) {
      throw new Error("git option -C is not allowed.");
    }
    if (flag === "-c" || (!token.startsWith("--") && token.startsWith("-c"))) {
      throw new Error("git option -c is not allowed.");
    }
    i += 1;
  }

  const sub = argv[i];
  if (!sub || sub.startsWith("-")) {
    throw new Error(
      "Pass a git subcommand first (status, diff, checkout, ...).",
    );
  }
  if (!ALLOWED.has(sub)) {
    throw new Error(
      `git ${sub} is not allowed. Allowed: status, diff, log, show, branch, blame, rev-parse, ls-files, checkout, switch, add, commit, apply.`,
    );
  }

  const commandArgs = argv.slice(i);

  let branchNeedsPerm = false;
  if (sub === "branch") {
    branchNeedsPerm = analyzeBranchArgs(commandArgs).needsPermission;
  }

  if (sub === "diff" || sub === "log" || sub === "show") {
    for (const token of commandArgs.slice(1)) {
      if (token === "--") break;
      if (!token.startsWith("--") && token.startsWith("-") && token.slice(1).includes("o")) {
        throw new Error("git option -o is not allowed.");
      }
    }
  }

  if (sub === "apply") {
    const blocked = commandArgs.find((token) =>
      APPLY_BLOCKED.has(flagName(token)),
    );
    if (blocked) {
      throw new Error(
        `git apply option ${flagName(blocked)} is not allowed.`,
      );
    }
  }

  if (sub === "commit") {
    if (!hasCommitMessage(commandArgs)) {
      throw new Error('git commit requires -m "message".');
    }
    if (!commandArgs.includes("--no-verify") && !commandArgs.includes("-n")) {
      argv = [...argv, "--no-verify"];
    }
  }

  return {
    args: argv,
    needsPermission:
      WRITE.has(sub) ||
      branchNeedsPerm ||
      (sub === "apply" && applyNeedsPermission(commandArgs)),
    title: `git ${argv.join(" ")}`,
  };
}
