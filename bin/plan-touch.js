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

try {
  const projectRoot = process.argv[2] || process.cwd();
  registry.registerProject(projectRoot);
} catch (_) {
  // best-effort — never fail
}

process.exit(0);
