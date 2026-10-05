const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");

// Shared .plans/ commit + sync helper (see CLAUDE.md "Plans storage mode &
// plans-git"). Every skill used to carry its own copy of the "Commit .plans/
// changes" block; this module is that block, plus branch mode.
//
// Storage modes:
//   none   — the project root is not a git repo. Nothing to commit.
//   local  — .plans is gitignored by the code repo. Never committed.
//   inline — .plans is tracked in the code repo. Today's exact sequence:
//            `git add .plans/` + `git commit -m <msg>`.
//   branch — .plans is a worktree of an orphan plans branch. Commits happen
//            inside that worktree under a mkdir lock, skip hooks and signing,
//            and push best-effort.
//
// Every exported function is best-effort and NEVER throws: problems come back
// as human-readable strings in `warnings`, which the CLI prints as `Warning:`
// lines for the model to surface. A skill must never fail because of this.

const LOCK_NAME = ".git-lock";
const SYNC_DEFAULTS = { remote: "origin", branch: "plans", auto_push: true };
const LOCK_DEFAULTS = { lockRetries: 20, lockDelayMs: 100, lockStaleMs: 60 * 1000 };

// Run git synchronously with an argv array (no shell, so messages can never be
// interpreted). Returns { ok, status, stdout, stderr } and never throws — a
// missing git binary reads as a failed command.
function git(cwd, args, extraEnv) {
  try {
    const r = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0", ...(extraEnv || {}) },
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

// realpath that degrades to path.resolve instead of throwing, so comparisons
// still work on paths that don't exist.
function realpath(p) {
  try {
    return fs.realpathSync(p);
  } catch (_) {
    return path.resolve(p);
  }
}

// Parse <root>/.plans/config.json, or {} if it is missing or malformed.
function readConfig(root) {
  try {
    const parsed = JSON.parse(fs.readFileSync(path.join(root, ".plans", "config.json"), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
}

// Resolve the storage mode for a project root: "none" | "local" | "inline" |
// "branch". The branch rule is the spec's single rule: .plans is the top level
// of its OWN worktree (`git -C .plans rev-parse --show-toplevel` is .plans
// itself) and that differs from the root's toplevel. A root that is not a git
// repo is "none" — exactly today's "not a git repo: skip silently" — even if
// .plans happens to be a repo (multi-repo parents are unsupported in v1).
function detectMode(root) {
  try {
    const rootTop = git(root, ["rev-parse", "--show-toplevel"]);
    if (!rootTop.ok) return "none";

    const plansDir = path.join(root, ".plans");
    if (fs.existsSync(plansDir)) {
      const plansTop = git(plansDir, ["rev-parse", "--show-toplevel"]);
      if (
        plansTop.ok &&
        realpath(plansTop.stdout) === realpath(plansDir) &&
        realpath(plansTop.stdout) !== realpath(rootTop.stdout)
      ) {
        return "branch";
      }
    }

    if (git(root, ["check-ignore", "-q", ".plans"]).ok) return "local";
    return "inline";
  } catch (_) {
    return "none";
  }
}

// The optional `sync` config key, read defensively like `models`: absent or
// malformed values fall back to the defaults per key. Never written here.
function readSyncConfig(root) {
  const out = { ...SYNC_DEFAULTS };
  try {
    const sync = readConfig(root).sync;
    if (sync && typeof sync === "object") {
      if (typeof sync.remote === "string" && sync.remote) out.remote = sync.remote;
      if (typeof sync.branch === "string" && sync.branch) out.branch = sync.branch;
      if (typeof sync.auto_push === "boolean") out.auto_push = sync.auto_push;
    }
  } catch (_) {
    // defaults
  }
  return out;
}

// Block the thread for ms milliseconds without spinning. The helper is a
// short-lived synchronous CLI, so a blocking wait is the simplest correct
// retry delay.
function sleep(ms) {
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch (_) {
    // best-effort
  }
}

// Take the .plans/.git-lock mutex. mkdir is atomic, so whoever creates the
// directory owns the lock. Retries a few times; a lock older than lockStaleMs
// is assumed abandoned (a crashed helper) and broken. Returns true on success.
function acquireLock(plansDir, opts) {
  const lockDir = path.join(plansDir, LOCK_NAME);
  for (let attempt = 0; attempt <= opts.lockRetries; attempt++) {
    try {
      fs.mkdirSync(lockDir);
      return true;
    } catch (err) {
      if (!err || err.code !== "EEXIST") return false;
    }
    try {
      const age = Date.now() - fs.statSync(lockDir).mtimeMs;
      if (age > opts.lockStaleMs) {
        fs.rmSync(lockDir, { recursive: true, force: true });
        continue; // retry immediately
      }
    } catch (_) {
      continue; // released between mkdir and stat — retry immediately
    }
    if (attempt < opts.lockRetries) sleep(opts.lockDelayMs);
  }
  return false;
}

// Release the lock we hold. Best-effort.
function releaseLock(plansDir) {
  try {
    fs.rmSync(path.join(plansDir, LOCK_NAME), { recursive: true, force: true });
  } catch (_) {
    // best-effort
  }
}

// Push the plans worktree's HEAD to <remote>/<branch>. Skipped silently when
// auto_push is off or the remote isn't configured (a branch-mode project with
// no remote is a valid local-only setup). syncPush waits for the result and
// reports failure as a warning; otherwise the push is detached and unref'd so
// the helper exits immediately and the push finishes (or fails) on its own.
function push(plansDir, syncConfig, syncPush, result) {
  if (!syncConfig.auto_push && !syncPush) return;
  if (!git(plansDir, ["remote", "get-url", syncConfig.remote]).ok) return;
  const args = ["push", "-u", syncConfig.remote, `HEAD:refs/heads/${syncConfig.branch}`];

  if (syncPush) {
    const r = git(plansDir, ["push", "-q", ...args.slice(1)]);
    if (r.ok) {
      result.pushed = true;
    } else {
      result.warnings.push(
        `plans push to ${syncConfig.remote}/${syncConfig.branch} failed (committed locally; will retry on next push)` +
          (r.stderr ? `: ${r.stderr.split("\n")[0]}` : "")
      );
    }
    return;
  }

  try {
    const child = spawn("git", args, {
      cwd: plansDir,
      detached: true,
      stdio: "ignore",
      env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
    });
    child.on("error", () => {});
    child.unref();
  } catch (_) {
    // best-effort
  }
}

// Inline mode: today's skill block, step for step — git_commits must be true,
// .plans/ must have changes, then `git add .plans/` and a bare
// `git commit -m` (which, as today, includes anything else already staged).
function commitInline(root, msg, result) {
  if (readConfig(root).git_commits !== true) return result;
  const status = git(root, ["status", "--porcelain", ".plans/"]);
  if (!status.ok || status.stdout === "") return result;
  const add = git(root, ["add", ".plans/"]);
  const commit = add.ok ? git(root, ["commit", "-m", msg]) : add;
  if (commit.ok) {
    result.committed = true;
  } else {
    result.warnings.push(
      "plans commit failed (e.g. a hook rejected it); changes left uncommitted" +
        (commit.stderr ? `: ${commit.stderr.split("\n")[0]}` : "")
    );
  }
  return result;
}

// Warn (once per clone) that git_commits isn't true in branch mode — commits
// are the sync mechanism there, so this silently disables sync. The marker is
// stored in the .plans worktree's git config; the setting is never flipped.
function warnGitCommitsOnce(plansDir, result) {
  if (git(plansDir, ["config", "--get", "plans-cc.warnedGitCommits"]).stdout === "true") return;
  result.warnings.push(
    'branch mode is on but git_commits is not true in .plans/config.json — plans are not being committed or synced. Set "git_commits": true to enable sync.'
  );
  git(plansDir, ["config", "plans-cc.warnedGitCommits", "true"]);
}

// Branch mode: commit everything in the .plans worktree on the plans branch,
// under the lock, bypassing the code repo's hooks (--no-verify) and signing.
function commitBranch(root, msg, opts, result) {
  const plansDir = path.join(root, ".plans");
  if (readConfig(root).git_commits !== true) {
    warnGitCommitsOnce(plansDir, result);
    return result;
  }
  if (!acquireLock(plansDir, opts)) {
    result.warnings.push(`.plans is locked by another commit (${LOCK_NAME}); skipped this commit — the next one will include these changes`);
    return result;
  }
  try {
    const add = git(plansDir, ["add", "-A", "--", ".", `:!${LOCK_NAME}`]);
    if (!add.ok) {
      result.warnings.push(`plans add failed${add.stderr ? `: ${add.stderr.split("\n")[0]}` : ""}`);
      return result;
    }
    // Nothing staged → clean tree → no-op.
    if (git(plansDir, ["diff", "--cached", "--quiet"]).ok) return result;
    const commit = git(plansDir, ["-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", msg]);
    if (!commit.ok) {
      result.warnings.push(`plans commit failed${commit.stderr ? `: ${commit.stderr.split("\n")[0]}` : ""}`);
      return result;
    }
    result.committed = true;
  } finally {
    releaseLock(plansDir);
  }
  push(plansDir, readSyncConfig(root), Boolean(opts.syncPush), result);
  return result;
}

// Commit pending .plans/ changes for the project at root with message msg.
// opts: { syncPush } waits for the push (ID-minting callers); lockRetries /
// lockDelayMs / lockStaleMs tune the lock (tests). Returns
// { mode, committed, pushed, warnings } and never throws.
function commit(root, msg, opts) {
  const o = { ...LOCK_DEFAULTS, ...(opts || {}) };
  const result = { mode: "none", committed: false, pushed: false, warnings: [] };
  try {
    result.mode = detectMode(root);
    if (result.mode === "inline") return commitInline(root, String(msg), result);
    if (result.mode === "branch") return commitBranch(root, String(msg), o, result);
  } catch (err) {
    result.warnings.push(`plans commit failed unexpectedly: ${err && err.message}`);
  }
  return result;
}

// Branch mode only (otherwise a no-op): make sure the `ours` merge driver is
// configured (it is not built in), then `pull --rebase --autostash` from the
// upstream under the lock. No upstream → quiet no-op. A failed rebase is
// reported, never auto-aborted — the user resolves it in .plans/.
// Returns { mode, synced, warnings } and never throws.
function sync(root, opts) {
  const o = { ...LOCK_DEFAULTS, ...(opts || {}) };
  const result = { mode: "none", synced: false, warnings: [] };
  try {
    result.mode = detectMode(root);
    if (result.mode !== "branch") return result;
    const plansDir = path.join(root, ".plans");

    if (git(plansDir, ["config", "--get", "merge.ours.driver"]).stdout !== "true") {
      git(plansDir, ["config", "merge.ours.driver", "true"]);
    }

    if (!git(plansDir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).ok) return result;

    if (!acquireLock(plansDir, o)) {
      result.warnings.push(`.plans is locked by another commit (${LOCK_NAME}); skipped sync`);
      return result;
    }
    try {
      const pull = git(plansDir, ["-c", "commit.gpgsign=false", "pull", "-q", "--rebase", "--autostash"]);
      if (pull.ok) {
        result.synced = true;
      } else {
        result.warnings.push(
          "plans sync failed — if a rebase is in progress, resolve it in .plans/ (git -C .plans status)" +
            (pull.stderr ? `: ${pull.stderr.split("\n")[0]}` : "")
        );
      }
    } finally {
      releaseLock(plansDir);
    }
  } catch (err) {
    result.warnings.push(`plans sync failed unexpectedly: ${err && err.message}`);
  }
  return result;
}

module.exports = { detectMode, readSyncConfig, commit, sync };
