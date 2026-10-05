const fs = require("fs");
const path = require("path");
const { spawnSync, spawn } = require("child_process");
const crypto = require("crypto");
const { renderProgress, scanIds, TASK_DIRS } = require("./render-progress");
const { findProjectRoot } = require("./find-root");

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
// missing git binary reads as a failed command. `input` is fed to stdin.
function git(cwd, args, extraEnv, input) {
  try {
    const r = spawnSync("git", args, {
      cwd,
      encoding: "utf8",
      input: input === undefined ? undefined : input,
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

// Stage everything in the .plans worktree and commit it, bypassing the code
// repo's hooks and signing. The lock is an empty directory, which git never
// stages (an exclude pathspec for it errors once .gitignore lists it). The
// caller holds the lock (or owns the worktree outright, during setup).
// Returns true when a commit was made; a clean tree is a quiet no-op.
function commitWorktree(plansDir, msg, result) {
  const add = git(plansDir, ["add", "-A"]);
  if (!add.ok) {
    result.warnings.push(`plans add failed${add.stderr ? `: ${add.stderr.split("\n")[0]}` : ""}`);
    return false;
  }
  if (git(plansDir, ["diff", "--cached", "--quiet"]).ok) return false;
  const commit = git(plansDir, ["-c", "commit.gpgsign=false", "commit", "-q", "--no-verify", "-m", msg]);
  if (!commit.ok) {
    result.warnings.push(`plans commit failed${commit.stderr ? `: ${commit.stderr.split("\n")[0]}` : ""}`);
    return false;
  }
  return true;
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
    if (!commitWorktree(plansDir, msg, result)) return result;
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

function ensureMergeDriver(plansDir) {
  if (git(plansDir, ["config", "--get", "merge.ours.driver"]).stdout !== "true") {
    git(plansDir, ["config", "merge.ours.driver", "true"]);
  }
}

function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2) + "\n");
}

const pad3 = (n) => String(n).padStart(3, "0");

// --- renumber ---

// Every task file under the task dirs, as worktree-relative posix paths.
function listTaskFiles(plansDir) {
  const out = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(plansDir, rel), { withFileTypes: true });
    } catch (_) {
      return;
    }
    for (const e of entries) {
      const child = `${rel}/${e.name}`;
      if (e.isDirectory()) walk(child);
      else if (/^\d{3,}-.*\.md$/.test(e.name)) out.push(child);
    }
  };
  for (const d of TASK_DIRS) walk(d);
  return out.sort();
}

function gitLines(cwd, args) {
  const r = git(cwd, ["-c", "core.quotePath=false", ...args]);
  return r.ok && r.stdout ? r.stdout.split("\n").filter(Boolean) : [];
}

// What this clone has that upstream doesn't: `added` (new files — the
// candidates to move) and `touched` (anything changed — where references to a
// moved id are rewritten). Uncommitted and untracked work counts as local too.
function localChanges(plansDir) {
  const added = new Set([
    ...gitLines(plansDir, ["diff", "--name-only", "-M", "--diff-filter=A", "@{u}", "HEAD"]),
    ...gitLines(plansDir, ["diff", "--name-only", "-M", "--diff-filter=A", "--cached"]),
    ...gitLines(plansDir, ["ls-files", "--others", "--exclude-standard"]),
  ]);
  const touched = new Set([
    ...added,
    ...gitLines(plansDir, ["diff", "--name-only", "@{u}", "HEAD"]),
    ...gitLines(plansDir, ["diff", "--name-only", "HEAD"]),
  ]);
  return { added, touched };
}

function rewriteFile(file, fn) {
  try {
    const before = fs.readFileSync(file, "utf8");
    const after = fn(before);
    if (after !== before) fs.writeFileSync(file, after);
  } catch (_) {
    // best-effort
  }
}

// Append a bullet to the ## Notes section (creating it at the end if absent).
function addNote(content, note) {
  const lines = content.replace(/\n+$/, "").split("\n");
  const start = lines.findIndex((l) => l.trim() === "## Notes");
  if (start === -1) return `${lines.join("\n")}\n\n## Notes\n- ${note}\n`;
  let end = lines.findIndex((l, i) => i > start && l.startsWith("## "));
  if (end === -1) end = lines.length;
  while (end - 1 > start && lines[end - 1].trim() === "") end--;
  lines.splice(end, 0, `- ${note}`);
  return `${lines.join("\n")}\n`;
}

// Rename a path inside the worktree: `git mv` when tracked, a plain rename
// otherwise. Returns true on success.
function movePath(plansDir, fromRel, toRel) {
  fs.mkdirSync(path.dirname(path.join(plansDir, toRel)), { recursive: true });
  if (git(plansDir, ["ls-files", "--error-unmatch", "--", fromRel]).ok) {
    return git(plansDir, ["mv", "--", fromRel, toRel]).ok;
  }
  try {
    fs.renameSync(path.join(plansDir, fromRel), path.join(plansDir, toRel));
    return true;
  } catch (_) {
    return false;
  }
}

// Rewrite **Blocked by:** ids (in pending/ and backlog/) and `Task #NNN` lines
// under an idea's ## Picked / ## Expanded Into, but only in files this clone
// changed: an upstream file's #043 means upstream's #043.
function rewriteReferences(plansDir, files, map) {
  const swap = (_, hash, id) => (map.has(id) ? `${hash}${map.get(id)}` : `${hash}${id}`);
  for (const rel of files) {
    const file = path.join(plansDir, rel);
    if (/^(pending|backlog)\/.*\.md$/.test(rel)) {
      rewriteFile(file, (c) =>
        c.replace(/^(\*\*Blocked by:\*\*.*)$/gm, (line) => line.replace(/(#?)(\d{3})\b/g, swap))
      );
    } else if (/^ideas\/.*\.md$/.test(rel)) {
      rewriteFile(file, (c) => {
        let inSection = false;
        return c
          .split("\n")
          .map((line) => {
            if (line.startsWith("## ")) inSection = /^## (Picked|Expanded Into)\s*$/.test(line);
            return inSection ? line.replace(/(Task #)(\d{3})\b/g, swap) : line;
          })
          .join("\n");
      });
    }
  }
}

// Find task ids that now exist twice and move this clone's copy (the one added
// in local commits not yet on upstream) to max+1. Caller holds the lock.
// Returns [{ from, to }]; branches and worktrees named for the old id are left
// alone with a warning.
function renumberLocked(root, plansDir, result) {
  const mapping = [];
  if (!git(plansDir, ["rev-parse", "--verify", "-q", "@{u}"]).ok) return mapping;

  const byId = new Map();
  for (const rel of listTaskFiles(plansDir)) {
    const id = path.posix.basename(rel).match(/^(\d{3,})-/)[1];
    if (!byId.has(id)) byId.set(id, []);
    byId.get(id).push(rel);
  }
  const { added, touched } = localChanges(plansDir);

  const movers = [];
  for (const [id, files] of [...byId].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (files.length < 2) continue;
    let local = files.filter((f) => added.has(f));
    if (local.length === files.length) local = local.slice(1);
    for (const rel of local) movers.push({ id, rel });
  }
  if (movers.length === 0) return mapping;

  const nextId = Number(readConfig(root).next_id) || 0;
  let next = Math.max(scanIds(plansDir).maxTaskId, nextId - 1) + 1;
  const map = new Map();
  const rewriteTargets = new Set(touched);
  const branches = gitLines(root, ["for-each-ref", "--format=%(refname:short)", "refs/heads"]);
  let worktrees = [];
  try {
    worktrees = fs.readdirSync(path.join(root, ".worktrees"));
  } catch (_) {
    // none
  }

  for (const { id, rel } of movers) {
    const to = pad3(next++);
    const dir = path.posix.dirname(rel);
    const newRel = `${dir}/${to}${path.posix.basename(rel).slice(id.length)}`;
    if (!movePath(plansDir, rel, newRel)) {
      result.warnings.push(`could not renumber ${rel} (duplicate id #${id}) — resolve it by hand`);
      continue;
    }
    rewriteFile(path.join(plansDir, newRel), (c) =>
      addNote(c.replace(/^\*\*ID:\*\*[^\S\n]*\d{3,}[^\S\n]*$/m, `**ID:** ${to}`), `Renumbered from #${id} after sync collision`)
    );
    rewriteTargets.add(newRel);

    const stateRel = `state/${id}-state.md`;
    const newStateRel = `state/${to}-state.md`;
    if (added.has(stateRel) && fs.existsSync(path.join(plansDir, stateRel)) && movePath(plansDir, stateRel, newStateRel)) {
      rewriteFile(path.join(plansDir, newStateRel), (c) => c.replace(new RegExp(`#${id}\\b`, "g"), `#${to}`));
    }

    for (const b of branches.filter((b) => new RegExp(`(^|/)${id}-`).test(b))) {
      result.warnings.push(`task #${id} was renumbered to #${to}, but branch ${b} still carries the old id — left alone; rename it by hand if needed`);
    }
    for (const w of worktrees.filter((w) => w.startsWith(`${id}-`))) {
      result.warnings.push(`task #${id} was renumbered to #${to}, but worktree .worktrees/${w} still carries the old id — left alone`);
    }
    map.set(id, to);
    mapping.push({ from: id, to });
  }

  rewriteReferences(plansDir, [...rewriteTargets], map);
  return mapping;
}

// Rebuild next_id / idea_next_id from the ID scan. A counter never moves
// backwards (deleted ids are not reused); a key that is absent stays absent
// unless files exist for it. Returns true when config.json changed.
function rebuildCounters(plansDir) {
  const file = path.join(plansDir, "config.json");
  let config;
  try {
    config = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (_) {
    return false;
  }
  if (!config || typeof config !== "object") return false;
  const { maxTaskId, maxIdeaId } = scanIds(plansDir);
  const next = { ...config };
  if ("next_id" in config || maxTaskId > 0) {
    next.next_id = Math.max(Number(config.next_id) || 0, maxTaskId + 1);
  }
  if ("idea_next_id" in config || maxIdeaId > 0) {
    next.idea_next_id = Math.max(Number(config.idea_next_id) || 0, maxIdeaId + 1);
  }
  if (next.next_id === config.next_id && next.idea_next_id === config.idea_next_id) return false;
  writeJson(file, next);
  return true;
}

// Regenerate PROGRESS.md from the task files (it is merge=ours, so a rebase
// can bring it back stale). Returns true when it changed.
function rebuildProgress(plansDir) {
  const file = path.join(plansDir, "PROGRESS.md");
  if (!fs.existsSync(file)) return false;
  const next = renderProgress(plansDir);
  if (fs.readFileSync(file, "utf8") === next) return false;
  fs.writeFileSync(file, next);
  return true;
}

// After a pull: renumber collisions, rebuild the counters, and rebuild
// PROGRESS.md if task files changed. Returns true when anything was written.
function postProcess(root, plansDir, preHead, postHead, result) {
  result.renumbered = renumberLocked(root, plansDir, result);
  let changed = rebuildCounters(plansDir);
  let tasksChanged = result.renumbered.length > 0;
  if (!tasksChanged && preHead && postHead && preHead !== postHead) {
    tasksChanged = gitLines(plansDir, ["diff", "--name-only", preHead, postHead, "--", ...TASK_DIRS]).length > 0;
  }
  if (tasksChanged && rebuildProgress(plansDir)) changed = true;
  return changed || result.renumbered.length > 0;
}

function renumberMessage(mapping) {
  return mapping.length
    ? `plan: sync — renumber ${mapping.map((m) => `#${m.from} → #${m.to}`).join(", ")}`
    : "plan: sync — rebuild counters";
}

// A failed pull that left a rebase behind is aborted (restoring the local
// commits and any autostash) — a conflict here is never resolved
// automatically. Anything else is reported as a plain sync failure.
function handleFailedPull(plansDir, pull, result) {
  const detail = pull.stderr ? `: ${pull.stderr.split("\n")[0]}` : "";
  const inRebase = ["rebase-merge", "rebase-apply"].some((p) => {
    const r = git(plansDir, ["rev-parse", "--git-path", p]);
    return r.ok && fs.existsSync(path.resolve(plansDir, r.stdout));
  });
  if (inRebase) {
    git(plansDir, ["rebase", "--abort"]);
    result.warnings.push(
      "plans sync hit a conflict it cannot resolve automatically — rebase aborted, local plan commits kept; resolve by hand with `git -C .plans pull --rebase`" +
        detail
    );
  } else {
    result.warnings.push(`plans sync failed${detail}`);
  }
}

// Branch mode only (otherwise a no-op): make sure the `ours` merge driver is
// configured (it is not built in), then `pull --rebase --autostash` from the
// upstream under the lock. After a successful pull, colliding local task ids
// are renumbered, next_id / idea_next_id are rebuilt from the files, and
// PROGRESS.md is regenerated if task files changed; the result is committed
// and pushed. A rebase conflict is aborted with a warning, never resolved.
// No upstream → quiet no-op. Returns { mode, synced, renumbered, warnings }
// and never throws.
function sync(root, opts) {
  const o = { ...LOCK_DEFAULTS, ...(opts || {}) };
  const result = { mode: "none", synced: false, renumbered: [], warnings: [] };
  try {
    result.mode = detectMode(root);
    if (result.mode !== "branch") return result;
    const plansDir = path.join(root, ".plans");
    ensureMergeDriver(plansDir);

    if (!git(plansDir, ["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{u}"]).ok) return result;

    if (!acquireLock(plansDir, o)) {
      result.warnings.push(`.plans is locked by another commit (${LOCK_NAME}); skipped sync`);
      return result;
    }
    let committed = false;
    try {
      const preHead = git(plansDir, ["rev-parse", "-q", "--verify", "HEAD"]).stdout;
      const pull = git(plansDir, ["-c", "commit.gpgsign=false", "pull", "-q", "--rebase", "--autostash"]);
      if (!pull.ok) {
        handleFailedPull(plansDir, pull, result);
        return result;
      }
      result.synced = true;
      const postHead = git(plansDir, ["rev-parse", "-q", "--verify", "HEAD"]).stdout;
      if (postProcess(root, plansDir, preHead, postHead, result) && readConfig(root).git_commits === true) {
        committed = commitWorktree(plansDir, renumberMessage(result.renumbered), result);
      }
    } finally {
      releaseLock(plansDir);
    }
    if (committed) push(plansDir, readSyncConfig(root), true, result);
  } catch (err) {
    result.warnings.push(`plans sync failed unexpectedly: ${err && err.message}`);
  }
  return result;
}

// Branch mode only: renumber colliding local task ids without pulling (sync
// already does this after every pull). Commits the result.
// Returns { mode, renumbered, warnings } and never throws.
function renumber(root, opts) {
  const o = { ...LOCK_DEFAULTS, ...(opts || {}) };
  const result = { mode: "none", renumbered: [], warnings: [] };
  try {
    result.mode = detectMode(root);
    if (result.mode !== "branch") return result;
    const plansDir = path.join(root, ".plans");
    if (!acquireLock(plansDir, o)) {
      result.warnings.push(`.plans is locked by another commit (${LOCK_NAME}); skipped renumber`);
      return result;
    }
    try {
      result.renumbered = renumberLocked(root, plansDir, result);
      if (result.renumbered.length > 0) {
        rebuildCounters(plansDir);
        rebuildProgress(plansDir);
        if (readConfig(root).git_commits === true) commitWorktree(plansDir, renumberMessage(result.renumbered), result);
      }
    } finally {
      releaseLock(plansDir);
    }
  } catch (err) {
    result.warnings.push(`plans renumber failed unexpectedly: ${err && err.message}`);
  }
  return result;
}

// --- setup: init-branch, migrate, join ---

const ATTRIBUTES = ["HISTORY.md merge=union", "PROGRESS.md merge=ours", "config.json merge=ours"];
const PLANS_IGNORES = [".DS_Store", LOCK_NAME];
const COPY_EXCLUDE = new Set([".git", ".DS_Store", LOCK_NAME]);

// `git worktree add --orphan` needs git >= 2.42.
function supportsOrphanWorktree() {
  const m = git(process.cwd(), ["--version"]).stdout.match(/(\d+)\.(\d+)/);
  if (!m) return false;
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return major > 2 || (major === 2 && minor >= 42);
}

function setupResult(branch, remote) {
  return { ok: false, branch, remote, fallback: false, pushed: false, gitignoreChanged: false, messages: [], warnings: [], error: null };
}

// Branch mode needs the root to be a git repo; a multi-repo parent is not.
function refuseNonGit(root, result) {
  if (git(root, ["rev-parse", "--show-toplevel"]).ok) return false;
  result.error = `${root} is not a git repo — branch mode needs the project root to be a git repository (multi-repo parent roots are not supported)`;
  return true;
}

// Append any missing lines to a text file, creating it if needed.
function ensureLines(file, lines) {
  let content = "";
  try {
    content = fs.readFileSync(file, "utf8");
  } catch (_) {
    // new file
  }
  const have = new Set(content.split(/\r?\n/).map((l) => l.trim()));
  const missing = lines.filter((l) => !have.has(l));
  if (missing.length === 0) return false;
  const sep = content && !content.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(file, `${content}${sep}${missing.join("\n")}\n`);
  return true;
}

// Ignore .plans in this clone's .git/info/exclude, so it stays ignored on
// every code branch — including old ones whose .gitignore lacks the line.
function addInfoExclude(root) {
  const r = git(root, ["rev-parse", "--git-path", "info/exclude"]);
  if (!r.ok) return;
  const file = path.resolve(root, r.stdout);
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    ensureLines(file, [".plans"]);
  } catch (_) {
    // best-effort
  }
}

// Make sure the code repo's .gitignore ignores `.plans` in the slashless form
// (the slashed form doesn't match the .plans symlink in execution worktrees).
// Returns true when the file changed.
function ensureSlashlessIgnore(root) {
  const file = path.join(root, ".gitignore");
  let content = "";
  try {
    content = fs.readFileSync(file, "utf8");
  } catch (_) {
    // new file
  }
  const lines = content.split("\n");
  if (lines.some((l) => l.trim() === ".plans" || l.trim() === "/.plans")) return false;
  const slashed = lines.findIndex((l) => l.trim() === ".plans/" || l.trim() === "/.plans/");
  if (slashed !== -1) {
    lines[slashed] = lines[slashed].trim().replace(/\/$/, "");
    fs.writeFileSync(file, lines.join("\n"));
    return true;
  }
  const sep = content && !content.endsWith("\n") ? "\n" : "";
  fs.writeFileSync(file, `${content}${sep}.plans\n`);
  return true;
}

// A missing or empty .plans is fine to build on (an empty dir is removed).
// Returns false when .plans has content.
function clearEmptyPlans(plansDir) {
  try {
    const st = fs.lstatSync(plansDir);
    if (!st.isDirectory() || fs.readdirSync(plansDir).length > 0) return false;
    fs.rmdirSync(plansDir);
    return true;
  } catch (_) {
    return true; // doesn't exist
  }
}

// The plans branch must not exist yet, locally or on the remote we know of.
function branchTaken(root, branch, remote, result) {
  if (git(root, ["rev-parse", "--verify", "-q", `refs/heads/${branch}`]).ok) {
    result.error = `branch "${branch}" already exists — use join to attach to it`;
    return true;
  }
  if (git(root, ["rev-parse", "--verify", "-q", `refs/remotes/${remote}/${branch}`]).ok) {
    result.error = `${remote}/${branch} already exists — use join to attach to it instead of starting a new plans branch`;
    return true;
  }
  return false;
}

// Create the orphan plans branch checked out as a worktree at .plans:
// `worktree add --orphan` on git >= 2.42, otherwise (or when forced) an empty
// root commit via mktree + commit-tree, a branch, and a plain worktree add.
function createWorktree(root, plansDir, branch, opts, result) {
  result.fallback = Boolean(opts.forceFallback) || !supportsOrphanWorktree();
  const fail = (what, r) => {
    result.error = `${what} failed${r && r.stderr ? `: ${r.stderr.split("\n")[0]}` : ""}`;
    return false;
  };
  if (!result.fallback) {
    const r = git(root, ["worktree", "add", "-q", "--orphan", "-b", branch, plansDir]);
    return r.ok || fail("git worktree add --orphan", r);
  }
  const tree = git(root, ["mktree"], null, "");
  if (!tree.ok) return fail("git mktree", tree);
  const commitSha = git(root, ["-c", "commit.gpgsign=false", "commit-tree", tree.stdout, "-m", "plan: start plans branch"]);
  if (!commitSha.ok) return fail("git commit-tree", commitSha);
  const br = git(root, ["branch", branch, commitSha.stdout]);
  if (!br.ok) return fail("git branch", br);
  const wt = git(root, ["worktree", "add", "-q", plansDir, branch]);
  return wt.ok || fail("git worktree add", wt);
}

// git doesn't track empty directories, so plan-init's empty pending/,
// completed/, backlog/ … would vanish from the branch (and never reach a
// joining clone). Drop a .gitkeep into every empty directory.
function keepEmptyDirs(dir) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return;
  }
  const kept = entries.filter((e) => !COPY_EXCLUDE.has(e.name));
  if (kept.length === 0) {
    fs.writeFileSync(path.join(dir, ".gitkeep"), "");
    return;
  }
  for (const e of kept) if (e.isDirectory()) keepEmptyDirs(path.join(dir, e.name));
}

// Scaffold the plans branch, configure the merge driver, write the sync config
// (flipping git_commits to true — announced, never silent), commit, and push
// with upstream (a push failure is a warning: the commit stays local).
function finalizeBranch(root, plansDir, msg, opts, result) {
  ensureLines(path.join(plansDir, ".gitattributes"), ATTRIBUTES);
  ensureLines(path.join(plansDir, ".gitignore"), PLANS_IGNORES);
  for (const e of fs.readdirSync(plansDir, { withFileTypes: true })) {
    if (e.isDirectory() && !COPY_EXCLUDE.has(e.name)) keepEmptyDirs(path.join(plansDir, e.name));
  }
  ensureMergeDriver(plansDir);

  const config = readConfig(root);
  if (config.git_commits === false) {
    result.messages.push("Set git_commits to true in .plans/config.json — in branch mode, commits are how plans sync.");
  }
  const prevSync = config.sync && typeof config.sync === "object" ? config.sync : {};
  const syncConfig = {
    remote: result.remote,
    branch: result.branch,
    auto_push: typeof prevSync.auto_push === "boolean" ? prevSync.auto_push : true,
  };
  writeJson(path.join(plansDir, "config.json"), { ...config, git_commits: true, sync: syncConfig });

  const before = result.warnings.length;
  commitWorktree(plansDir, msg, result);
  if (result.warnings.length > before) {
    result.error = result.warnings.splice(before).join("; ");
    return;
  }
  if (opts.push !== false) push(plansDir, { ...syncConfig, auto_push: true }, true, result);
}

function resolveNames(root, opts) {
  const configured = readSyncConfig(root);
  return {
    branch: (opts && opts.branch) || configured.branch,
    remote: (opts && opts.remote) || configured.remote,
  };
}

// Start branch mode in a project with no .plans yet: an orphan plans branch
// at .plans with the scaffold and sync config, committed and pushed.
// opts: { branch, remote, push (default true), forceFallback }. Returns
// { ok, branch, remote, fallback, pushed, messages, warnings, error }.
function initBranch(root, opts) {
  const o = opts || {};
  const { branch, remote } = resolveNames(root, o);
  const result = setupResult(branch, remote);
  try {
    if (refuseNonGit(root, result)) return result;
    const plansDir = path.join(root, ".plans");
    if (detectMode(root) === "branch") {
      result.error = ".plans is already on a plans branch (branch mode)";
      return result;
    }
    if (!clearEmptyPlans(plansDir)) {
      result.error = ".plans already exists — use migrate to move an existing .plans onto the plans branch";
      return result;
    }
    if (branchTaken(root, branch, remote, result)) return result;
    addInfoExclude(root);
    if (!createWorktree(root, plansDir, branch, o, result)) return result;
    finalizeBranch(root, plansDir, "plan: init plans branch", o, result);
    result.ok = !result.error;
  } catch (err) {
    result.error = `init-branch failed unexpectedly: ${err && err.message}`;
  }
  return result;
}

// Worktree-relative posix paths of every file/symlink under dir, skipping
// COPY_EXCLUDE names at any depth. dirs, when given, collects directories.
function listFiles(dir, dirs) {
  const out = [];
  const walk = (rel) => {
    for (const e of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      if (COPY_EXCLUDE.has(e.name)) continue;
      const child = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (dirs) dirs.push(child);
        walk(child);
      } else out.push(child);
    }
  };
  walk("");
  return out.sort();
}

function copyTree(src, dest) {
  const dirs = [];
  const files = listFiles(src, dirs);
  for (const rel of dirs) fs.mkdirSync(path.join(dest, rel), { recursive: true });
  for (const rel of files) {
    const from = path.join(src, rel);
    const to = path.join(dest, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    if (fs.lstatSync(from).isSymbolicLink()) fs.symlinkSync(fs.readlinkSync(from), to);
    else fs.copyFileSync(from, to);
  }
}

function fingerprint(file) {
  const st = fs.lstatSync(file);
  const data = st.isSymbolicLink() ? `link:${fs.readlinkSync(file)}` : fs.readFileSync(file);
  return crypto.createHash("sha1").update(data).digest("hex");
}

// Compare the backup with the copy: same file count, same sha1 per file.
// Returns a description of the first mismatch, or null when they match.
function verifyCopy(backup, plansDir) {
  const a = listFiles(backup);
  const b = listFiles(plansDir);
  if (a.length !== b.length) {
    const missing = a.filter((f) => !b.includes(f));
    return `${a.length} files in the backup but ${b.length} in .plans${missing.length ? ` (missing: ${missing.slice(0, 5).join(", ")})` : ""}`;
  }
  for (const rel of a) {
    if (!b.includes(rel)) return `${rel} is missing from .plans`;
    if (fingerprint(path.join(backup, rel)) !== fingerprint(path.join(plansDir, rel))) return `checksum mismatch on ${rel}`;
  }
  return null;
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

// Convert an existing local .plans onto an orphan plans branch, loss-proof:
// move it aside to .plans.bak-<ts>, create the worktree, copy the contents
// back (minus .git / .DS_Store / the lock), verify file count and sha1 of
// every file, and only then commit, push, and delete the backup. Any failure
// after the move keeps the backup and says where it is. opts as initBranch,
// plus _afterCopy(plansDir) (tests). Returns the initBranch result shape.
function migrate(root, opts) {
  const o = opts || {};
  const { branch, remote } = resolveNames(root, o);
  const result = setupResult(branch, remote);
  let backup = null;
  try {
    if (refuseNonGit(root, result)) return result;
    const plansDir = path.join(root, ".plans");
    const mode = detectMode(root);
    if (mode === "branch") {
      result.error = ".plans is already on a plans branch (branch mode)";
      return result;
    }
    if (!fs.existsSync(path.join(plansDir, "config.json"))) {
      result.error = "no .plans/config.json to migrate — use init-branch for a fresh plans branch";
      return result;
    }
    if (git(root, ["ls-files", "--", ".plans"]).stdout !== "") {
      result.error =
        ".plans is tracked in the code repo (inline mode) — untrack it first (git rm -r --cached .plans, add the slashless `.plans` line to .gitignore, commit), then migrate";
      return result;
    }
    if (branchTaken(root, branch, remote, result)) return result;
    addInfoExclude(root);

    backup = path.join(root, `.plans.bak-${timestamp()}`);
    for (let n = 1; fs.existsSync(backup); n++) backup = backup.replace(/(-\d+)?$/, `-${n}`);
    fs.renameSync(plansDir, backup);

    if (!createWorktree(root, plansDir, branch, o, result)) {
      if (clearEmptyPlans(plansDir)) fs.renameSync(backup, plansDir);
      else result.error += ` — original kept at ${backup}`;
      return result;
    }
    copyTree(backup, plansDir);
    if (typeof o._afterCopy === "function") o._afterCopy(plansDir);

    const mismatch = verifyCopy(backup, plansDir);
    if (mismatch) {
      result.error = `migration verification failed: ${mismatch} — backup kept at ${backup}; nothing was committed`;
      return result;
    }
    finalizeBranch(root, plansDir, "plan: migrate .plans to the plans branch", o, result);
    if (result.error) {
      result.error += ` — backup kept at ${backup}`;
      return result;
    }
    fs.rmSync(backup, { recursive: true, force: true });
    result.ok = true;
  } catch (err) {
    result.error = `migrate failed unexpectedly: ${err && err.message}${backup && fs.existsSync(backup) ? ` — backup kept at ${backup}` : ""}`;
  }
  return result;
}

// Attach this clone to an existing <remote>/<branch> plans branch: fetch it,
// check it out as the .plans worktree with upstream set, configure the merge
// driver, and make sure the code repo ignores `.plans` (slashless .gitignore
// line + info/exclude). opts: { branch, remote }. Returns the initBranch
// result shape, with gitignoreChanged when .gitignore was edited (the caller
// commits it).
function join(root, opts) {
  const o = opts || {};
  const result = setupResult(o.branch || SYNC_DEFAULTS.branch, o.remote || SYNC_DEFAULTS.remote);
  const { branch, remote } = result;
  try {
    if (refuseNonGit(root, result)) return result;
    const plansDir = path.join(root, ".plans");
    if (detectMode(root) === "branch") {
      result.error = ".plans is already on a plans branch (branch mode)";
      return result;
    }
    if (fs.existsSync(plansDir) && fs.readdirSync(plansDir).length > 0) {
      result.error = ".plans already exists — join attaches a project that has no .plans yet";
      return result;
    }
    if (!git(root, ["remote", "get-url", remote]).ok) {
      result.error = `no "${remote}" remote — join needs the remote that holds the plans branch`;
      return result;
    }
    const fetch = git(root, ["fetch", "-q", remote, `${branch}:${branch}`]);
    if (!fetch.ok) {
      result.error = `could not fetch ${remote}/${branch} — does the remote have a plans branch?${fetch.stderr ? ` (${fetch.stderr.split("\n")[0]})` : ""}`;
      return result;
    }
    addInfoExclude(root);
    clearEmptyPlans(plansDir);
    const wt = git(root, ["worktree", "add", "-q", plansDir, branch]);
    if (!wt.ok) {
      result.error = `git worktree add failed${wt.stderr ? `: ${wt.stderr.split("\n")[0]}` : ""}`;
      return result;
    }
    if (!git(plansDir, ["branch", "-q", `--set-upstream-to=${remote}/${branch}`]).ok) {
      result.warnings.push(`could not set ${remote}/${branch} as the upstream of ${branch} — sync will be a no-op until it is set`);
    }
    ensureMergeDriver(plansDir);
    result.gitignoreChanged = ensureSlashlessIgnore(root);
    if (readConfig(root).git_commits !== true) {
      result.warnings.push('the joined plans have git_commits not true in .plans/config.json — set "git_commits": true or nothing will sync');
    }
    result.ok = true;
  } catch (err) {
    result.error = `join failed unexpectedly: ${err && err.message}`;
  }
  return result;
}

// --- bootstrap (remote sessions) and the Base guard ---

// The project root for bootstrap: the usual discovery walk, falling back to
// the git toplevel of startDir — a fresh clone has no .plans/config.json yet,
// so discovery alone can't find it. Returns null outside any git repo.
function bootstrapRoot(startDir) {
  const found = findProjectRoot(startDir);
  if (found) return found;
  const top = git(startDir, ["rev-parse", "--show-toplevel"]);
  return top.ok && top.stdout ? realpath(top.stdout) : null;
}

// Does <remote> have <branch>? "yes" | "no" | "unreachable".
function remoteHasBranch(root, remote, branch) {
  const r = git(root, ["ls-remote", "--exit-code", "--heads", remote, `refs/heads/${branch}`]);
  if (r.ok) return "yes";
  return r.status === 2 ? "no" : "unreachable";
}

// Bring .plans into this clone, idempotently — meant for a SessionStart hook
// in remote sessions. Resolves the root (see bootstrapRoot), prunes stale
// worktree records, then:
//   - .plans in branch mode       → sync (action "synced");
//   - .plans missing or empty     → join <remote>/<branch> (action "joined");
//     no remote / no plans branch → nothing to do (action "skipped", quiet);
//   - any other .plans (local or inline plans, a stray file) → refuse
//     (action "refused") — converting is /plan-init branch's job.
// opts: { branch, remote }. Returns { ok, action, root, branch, remote,
// reason (why it skipped), renumbered, gitignoreChanged, messages, warnings,
// error } and never throws.
function bootstrap(startDir, opts) {
  const o = opts || {};
  const result = {
    ok: false,
    action: "skipped",
    root: null,
    branch: null,
    remote: null,
    reason: null,
    renumbered: [],
    gitignoreChanged: false,
    messages: [],
    warnings: [],
    error: null,
  };
  try {
    const root = bootstrapRoot(startDir || process.cwd());
    if (!root || !git(root, ["rev-parse", "--show-toplevel"]).ok) {
      result.ok = true;
      result.reason = "not inside a git repo";
      return result;
    }
    result.root = root;
    ({ branch: result.branch, remote: result.remote } = resolveNames(root, o));
    git(root, ["worktree", "prune"]);

    const plansDir = path.join(root, ".plans");
    if (detectMode(root) === "branch") {
      const res = sync(root);
      result.renumbered = res.renumbered;
      result.warnings.push(...res.warnings);
      if (res.synced) {
        // Pull succeeded (or a clean fast-forward) — a real sync.
        result.action = "synced";
      } else if (res.warnings.length > 0) {
        // Pull failed or a rebase was aborted (offline / unreachable remote):
        // `sync` pushed a warning but set synced=false. Never claim "synced".
        result.action = "skipped";
        result.reason = `${result.remote} unreachable`;
      } else {
        // No upstream configured — a legitimate quiet no-op, no warning.
        // Keep today's behavior (reported as synced).
        result.action = "synced";
      }
      result.ok = true;
      return result;
    }

    let present = false;
    try {
      const st = fs.lstatSync(plansDir);
      present = !st.isDirectory() || fs.readdirSync(plansDir).length > 0;
    } catch (_) {
      present = false;
    }
    if (present) {
      result.action = "refused";
      result.error = "local .plans/ exists, run /plan-init branch to convert";
      return result;
    }

    if (!git(root, ["remote", "get-url", result.remote]).ok) {
      result.ok = true;
      result.reason = `no "${result.remote}" remote, so no plans branch to attach`;
      return result;
    }
    const has = remoteHasBranch(root, result.remote, result.branch);
    if (has === "no") {
      result.ok = true;
      result.reason = `no plans branch on ${result.remote}/${result.branch}`;
      return result;
    }
    if (has === "unreachable") {
      result.ok = true;
      result.warnings.push(`could not reach ${result.remote} to look for the ${result.branch} branch (offline?)`);
      result.reason = `${result.remote} unreachable`;
      return result;
    }

    const res = join(root, { branch: result.branch, remote: result.remote });
    result.warnings.push(...res.warnings);
    result.gitignoreChanged = res.gitignoreChanged;
    if (!res.ok) {
      result.error = res.error;
      return result;
    }
    result.action = "joined";
    result.ok = true;
  } catch (err) {
    result.error = `bootstrap failed unexpectedly: ${err && err.message}`;
  }
  return result;
}

// True when `name` is the plans branch, which must never be a task's
// **Base:** (or any merge target / execution branch). The plans branch is the
// configured sync.branch (default "plans") and, in branch mode, whatever the
// .plans worktree actually has checked out. `refs/heads/` and `<remote>/`
// prefixes are accepted. root may be null (defaults only). Never throws.
function isPlansBranch(name, root) {
  try {
    if (typeof name !== "string" || !name.trim()) return false;
    const { branch, remote } = root ? readSyncConfig(root) : SYNC_DEFAULTS;
    const candidates = new Set([branch]);
    if (root && detectMode(root) === "branch") {
      const current = git(path.join(root, ".plans"), ["branch", "--show-current"]).stdout;
      if (current) candidates.add(current);
    }
    let n = name.trim().replace(/^refs\/heads\//, "");
    if (n.startsWith("refs/remotes/")) n = n.slice("refs/remotes/".length);
    if (n.startsWith(`${remote}/`) && !candidates.has(n)) n = n.slice(remote.length + 1);
    return candidates.has(n);
  } catch (_) {
    return false;
  }
}

module.exports = {
  detectMode,
  readSyncConfig,
  commit,
  sync,
  renumber,
  initBranch,
  migrate,
  join,
  bootstrap,
  isPlansBranch,
};
