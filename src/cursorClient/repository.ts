import spawn from "cross-spawn";
import type { CursorRepository } from "./types";

export type GitRunner = (
  args: string[],
  cwd: string,
) => Promise<{ stdout: string; stderr: string; code: number }>;

export const REPOSITORY_CACHE_TTL_MS = 5 * 60 * 1000;

export type RepositoryCache = {
  loadedAt: number;
  urls: Set<string>;
};

export function runGit(
  args: string[],
  cwd: string,
): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn("git", args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? 1 });
    });
  });
}

export async function getOriginUrl(
  projectRoot: string,
  run: GitRunner = runGit,
): Promise<string | null> {
  const result = await run(["remote", "get-url", "origin"], projectRoot);
  if (result.code !== 0) return null;
  const url = result.stdout.trim();
  return url || null;
}

export async function getCurrentBranch(
  projectRoot: string,
  run: GitRunner = runGit,
): Promise<string | null> {
  const result = await run(["rev-parse", "--abbrev-ref", "HEAD"], projectRoot);
  if (result.code !== 0) return null;
  const branch = result.stdout.trim();
  return branch || null;
}

export async function getCurrentCommit(
  projectRoot: string,
  run: GitRunner = runGit,
): Promise<string | null> {
  const result = await run(["rev-parse", "HEAD"], projectRoot);
  if (result.code !== 0) return null;
  const sha = result.stdout.trim();
  return sha || null;
}

export async function getRemoteBranchSha(
  projectRoot: string,
  branch: string,
  run: GitRunner = runGit,
): Promise<string | null> {
  const targetRef = `refs/heads/${branch}`;
  const result = await run(
    ["ls-remote", "--exit-code", "origin", targetRef],
    projectRoot,
  );
  if (result.code !== 0) return null;
  const lines = result.stdout.trim().split(/\r?\n/);
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 2 && parts[1] === targetRef) {
      return parts[0];
    }
  }
  return null;
}

// Canonicalizes ssh, scp-like (`git@host:owner/repo`) and https origins into
// `https://host/owner/repo` for stable comparison with Cursor's repository
// list. `git://` is intentionally rejected because it has no auth story.
export function normalizeRepositoryUrl(url: string): string | null {
  let value = url.trim();
  if (!value) return null;
  value = value.replace(/\/+$/, "");
  value = value.replace(/\.git$/i, "");

  let host = "";
  let pathPart = "";

  if (value.startsWith("git@")) {
    const rest = value.slice(4);
    const colon = rest.indexOf(":");
    if (colon === -1) return null;
    host = rest.slice(0, colon);
    pathPart = rest.slice(colon + 1);
  } else if (/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      return null;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:" && parsed.protocol !== "ssh:") {
      return null;
    }
    host = parsed.hostname;
    pathPart = parsed.pathname;
  } else {
    return null;
  }

  pathPart = pathPart.replace(/^\/+/, "");
  if (!host || !pathPart) return null;
  return `https://${host.toLowerCase()}/${pathPart}`;
}

export function repositoryKeysEqual(a: string, b: string): boolean {
  const normalizedA = normalizeRepositoryUrl(a);
  const normalizedB = normalizeRepositoryUrl(b);
  if (!normalizedA || !normalizedB) return false;

  let parsedA: URL;
  let parsedB: URL;
  try {
    parsedA = new URL(normalizedA);
    parsedB = new URL(normalizedB);
  } catch {
    return false;
  }
  return (
    parsedA.hostname.toLowerCase() === parsedB.hostname.toLowerCase() &&
    parsedA.pathname.toLowerCase().replace(/\/+$/, "") ===
      parsedB.pathname.toLowerCase().replace(/\/+$/, "")
  );
}

// Verifies that the local checkout is safe to hand to a remote cloud agent:
// clean tree, checked-out branch, and a pushed commit matching the remote head.
export async function validateWorkingTree(
  projectRoot: string,
  run: GitRunner = runGit,
): Promise<{ branch: string; headSha: string; remoteSha: string }> {
  const status = await run(["status", "--porcelain"], projectRoot);
  if (status.code !== 0) {
    throw new Error("Failed to check the git working tree.");
  }
  if (status.stdout.trim()) {
    throw new Error(
      "Cursor cannot see local uncommitted changes.\nCommit and push them first.",
    );
  }

  const branch = await getCurrentBranch(projectRoot, run);
  if (!branch || branch === "HEAD") {
    throw new Error("Cursor requires a checked-out git branch, not a detached HEAD.");
  }

  const headSha = await getCurrentCommit(projectRoot, run);
  if (!headSha) {
    throw new Error("Failed to determine the current git commit.");
  }

  const remoteSha = await getRemoteBranchSha(projectRoot, branch, run);
  if (!remoteSha) {
    throw new Error(
      `The current local branch "${branch}" is not available on the remote repository.\nPush the branch before starting a Cursor Cloud session.`,
    );
  }
  if (remoteSha !== headSha) {
    throw new Error(
      "The local branch does not match the remote branch.\nPush or update the branch before starting Cursor.",
    );
  }

  return { branch, headSha, remoteSha };
}

// Resolves the local origin to a Cursor-accessible repository URL. Repository
// membership is cached for five minutes because the list can be slow and does
// not change between turns.
export async function resolveCursorRepository(
  projectRoot: string,
  listRepositories: () => Promise<CursorRepository[]>,
  cache: RepositoryCache,
  run: GitRunner = runGit,
  now: () => number = Date.now,
): Promise<string> {
  const origin = await getOriginUrl(projectRoot, run);
  if (!origin) {
    throw new Error("Cursor backend cannot start: this project has no origin remote.");
  }
  const normalizedOrigin = normalizeRepositoryUrl(origin);
  if (!normalizedOrigin) {
    throw new Error(`Unsupported origin remote URL: ${origin}`);
  }

  if (cache.loadedAt === 0 || now() - cache.loadedAt >= REPOSITORY_CACHE_TTL_MS) {
    const repositories = await listRepositories();
    cache.loadedAt = now();
    cache.urls = new Set(
      repositories
        .map((repository) => repository.url)
        .filter((url): url is string => typeof url === "string" && !!url.trim()),
    );
  }

  for (const url of cache.urls) {
    if (repositoryKeysEqual(url, normalizedOrigin)) {
      // Return the Cursor-provided URL rather than the local origin so the
      // cloud agent receives the exact spelling it knows.
      return url;
    }
  }

  throw new Error(
    `Cursor does not have access to this project's repository:\n\n${origin}\n\nConnect the repository to Cursor before using the Cursor backend.`,
  );
}
