#!/usr/bin/env node

// Best-effort CLI over lib/plans-git.js — the one place skills commit and sync
// .plans/. Usage (run from anywhere inside a project):
//
//   node plans-git.js commit [--sync-push] "<msg>"   commit pending .plans/ changes
//   node plans-git.js sync                           pull the plans branch (branch mode)
//   node plans-git.js mode                           print none|local|inline|branch
//
// Any problem is printed to stdout as a `Warning: …` line for the model to
// surface. The exit code is ALWAYS 0: a skill must never fail because of this.
//
// The lib/ directory is a sibling of this script in BOTH layouts:
//   repo:      bin/plans-git.js      + lib/plans-git.js          → ../lib/plans-git
//   installed: plans-cc/plans-git.js + plans-cc/lib/plans-git.js → ./lib/plans-git
// Try the repo path first, fall back to the installed path.
try {
  let plansGit;
  try {
    plansGit = require("../lib/plans-git");
  } catch (_) {
    plansGit = require("./lib/plans-git");
  }
  let findProjectRoot;
  try {
    ({ findProjectRoot } = require("../lib/find-root"));
  } catch (_) {
    ({ findProjectRoot } = require("./lib/find-root"));
  }

  const args = process.argv.slice(2);
  const subcommand = args.shift();
  // Commit/sync the CENTRALIZED project root, wherever we were invoked from.
  // No root up the tree means this isn't a plans-cc project: do nothing.
  const root = findProjectRoot(process.cwd());

  const printWarnings = (warnings) => {
    for (const w of warnings || []) console.log(`Warning: ${w}`);
  };

  if (subcommand === "mode") {
    console.log(root ? plansGit.detectMode(root) : "none");
  } else if (subcommand === "commit") {
    const syncPush = args.includes("--sync-push");
    const msg = args.filter((a) => a !== "--sync-push").join(" ");
    if (!msg) {
      console.log("Warning: plans-git commit needs a message");
    } else if (root) {
      printWarnings(plansGit.commit(root, msg, { syncPush }).warnings);
    }
  } else if (subcommand === "sync") {
    if (root) printWarnings(plansGit.sync(root).warnings);
  } else {
    console.log(`Warning: unknown plans-git subcommand "${subcommand || ""}" (expected commit, sync, or mode)`);
  }
} catch (err) {
  console.log(`Warning: plans-git failed unexpectedly: ${err && err.message}`);
}

process.exit(0);
