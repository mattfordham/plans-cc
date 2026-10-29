#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const { parseTasks } = require("../lib/parse-tasks");
const { buildLayout, updateLayout } = require("../lib/render-dashboard");
const { registerProject } = require("../lib/registry");
const { findProjectRoot } = require("../lib/find-root");
const { createDashboardGit } = require("../lib/dashboard-git");
const { createPidLock, installExitHandlers } = require("../lib/pidlock");

// Discover the project root by the shared walk (CLAUDE.md "Project-root
// discovery"): ascend from cwd to the nearest ancestor holding
// .plans/config.json, so the dashboard works when launched from a sub-repo
// directory of a centralized-.plans project. May be null (no root up the tree);
// main() handles that before any PLANS_DIR-dependent work runs. Everything that
// used to key off process.cwd() re-anchors to PROJECT_ROOT below.
const PROJECT_ROOT = findProjectRoot(process.cwd());
const PLANS_DIR = PROJECT_ROOT ? path.join(PROJECT_ROOT, ".plans") : null;
const CONTEXT_FILE = PLANS_DIR ? path.join(PLANS_DIR, "CONTEXT.md") : null;
const DEBOUNCE_MS = 100;
const PROJECT_CACHE_TTL_MS = 5000;

// Fallback poll: a cheap safety net UNDER the fs.watch-driven refresh. Watches
// catch the common case (checkout, commit, staging) instantly; the poll only
// exists to recover from a watch that silently dropped (e.g. an editor's
// atomic-rename replacing the watched inode). It is idle by default — 30s —
// and stretches to 5 min after 5 min of no keypress/watch activity, snapping
// back on the next event. This is the whole point of the task: the old code
// re-shelled four git commands every 2s forever.
const POLL_IDLE_MS = 30 * 1000;
const POLL_SLOW_MS = 5 * 60 * 1000;
const POLL_STRETCH_AFTER_MS = 5 * 60 * 1000;

function main() {
  if (!PROJECT_ROOT) {
    process.stderr.write(
      "\n  plans-cc-dashboard — no .plans/ found in this directory or any parent\n" +
        "  Run `/plan-init` in Claude Code first.\n\n"
    );
    process.exit(1);
  }

  // Self-register this project in the system-wide registry. Best-effort —
  // registerProject never throws, but guard anyway so the dashboard can't break.
  try {
    registerProject(PROJECT_ROOT);
  } catch (_) {
    // ignore
  }

  // Take the per-project PID lock BEFORE starting blessed, so a second
  // dashboard for the same project refuses cleanly (and stops launching a
  // duplicate git-process storm) rather than running two side by side. A stale
  // lock from a crashed dashboard is taken over automatically.
  const lock = createPidLock({ root: PROJECT_ROOT });
  const held = lock.acquire();
  if (!held.ok) {
    process.stderr.write(
      "\n  plans-cc-dashboard — already running for this project (pid " +
        held.pid +
        ")\n" +
        "  Close the other dashboard first.\n\n"
    );
    process.exit(0);
  }

  let blessed;
  try {
    blessed = require("blessed");
  } catch (_) {
    lock.release();
    process.stderr.write(
      "\n  plans-cc-dashboard — blessed is not installed\n" +
        "  Run `npm install` in the plans-cc package directory, or install it globally.\n\n"
    );
    process.exit(1);
  }

  const screen = blessed.screen({
    smartCSR: true,
    title: "plans-cc dashboard",
    fullUnicode: true,
  });

  const widgets = buildLayout(screen);

  // All git reads go through the single dashboard-git instance: no shell, one
  // status call per repo per refresh, and process-lifetime caches for mode and
  // --git-path lookups. This replaces the old execSync readBranch/readDirty/
  // getBranches/getSyncStatus helpers AND the 2s git poll wholesale.
  const git = createDashboardGit({ root: PROJECT_ROOT });

  // Git state is re-read only when something tells us it changed (a watch
  // fired) or the fallback poll is due — NOT on every render. gitDirty starts
  // true so the first render populates the header. cachedBranches/cachedSync
  // hold the last-read values between those re-reads.
  let gitDirty = true;
  let cachedBranches = null;
  let cachedSync = null;

  function refreshGit() {
    try {
      cachedBranches = git.readBranches();
    } catch (_) {
      cachedBranches = null;
    }
    try {
      cachedSync = git.readSync();
    } catch (_) {
      cachedSync = null;
    }
    gitDirty = false;
  }

  // CONTEXT.md project-name read is NOT git — keep it on its own small TTL cache
  // exactly as before.
  let cachedProject = null;
  let cachedProjectAt = 0;
  function getProject() {
    const now = Date.now();
    if (cachedProjectAt && now - cachedProjectAt < PROJECT_CACHE_TTL_MS) {
      return cachedProject;
    }
    cachedProjectAt = now;
    let name = null;
    try {
      if (fs.existsSync(CONTEXT_FILE)) {
        const content = fs.readFileSync(CONTEXT_FILE, "utf8");
        const match = content.match(/^\*\*Project:\*\*\s*(.+)$/m);
        if (match) name = match[1].trim();
      }
    } catch (_) {
      // ignore — fall through to basename
    }
    if (!name) name = path.basename(PROJECT_ROOT);
    cachedProject = name;
    return cachedProject;
  }

  function render() {
    try {
      if (gitDirty || cachedBranches === null) refreshGit();
      const { tasks, summary } = parseTasks(PLANS_DIR);
      updateLayout(widgets, {
        tasks,
        summary,
        branches: cachedBranches,
        project: getProject(),
        sync: cachedSync,
      });
      screen.render();
    } catch (err) {
      widgets.tasksBox.setContent("Error: " + err.message);
      screen.render();
    }
  }

  render();

  let debounceTimer = null;
  function scheduleRender() {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(render, DEBOUNCE_MS);
  }

  // --- activity tracking drives the fallback poll cadence ------------------
  let lastActivityAt = Date.now();
  function markActivity() {
    lastActivityAt = Date.now();
  }

  // A git-affecting change: re-read git on the next render, note activity, and
  // nudge the debounced render.
  function markGitDirty() {
    gitDirty = true;
    markActivity();
    scheduleRender();
  }

  // --- .plans recursive watch (tasks/progress) — unchanged -----------------
  try {
    fs.watch(PLANS_DIR, { recursive: true }, () => {
      markActivity();
      scheduleRender();
    });
  } catch (_) {
    for (const sub of ["pending", "completed"]) {
      const p = path.join(PLANS_DIR, sub);
      if (fs.existsSync(p)) {
        try {
          fs.watch(p, () => {
            markActivity();
            scheduleRender();
          });
        } catch (_) {
          // ignore — best effort
        }
      }
    }
  }

  // --- git-ref watches replace the 2s poll ---------------------------------
  // Watch each repo's HEAD (branch switch) and index (staging/dirty), plus, in
  // branch mode, the .plans worktree's HEAD/index and the upstream tracking ref
  // / packed-refs (sync ahead/behind). A fired watch marks git dirty; the next
  // render re-reads. Every fs.watch is best-effort (try/catch), exactly like
  // the .plans recursive watcher.
  function watchFile(p) {
    if (!p) return;
    try {
      // Watch the containing directory and filter by basename: editors and git
      // replace HEAD/index via atomic rename, which a direct file watch misses.
      const dir = path.dirname(p);
      const base = path.basename(p);
      if (!fs.existsSync(dir)) return;
      fs.watch(dir, (_event, filename) => {
        if (!filename || filename === base) markGitDirty();
      });
    } catch (_) {
      // ignore — best effort
    }
  }

  function watchRepoRefs(repoDir) {
    try {
      const p = git.gitPaths(repoDir);
      watchFile(p.HEAD);
      watchFile(p.index);
    } catch (_) {
      // ignore — best effort
    }
  }

  // Root (when it is itself a git repo) + each sub-repo.
  try {
    watchRepoRefs(PROJECT_ROOT);
    const b = cachedBranches || git.readBranches();
    for (const sub of (b && b.subRepos) || []) {
      watchRepoRefs(path.join(PROJECT_ROOT, sub.name));
    }
  } catch (_) {
    // ignore — best effort
  }

  // Branch mode: also watch the .plans worktree HEAD/index and the upstream
  // ref / packed-refs so the plans: ahead/behind line refreshes on sync.
  try {
    if (cachedSync && cachedSync.mode === "branch") {
      const plansDir = path.join(PROJECT_ROOT, ".plans");
      const pp = git.gitPaths(plansDir);
      watchFile(pp.HEAD);
      watchFile(pp.index);
      // packed-refs lives at the git common dir root (sibling of HEAD).
      if (pp.HEAD) {
        watchFile(path.join(path.dirname(pp.HEAD), "packed-refs"));
      }
    }
  } catch (_) {
    // ignore — best effort
  }

  // --- fallback poll (idle 30s → slow 5min; snaps back on activity) --------
  function pollInterval() {
    return Date.now() - lastActivityAt >= POLL_STRETCH_AFTER_MS
      ? POLL_SLOW_MS
      : POLL_IDLE_MS;
  }
  let pollTimer = null;
  function scheduleFallbackPoll() {
    pollTimer = setTimeout(() => {
      // Re-read the volatile git state (branch/dirty/sync). Mode and --git-path
      // caches inside dashboard-git are process-lifetime and intentionally not
      // invalidated — they hardly ever change and re-probing them would reopen
      // the process-storm this task is closing.
      gitDirty = true;
      scheduleRender();
      scheduleFallbackPoll();
    }, pollInterval());
  }
  scheduleFallbackPoll();

  // --- exit / cleanup ------------------------------------------------------
  function cleanup() {
    if (pollTimer) clearTimeout(pollTimer);
    if (debounceTimer) clearTimeout(debounceTimer);
    lock.release();
  }

  // SIGHUP (terminal closed) and stdin 'end' release the lock and exit.
  installExitHandlers({
    proc: process,
    stdin: process.stdin,
    exit: (code) => process.exit(code),
    onExit: cleanup,
  });

  screen.key(["q", "escape", "C-c"], () => {
    cleanup();
    process.exit(0);
  });
}

main();
