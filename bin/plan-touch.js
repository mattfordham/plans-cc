#!/usr/bin/env node

// Tiny best-effort CLI that records a project touch in the system-wide
// registry. Usage: node plan-touch.js [projectRoot] (defaults to cwd).
//
// The lib/ directory is a sibling of this script in BOTH layouts:
//   repo:      bin/plan-touch.js     + lib/registry.js   → ../lib/registry
//   installed: plans-cc/plan-touch.js + plans-cc/lib/registry.js → ./lib/registry
// Try the repo path first, fall back to the installed path.
let registry;
try {
  registry = require("../lib/registry");
} catch (_) {
  registry = require("./lib/registry");
}
// find-root is a sibling of registry in both layouts; require it the same
// defensive way so plan-touch keeps working in the installed layout too.
let findProjectRoot;
try {
  ({ findProjectRoot } = require("../lib/find-root"));
} catch (_) {
  ({ findProjectRoot } = require("./lib/find-root"));
}

try {
  const startDir = process.argv[2] || process.cwd();
  // Register the CENTRALIZED project root, not the sub-repo a touch fired from:
  // ascend to the nearest ancestor holding .plans/config.json. If none exists
  // up the tree this isn't a plans-cc project, so register nothing (registering
  // a non-project path would pollute the desktop app's project list).
  const projectRoot = findProjectRoot(startDir);
  if (projectRoot) {
    registry.registerProject(projectRoot);
  }
} catch (_) {
  // best-effort — never fail
}

process.exit(0);
