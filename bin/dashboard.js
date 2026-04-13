#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const { parseTasks } = require("../lib/parse-tasks");
const { buildLayout, updateLayout } = require("../lib/render-dashboard");

const PLANS_DIR = path.resolve(process.cwd(), ".plans");
const DEBOUNCE_MS = 100;
const BRANCH_CACHE_TTL_MS = 5000;

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

  let cachedBranch = null;
  let cachedBranchAt = 0;
  function getBranch() {
    const now = Date.now();
    if (cachedBranchAt && now - cachedBranchAt < BRANCH_CACHE_TTL_MS) {
      return cachedBranch;
    }
    cachedBranchAt = now;
    try {
      cachedBranch =
        execSync("git branch --show-current", {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim() || null;
    } catch (_) {
      cachedBranch = null;
    }
    return cachedBranch;
  }

  function render() {
    try {
      const { tasks, summary } = parseTasks(PLANS_DIR);
      updateLayout(widgets, {
        tasks,
        summary,
        branch: getBranch(),
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
