#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { parseTasks } = require("../lib/parse-tasks");
const { buildLayout, updateLayout } = require("../lib/render-dashboard");

const PLANS_DIR = path.resolve(process.cwd(), ".plans");
const CONTEXT_FILE = path.join(PLANS_DIR, "CONTEXT.md");
const DEBOUNCE_MS = 100;
const BRANCH_CACHE_TTL_MS = 5000;
const PROJECT_CACHE_TTL_MS = 5000;

function main() {
  if (!fs.existsSync(PLANS_DIR)) {
    process.stderr.write(
      "\n  plans-cc-dashboard — .plans/ not found in current directory\n" +
        "  Run `/plan-init` in Claude Code first.\n\n"
    );
    process.exit(1);
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
  function getBranches() {
    const now = Date.now();
    if (cachedBranchesAt && now - cachedBranchesAt < BRANCH_CACHE_TTL_MS) {
      return cachedBranches;
    }
    cachedBranchesAt = now;
    const root = readBranch(process.cwd());
    const subRepos = [];
    try {
      const entries = fs.readdirSync(process.cwd(), { withFileTypes: true });
      const names = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith("."))
        .map((e) => e.name)
        .sort();
      for (const name of names) {
        const gitPath = path.join(process.cwd(), name, ".git");
        if (!fs.existsSync(gitPath)) continue;
        const branch = readBranch(path.join(process.cwd(), name));
        subRepos.push({ name, branch });
      }
    } catch (_) {
      // ignore — best effort
    }
    cachedBranches = { root, subRepos };
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
    if (!name) name = path.basename(process.cwd());
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

  screen.key(["q", "escape", "C-c"], () => process.exit(0));
}

main();
