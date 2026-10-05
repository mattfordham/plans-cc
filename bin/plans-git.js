#!/usr/bin/env node

// Best-effort CLI over lib/plans-git.js — the one place skills commit and sync
// .plans/. Usage (run from anywhere inside a project):
//
//   node plans-git.js commit [--sync-push] "<msg>"   commit pending .plans/ changes
//   node plans-git.js sync                           pull the plans branch (branch mode),
//                                                    renumber collisions, rebuild counters
//   node plans-git.js renumber                       renumber colliding local ids (branch mode)
//   node plans-git.js mode                           print none|local|inline|branch
//
// Setup (run from the project root — the current directory is the root):
//
//   node plans-git.js init-branch [--branch <b>] [--remote <r>] [--no-push] [--force-fallback]
//   node plans-git.js migrate     [--branch <b>] [--remote <r>] [--no-push] [--force-fallback]
//   node plans-git.js join        [--branch <b>] [--remote <r>]
//
// Any problem is printed to stdout as a `Warning: …` line for the model to
// surface; sync/renumber print one `Renumbered #A → #B` line per moved task.
// Setup commands end with exactly one `OK: …` or `Error: …` line. The exit
// code is ALWAYS 0: a skill must never fail because of this.
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
  } else if (subcommand === "sync" || subcommand === "renumber") {
    if (root) {
      const res = subcommand === "sync" ? plansGit.sync(root) : plansGit.renumber(root);
      for (const m of res.renumbered || []) console.log(`Renumbered #${m.from} → #${m.to}`);
      printWarnings(res.warnings);
    }
  } else if (subcommand === "init-branch" || subcommand === "migrate" || subcommand === "join") {
    const opts = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === "--branch" || args[i] === "--remote") opts[args[i].slice(2)] = args[++i];
      else if (args[i].startsWith("--branch=")) opts.branch = args[i].slice("--branch=".length);
      else if (args[i].startsWith("--remote=")) opts.remote = args[i].slice("--remote=".length);
      else if (args[i] === "--no-push") opts.push = false;
      else if (args[i] === "--force-fallback") opts.forceFallback = true;
    }
    const fn = { "init-branch": plansGit.initBranch, migrate: plansGit.migrate, join: plansGit.join }[subcommand];
    const res = fn(process.cwd(), opts);
    for (const m of res.messages || []) console.log(m);
    printWarnings(res.warnings);
    if (res.ok) {
      const pushed = res.pushed ? `pushed to ${res.remote}/${res.branch}` : "not pushed";
      const detail =
        subcommand === "join"
          ? `.plans is attached to ${res.remote}/${res.branch}${res.gitignoreChanged ? "; added `.plans` to .gitignore (commit it)" : ""}`
          : `.plans is on branch ${res.branch} (${pushed})`;
      console.log(`OK: ${detail}`);
    } else {
      console.log(`Error: ${res.error}`);
    }
  } else {
    console.log(
      `Warning: unknown plans-git subcommand "${subcommand || ""}" (expected commit, sync, renumber, mode, init-branch, migrate, or join)`
    );
  }
} catch (err) {
  console.log(`Warning: plans-git failed unexpectedly: ${err && err.message}`);
}

process.exit(0);
