#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { parseTasks } = require("../lib/parse-tasks");
const { buildLayout, updateLayout } = require("../lib/render-dashboard");
const { registerProject } = require("../lib/registry");
const { findProjectRoot } = require("../lib/find-root");

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
const BRANCH_CACHE_TTL_MS = 5000;
const PROJECT_CACHE_TTL_MS = 5000;
const GIT_POLL_INTERVAL_MS = 2000;

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

  let blessed;
  try {
    blessed = require("blessed");
  } catch (_) {
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

  let cachedBranches = null;
  let cachedBranchesAt = 0;
  function readBranch(cwd) {
    try {
      return (
        execSync("git branch --show-current", {
          cwd,
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim() || null
      );
    } catch (_) {
      return null;
    }
  }
  function readDirty(cwd) {
    try {
      const out = execSync("git status --porcelain", {
        cwd,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      return out.trim().length > 0;
    } catch (_) {
      return null;
    }
  }
  function getBranches() {
    const now = Date.now();
    if (cachedBranchesAt && now - cachedBranchesAt < BRANCH_CACHE_TTL_MS) {
      return cachedBranches;
    }
    cachedBranchesAt = now;
    const root = readBranch(PROJECT_ROOT);
    const rootDirty = root ? readDirty(PROJECT_ROOT) : null;
    const subRepos = [];
    try {
      const entries = fs.readdirSync(PROJECT_ROOT, { withFileTypes: true });
      const names = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort();
      for (const name of names) {
        const gitPath = path.join(PROJECT_ROOT, name, ".git");
        if (!fs.existsSync(gitPath)) continue;
        const repoPath = path.join(PROJECT_ROOT, name);
        const branch = readBranch(repoPath);
        const dirty = readDirty(repoPath);
        subRepos.push({ name, branch, dirty });
      }
    } catch (_) {
      // ignore — best effort
    }
    cachedBranches = { root, rootDirty, subRepos };
    return cachedBranches;
  }

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
      const { tasks, summary } = parseTasks(PLANS_DIR);
      updateLayout(widgets, {
        tasks,
        summary,
        branches: getBranches(),
        project: getProject(),
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

  try {
    fs.watch(PLANS_DIR, { recursive: true }, scheduleRender);
  } catch (_) {
    for (const sub of ["pending", "completed"]) {
      const p = path.join(PLANS_DIR, sub);
      if (fs.existsSync(p)) {
        try {
          fs.watch(p, scheduleRender);
        } catch (_) {
          // ignore — best effort
        }
      }
    }
  }

  // Git state (branch / dirty marks) changes via `git checkout`, commits, and
  // staging never touch .plans/, so fs.watch never fires for them and the cached
  // git info goes stale. Poll on a timer: invalidate the branch cache and nudge
  // the existing debounced render path so getBranches() re-reads fresh git state.
  const gitPollTimer = setInterval(() => {
    cachedBranchesAt = 0;
    scheduleRender();
  }, GIT_POLL_INTERVAL_MS);

  screen.key(["q", "escape", "C-c"], () => {
    clearInterval(gitPollTimer);
    process.exit(0);
  });
}

main();
