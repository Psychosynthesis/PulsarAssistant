import * as esbuild from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

// `.nvmrc` pins the Node version used to run esbuild and the tests (a modern
// toolchain; also used by CI via `node-version-file`). Pulsar executes the
// bundled code in the Electron renderer on Node.js 14.16, so the emitted
// JavaScript must stay Node 14-compatible no matter which Node runs the build.
const runtimeTarget = "node14";

// main.ts is Pulsar's entry point. Pure helpers are bundled on their own so
// tests can import lib/*.js without loading `atom`.
const options = {
  entryPoints: [
    "src/main.ts",
    "src/util.ts",
    "src/agent-config.ts",
    "src/grep.ts",
    "src/git-command.ts",
    "src/openai-client.ts",
    "src/project-uri.ts",
    "src/project-policy.ts",
    "src/session-storage.ts",
    "src/session/project-sessions.ts",
    "src/view/empty-state-content.ts",
    "src/file-btree.ts",
    "src/paths.ts",
    "src/proxy-fetch.ts",
    "src/token-estimate.ts",
    "src/editor/editor-backend.ts",
    "src/builtin/tools.ts",
    "src/web-search.ts",
    "src/open-url.ts",
  ],
  outdir: "lib",
  bundle: true,
  platform: "node",
  format: "cjs",
  target: runtimeTarget,
  sourcemap: true,
  external: ["atom", "electron"],
  define: {
    __PULSAR_ASSISTANT_VERSION__: JSON.stringify(pkg.version),
  },
  logLevel: "info",
};

if (process.argv.includes("--watch")) {
  const ctx = await esbuild.context(options);
  await ctx.watch();
  console.log("watching for changes...");
} else {
  await esbuild.build(options);
}
