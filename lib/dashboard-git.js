const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

// Dashboard git reads, extracted from bin/dashboard.js so they can be unit
// tested and so they stop launching a storm of processes on a 2s poll.
//
// Two things make this cheap where the old code was expensive:
//   1. No shell. The default runner is spawnSync("git", [...]) directly —
//      modeled on git() in lib/plans-git.js:32-49 — instead of execSync
//      through /bin/sh. It never throws; a failure reads as { ok: false }.
//   2. One status call per repo per refresh. `git --no-optional-locks status
//      --porcelain=v2 --branch` yields branch + dirty + upstream/ahead/behind
//      in a single invocation, replacing the old separate `branch
//      --show-current` + `status --porcelain` pair.
//
// Storage-mode detection and the per-repo --git-path lookups (HEAD / index /
// rebase-merge / rebase-apply, used by the dashboard's fs.watch wiring) hardly
// ever change, so they are cached for the life of the process rather than
// re-run on every refresh.
//
// The module is a factory — createDashboardGit({ root, runGit, listSubRepos })
// — so tests inject a fake runner and production gets the spawnSync default.

const SYNC_DEFAULTS = { remote: "origin", branch: "plans", auto_push: true };

// Run git synchronously with an argv array, no shell. Returns
// { ok, status, stdout, stderr } and never throws. --no-optional-locks keeps a
// read from taking the index.lock, so a concurrent git command is never
// blocked by the dashboard's polling.
function defaultRunGit(cwd, args) {
  try {
    const r = spawnSync("git", ["--no-optional-locks", ...args], {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    return {
      ok: r.status === 0,
      status: r.status,
      stdout: (r.stdout || "").trim(),
      stderr: (r.stderr || "").trim(),
    };
  } catch (_) {
    return { ok: false, status: null, stdout: "", stderr: "" };
  }
}

// realpath that degrades to path.resolve instead of throwing (mirrors
// lib/plans-git.js realpath), so mode comparisons work on paths that may not
// resolve.
function realpath(p) {
  try {
    return fs.realpathSync(p);
  } catch (_) {
    return path.resolve(p);
  }
}

// Parse `git status --porcelain=v2 --branch` output into
// { branch, dirty, upstream, ahead, behind }.
//   - branch: `# branch.head <name>`; the literal `(detached)` → null.
//   - dirty: true iff any line that is NOT a `# ...` header is present
//     (tracked changes `1`/`2`, unmerged `u`, untracked `?`, ignored `!`).
//   - upstream/ahead/behind: from `# branch.upstream` and `# branch.ab +A -B`.
// Pure function — no I/O — so it is trivially testable.
function parseStatusV2(stdout) {
  const out = { branch: null, dirty: false, upstream: false, ahead: 0, behind: 0 };
  const lines = (stdout || "").split("\n");
  for (const line of lines) {
    if (line === "") continue;
    if (line[0] !== "#") {
      out.dirty = true;
      continue;
    }
    if (line.startsWith("# branch.head ")) {
      const name = line.slice("# branch.head ".length).trim();
      out.branch = name === "(detached)" ? null : name;
    } else if (line.startsWith("# branch.upstream ")) {
      out.upstream = true;
    } else if (line.startsWith("# branch.ab ")) {
      const m = line.match(/\+(\d+)\s+-(\d+)/);
      if (m) {
        out.ahead = Number(m[1]);
        out.behind = Number(m[2]);
      }
    }
  }
  return out;
}

function createDashboardGit(opts) {
  const o = opts || {};
  const root = o.root;
  const runGit = o.runGit || defaultRunGit;
  // Filesystem probes, injected so tests are deterministic without touching
  // disk. Production defaults to fs.existsSync.
  const plansExists = o.plansExists || (() => fs.existsSync(path.join(root, ".plans")));
  const pathExists = o.pathExists || ((p) => fs.existsSync(p));
  // listSubRepos returns the immediate sub-directory names that are git repos.
  // Injected so tests don't touch the filesystem; production scans root.
  const listSubRepos =
    o.listSubRepos ||
    (() => {
      try {
        const entries = fs.readdirSync(root, { withFileTypes: true });
        return entries
          .filter((e) => e.isDirectory() && !e.name.startsWith("."))
          .map((e) => e.name)
          .filter((name) => fs.existsSync(path.join(root, name, ".git")))
          .sort();
      } catch (_) {
        return [];
      }
    });

  // --- caches (process lifetime) ---
  let modeCache; // undefined until first resolved
  const gitPathCache = new Map(); // repo dir -> { HEAD, index, "rebase-merge", "rebase-apply" }

  // One status call, parsed. Returns parseStatusV2's shape, or a null/empty
  // result when the repo read fails.
  function statusOf(dir) {
    const r = runGit(dir, ["status", "--porcelain=v2", "--branch"]);
    if (!r.ok) return { branch: null, dirty: null, upstream: false, ahead: 0, behind: 0 };
    return parseStatusV2(r.stdout);
  }

  // Mirror of lib/plans-git.js detectMode, cached. detectMode itself stays
  // uncached (other callers + the migrate/init-branch tests depend on that);
  // this is a private copy so the dashboard pays the cost once.
  function detectModeCached() {
    if (modeCache !== undefined) return modeCache;
    modeCache = detectModeUncached();
    return modeCache;
  }

  function detectModeUncached() {
    try {
      const rootTop = runGit(root, ["rev-parse", "--show-toplevel"]);
      if (!rootTop.ok) return "none";

      const plansDir = path.join(root, ".plans");
      if (plansExists()) {
        const plansTop = runGit(plansDir, ["rev-parse", "--show-toplevel"]);
        if (
          plansTop.ok &&
          realpath(plansTop.stdout) === realpath(plansDir) &&
          realpath(plansTop.stdout) !== realpath(rootTop.stdout)
        ) {
          return "branch";
        }
      }

      if (runGit(root, ["check-ignore", "-q", ".plans"]).ok) return "local";
      return "inline";
    } catch (_) {
      return "none";
    }
  }

  // Cached --git-path lookups for a repo dir. Returns absolute paths for
  // HEAD, index, rebase-merge and rebase-apply. The dashboard fs.watch-es
  // HEAD/index; rebase-merge/rebase-apply drive the branch-mode rebaseStuck
  // check. Values that git cannot resolve are omitted.
  function gitPaths(dir) {
    if (gitPathCache.has(dir)) return gitPathCache.get(dir);
    const paths = {};
    for (const which of ["HEAD", "index", "rebase-merge", "rebase-apply"]) {
      const r = runGit(dir, ["rev-parse", "--git-path", which]);
      if (r.ok && r.stdout) paths[which] = path.resolve(dir, r.stdout);
    }
    gitPathCache.set(dir, paths);
    return paths;
  }

  // Branch info for the header: { root, rootDirty, subRepos:[{name,branch,dirty}] }.
  // Exactly one status call per repo. If root is not itself a git repo (the
  // centralized multi-repo shape) root/rootDirty are null, mirroring today.
  function readBranches() {
    const rootTop = runGit(root, ["rev-parse", "--show-toplevel"]);
    let rootBranch = null;
    let rootDirty = null;
    if (rootTop.ok) {
      const s = statusOf(root);
      rootBranch = s.branch;
      rootDirty = s.dirty;
    }
    const subRepos = [];
    for (const name of listSubRepos()) {
      const dir = path.join(root, name);
      const s = statusOf(dir);
      subRepos.push({ name, branch: s.branch, dirty: s.dirty });
    }
    return { root: rootBranch, rootDirty, subRepos };
  }

  // On-disk rebase check against the cached git paths (no new process).
  function rebaseInProgress(dir) {
    const p = gitPaths(dir);
    return ["rebase-merge", "rebase-apply"].some(
      (which) => p[which] && pathExists(p[which])
    );
  }

  // Read the optional `sync` config for the configured remote/branch, mirroring
  // readSyncConfig in lib/plans-git.js. Defensive per-field.
  function readSyncConfig() {
    const out = { ...SYNC_DEFAULTS };
    try {
      const parsed = JSON.parse(
        fs.readFileSync(path.join(root, ".plans", "config.json"), "utf8")
      );
      const sync = parsed && parsed.sync;
      if (sync && typeof sync === "object") {
        if (typeof sync.remote === "string" && sync.remote) out.remote = sync.remote;
        if (typeof sync.branch === "string" && sync.branch) out.branch = sync.branch;
      }
    } catch (_) {
      // defaults
    }
    return out;
  }

  // Read-only sync state for the header's `plans:` line. Same shape as
  // syncStatus() in lib/plans-git.js: { mode } outside branch mode, and
  // { mode, branch, remote, upstream, ahead, behind, rebaseStuck } in branch
  // mode — derived from a single .plans v2 status call plus on-disk rebase
  // checks against the cached paths.
  function readSync() {
    const mode = detectModeCached();
    if (mode !== "branch") return { mode };

    const plansDir = path.join(root, ".plans");
    const config = readSyncConfig();
    const s = statusOf(plansDir);
    return {
      mode,
      branch: s.branch || config.branch,
      remote: config.remote,
      upstream: s.upstream,
      ahead: s.ahead,
      behind: s.behind,
      rebaseStuck: rebaseInProgress(plansDir),
    };
  }

  return {
    readBranches,
    readSync,
    gitPaths,
    detectMode: detectModeCached,
    statusOf,
  };
}

module.exports = { createDashboardGit, parseStatusV2, defaultRunGit };
