#!/usr/bin/env node

// Best-effort CLI over lib/plans-git.js — the one place skills commit and sync
// .plans/. Usage (run from anywhere inside a project):
//
//   node plans-git.js commit [--sync-push] "<msg>"   commit pending .plans/ changes
//   node plans-git.js sync                           pull the plans branch (branch mode),
//                                                    renumber collisions, rebuild counters
//   node plans-git.js renumber                       renumber colliding local ids (branch mode)
//   node plans-git.js mode                           print none|local|inline|branch
//   node plans-git.js is-plans-branch <name>         print yes|no — is <name> the plans
//                                                    branch? (it must never be a **Base:**)
//
// Setup (run from the project root — the current directory is the root):
//
//   node plans-git.js init-branch [--branch <b>] [--remote <r>] [--no-push] [--force-fallback]
//   node plans-git.js migrate     [--branch <b>] [--remote <r>] [--no-push] [--force-fallback]
//   node plans-git.js join        [--branch <b>] [--remote <r>]
//
// Remote sessions (a SessionStart hook; run from anywhere inside the clone):
//
//   node plans-git.js bootstrap   [--branch <b>] [--remote <r>]
//
//   Idempotent: attaches <remote>/<branch> as the .plans worktree when .plans
//   is missing (join), syncs when it is already in branch mode, refuses a plain
//   local .plans/, and is a quiet no-op when there is no plans branch. It
//   prints NOTHING on stdout — every line (including its final `OK: …`,
//   `Skipped: …`, or `Error: …` line) goes to stderr.
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

  function parseSetupOpts(argv) {
    const opts = {};
    for (let i = 0; i < argv.length; i++) {
      if (argv[i] === "--branch" || argv[i] === "--remote") opts[argv[i].slice(2)] = argv[++i];
      else if (argv[i].startsWith("--branch=")) opts.branch = argv[i].slice("--branch=".length);
      else if (argv[i].startsWith("--remote=")) opts.remote = argv[i].slice("--remote=".length);
      else if (argv[i] === "--no-push") opts.push = false;
      else if (argv[i] === "--force-fallback") opts.forceFallback = true;
    }
    return opts;
  }

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
  } else if (subcommand === "is-plans-branch") {
    console.log(plansGit.isPlansBranch(args[0] || "", root) ? "yes" : "no");
  } else if (subcommand === "bootstrap") {
    // stdout must stay empty (SessionStart hook output is injected as context).
    const opts = parseSetupOpts(args);
    const res = plansGit.bootstrap(process.cwd(), opts);
    const err = (line) => console.error(line);
    for (const m of res.messages || []) err(m);
    for (const m of res.renumbered || []) err(`Renumbered #${m.from} → #${m.to}`);
    for (const w of res.warnings || []) err(`Warning: ${w}`);
    if (!res.ok) err(`Error: ${res.error}`);
    // bootstrap joins with skipGitignore: true, so it never edits the checkout's
    // .gitignore — no "(commit it)" suffix here. A missing slashless `.plans` line
    // is surfaced as a res.messages hint instead (printed above).
    else if (res.action === "joined") err(`OK: .plans is attached to ${res.remote}/${res.branch}`);
    else if (res.action === "synced") err(`OK: .plans synced with ${res.remote}/${res.branch}`);
    else err(`Skipped: ${res.reason || "nothing to bootstrap"}`);
  } else if (subcommand === "init-branch" || subcommand === "migrate" || subcommand === "join") {
    const opts = parseSetupOpts(args);
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
      `Warning: unknown plans-git subcommand "${subcommand || ""}" (expected commit, sync, renumber, mode, is-plans-branch, init-branch, migrate, join, or bootstrap)`
    );
  }
} catch (err) {
  // bootstrap's stdout must stay empty even when something goes wrong.
  const out = process.argv[2] === "bootstrap" ? console.error : console.log;
  out(`Warning: plans-git failed unexpectedly: ${err && err.message}`);
}

process.exit(0);
