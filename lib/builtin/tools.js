"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// node_modules/isexe/windows.js
var require_windows = __commonJS({
  "node_modules/isexe/windows.js"(exports2, module2) {
    module2.exports = isexe;
    isexe.sync = sync;
    var fs4 = require("fs");
    function checkPathExt(path6, options) {
      var pathext = options.pathExt !== void 0 ? options.pathExt : process.env.PATHEXT;
      if (!pathext) {
        return true;
      }
      pathext = pathext.split(";");
      if (pathext.indexOf("") !== -1) {
        return true;
      }
      for (var i = 0; i < pathext.length; i++) {
        var p = pathext[i].toLowerCase();
        if (p && path6.substr(-p.length).toLowerCase() === p) {
          return true;
        }
      }
      return false;
    }
    function checkStat(stat, path6, options) {
      if (!stat.isSymbolicLink() && !stat.isFile()) {
        return false;
      }
      return checkPathExt(path6, options);
    }
    function isexe(path6, options, cb) {
      fs4.stat(path6, function(er, stat) {
        cb(er, er ? false : checkStat(stat, path6, options));
      });
    }
    function sync(path6, options) {
      return checkStat(fs4.statSync(path6), path6, options);
    }
  }
});

// node_modules/isexe/mode.js
var require_mode = __commonJS({
  "node_modules/isexe/mode.js"(exports2, module2) {
    module2.exports = isexe;
    isexe.sync = sync;
    var fs4 = require("fs");
    function isexe(path6, options, cb) {
      fs4.stat(path6, function(er, stat) {
        cb(er, er ? false : checkStat(stat, options));
      });
    }
    function sync(path6, options) {
      return checkStat(fs4.statSync(path6), options);
    }
    function checkStat(stat, options) {
      return stat.isFile() && checkMode(stat, options);
    }
    function checkMode(stat, options) {
      var mod = stat.mode;
      var uid = stat.uid;
      var gid = stat.gid;
      var myUid = options.uid !== void 0 ? options.uid : process.getuid && process.getuid();
      var myGid = options.gid !== void 0 ? options.gid : process.getgid && process.getgid();
      var u = parseInt("100", 8);
      var g = parseInt("010", 8);
      var o = parseInt("001", 8);
      var ug = u | g;
      var ret = mod & o || mod & g && gid === myGid || mod & u && uid === myUid || mod & ug && myUid === 0;
      return ret;
    }
  }
});

// node_modules/isexe/index.js
var require_isexe = __commonJS({
  "node_modules/isexe/index.js"(exports2, module2) {
    var fs4 = require("fs");
    var core;
    if (process.platform === "win32" || global.TESTING_WINDOWS) {
      core = require_windows();
    } else {
      core = require_mode();
    }
    module2.exports = isexe;
    isexe.sync = sync;
    function isexe(path6, options, cb) {
      if (typeof options === "function") {
        cb = options;
        options = {};
      }
      if (!cb) {
        if (typeof Promise !== "function") {
          throw new TypeError("callback not provided");
        }
        return new Promise(function(resolve6, reject) {
          isexe(path6, options || {}, function(er, is) {
            if (er) {
              reject(er);
            } else {
              resolve6(is);
            }
          });
        });
      }
      core(path6, options || {}, function(er, is) {
        if (er) {
          if (er.code === "EACCES" || options && options.ignoreErrors) {
            er = null;
            is = false;
          }
        }
        cb(er, is);
      });
    }
    function sync(path6, options) {
      try {
        return core.sync(path6, options || {});
      } catch (er) {
        if (options && options.ignoreErrors || er.code === "EACCES") {
          return false;
        } else {
          throw er;
        }
      }
    }
  }
});

// node_modules/which/which.js
var require_which = __commonJS({
  "node_modules/which/which.js"(exports2, module2) {
    var isWindows = process.platform === "win32" || process.env.OSTYPE === "cygwin" || process.env.OSTYPE === "msys";
    var path6 = require("path");
    var COLON = isWindows ? ";" : ":";
    var isexe = require_isexe();
    var getNotFoundError = (cmd) => Object.assign(new Error(`not found: ${cmd}`), { code: "ENOENT" });
    var getPathInfo = (cmd, opt) => {
      const colon = opt.colon || COLON;
      const pathEnv = cmd.match(/\//) || isWindows && cmd.match(/\\/) ? [""] : [
        // windows always checks the cwd first
        ...isWindows ? [process.cwd()] : [],
        ...(opt.path || process.env.PATH || /* istanbul ignore next: very unusual */
        "").split(colon)
      ];
      const pathExtExe = isWindows ? opt.pathExt || process.env.PATHEXT || ".EXE;.CMD;.BAT;.COM" : "";
      const pathExt = isWindows ? pathExtExe.split(colon) : [""];
      if (isWindows) {
        if (cmd.indexOf(".") !== -1 && pathExt[0] !== "")
          pathExt.unshift("");
      }
      return {
        pathEnv,
        pathExt,
        pathExtExe
      };
    };
    var which = (cmd, opt, cb) => {
      if (typeof opt === "function") {
        cb = opt;
        opt = {};
      }
      if (!opt)
        opt = {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      const step = (i) => new Promise((resolve6, reject) => {
        if (i === pathEnv.length)
          return opt.all && found.length ? resolve6(found) : reject(getNotFoundError(cmd));
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path6.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        resolve6(subStep(p, i, 0));
      });
      const subStep = (p, i, ii) => new Promise((resolve6, reject) => {
        if (ii === pathExt.length)
          return resolve6(step(i + 1));
        const ext = pathExt[ii];
        isexe(p + ext, { pathExt: pathExtExe }, (er, is) => {
          if (!er && is) {
            if (opt.all)
              found.push(p + ext);
            else
              return resolve6(p + ext);
          }
          return resolve6(subStep(p, i, ii + 1));
        });
      });
      return cb ? step(0).then((res) => cb(null, res), cb) : step(0);
    };
    var whichSync = (cmd, opt) => {
      opt = opt || {};
      const { pathEnv, pathExt, pathExtExe } = getPathInfo(cmd, opt);
      const found = [];
      for (let i = 0; i < pathEnv.length; i++) {
        const ppRaw = pathEnv[i];
        const pathPart = /^".*"$/.test(ppRaw) ? ppRaw.slice(1, -1) : ppRaw;
        const pCmd = path6.join(pathPart, cmd);
        const p = !pathPart && /^\.[\\\/]/.test(cmd) ? cmd.slice(0, 2) + pCmd : pCmd;
        for (let j = 0; j < pathExt.length; j++) {
          const cur = p + pathExt[j];
          try {
            const is = isexe.sync(cur, { pathExt: pathExtExe });
            if (is) {
              if (opt.all)
                found.push(cur);
              else
                return cur;
            }
          } catch (ex) {
          }
        }
      }
      if (opt.all && found.length)
        return found;
      if (opt.nothrow)
        return null;
      throw getNotFoundError(cmd);
    };
    module2.exports = which;
    which.sync = whichSync;
  }
});

// node_modules/path-key/index.js
var require_path_key = __commonJS({
  "node_modules/path-key/index.js"(exports2, module2) {
    "use strict";
    var pathKey = (options = {}) => {
      const environment = options.env || process.env;
      const platform = options.platform || process.platform;
      if (platform !== "win32") {
        return "PATH";
      }
      return Object.keys(environment).reverse().find((key) => key.toUpperCase() === "PATH") || "Path";
    };
    module2.exports = pathKey;
    module2.exports.default = pathKey;
  }
});

// node_modules/cross-spawn/lib/util/resolveCommand.js
var require_resolveCommand = __commonJS({
  "node_modules/cross-spawn/lib/util/resolveCommand.js"(exports2, module2) {
    "use strict";
    var path6 = require("path");
    var which = require_which();
    var getPathKey = require_path_key();
    function resolveCommandAttempt(parsed, withoutPathExt) {
      const env = parsed.options.env || process.env;
      const cwd = process.cwd();
      const hasCustomCwd = parsed.options.cwd != null;
      const shouldSwitchCwd = hasCustomCwd && process.chdir !== void 0 && !process.chdir.disabled;
      if (shouldSwitchCwd) {
        try {
          process.chdir(parsed.options.cwd);
        } catch (err) {
        }
      }
      let resolved;
      try {
        resolved = which.sync(parsed.command, {
          path: env[getPathKey({ env })],
          pathExt: withoutPathExt ? path6.delimiter : void 0
        });
      } catch (e) {
      } finally {
        if (shouldSwitchCwd) {
          process.chdir(cwd);
        }
      }
      if (resolved) {
        resolved = path6.resolve(hasCustomCwd ? parsed.options.cwd : "", resolved);
      }
      return resolved;
    }
    function resolveCommand(parsed) {
      return resolveCommandAttempt(parsed) || resolveCommandAttempt(parsed, true);
    }
    module2.exports = resolveCommand;
  }
});

// node_modules/cross-spawn/lib/util/escape.js
var require_escape = __commonJS({
  "node_modules/cross-spawn/lib/util/escape.js"(exports2, module2) {
    "use strict";
    var metaCharsRegExp = /([()\][%!^"`<>&|;, *?])/g;
    function escapeCommand(arg) {
      arg = arg.replace(metaCharsRegExp, "^$1");
      return arg;
    }
    function escapeArgument(arg, doubleEscapeMetaChars) {
      arg = `${arg}`;
      arg = arg.replace(/(?=(\\+?)?)\1"/g, '$1$1\\"');
      arg = arg.replace(/(?=(\\+?)?)\1$/, "$1$1");
      arg = `"${arg}"`;
      arg = arg.replace(metaCharsRegExp, "^$1");
      if (doubleEscapeMetaChars) {
        arg = arg.replace(metaCharsRegExp, "^$1");
      }
      return arg;
    }
    module2.exports.command = escapeCommand;
    module2.exports.argument = escapeArgument;
  }
});

// node_modules/shebang-regex/index.js
var require_shebang_regex = __commonJS({
  "node_modules/shebang-regex/index.js"(exports2, module2) {
    "use strict";
    module2.exports = /^#!(.*)/;
  }
});

// node_modules/shebang-command/index.js
var require_shebang_command = __commonJS({
  "node_modules/shebang-command/index.js"(exports2, module2) {
    "use strict";
    var shebangRegex = require_shebang_regex();
    module2.exports = (string = "") => {
      const match = string.match(shebangRegex);
      if (!match) {
        return null;
      }
      const [path6, argument] = match[0].replace(/#! ?/, "").split(" ");
      const binary = path6.split("/").pop();
      if (binary === "env") {
        return argument;
      }
      return argument ? `${binary} ${argument}` : binary;
    };
  }
});

// node_modules/cross-spawn/lib/util/readShebang.js
var require_readShebang = __commonJS({
  "node_modules/cross-spawn/lib/util/readShebang.js"(exports2, module2) {
    "use strict";
    var fs4 = require("fs");
    var shebangCommand = require_shebang_command();
    function readShebang(command) {
      const size = 150;
      const buffer = Buffer.alloc(size);
      let fd;
      try {
        fd = fs4.openSync(command, "r");
        fs4.readSync(fd, buffer, 0, size, 0);
        fs4.closeSync(fd);
      } catch (e) {
      }
      return shebangCommand(buffer.toString());
    }
    module2.exports = readShebang;
  }
});

// node_modules/cross-spawn/lib/parse.js
var require_parse = __commonJS({
  "node_modules/cross-spawn/lib/parse.js"(exports2, module2) {
    "use strict";
    var path6 = require("path");
    var resolveCommand = require_resolveCommand();
    var escape = require_escape();
    var readShebang = require_readShebang();
    var isWin = process.platform === "win32";
    var isExecutableRegExp = /\.(?:com|exe)$/i;
    var isCmdShimRegExp = /node_modules[\\/].bin[\\/][^\\/]+\.cmd$/i;
    function detectShebang(parsed) {
      parsed.file = resolveCommand(parsed);
      const shebang = parsed.file && readShebang(parsed.file);
      if (shebang) {
        parsed.args.unshift(parsed.file);
        parsed.command = shebang;
        return resolveCommand(parsed);
      }
      return parsed.file;
    }
    function parseNonShell(parsed) {
      if (!isWin) {
        return parsed;
      }
      const commandFile = detectShebang(parsed);
      const needsShell = !isExecutableRegExp.test(commandFile);
      if (parsed.options.forceShell || needsShell) {
        const needsDoubleEscapeMetaChars = isCmdShimRegExp.test(commandFile);
        parsed.command = path6.normalize(parsed.command);
        parsed.command = escape.command(parsed.command);
        parsed.args = parsed.args.map((arg) => escape.argument(arg, needsDoubleEscapeMetaChars));
        const shellCommand = [parsed.command].concat(parsed.args).join(" ");
        parsed.args = ["/d", "/s", "/c", `"${shellCommand}"`];
        parsed.command = process.env.comspec || "cmd.exe";
        parsed.options.windowsVerbatimArguments = true;
      }
      return parsed;
    }
    function parse(command, args, options) {
      if (args && !Array.isArray(args)) {
        options = args;
        args = null;
      }
      args = args ? args.slice(0) : [];
      options = Object.assign({}, options);
      const parsed = {
        command,
        args,
        options,
        file: void 0,
        original: {
          command,
          args
        }
      };
      return options.shell ? parsed : parseNonShell(parsed);
    }
    module2.exports = parse;
  }
});

// node_modules/cross-spawn/lib/enoent.js
var require_enoent = __commonJS({
  "node_modules/cross-spawn/lib/enoent.js"(exports2, module2) {
    "use strict";
    var isWin = process.platform === "win32";
    function notFoundError(original, syscall) {
      return Object.assign(new Error(`${syscall} ${original.command} ENOENT`), {
        code: "ENOENT",
        errno: "ENOENT",
        syscall: `${syscall} ${original.command}`,
        path: original.command,
        spawnargs: original.args
      });
    }
    function hookChildProcess(cp, parsed) {
      if (!isWin) {
        return;
      }
      const originalEmit = cp.emit;
      cp.emit = function(name, arg1) {
        if (name === "exit") {
          const err = verifyENOENT(arg1, parsed);
          if (err) {
            return originalEmit.call(cp, "error", err);
          }
        }
        return originalEmit.apply(cp, arguments);
      };
    }
    function verifyENOENT(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawn");
      }
      return null;
    }
    function verifyENOENTSync(status, parsed) {
      if (isWin && status === 1 && !parsed.file) {
        return notFoundError(parsed.original, "spawnSync");
      }
      return null;
    }
    module2.exports = {
      hookChildProcess,
      verifyENOENT,
      verifyENOENTSync,
      notFoundError
    };
  }
});

// node_modules/cross-spawn/index.js
var require_cross_spawn = __commonJS({
  "node_modules/cross-spawn/index.js"(exports2, module2) {
    "use strict";
    var cp = require("child_process");
    var parse = require_parse();
    var enoent = require_enoent();
    function spawn2(command, args, options) {
      const parsed = parse(command, args, options);
      const spawned = cp.spawn(parsed.command, parsed.args, parsed.options);
      enoent.hookChildProcess(spawned, parsed);
      return spawned;
    }
    function spawnSync(command, args, options) {
      const parsed = parse(command, args, options);
      const result = cp.spawnSync(parsed.command, parsed.args, parsed.options);
      result.error = result.error || enoent.verifyENOENTSync(result.status, parsed);
      return result;
    }
    module2.exports = spawn2;
    module2.exports.spawn = spawn2;
    module2.exports.sync = spawnSync;
    module2.exports._parse = parse;
    module2.exports._enoent = enoent;
  }
});

// src/builtin/tools.ts
var tools_exports = {};
__export(tools_exports, {
  TOOL_DEFINITIONS: () => TOOL_DEFINITIONS,
  ToolRejected: () => ToolRejected,
  WEB_FETCH_TOOL: () => WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL: () => WEB_SEARCH_TOOL,
  describeToolCall: () => describeToolCall,
  executeTool: () => executeTool,
  requestToolPermission: () => requestToolPermission,
  toolsForPolicy: () => toolsForPolicy
});
module.exports = __toCommonJS(tools_exports);
var path5 = __toESM(require("path"));

// src/util.ts
var import_path = require("path");
var import_cross_spawn = __toESM(require_cross_spawn());
var TERMINAL_KILL_GRACE_MS = 2e3;
var DEFAULT_PROCESS_OUTPUT_BYTES = 64 * 1024;
var MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;
function parseCommandLine(line) {
  const tokens = [];
  let current = "";
  let inQuotes = false;
  let hasToken = false;
  for (const char of line) {
    if (char === '"') {
      inQuotes = !inQuotes;
      hasToken = true;
      continue;
    }
    if (!inQuotes && (char === " " || char === "	" || char === "\r" || char === "\n")) {
      if (hasToken) {
        tokens.push(current);
        current = "";
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }
  if (hasToken) tokens.push(current);
  return tokens;
}
var TerminalRecord = class {
  constructor(child, outputByteLimit, onOutput) {
    this.child = child;
    this.outputByteLimit = outputByteLimit;
    this.onOutput = onOutput;
    this.truncated = false;
    this.exitStatus = null;
    this.chunkList = [];
    this.totalLength = 0;
    this.waitResolvers = /* @__PURE__ */ new Set();
    this.emitScheduled = false;
  }
  append(chunk) {
    this.chunkList.push(chunk);
    this.totalLength += chunk.length;
    if (this.totalLength > this.outputByteLimit) {
      let combined = Buffer.concat(this.chunkList);
      let start = combined.length - this.outputByteLimit;
      while (start < combined.length && (combined[start] & 192) === 128) {
        start++;
      }
      const newline = combined.indexOf(10, start);
      if (newline !== -1 && newline + 1 < combined.length) {
        start = newline + 1;
      }
      this.chunkList = [combined.subarray(start)];
      this.totalLength = this.chunkList[0].length;
      this.truncated = true;
    }
    this.scheduleEmit();
  }
  // Coalesce UI emits: a chatty command produces thousands of small chunks, and
  // re-rendering the full buffer on each one causes jank. Callers that need the
  // current buffer read `output()` directly.
  scheduleEmit() {
    if (this.emitScheduled) return;
    this.emitScheduled = true;
    setTimeout(() => {
      this.emitScheduled = false;
      this.onOutput();
    }, 33);
  }
  flushOutput() {
    this.onOutput();
  }
  output() {
    if (this.chunkList.length > 1) {
      this.chunkList = [Buffer.concat(this.chunkList)];
    }
    return this.chunkList.length > 0 ? this.chunkList[0].toString("utf8") : "";
  }
  resolveExit(status) {
    if (!this.exitStatus) this.exitStatus = status;
    this.releaseWaiters();
  }
  // Unblocks pending `waitForExit` callers without recording a synthetic exit
  // status, so the kill-escalation timer in `killProcess` can still fire when
  // the record is released while its process is still being torn down.
  releaseWaiters() {
    const status = this.exitStatus ?? { exitCode: null, signal: null };
    for (const resolve6 of this.waitResolvers) resolve6(status);
    this.waitResolvers.clear();
  }
  waitForExit() {
    if (this.exitStatus) return Promise.resolve(this.exitStatus);
    return new Promise((resolve6) => this.waitResolvers.add(resolve6));
  }
  // SIGTERM, then SIGKILL after a grace period. On POSIX the child is spawned
  // detached so the whole process group can be signalled; on Windows use
  // `taskkill /t` to terminate the whole process tree (graceful, then forced),
  // since `child.kill()` would only terminate the root and orphan descendants.
  killProcess() {
    var _a, _b;
    if (this.exitStatus) return;
    const pid = (_a = this.child) == null ? void 0 : _a.pid;
    if (pid == null) {
      try {
        (_b = this.child) == null ? void 0 : _b.kill("SIGTERM");
      } catch {
      }
      return;
    }
    if (process.platform === "win32") {
      this.runTaskkill(pid, false);
      setTimeout(() => {
        if (this.exitStatus) return;
        this.runTaskkill(pid, true);
      }, TERMINAL_KILL_GRACE_MS);
      return;
    }
    this.signalGroup(pid, "SIGTERM");
    setTimeout(() => {
      if (this.exitStatus) return;
      this.signalGroup(pid, "SIGKILL");
    }, TERMINAL_KILL_GRACE_MS);
  }
  runTaskkill(pid, force) {
    const args = ["/pid", String(pid), "/t"];
    if (force) args.push("/f");
    try {
      const killer = (0, import_cross_spawn.default)("taskkill", args, { windowsHide: true });
      killer.on("error", () => {
      });
    } catch {
    }
  }
  signalGroup(pid, signal) {
    var _a;
    try {
      process.kill(-pid, signal);
    } catch {
      try {
        (_a = this.child) == null ? void 0 : _a.kill(signal);
      } catch {
      }
    }
  }
};
async function runCapturedProcess(options) {
  var _a, _b;
  const limit = Math.max(
    1,
    Math.min(
      options.outputByteLimit ?? DEFAULT_PROCESS_OUTPUT_BYTES,
      MAX_PROCESS_OUTPUT_BYTES
    )
  );
  const env = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (value !== void 0) env[key] = value;
  }
  env.PAGER = "";
  env.GIT_PAGER = "cat";
  env.GIT_TERMINAL_PROMPT = "0";
  const pathDirs = (options.pathDirs ?? []).filter((dir) => dir.length > 0);
  if (pathDirs.length > 0) {
    const key = Object.keys(env).find((name) => name.toLowerCase() === "path") ?? "PATH";
    const current = env[key];
    const prefix = pathDirs.join(import_path.delimiter);
    env[key] = current ? `${prefix}${import_path.delimiter}${current}` : prefix;
  }
  const child = (0, import_cross_spawn.default)(options.command, options.args, {
    cwd: options.cwd,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: process.platform !== "win32",
    windowsHide: true,
    shell: options.shell === true
  });
  const record = new TerminalRecord(child, limit, () => {
  });
  (_a = child.stdout) == null ? void 0 : _a.on("data", (chunk) => record.append(chunk));
  (_b = child.stderr) == null ? void 0 : _b.on("data", (chunk) => record.append(chunk));
  child.on("error", (error) => {
    record.append(Buffer.from(`
${error.message}
`));
    record.resolveExit({ exitCode: null, signal: null });
  });
  child.on("exit", (code, signal) => {
    record.resolveExit({ exitCode: code, signal });
  });
  const abort = () => record.killProcess();
  if (options.signal.aborted) abort();
  else options.signal.addEventListener("abort", abort, { once: true });
  child.once("spawn", () => {
    if (options.signal.aborted && !record.exitStatus) abort();
  });
  return record.waitForExit().then((status) => {
    options.signal.removeEventListener("abort", abort);
    if (options.signal.aborted) throw new Error("Cancelled.");
    return {
      output: record.output(),
      truncated: record.truncated,
      exitCode: status.exitCode ?? null,
      signal: status.signal ?? null
    };
  });
}

// src/grep.ts
var fs2 = __toESM(require("fs"));
var path3 = __toESM(require("path"));

// src/project-uri.ts
var fs = __toESM(require("fs"));
var path2 = __toESM(require("path"));

// src/input-normalize.ts
var path = __toESM(require("path"));
function normalizeInputPath(raw) {
  if (typeof raw !== "string") return "";
  let p = raw.trim();
  if (!p) return "";
  if (p.startsWith('"') && p.endsWith('"') || p.startsWith("'") && p.endsWith("'") || p.startsWith("`") && p.endsWith("`")) {
    p = p.slice(1, -1).trim();
  }
  p = p.replace(/\\\//g, "/");
  const isWinDrive = /^[a-zA-Z]:[/\\]/.test(p);
  p = p.replace(/\\/g, "/");
  p = p.replace(/\/+/g, "/");
  if (!isWinDrive && p.startsWith("/")) {
    p = p.replace(/^\/+/, "");
  }
  p = p.replace(/^\.\//, "");
  return p;
}
function resolveSafeProjectPath(cwd, requested) {
  const norm = normalizeInputPath(requested);
  if (!norm || norm === ".") {
    return path.resolve(cwd);
  }
  const root = path.resolve(cwd);
  const target = path.isAbsolute(norm) ? path.resolve(norm) : path.resolve(root, norm);
  const isWindows = process.platform === "win32";
  const normRoot = isWindows ? root.toLowerCase() : root;
  const normTarget = isWindows ? target.toLowerCase() : target;
  const rel = path.relative(normRoot, normTarget);
  if (rel.startsWith("..") || (isWindows ? /^[a-zA-Z]:/.test(rel) : path.isAbsolute(rel))) {
    throw new Error(`Path is outside the project: ${String(requested)}`);
  }
  return target;
}
function robustReplace(current, search, replace, replaceAll = false) {
  if (!search) {
    throw new Error("Search text cannot be empty.");
  }
  const usesCrlf = current.includes("\r\n");
  let parts = current.split(search);
  if (parts.length > 1) {
    const count = replaceAll ? parts.length - 1 : 1;
    const newContent = replaceAll ? parts.join(replace) : parts[0] + replace + parts.slice(1).join(search);
    return { newContent, count };
  }
  const normCurrent = current.replace(/\r\n/g, "\n");
  const normSearch = search.replace(/\r\n/g, "\n");
  const normReplace = replace.replace(/\r\n/g, "\n");
  parts = normCurrent.split(normSearch);
  if (parts.length > 1) {
    const count = replaceAll ? parts.length - 1 : 1;
    let joined = replaceAll ? parts.join(normReplace) : parts[0] + normReplace + parts.slice(1).join(normSearch);
    if (usesCrlf) {
      joined = joined.replace(/\n/g, "\r\n");
    }
    return { newContent: joined, count };
  }
  if (search.includes("\\n") && !search.includes("\n")) {
    const unescapedSearch = search.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\"/g, '"');
    const unescapedReplace = replace.replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\t/g, "	").replace(/\\"/g, '"');
    const result = robustReplace(current, unescapedSearch, unescapedReplace, replaceAll);
    if (result.count > 0) return result;
  }
  const currentLines = normCurrent.split("\n");
  const searchLines = normSearch.split("\n");
  if (searchLines.length > 1 && searchLines.length <= currentLines.length) {
    const trimmedSearchLines = searchLines.map((l) => l.trimEnd());
    for (let i = 0; i <= currentLines.length - searchLines.length; i++) {
      let matched = true;
      for (let j = 0; j < searchLines.length; j++) {
        if (currentLines[i + j].trimEnd() !== trimmedSearchLines[j]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        const before = currentLines.slice(0, i);
        const after = currentLines.slice(i + searchLines.length);
        const replaceLines = normReplace.split("\n");
        let combined = [...before, ...replaceLines, ...after].join("\n");
        if (usesCrlf) {
          combined = combined.replace(/\n/g, "\r\n");
        }
        return { newContent: combined, count: 1 };
      }
    }
  }
  throw new Error("Search text not found in file.");
}

// src/project-uri.ts
function resolveRealPath(filePath) {
  const target = path2.resolve(filePath);
  let current = target;
  const missing = [];
  while (true) {
    try {
      const real = fs.realpathSync(current);
      return missing.length > 0 ? path2.join(real, ...missing) : real;
    } catch (error) {
      const code = error.code;
      if (code !== "ENOENT" && code !== "ENOTDIR") throw error;
      const parent = path2.dirname(current);
      if (parent === current) return target;
      missing.unshift(path2.basename(current));
      current = parent;
    }
  }
}
function resolveInsideRoot(cwd, requested) {
  const target = resolveSafeProjectPath(cwd, requested);
  const root = path2.resolve(cwd);
  const realRoot = resolveRealPath(root);
  const realTarget = resolveRealPath(target);
  const isWindows = process.platform === "win32";
  const realRel = path2.relative(
    isWindows ? realRoot.toLowerCase() : realRoot,
    isWindows ? realTarget.toLowerCase() : realTarget
  );
  if (realRel.startsWith("..") || (isWindows ? /^[a-zA-Z]:/.test(realRel) : path2.isAbsolute(realRel))) {
    throw new Error(`Path is outside the project: ${requested}`);
  }
  return target;
}

// src/ignored-dirs.ts
var DEFAULT_IGNORED_DIRS = [
  // Version control
  ".git",
  ".hg",
  ".svn",
  ".jj",
  // Dependencies & package managers
  "node_modules",
  ".pnpm-store",
  ".yarn",
  "vendor",
  ".bundle",
  ".cargo",
  ".rustup",
  // Build outputs & caches
  "dist",
  "build",
  "out",
  ".output",
  "target",
  ".next",
  ".nuxt",
  ".svelte-kit",
  ".turbo",
  ".cache",
  ".gradle",
  // Test coverage & reports
  "coverage",
  ".nyc_output",
  // Python environments & caches
  ".venv",
  "venv",
  "env",
  "__pycache__",
  ".pytest_cache",
  ".mypy_cache",
  ".ruff_cache",
  ".tox",
  // IDEs & editors
  ".idea",
  ".vscode",
  ".pulsar"
];
var DEFAULT_IGNORED_SET = new Set(DEFAULT_IGNORED_DIRS);
function buildIgnoredDirsSet(customDirs) {
  const set = new Set(DEFAULT_IGNORED_SET);
  if (customDirs) {
    for (const dir of customDirs) {
      const trimmed = dir.trim();
      if (trimmed) set.add(trimmed);
    }
  }
  return set;
}
function getConfiguredIgnoredDirs() {
  var _a;
  if (typeof atom !== "undefined" && ((_a = atom == null ? void 0 : atom.config) == null ? void 0 : _a.get)) {
    const custom = atom.config.get("pulsar-assistant.ignoredDirectories");
    if (Array.isArray(custom)) {
      return buildIgnoredDirsSet(custom.filter((x) => typeof x === "string"));
    }
  }
  return new Set(DEFAULT_IGNORED_SET);
}

// src/grep.ts
var DEFAULT_SKIP_DIRS = buildIgnoredDirsSet();
var DEFAULT_MAX_FILE_BYTES = 1 * 1024 * 1024;
var DEFAULT_MAX_RESULTS = 100;
var HARD_MAX_RESULTS = 500;
function splitUnescaped(input, delimiter2) {
  const parts = [];
  let current = "";
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (ch === "\\") {
      current += ch;
      if (i + 1 < input.length) {
        current += input[i + 1];
        i++;
      }
      continue;
    }
    if (ch === delimiter2) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  parts.push(current.trim());
  return parts;
}
function atomToRegExp(atom2, caseInsensitive) {
  let regexStr = "^";
  let i = 0;
  while (i < atom2.length) {
    const ch = atom2[i];
    if (ch === "\\") {
      if (i + 1 < atom2.length) {
        const next = atom2[i + 1];
        if ("\\^$+{}()|[]*?.#".includes(next)) {
          regexStr += `\\${next}`;
        } else {
          regexStr += next;
        }
        i += 2;
        continue;
      } else {
        regexStr += "\\\\";
        i++;
        continue;
      }
    }
    if (ch === "*") {
      regexStr += ".*";
      i++;
      continue;
    }
    if (ch === "?") {
      regexStr += ".";
      i++;
      continue;
    }
    if ("\\^$+{}()|[]*.#".includes(ch)) {
      regexStr += `\\${ch}`;
    } else {
      regexStr += ch;
    }
    i++;
  }
  regexStr += "$";
  return new RegExp(regexStr, caseInsensitive ? "i" : "");
}
function parseDslPattern(pattern, caseInsensitive = false) {
  if (!pattern || !pattern.trim()) {
    return () => true;
  }
  const orBranches = splitUnescaped(pattern, "|").filter((s) => s.length > 0);
  if (orBranches.length === 0) {
    return () => true;
  }
  const compiledOrBranches = orBranches.map((branch) => {
    const andTerms = splitUnescaped(branch, "&").filter((s) => s.length > 0);
    return andTerms.map((term) => atomToRegExp(term, caseInsensitive));
  });
  return (basename4) => {
    return compiledOrBranches.some(
      (andTerms) => andTerms.every((regex) => regex.test(basename4))
    );
  };
}
function makeExtensionsMatcher(extensions, caseInsensitive = false) {
  if (!extensions || extensions.length === 0) {
    return () => true;
  }
  const normalized = extensions.map((ext) => {
    const trimmed = ext.trim().replace(/^\./, "");
    return caseInsensitive ? trimmed.toLowerCase() : trimmed;
  }).filter(Boolean);
  if (normalized.length === 0) return () => true;
  const set = new Set(normalized);
  return (basename4) => {
    const ext = path3.extname(basename4).replace(/^\./, "");
    const target = caseInsensitive ? ext.toLowerCase() : ext;
    return set.has(target);
  };
}
function looksBinary(buffer) {
  const check = buffer.subarray(0, 1024);
  for (let i = 0; i < check.length; i++) {
    if (check[i] === 0) return true;
  }
  return false;
}
async function walkFiles(root, skipDirs, visit) {
  const stack = [
    { dir: root, relative: "" }
  ];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    let entries;
    try {
      entries = await fs2.promises.readdir(current.dir, { withFileTypes: true });
    } catch {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const absolutePath = path3.join(current.dir, entry.name);
      const relativePath = current.relative ? path3.join(current.relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name)) continue;
        stack.push({ dir: absolutePath, relative: relativePath });
        continue;
      }
      if (!entry.isFile()) continue;
      const keepGoing = await visit(absolutePath, relativePath);
      if (keepGoing === false) return;
    }
  }
}
async function findFiles(options) {
  const cwd = path3.resolve(options.cwd);
  const normalizedSearch = normalizeInputPath(options.searchPath ?? ".");
  const searchRoot = resolveInsideRoot(cwd, normalizedSearch || ".");
  const skipDirs = options.skipDirs ?? getConfiguredIgnoredDirs();
  const maxResults = Math.max(
    1,
    Math.min(options.maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS)
  );
  const dslMatcher = parseDslPattern(options.pattern, options.caseInsensitive === true);
  const extMatcher = makeExtensionsMatcher(options.extensions, options.caseInsensitive === true);
  const matches = [];
  const searchRel = path3.relative(cwd, searchRoot).replace(/\\/g, "/");
  if (options.fileTree && options.fileTree.size > 0) {
    const all = searchRel === "" || searchRel === "." ? options.fileTree.listAll() : options.fileTree.findInDirectory(searchRel);
    for (const item of all) {
      if (item.isDirectory) continue;
      const basename4 = path3.posix.basename(item.path);
      if (dslMatcher(basename4) && extMatcher(basename4)) {
        matches.push(path3.resolve(cwd, item.path));
        if (matches.length >= maxResults) break;
      }
    }
    if (all.length > 0 || matches.length > 0) {
      return matches;
    }
  }
  await walkFiles(searchRoot, skipDirs, async (absolutePath) => {
    const basename4 = path3.basename(absolutePath);
    if (!dslMatcher(basename4) || !extMatcher(basename4)) return;
    matches.push(absolutePath);
    if (matches.length >= maxResults) return false;
  });
  return matches;
}
async function grepFiles(options) {
  const cwd = path3.resolve(options.cwd);
  const normalizedSearch = normalizeInputPath(options.searchPath ?? ".");
  const searchRoot = resolveInsideRoot(cwd, normalizedSearch || ".");
  const skipDirs = options.skipDirs ?? getConfiguredIgnoredDirs();
  const maxResults = Math.max(
    1,
    Math.min(options.maxResults ?? DEFAULT_MAX_RESULTS, HARD_MAX_RESULTS)
  );
  const maxFileBytes = options.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const matches = [];
  const query = options.caseInsensitive ? options.query.toLowerCase() : options.query;
  if (!query) {
    return matches;
  }
  let searchStat = null;
  try {
    searchStat = await fs2.promises.stat(searchRoot);
  } catch {
    return matches;
  }
  if (searchStat.isFile()) {
    await searchSingleFile(searchRoot);
    return matches;
  }
  async function searchSingleFile(absolutePath) {
    let stat;
    try {
      stat = await fs2.promises.stat(absolutePath);
    } catch {
      return;
    }
    if (stat.size > maxFileBytes) return;
    let buffer;
    try {
      buffer = await fs2.promises.readFile(absolutePath);
    } catch {
      return;
    }
    if (looksBinary(buffer)) return;
    const text = buffer.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const target = options.caseInsensitive ? line.toLowerCase() : line;
      if (!target.includes(query)) continue;
      matches.push({
        path: absolutePath,
        line: i + 1,
        text: lines[i].length > 400 ? `${lines[i].slice(0, 400)}\u2026` : lines[i]
      });
      if (matches.length >= maxResults) return false;
    }
  }
  const searchRel = path3.relative(cwd, searchRoot).replace(/\\/g, "/");
  if (options.fileTree && options.fileTree.size > 0) {
    const all = searchRel === "" || searchRel === "." ? options.fileTree.listAll() : options.fileTree.findInDirectory(searchRel);
    for (const item of all) {
      if (item.isDirectory) continue;
      const abs = path3.resolve(cwd, item.path);
      const keep = await searchSingleFile(abs);
      if (keep === false) break;
    }
    if (all.length > 0 || matches.length > 0) {
      return matches;
    }
  }
  await walkFiles(searchRoot, skipDirs, async (absolutePath) => {
    const keep = await searchSingleFile(absolutePath);
    if (keep === false) return false;
  });
  return matches;
}
async function listDirectory(dirPath) {
  const entries = await fs2.promises.readdir(dirPath, { withFileTypes: true });
  const listed = entries.map((entry) => {
    let type = "other";
    if (entry.isDirectory()) type = "directory";
    else if (entry.isFile()) type = "file";
    return { name: entry.name, type };
  });
  listed.sort((a, b) => a.name.localeCompare(b.name));
  return listed;
}

// src/git-command.ts
var READ = /* @__PURE__ */ new Set([
  "status",
  "diff",
  "log",
  "show",
  "branch",
  "blame",
  "rev-parse",
  "ls-files"
]);
var WRITE = /* @__PURE__ */ new Set(["checkout", "switch", "add", "commit"]);
var ALLOWED = /* @__PURE__ */ new Set([...READ, ...WRITE, "apply"]);
var BLOCKED_ANYWHERE = /* @__PURE__ */ new Set([
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--bare",
  "--output",
  "-o"
]);
var BRANCH_MUTATING = /* @__PURE__ */ new Set([
  "-m",
  "--move",
  "-c",
  "--copy",
  "-d",
  "--delete",
  "--track",
  "--no-track"
]);
var BRANCH_BLOCKED = /* @__PURE__ */ new Set([
  "-M",
  "-C",
  "-D",
  "-f",
  "--force",
  "--edit-description"
]);
var APPLY_READ_FLAGS = /* @__PURE__ */ new Set([
  "--check",
  "--numstat",
  "--stat",
  "--summary"
]);
var APPLY_INDEX_FLAGS = /* @__PURE__ */ new Set(["--index", "--cached"]);
var APPLY_BLOCKED = /* @__PURE__ */ new Set(["--unsafe-paths"]);
function flagName(token) {
  return token.split("=")[0];
}
function hasCommitMessage(argv) {
  for (const token of argv) {
    if (token === "-m" || token === "--message") return true;
    if (token.startsWith("--message=")) return true;
    if (/^-.*m/.test(token) && !token.startsWith("--")) return true;
  }
  return false;
}
function branchNeedsPermission(args) {
  const tokens = args.slice(1);
  if (tokens.some((token) => BRANCH_MUTATING.has(flagName(token)))) {
    return true;
  }
  return tokens.length > 0 && tokens.every((token) => !token.startsWith("-") && token !== "--");
}
function applyNeedsPermission(args) {
  const tokens = args.slice(1);
  if (tokens.some((token) => APPLY_INDEX_FLAGS.has(flagName(token)))) {
    return true;
  }
  const hasReadFlag = tokens.some(
    (token) => APPLY_READ_FLAGS.has(flagName(token))
  );
  return !hasReadFlag;
}
function planGitCommand(argv) {
  if (argv[0] === "git") argv = argv.slice(1);
  if (argv.length === 0) {
    throw new Error(
      "git requires arguments, e.g. status or checkout -b topic."
    );
  }
  for (const token of argv) {
    const flag = flagName(token);
    if (BLOCKED_ANYWHERE.has(flag)) {
      throw new Error(`git option ${flag} is not allowed.`);
    }
  }
  let i = 0;
  while (i < argv.length && argv[i].startsWith("-")) {
    const flag = flagName(argv[i]);
    if (flag === "-C" || flag === "-c") {
      throw new Error(`git option ${flag} is not allowed.`);
    }
    i += 1;
  }
  const sub = argv[i];
  if (!sub || sub.startsWith("-")) {
    throw new Error(
      "Pass a git subcommand first (status, diff, checkout, ...)."
    );
  }
  if (!ALLOWED.has(sub)) {
    throw new Error(
      `git ${sub} is not allowed. Allowed: status, diff, log, show, branch, blame, rev-parse, ls-files, checkout, switch, add, commit, apply.`
    );
  }
  const commandArgs = argv.slice(i);
  if (sub === "branch") {
    const blocked = commandArgs.find(
      (token) => BRANCH_BLOCKED.has(flagName(token))
    );
    if (blocked) {
      throw new Error(
        `git branch option ${flagName(blocked)} is not allowed.`
      );
    }
  }
  if (sub === "apply") {
    const blocked = commandArgs.find(
      (token) => APPLY_BLOCKED.has(flagName(token))
    );
    if (blocked) {
      throw new Error(
        `git apply option ${flagName(blocked)} is not allowed.`
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
    needsPermission: WRITE.has(sub) || sub === "branch" && branchNeedsPermission(commandArgs) || sub === "apply" && applyNeedsPermission(commandArgs),
    title: `git ${argv.join(" ")}`
  };
}

// src/file-btree.ts
var fs3 = __toESM(require("fs"));
var path4 = __toESM(require("path"));

// src/paths.ts
function toPosixPath(relPath) {
  return relPath.replace(/\\/g, "/");
}

// src/file-btree.ts
var DEFAULT_PROJECT_SKIP_DIRS = buildIgnoredDirsSet();
var BTreeNode = class _BTreeNode {
  constructor(leaf = true) {
    this.leaf = leaf;
    this.keys = [];
    this.values = [];
    this.children = [];
  }
  toJSON() {
    const out = {
      leaf: this.leaf,
      keys: this.keys,
      values: this.values
    };
    if (!this.leaf && this.children.length > 0) {
      out.children = this.children.map((c) => c.toJSON());
    }
    return out;
  }
  static fromJSON(json) {
    const node = new _BTreeNode(json.leaf);
    node.keys = [...json.keys];
    node.values = json.values.map((v) => {
      if (v && typeof v === "object" && "path" in v) {
        const { path: _p, ...rest } = v;
        return rest;
      }
      return v;
    });
    if (json.children) {
      node.children = json.children.map((c) => _BTreeNode.fromJSON(c));
    }
    return node;
  }
};
var BTree = class {
  constructor(degree = 16) {
    this._size = 0;
    if (degree < 2) throw new Error("Degree t must be >= 2");
    this.t = degree;
    this.root = new BTreeNode(true);
  }
  size() {
    return this._size;
  }
  search(key) {
    return this._searchNode(this.root, key);
  }
  _searchNode(node, key) {
    let i = 0;
    while (i < node.keys.length && key > node.keys[i]) {
      i++;
    }
    if (i < node.keys.length && key === node.keys[i]) {
      return node.values[i];
    }
    if (node.leaf) {
      return null;
    }
    return this._searchNode(node.children[i], key);
  }
  insert(key, value) {
    const existing = this.search(key);
    if (existing !== null) {
      this._updateNode(this.root, key, value);
      return;
    }
    const r = this.root;
    if (r.keys.length === 2 * this.t - 1) {
      const s = new BTreeNode(false);
      this.root = s;
      s.children.push(r);
      this._splitChild(s, 0, r);
      this._insertNonFull(s, key, value);
    } else {
      this._insertNonFull(r, key, value);
    }
    this._size++;
  }
  _updateNode(node, key, value) {
    let i = 0;
    while (i < node.keys.length && key > node.keys[i]) {
      i++;
    }
    if (i < node.keys.length && key === node.keys[i]) {
      node.values[i] = value;
      return;
    }
    if (!node.leaf) {
      this._updateNode(node.children[i], key, value);
    }
  }
  _insertNonFull(node, key, value) {
    let i = node.keys.length - 1;
    if (node.leaf) {
      while (i >= 0 && key < node.keys[i]) {
        i--;
      }
      node.keys.splice(i + 1, 0, key);
      node.values.splice(i + 1, 0, value);
    } else {
      while (i >= 0 && key < node.keys[i]) {
        i--;
      }
      i++;
      if (node.children[i].keys.length === 2 * this.t - 1) {
        this._splitChild(node, i, node.children[i]);
        if (key > node.keys[i]) {
          i++;
        }
      }
      this._insertNonFull(node.children[i], key, value);
    }
  }
  _splitChild(parent, i, child) {
    const t = this.t;
    const z = new BTreeNode(child.leaf);
    z.keys = child.keys.splice(t);
    z.values = child.values.splice(t);
    const midKey = child.keys.pop();
    const midVal = child.values.pop();
    if (!child.leaf) {
      z.children = child.children.splice(t);
    }
    parent.children.splice(i + 1, 0, z);
    parent.keys.splice(i, 0, midKey);
    parent.values.splice(i, 0, midVal);
  }
  delete(key) {
    const deleted = this._deleteNode(this.root, key);
    if (deleted) {
      this._size--;
      if (this.root.keys.length === 0 && !this.root.leaf) {
        this.root = this.root.children[0];
      }
    }
    return deleted;
  }
  _deleteNode(node, key) {
    const t = this.t;
    let idx = 0;
    while (idx < node.keys.length && node.keys[idx] < key) {
      idx++;
    }
    if (idx < node.keys.length && node.keys[idx] === key) {
      if (node.leaf) {
        node.keys.splice(idx, 1);
        node.values.splice(idx, 1);
        return true;
      }
      return this._deleteInternalNode(node, idx);
    }
    if (node.leaf) {
      return false;
    }
    const isLastChild = idx === node.keys.length;
    if (node.children[idx].keys.length < t) {
      this._fill(node, idx);
    }
    if (isLastChild && idx > node.keys.length) {
      return this._deleteNode(node.children[idx - 1], key);
    } else {
      return this._deleteNode(node.children[idx], key);
    }
  }
  _deleteInternalNode(node, idx) {
    const k = node.keys[idx];
    const t = this.t;
    if (node.children[idx].keys.length >= t) {
      const { key: predKey, val: predVal } = this._getPred(node, idx);
      node.keys[idx] = predKey;
      node.values[idx] = predVal;
      return this._deleteNode(node.children[idx], predKey);
    } else if (node.children[idx + 1].keys.length >= t) {
      const { key: succKey, val: succVal } = this._getSucc(node, idx);
      node.keys[idx] = succKey;
      node.values[idx] = succVal;
      return this._deleteNode(node.children[idx + 1], succKey);
    } else {
      this._merge(node, idx);
      return this._deleteNode(node.children[idx], k);
    }
  }
  _getPred(node, idx) {
    let curr = node.children[idx];
    while (!curr.leaf) {
      curr = curr.children[curr.children.length - 1];
    }
    return {
      key: curr.keys[curr.keys.length - 1],
      val: curr.values[curr.values.length - 1]
    };
  }
  _getSucc(node, idx) {
    let curr = node.children[idx + 1];
    while (!curr.leaf) {
      curr = curr.children[0];
    }
    return { key: curr.keys[0], val: curr.values[0] };
  }
  _fill(node, idx) {
    const t = this.t;
    if (idx !== 0 && node.children[idx - 1].keys.length >= t) {
      this._borrowFromPrev(node, idx);
    } else if (idx !== node.keys.length && node.children[idx + 1].keys.length >= t) {
      this._borrowFromNext(node, idx);
    } else {
      if (idx !== node.keys.length) {
        this._merge(node, idx);
      } else {
        this._merge(node, idx - 1);
      }
    }
  }
  _borrowFromPrev(node, idx) {
    const child = node.children[idx];
    const sibling = node.children[idx - 1];
    child.keys.unshift(node.keys[idx - 1]);
    child.values.unshift(node.values[idx - 1]);
    if (!child.leaf) {
      child.children.unshift(sibling.children.pop());
    }
    node.keys[idx - 1] = sibling.keys.pop();
    node.values[idx - 1] = sibling.values.pop();
  }
  _borrowFromNext(node, idx) {
    const child = node.children[idx];
    const sibling = node.children[idx + 1];
    child.keys.push(node.keys[idx]);
    child.values.push(node.values[idx]);
    if (!child.leaf) {
      child.children.push(sibling.children.shift());
    }
    node.keys[idx] = sibling.keys.shift();
    node.values[idx] = sibling.values.shift();
  }
  _merge(node, idx) {
    const child = node.children[idx];
    const sibling = node.children[idx + 1];
    child.keys.push(node.keys[idx]);
    child.values.push(node.values[idx]);
    child.keys.push(...sibling.keys);
    child.values.push(...sibling.values);
    if (!child.leaf) {
      child.children.push(...sibling.children);
    }
    node.keys.splice(idx, 1);
    node.values.splice(idx, 1);
    node.children.splice(idx + 1, 1);
  }
  keys() {
    const res = [];
    this._traverseKeys(this.root, res);
    return res;
  }
  _traverseKeys(node, res) {
    for (let i = 0; i < node.keys.length; i++) {
      if (!node.leaf) {
        this._traverseKeys(node.children[i], res);
      }
      res.push(node.keys[i]);
    }
    if (!node.leaf) {
      this._traverseKeys(node.children[node.keys.length], res);
    }
  }
  entries() {
    const res = [];
    this._traverseEntries(this.root, res);
    return res;
  }
  _traverseEntries(node, res) {
    for (let i = 0; i < node.keys.length; i++) {
      if (!node.leaf) {
        this._traverseEntries(node.children[i], res);
      }
      res.push({ key: node.keys[i], value: node.values[i] });
    }
    if (!node.leaf) {
      this._traverseEntries(node.children[node.keys.length], res);
    }
  }
  prefixSearch(prefix) {
    const res = [];
    this._prefixSearchNode(this.root, prefix, res);
    return res;
  }
  _prefixSearchNode(node, prefix, res) {
    for (let i = 0; i < node.keys.length; i++) {
      const k = node.keys[i];
      if (!node.leaf && k >= prefix) {
        this._prefixSearchNode(node.children[i], prefix, res);
      }
      if (k.startsWith(prefix)) {
        res.push({ key: k, value: node.values[i] });
      }
    }
    if (!node.leaf) {
      this._prefixSearchNode(node.children[node.keys.length], prefix, res);
    }
  }
  recalculateSize() {
    let count = 0;
    const walk = (node) => {
      count += node.keys.length;
      if (!node.leaf) {
        for (const child of node.children) {
          walk(child);
        }
      }
    };
    walk(this.root);
    this._size = count;
    return count;
  }
};
var ProjectFileTree = class _ProjectFileTree {
  constructor(projectRoot, degree = 16) {
    this.projectRoot = path4.resolve(projectRoot);
    this.updatedAt = Date.now();
    this.tree = new BTree(degree);
  }
  get size() {
    return this.tree.size();
  }
  get degree() {
    return this.tree.t;
  }
  has(posixRelPath) {
    return this.tree.search(posixRelPath) !== null;
  }
  get(posixRelPath) {
    const val = this.tree.search(posixRelPath);
    if (!val) return null;
    return {
      path: posixRelPath,
      size: val.size,
      mtime: val.mtime,
      isDirectory: val.isDirectory
    };
  }
  set(posixRelPath, meta) {
    this.tree.insert(posixRelPath, {
      size: meta.size,
      mtime: meta.mtime,
      isDirectory: meta.isDirectory
    });
    this.updatedAt = Date.now();
  }
  remove(posixRelPath) {
    const res = this.tree.delete(posixRelPath);
    if (res) this.updatedAt = Date.now();
    return res;
  }
  listPaths() {
    return this.tree.keys();
  }
  listAll() {
    return this.tree.entries().map((e) => ({
      path: e.key,
      size: e.value.size,
      mtime: e.value.mtime,
      isDirectory: e.value.isDirectory
    }));
  }
  findInDirectory(subDir) {
    let normalized = toPosixPath(subDir).replace(/^\.\/?/, "");
    if (normalized && !normalized.endsWith("/")) {
      normalized += "/";
    }
    const entries = this.tree.prefixSearch(normalized);
    return entries.map((e) => ({
      path: e.key,
      size: e.value.size,
      mtime: e.value.mtime,
      isDirectory: e.value.isDirectory
    }));
  }
  async scanProject(skipDirs = getConfiguredIgnoredDirs()) {
    const newTree = new BTree(this.tree.t);
    const stack = [
      { dir: this.projectRoot, relative: "" }
    ];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) break;
      let entries;
      try {
        entries = await fs3.promises.readdir(current.dir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        if (skipDirs.has(entry.name)) continue;
        const relPath = current.relative ? `${current.relative}/${entry.name}` : entry.name;
        const fullPath = path4.join(current.dir, entry.name);
        if (entry.isDirectory()) {
          stack.push({ dir: fullPath, relative: relPath });
          continue;
        }
        if (entry.isFile()) {
          try {
            const stat = await fs3.promises.stat(fullPath);
            newTree.insert(relPath, {
              size: stat.size,
              mtime: stat.mtimeMs,
              isDirectory: false
            });
          } catch {
          }
        }
      }
    }
    this.tree = newTree;
    this.updatedAt = Date.now();
  }
  async updatePath(fullOrRelPath) {
    const fullPath = path4.isAbsolute(fullOrRelPath) ? fullOrRelPath : path4.join(this.projectRoot, fullOrRelPath);
    const relPath = toPosixPath(path4.relative(this.projectRoot, fullPath));
    try {
      const stat = await fs3.promises.stat(fullPath);
      this.set(relPath, {
        size: stat.size,
        mtime: stat.mtimeMs,
        isDirectory: stat.isDirectory()
      });
    } catch (err) {
      if (err.code === "ENOENT") {
        this.remove(relPath);
      }
    }
  }
  toHierarchyText(maxLines = 300, startPath = ".", maxDepth = 5) {
    const all = this.listAll();
    if (all.length === 0) return "(empty project)";
    const normalizedStart = startPath ? toPosixPath(startPath).replace(/^\.\/?/, "").replace(/\/+$/, "") : "";
    const lines = [];
    let omitted = 0;
    for (const entry of all) {
      if (entry.isDirectory) continue;
      const rel = entry.path;
      if (normalizedStart) {
        if (rel === normalizedStart) {
        } else if (rel.startsWith(normalizedStart + "/")) {
        } else {
          continue;
        }
      }
      const depthPath = normalizedStart && rel.startsWith(normalizedStart + "/") ? rel.slice(normalizedStart.length + 1) : rel;
      const segments = depthPath.split("/").filter(Boolean);
      if (segments.length > maxDepth) {
        continue;
      }
      if (lines.length >= maxLines) {
        omitted++;
        continue;
      }
      lines.push(`F	${entry.path}	size=${entry.size}`);
    }
    if (lines.length === 0) return "(empty)";
    if (omitted > 0) {
      lines.push(`... [${omitted} more entries omitted]`);
    }
    return lines.join("\n");
  }
  toJSON() {
    return {
      version: 1,
      projectRoot: this.projectRoot,
      updatedAt: this.updatedAt,
      fileCount: this.tree.size(),
      t: this.tree.t,
      root: this.tree.root.toJSON()
    };
  }
  static fromJSON(json) {
    const tree = new _ProjectFileTree(json.projectRoot, json.t || 16);
    tree.updatedAt = json.updatedAt;
    tree.tree.root = BTreeNode.fromJSON(json.root);
    tree.tree.recalculateSize();
    return tree;
  }
  async saveToFile(filePath) {
    const dir = path4.dirname(filePath);
    await fs3.promises.mkdir(dir, { recursive: true });
    const data = JSON.stringify(this.toJSON());
    await fs3.promises.writeFile(filePath, data, "utf8");
  }
  static async loadFromFile(filePath) {
    try {
      const raw = await fs3.promises.readFile(filePath, "utf8");
      const parsed = JSON.parse(raw);
      if (!parsed || parsed.version !== 1) return null;
      return _ProjectFileTree.fromJSON(parsed);
    } catch {
      return null;
    }
  }
};

// src/web-search.ts
var MAX_SEARCH_RESULTS = 5;
function formatSearchResults(results, query, maxResults = MAX_SEARCH_RESULTS) {
  const limited = results.slice(0, maxResults);
  if (limited.length === 0) {
    return `No web results found for "${query}".`;
  }
  const lines = limited.map((result, index) => {
    const snippet = (result.snippet || "").replace(/\s+/g, " ").trim().slice(0, 300);
    return `${index + 1}. ${result.title}
   ${result.url}${snippet ? `
   ${snippet}` : ""}`;
  });
  return `Web search results for "${query}":

${lines.join("\n\n")}`;
}

// src/builtin/tools.ts
var TOOL_DEFINITIONS = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: 'Read a text file in the project. Path may be absolute or relative to the project root. If the file is already listed under the "Pinned Project Files" section of your system context, its contents are already available there \u2014 do not read it again.',
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          line: {
            type: "integer",
            description: "1-based start line. Omit to read from the start. This is a line number, not a byte offset."
          },
          limit: {
            type: "integer",
            description: "Maximum number of lines to return (a count, not an end line: the slice spans line..line+limit-1)."
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Create or fully overwrite a text file in the project. Pass `content` with the complete new file contents (this replaces the entire file). For targeted edits (search/replace or line ranges) use write_diff. Writing inside .git is not allowed.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: { type: "string" },
          content: {
            type: "string",
            description: "Complete new file contents. Replaces the whole file, so include every line \u2014 do not pass partial content."
          }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_diff",
      description: "Apply a targeted edit to a file. Pass `path` and either `startLine` (with optional `endLine`) and `replace` (or `content`), or `search` and `replace`.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description: "Project-relative or absolute path to the file."
          },
          startLine: {
            type: "integer",
            description: "1-based start line of the range to replace."
          },
          endLine: {
            type: "integer",
            description: "1-based end line of the range to replace (defaults to startLine)."
          },
          search: {
            type: "string",
            description: "Exact text or lines to find and replace in the file."
          },
          replace: {
            type: "string",
            description: "New text to replace the specified lines or search text."
          },
          content: {
            type: "string",
            description: "Alias for `replace`."
          },
          all: {
            type: "boolean",
            description: "If true, replace all occurrences of `search`. Defaults to false."
          }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "move_file",
      description: "Move a file within the project. Both source and destination must stay inside the project; destination must not already exist.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          sourcePath: {
            type: "string",
            description: "Absolute or project-relative path of the file to move."
          },
          destinationPath: {
            type: "string",
            description: "Absolute or project-relative destination path, including filename."
          }
        },
        required: ["sourcePath", "destinationPath"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "find_files",
      description: "Find files matching a search pattern and/or extensions. Pattern supports DSL: * (wildcard), ? (single character), | (OR), & (AND), \\ (escape special chars). Pattern matches file basename only. Works fast using project index.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description: "Directory to search in, relative to project root. Defaults to '.' (root)."
          },
          pattern: {
            type: "string",
            description: "DSL search pattern (*, ?, |, &, \\). Applied to file basename."
          },
          extensions: {
            type: "array",
            items: { type: "string" },
            description: "Optional list of file extensions to filter by (e.g. ['ts', 'js'] or ['.ts', '.js'])."
          },
          caseInsensitive: {
            type: "boolean",
            description: "Case-insensitive matching for pattern and extensions."
          },
          maxResults: {
            type: "integer",
            description: "Maximum number of files to return (default 100)."
          }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "get_file_structure",
      description: "Get project file structure using TSV line protocol (F\\t<path>\\tsize=<bytes>). Supports directory and depth filtering.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description: "Directory to get structure for, relative to project root. Defaults to '.' (entire project)."
          },
          depth: {
            type: "integer",
            description: "Maximum depth of folder nesting to display (default 5)."
          }
        }
      }
    }
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
          path: { type: "string" }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "grep",
      description: "Fast literal substring search in file contents (no regex, no glob).",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: {
            type: "string",
            description: "Literal text to search for (substring)."
          },
          pattern: {
            type: "string",
            description: "Alias for query."
          },
          path: {
            type: "string",
            description: "Directory or file to search in, relative to project root. Defaults to '.'."
          },
          caseInsensitive: { type: "boolean" },
          maxResults: { type: "integer" }
        }
      }
    }
  },
  {
    type: "function",
    function: {
      name: "git",
      description: 'Run git in the project root. Always available; does not need allowCommands. Pass arguments after git, e.g. status, diff, branch, checkout -b topic, add -A, commit -m "msg". Not a shell. No push, pull, fetch, reset, rebase, force branch options, or --edit-description. checkout, switch, add, commit, apply, and mutating branch operations (create, rename, delete) ask for permission. apply --check is read-only. commit needs -m.',
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: {
            type: "string",
            description: 'Arguments after git, e.g. status or checkout -b topic. You may include a leading "git".'
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_command",
      description: "Run a process in the project when the user has enabled allowCommands for this folder in Pulsar user config (not in the repo). Pass the executable and arguments as a single command line (quoted paths allowed). Not a shell.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          command: { type: "string" },
          cwd: {
            type: "string",
            description: "Optional working directory inside the project."
          }
        },
        required: ["command"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_tests",
      description: "Run the test command the user configured for this project in Pulsar user config (testCommand). You cannot choose or change the command.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "run_build",
      description: "Run the build command the user configured for this project in Pulsar user config (buildCommand). You cannot choose or change the command.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {}
      }
    }
  },
  {
    type: "function",
    function: {
      name: "unpin_file",
      description: "Remove a file from the pinned context. A pinned file is re-injected into your context on every turn until you unpin it; call this when you no longer need it in context to conserve tokens.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          path: {
            type: "string",
            description: "Project-relative or absolute path of the file to unpin."
          }
        },
        required: ["path"]
      }
    }
  }
];
var WEB_SEARCH_TOOL = {
  type: "function",
  function: {
    name: "web_search",
    description: "Search the web and return a short list of results with titles, URLs and snippets. Use this to look up current information that is not in the project files or in your training data.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string", description: "The search query." }
      },
      required: ["query"]
    }
  }
};
var WEB_FETCH_TOOL = {
  type: "function",
  function: {
    name: "web_fetch",
    description: "Fetch the text content of a public web page by absolute URL. Returns the page content up to a size limit. Local and private network addresses are not allowed.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        url: {
          type: "string",
          description: "Absolute http(s) URL to fetch."
        }
      },
      required: ["url"]
    }
  }
};
function toolsForPolicy(policy) {
  return TOOL_DEFINITIONS.filter((tool) => {
    const name = tool.function.name;
    if (name === "run_command") return policy.allowCommands;
    if (name === "run_tests") return !!policy.testCommand;
    if (name === "run_build") return !!policy.buildCommand;
    return true;
  });
}
var ToolRejected = class extends Error {
  constructor(message = "The user rejected this tool call.") {
    super(message);
    this.name = "ToolRejected";
  }
};
function asRecord(raw) {
  if (!raw.trim()) return {};
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Tool arguments must be a JSON object.");
  }
  return parsed;
}
function stringArg(args, key) {
  const value = args[key];
  return typeof value === "string" ? value : void 0;
}
function intArg(args, key) {
  const value = args[key];
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed !== "" && Number.isFinite(Number(trimmed))) {
      return Math.trunc(Number(trimmed));
    }
  }
  return void 0;
}
function assertWritablePath(cwd, filePath) {
  const rel = path5.relative(path5.resolve(cwd), filePath);
  if (rel === ".git" || rel.startsWith(`.git${path5.sep}`)) {
    throw new Error(`Writing into .git is not allowed: ${filePath}`);
  }
}
function resolveToolPath(ctx, raw) {
  return resolveInsideRoot(ctx.cwd, raw);
}
function describeToolCall(name, rawArguments, ctx) {
  const { cwd, policy } = ctx;
  const args = asRecord(rawArguments);
  switch (name) {
    case "read_file": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      return {
        title: `Read ${path5.basename(filePath)}`,
        kind: "read",
        locations: [{ path: filePath }],
        rawInput: { path: filePath, line: args.line, limit: args.limit },
        needsPermission: false
      };
    }
    case "write_file": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      assertWritablePath(cwd, filePath);
      return {
        title: `Rewrite ${path5.basename(filePath)}`,
        kind: "edit",
        locations: [{ path: filePath }],
        rawInput: { path: filePath, content: stringArg(args, "content") },
        needsPermission: true
      };
    }
    case "write_diff": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      assertWritablePath(cwd, filePath);
      return {
        title: `Edit ${path5.basename(filePath)}`,
        kind: "edit",
        locations: [{ path: filePath }],
        rawInput: args,
        needsPermission: true
      };
    }
    case "move_file": {
      const sourcePath = resolveToolPath(
        ctx,
        stringArg(args, "sourcePath") ?? "."
      );
      const destinationPath = resolveToolPath(
        ctx,
        stringArg(args, "destinationPath") ?? "."
      );
      assertWritablePath(cwd, sourcePath);
      assertWritablePath(cwd, destinationPath);
      return {
        title: `Move ${path5.basename(sourcePath)}`,
        kind: "edit",
        locations: [{ path: sourcePath }, { path: destinationPath }],
        rawInput: { sourcePath, destinationPath },
        needsPermission: true
      };
    }
    case "find_files": {
      const pattern = stringArg(args, "pattern") ?? "*";
      const extensions = Array.isArray(args.extensions) ? args.extensions.join(",") : "";
      const searchPath = stringArg(args, "path") ?? ".";
      const desc = extensions ? `${pattern} (${extensions})` : pattern;
      return {
        title: `Find ${desc} in ${searchPath}`,
        kind: "search",
        rawInput: args,
        needsPermission: false
      };
    }
    case "get_file_structure": {
      const searchPath = stringArg(args, "path") ?? ".";
      const depth = intArg(args, "depth") ?? 5;
      return {
        title: `Structure of ${searchPath} (depth ${depth})`,
        kind: "read",
        rawInput: args,
        needsPermission: false
      };
    }
    case "list_dir": {
      const dirPath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      return {
        title: `List ${path5.basename(dirPath) || dirPath}`,
        kind: "read",
        locations: [{ path: dirPath }],
        rawInput: { path: dirPath },
        needsPermission: false
      };
    }
    case "grep": {
      const query = stringArg(args, "query") ?? stringArg(args, "pattern") ?? "";
      const searchPath = stringArg(args, "path") ?? ".";
      return {
        title: `Grep "${query}" in ${searchPath}`,
        kind: "search",
        rawInput: args,
        needsPermission: false
      };
    }
    case "git": {
      const plan = planGitCommand(
        parseCommandLine(stringArg(args, "command") ?? "")
      );
      return {
        title: plan.title,
        kind: plan.needsPermission ? "execute" : "read",
        rawInput: { command: plan.args.join(" ") },
        needsPermission: plan.needsPermission
      };
    }
    case "run_command": {
      if (!policy.allowCommands) {
        throw new Error(
          "Commands are disabled for this project. Set allowCommands: true under pulsar-assistant.projects in Pulsar user config (not in the project folder)."
        );
      }
      const command = stringArg(args, "command") ?? "";
      return {
        title: command ? `Run ${command}` : "Run command",
        kind: "execute",
        rawInput: { command, cwd: stringArg(args, "cwd") ?? cwd },
        needsPermission: true
      };
    }
    case "run_tests": {
      const command = policy.testCommand;
      if (!command) {
        throw new Error(
          "No test command configured. Set testCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder)."
        );
      }
      return {
        title: `Test ${command}`,
        kind: "execute",
        rawInput: { command },
        needsPermission: false
      };
    }
    case "run_build": {
      const command = policy.buildCommand;
      if (!command) {
        throw new Error(
          "No build command configured. Set buildCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder)."
        );
      }
      return {
        title: `Build ${command}`,
        kind: "execute",
        rawInput: { command },
        needsPermission: false
      };
    }
    case "unpin_file": {
      const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
      return {
        title: `Unpin ${path5.basename(filePath)}`,
        kind: "edit",
        locations: [{ path: filePath }],
        rawInput: { path: filePath },
        needsPermission: false
      };
    }
    case "web_search": {
      const query = stringArg(args, "query") ?? "";
      return {
        title: query ? `Search web for "${query}"` : "Web search",
        kind: "search",
        rawInput: args,
        needsPermission: false
      };
    }
    case "web_fetch": {
      const url = stringArg(args, "url") ?? "";
      return {
        title: url ? `Fetch ${url}` : "Fetch page",
        kind: "read",
        rawInput: args,
        needsPermission: false
      };
    }
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
async function requestToolPermission(ctx, toolCallId, meta) {
  const response = await ctx.host.requestPermission({
    sessionId: ctx.sessionId,
    toolCall: {
      toolCallId,
      title: meta.title,
      kind: meta.kind,
      status: "pending",
      locations: meta.locations,
      rawInput: meta.rawInput
    },
    options: [
      { optionId: "allow-once", name: "Allow once", kind: "allow_once" },
      { optionId: "reject-once", name: "Reject", kind: "reject_once" }
    ]
  });
  if (response.outcome.outcome === "cancelled") return false;
  return response.outcome.optionId === "allow-once";
}
async function executeTool(ctx, name, rawArguments) {
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
    case "web_search":
      return webSearchTool(ctx, args);
    case "web_fetch":
      return webFetchTool(ctx, args);
    default:
      throw new Error(`Unknown tool: ${name}`);
  }
}
async function webSearchTool(ctx, args) {
  const query = stringArg(args, "query") ?? "";
  if (!query.trim()) {
    throw new Error("web_search requires a query.");
  }
  if (!ctx.webSearch) {
    throw new Error("Web search is not available for this agent.");
  }
  const results = await ctx.webSearch.search(query.trim(), ctx.signal);
  return { output: formatSearchResults(results, query.trim()) };
}
async function webFetchTool(ctx, args) {
  const url = stringArg(args, "url") ?? "";
  if (!url.trim()) {
    throw new Error("web_fetch requires a URL.");
  }
  if (!ctx.webFetch) {
    throw new Error("Web page fetching is not available for this agent.");
  }
  const content = await ctx.webFetch.fetch(url.trim(), ctx.signal);
  return { output: content };
}
async function unpinFileTool(ctx, args) {
  const rawPath = normalizeInputPath(stringArg(args, "path") ?? "");
  const filePath = resolveToolPath(ctx, rawPath);
  if (!ctx.host.unpinFile) {
    throw new Error("Pinned files are not supported by this backend.");
  }
  const removed = await ctx.host.unpinFile(filePath);
  if (!removed) {
    return {
      output: `File "${path5.basename(filePath)}" was not pinned, nothing changed.`
    };
  }
  return {
    output: `File "${path5.basename(filePath)}" successfully unpinned from context.`
  };
}
async function readFileTool(ctx, args) {
  const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  const result = await ctx.host.readTextFile({
    sessionId: ctx.sessionId,
    path: filePath,
    line: intArg(args, "line") ?? null,
    limit: intArg(args, "limit") ?? null
  });
  return { output: result.content ?? "" };
}
var SYSTEMIC_MARKER_REGEX = /\[[^\]]*?(?:result omitted|output omitted|content omitted|SYSTEM NOTE)[^\]]*?\]/i;
function assertNoSystemicMarker(value, fieldName) {
  if (!value) return;
  const match = value.match(SYSTEMIC_MARKER_REGEX);
  if (match) {
    throw new Error(
      `Cannot write file: contains systemic omission/compaction marker (${match[0]}). Provide actual code, do not write omitted markers into files.`
    );
  }
}
async function writeFileTool(ctx, args) {
  const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  assertWritablePath(ctx.cwd, filePath);
  const fullContent = stringArg(args, "content");
  const searchText = stringArg(args, "searchText");
  const replaceText = stringArg(args, "replaceText");
  if (searchText !== void 0 || replaceText !== void 0) {
    throw new Error(
      "write_file now only rewrites whole files. Use write_diff with `search`/`replace` or `startLine`/`endLine` for targeted edits."
    );
  }
  assertNoSystemicMarker(fullContent, "content");
  if (fullContent === void 0) {
    throw new Error("write_file requires `content` (the complete new file).");
  }
  let oldText = null;
  try {
    const existing = await ctx.host.readTextFile({
      sessionId: ctx.sessionId,
      path: filePath
    });
    oldText = existing.content ?? "";
  } catch {
    oldText = null;
  }
  await ctx.host.writeTextFile({
    sessionId: ctx.sessionId,
    path: filePath,
    content: fullContent
  });
  return {
    output: `Wrote ${filePath}`,
    content: [
      { type: "diff", path: filePath, oldText, newText: fullContent }
    ]
  };
}
async function writeDiffTool(ctx, args) {
  const filePath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  assertWritablePath(ctx.cwd, filePath);
  let oldText = null;
  try {
    const existing = await ctx.host.readTextFile({
      sessionId: ctx.sessionId,
      path: filePath
    });
    oldText = existing.content ?? "";
  } catch {
    oldText = "";
  }
  const replaceText = stringArg(args, "replace") ?? stringArg(args, "content") ?? "";
  const startLine = intArg(args, "startLine");
  const endLine = intArg(args, "endLine") ?? startLine;
  const search = stringArg(args, "search") ?? stringArg(args, "searchText");
  assertNoSystemicMarker(replaceText, "replace");
  assertNoSystemicMarker(search, "search");
  let newContent;
  let summary;
  if (startLine !== void 0) {
    if (startLine < 1) {
      throw new Error("write_diff `startLine` must be >= 1.");
    }
    const safeEndLine = endLine !== void 0 ? Math.max(startLine, endLine) : startLine;
    const current = oldText ?? "";
    const usesCrlf = current.includes("\r\n");
    const eol = usesCrlf ? "\r\n" : "\n";
    const lines = current.split(/\r?\n/);
    const before = lines.slice(0, startLine - 1);
    const after = lines.slice(safeEndLine);
    const replacementLines = replaceText.length > 0 ? replaceText.split(/\r?\n/) : [];
    const combined = [...before, ...replacementLines, ...after];
    newContent = combined.join(eol);
    summary = `Replaced lines ${startLine}-${safeEndLine} in ${filePath}`;
  } else if (search !== void 0) {
    if (search.length === 0) {
      throw new Error("write_diff `search` must not be empty.");
    }
    const replaceAll = args.all === true;
    const res = robustReplace(oldText ?? "", search, replaceText, replaceAll);
    newContent = res.newContent;
    summary = `Replaced ${res.count} occurrence${res.count === 1 ? "" : "s"} in ${filePath}`;
  } else {
    throw new Error(
      "write_diff requires either `startLine` (with optional `endLine`) or `search`, along with `replace`."
    );
  }
  await ctx.host.writeTextFile({
    sessionId: ctx.sessionId,
    path: filePath,
    content: newContent
  });
  return {
    output: summary,
    content: [
      { type: "diff", path: filePath, oldText, newText: newContent }
    ]
  };
}
async function moveFileTool(ctx, args) {
  const sourcePath = resolveToolPath(
    ctx,
    stringArg(args, "sourcePath") ?? "."
  );
  const destinationPath = resolveToolPath(
    ctx,
    stringArg(args, "destinationPath") ?? "."
  );
  assertWritablePath(ctx.cwd, sourcePath);
  assertWritablePath(ctx.cwd, destinationPath);
  await ctx.host.moveTextFile({
    sessionId: ctx.sessionId,
    sourcePath,
    destinationPath
  });
  return { output: `Moved ${sourcePath} -> ${destinationPath}` };
}
async function findFilesTool(ctx, args) {
  const pattern = stringArg(args, "pattern");
  const searchPath = stringArg(args, "path");
  const extensions = Array.isArray(args.extensions) ? args.extensions.filter((x) => typeof x === "string") : void 0;
  const matches = await findFiles({
    pattern,
    extensions,
    cwd: ctx.cwd,
    searchPath,
    caseInsensitive: args.caseInsensitive === true,
    maxResults: intArg(args, "maxResults"),
    fileTree: ctx.fileTree
  });
  if (matches.length === 0) return { output: "No files matched." };
  return { output: matches.join("\n") };
}
async function getFileStructureTool(ctx, args) {
  const searchPath = stringArg(args, "path") ?? ".";
  const depth = intArg(args, "depth") ?? 5;
  if (ctx.fileTree && ctx.fileTree.size > 0) {
    const text2 = ctx.fileTree.toHierarchyText(500, searchPath, depth);
    return { output: text2 };
  }
  const tree = new ProjectFileTree(ctx.cwd);
  await tree.scanProject();
  const text = tree.toHierarchyText(500, searchPath, depth);
  return { output: text };
}
async function grepTool(ctx, args) {
  const query = stringArg(args, "query") ?? stringArg(args, "pattern");
  if (!query) throw new Error("grep requires a query string.");
  const searchPath = stringArg(args, "path");
  const matches = await grepFiles({
    query,
    cwd: ctx.cwd,
    searchPath,
    caseInsensitive: args.caseInsensitive === true,
    maxResults: intArg(args, "maxResults"),
    fileTree: ctx.fileTree
  });
  if (matches.length === 0) return { output: "No matches." };
  const lines = matches.map((match) => {
    const relPath = toPosixPath(path5.relative(ctx.cwd, match.path));
    return `${relPath}:${match.line}:${match.text}`;
  });
  return { output: lines.join("\n") };
}
async function listDirTool(ctx, args) {
  const dirPath = resolveToolPath(ctx, stringArg(args, "path") ?? ".");
  const entries = await listDirectory(dirPath);
  if (entries.length === 0) return { output: "(empty)" };
  const lines = entries.map(
    (entry) => entry.type === "directory" ? `${entry.name}/` : entry.name
  );
  return { output: lines.join("\n") };
}
async function gitTool(ctx, args) {
  const commandLine = stringArg(args, "command");
  if (!commandLine) throw new Error("git requires a command string.");
  const plan = planGitCommand(parseCommandLine(commandLine));
  return formatProcessResult(
    await runCapturedProcess({
      command: "git",
      args: plan.args,
      cwd: ctx.cwd,
      signal: ctx.signal
    })
  );
}
async function runCommandTool(ctx, args) {
  if (!ctx.policy.allowCommands) {
    throw new Error(
      "Commands are disabled for this project. Set allowCommands: true under pulsar-assistant.projects in Pulsar user config (not in the project folder)."
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
      signal: ctx.signal
    })
  );
}
async function runConfiguredCommand(commandLine, cwd, signal) {
  return formatProcessResult(
    await runCapturedProcess({
      command: commandLine,
      args: [],
      shell: true,
      // `tsc`, `npx` and friends live in node_modules/.bin and are not on PATH.
      pathDirs: [path5.join(cwd, "node_modules", ".bin")],
      cwd,
      signal
    })
  );
}
async function runTestsTool(ctx) {
  const commandLine = ctx.policy.testCommand;
  if (!commandLine) {
    throw new Error(
      "No test command configured. Set testCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder)."
    );
  }
  if (!commandLine.trim()) throw new Error("Configured testCommand is empty.");
  return runConfiguredCommand(commandLine, ctx.cwd, ctx.signal);
}
async function runBuildTool(ctx) {
  const commandLine = ctx.policy.buildCommand;
  if (!commandLine) {
    throw new Error(
      "No build command configured. Set buildCommand under pulsar-assistant.projects in Pulsar user config for this folder (not in the project folder)."
    );
  }
  if (!commandLine.trim()) throw new Error("Configured buildCommand is empty.");
  return runConfiguredCommand(commandLine, ctx.cwd, ctx.signal);
}
function formatProcessResult(result) {
  const status = result.exitCode != null ? `exit ${result.exitCode}` : result.signal ? `signal ${result.signal}` : "exited";
  const truncated = result.truncated ? "\n(output truncated)" : "";
  return { output: `${status}
${result.output}${truncated}`.trim() };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  TOOL_DEFINITIONS,
  ToolRejected,
  WEB_FETCH_TOOL,
  WEB_SEARCH_TOOL,
  describeToolCall,
  executeTool,
  requestToolPermission,
  toolsForPolicy
});
//# sourceMappingURL=tools.js.map
