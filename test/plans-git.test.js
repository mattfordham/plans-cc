const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, spawn } = require("node:child_process");

// Every test builds throwaway git repos under os.tmpdir() and runs REAL git
// against them. Safety rules (a past harness bug sent scratch commits into the
// real repo):
//   - every git call goes through run(), which takes an ABSOLUTE cwd and
//     refuses anything outside the per-test temp dir — never rely on `cd`;
//   - git is isolated from the user's config (GIT_CONFIG_GLOBAL=/dev/null,
//     GIT_CONFIG_NOSYSTEM=1) and gets a fixed identity;
//   - GIT_CEILING_DIRECTORIES stops repo discovery at the temp base, so a
//     "not a git repo" fixture can never find an enclosing repo.
// These are set on process.env so lib/plans-git.js inherits them too.
const TMP_BASE = fs.realpathSync(os.tmpdir());
Object.assign(process.env, {
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CEILING_DIRECTORIES: TMP_BASE,
  GIT_TERMINAL_PROMPT: "0",
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.com",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.com",
});

const plansGit = require("../lib/plans-git");

let tmpRoot;

// Run git with an absolute cwd confined to the current test's temp dir.
function run(cwd, ...args) {
  assert.ok(path.isAbsolute(cwd), `git cwd must be absolute: ${cwd}`);
  assert.ok(cwd.startsWith(tmpRoot), `git cwd escaped the temp dir: ${cwd}`);
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function gitOk(cwd, ...args) {
  const r = run(cwd, ...args);
  assert.strictEqual(r.status, 0, `git ${args.join(" ")} failed: ${r.err}`);
  return r.out;
}

function writeConfig(plansDir, config) {
  fs.mkdirSync(plansDir, { recursive: true });
  fs.writeFileSync(path.join(plansDir, "config.json"), JSON.stringify(config, null, 2) + "\n");
}

// A code repo with one commit. `ignorePlans` writes the slashless `.plans`
// ignore line, as plan-init does.
function makeRepo(dir, { ignorePlans = false } = {}) {
  fs.mkdirSync(dir, { recursive: true });
  gitOk(dir, "init", "-q", "-b", "main");
  fs.writeFileSync(path.join(dir, "README.md"), "code\n");
  if (ignorePlans) fs.writeFileSync(path.join(dir, ".gitignore"), ".plans\n");
  gitOk(dir, "add", "-A");
  gitOk(dir, "commit", "-q", "-m", "init");
  return dir;
}

// Branch mode: .plans is a worktree of an orphan `plans` branch, ignored by
// the code repo.
function makeBranchModeProject(config = { git_commits: true }) {
  const root = makeRepo(path.join(tmpRoot, "proj"), { ignorePlans: true });
  gitOk(root, "worktree", "add", "-q", "--orphan", "-b", "plans", path.join(root, ".plans"));
  writeConfig(path.join(root, ".plans"), config);
  return root;
}

function headSubject(cwd) {
  return run(cwd, "log", "-1", "--format=%s").out;
}

function commitCount(cwd) {
  const r = run(cwd, "rev-list", "--count", "HEAD");
  return r.status === 0 ? Number(r.out) : 0;
}

beforeEach(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(TMP_BASE, "plans-git-")));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// --- detectMode ---

test("detectMode: none when the root is not a git repo", () => {
  const root = path.join(tmpRoot, "proj");
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  assert.strictEqual(plansGit.detectMode(root), "none");
});

test("detectMode: local when .plans is gitignored", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"), { ignorePlans: true });
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  assert.strictEqual(plansGit.detectMode(root), "local");
});

test("detectMode: inline when .plans is tracked in the code repo", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  assert.strictEqual(plansGit.detectMode(root), "inline");
});

test("detectMode: branch when .plans is its own worktree", () => {
  const root = makeBranchModeProject();
  assert.strictEqual(plansGit.detectMode(root), "branch");
});

test("detectMode: never throws on a nonexistent root", () => {
  assert.strictEqual(plansGit.detectMode(path.join(tmpRoot, "ghost")), "none");
});

// --- readSyncConfig ---

test("readSyncConfig: defaults when the sync key is absent", () => {
  const root = path.join(tmpRoot, "proj");
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  assert.deepStrictEqual(plansGit.readSyncConfig(root), {
    remote: "origin",
    branch: "plans",
    auto_push: true,
  });
});

test("readSyncConfig: partial and malformed values fall back per key", () => {
  const root = path.join(tmpRoot, "proj");
  writeConfig(path.join(root, ".plans"), { sync: { branch: "notes", auto_push: "yes", remote: 7 } });
  assert.deepStrictEqual(plansGit.readSyncConfig(root), {
    remote: "origin",
    branch: "notes",
    auto_push: true,
  });
  fs.writeFileSync(path.join(root, ".plans", "config.json"), "{not json");
  assert.deepStrictEqual(plansGit.readSyncConfig(root), {
    remote: "origin",
    branch: "plans",
    auto_push: true,
  });
});

// --- commit: non-branch modes reproduce today's skill block ---

test("commit: local mode never commits", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"), { ignorePlans: true });
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  const before = commitCount(root);
  const res = plansGit.commit(root, "plan: capture #001 - Test");
  assert.strictEqual(res.mode, "local");
  assert.strictEqual(res.committed, false);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(commitCount(root), before);
});

test("commit: none mode is a silent no-op", () => {
  const root = path.join(tmpRoot, "proj");
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  const res = plansGit.commit(root, "msg");
  assert.deepStrictEqual(res, { mode: "none", committed: false, pushed: false, warnings: [] });
});

test("commit: git_commits:false skips in inline mode", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  writeConfig(path.join(root, ".plans"), { git_commits: false });
  const before = commitCount(root);
  const res = plansGit.commit(root, "msg");
  assert.strictEqual(res.committed, false);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(commitCount(root), before);
});

test("commit: inline uses git add .plans/ + bare commit, sweeping already-staged files", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  // Something else already staged rides along, exactly as today's block does.
  fs.writeFileSync(path.join(root, "staged.txt"), "x\n");
  gitOk(root, "add", "staged.txt");
  // An unstaged, untracked file outside .plans must NOT be swept in.
  fs.writeFileSync(path.join(root, "loose.txt"), "y\n");

  const res = plansGit.commit(root, "plan: capture #001 - Test");
  assert.strictEqual(res.mode, "inline");
  assert.strictEqual(res.committed, true);
  assert.strictEqual(headSubject(root), "plan: capture #001 - Test");
  const files = gitOk(root, "show", "--name-only", "--format=", "HEAD").split("\n").sort();
  assert.deepStrictEqual(files, [".plans/config.json", "staged.txt"]);
  assert.match(gitOk(root, "status", "--porcelain"), /\?\? loose\.txt/);
});

test("commit: inline with a clean .plans is a no-op", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  gitOk(root, "add", ".plans/");
  gitOk(root, "commit", "-q", "-m", "seed");
  const before = commitCount(root);
  const res = plansGit.commit(root, "msg");
  assert.strictEqual(res.committed, false);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(commitCount(root), before);
});

test("commit: inline hook failure is a warning, not a throw", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  const hook = path.join(root, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  fs.chmodSync(hook, 0o755);
  const res = plansGit.commit(root, "msg");
  assert.strictEqual(res.committed, false);
  assert.strictEqual(res.warnings.length, 1);
});

// --- commit: branch mode ---

test("commit: branch mode lands on the orphan plans branch and leaves the code repo clean", () => {
  const root = makeBranchModeProject();
  const codeHead = gitOk(root, "rev-parse", "HEAD");
  const res = plansGit.commit(root, "plan: capture #001 - Test");
  const plansDir = path.join(root, ".plans");

  assert.strictEqual(res.mode, "branch");
  assert.strictEqual(res.committed, true);
  assert.strictEqual(gitOk(plansDir, "rev-parse", "--abbrev-ref", "HEAD"), "plans");
  assert.strictEqual(headSubject(plansDir), "plan: capture #001 - Test");
  // Orphan: the plans branch shares no history with the code branch.
  assert.strictEqual(commitCount(plansDir), 1);
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");
  // The code repo is untouched.
  assert.strictEqual(gitOk(root, "rev-parse", "HEAD"), codeHead);
  assert.strictEqual(gitOk(root, "status", "--porcelain"), "");
  // The lock is released.
  assert.ok(!fs.existsSync(path.join(plansDir, ".git-lock")));
});

test("commit: branch mode with a clean worktree is a no-op", () => {
  const root = makeBranchModeProject();
  plansGit.commit(root, "first");
  const plansDir = path.join(root, ".plans");
  const before = commitCount(plansDir);
  const res = plansGit.commit(root, "second");
  assert.strictEqual(res.committed, false);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(commitCount(plansDir), before);
});

test("commit: branch mode bypasses a failing pre-commit hook", () => {
  const root = makeBranchModeProject();
  // Hooks live in the common git dir, so they apply to the .plans worktree too.
  const hook = path.join(root, ".git", "hooks", "pre-commit");
  fs.writeFileSync(hook, "#!/bin/sh\nexit 1\n");
  fs.chmodSync(hook, 0o755);
  const res = plansGit.commit(root, "msg");
  assert.strictEqual(res.committed, true);
  assert.deepStrictEqual(res.warnings, []);
});

test("commit: branch mode with git_commits:false skips and warns exactly once", () => {
  const root = makeBranchModeProject({ git_commits: false });
  const plansDir = path.join(root, ".plans");
  const first = plansGit.commit(root, "msg");
  assert.strictEqual(first.committed, false);
  assert.strictEqual(first.warnings.length, 1);
  assert.match(first.warnings[0], /git_commits/);
  const second = plansGit.commit(root, "msg");
  assert.deepStrictEqual(second.warnings, []);
  assert.strictEqual(commitCount(plansDir), 0);
});

test("commit: a push to an unreachable remote is non-fatal (sync push)", () => {
  const root = makeBranchModeProject();
  const plansDir = path.join(root, ".plans");
  gitOk(plansDir, "remote", "add", "origin", path.join(tmpRoot, "no-such-remote.git"));
  const res = plansGit.commit(root, "msg", { syncPush: true });
  assert.strictEqual(res.committed, true);
  assert.strictEqual(res.pushed, false);
  assert.strictEqual(res.warnings.length, 1);
  assert.match(res.warnings[0], /push/i);
});

test("commit: background push returns immediately and never throws", () => {
  const root = makeBranchModeProject();
  const plansDir = path.join(root, ".plans");
  gitOk(plansDir, "remote", "add", "origin", path.join(tmpRoot, "no-such-remote.git"));
  const res = plansGit.commit(root, "msg");
  assert.strictEqual(res.committed, true);
  assert.strictEqual(res.pushed, false);
  assert.deepStrictEqual(res.warnings, []);
});

test("commit: synchronous push to a reachable remote succeeds and sets upstream", () => {
  const root = makeBranchModeProject();
  const plansDir = path.join(root, ".plans");
  const bare = path.join(tmpRoot, "remote.git");
  gitOk(tmpRoot, "init", "-q", "--bare", bare);
  gitOk(plansDir, "remote", "add", "origin", bare);
  const res = plansGit.commit(root, "msg", { syncPush: true });
  assert.strictEqual(res.pushed, true);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(gitOk(bare, "log", "-1", "--format=%s", "plans"), "msg");
  assert.strictEqual(gitOk(plansDir, "rev-parse", "--abbrev-ref", "@{u}"), "origin/plans");
});

// --- lock ---

test("commit: a held lock is waited on until released", () => {
  const root = makeBranchModeProject();
  const lockDir = path.join(root, ".plans", ".git-lock");
  fs.mkdirSync(lockDir);
  // A separate process releases the lock while commit() is blocked waiting.
  // The retry ceiling is generous (15s) because process start-up can stall on
  // a loaded machine; commit() returns as soon as the lock is released.
  const releaser = spawn(
    process.execPath,
    ["-e", `setTimeout(() => require("fs").rmdirSync(${JSON.stringify(lockDir)}), 250)`],
    { stdio: "ignore" }
  );
  const res = plansGit.commit(root, "msg", { lockRetries: 300, lockDelayMs: 50 });
  releaser.kill();
  assert.strictEqual(res.committed, true);
  assert.deepStrictEqual(res.warnings, []);
});

test("commit: a fresh lock that is never released gives up with a warning", () => {
  const root = makeBranchModeProject();
  const lockDir = path.join(root, ".plans", ".git-lock");
  fs.mkdirSync(lockDir);
  const res = plansGit.commit(root, "msg", { lockRetries: 3, lockDelayMs: 10 });
  assert.strictEqual(res.committed, false);
  assert.strictEqual(res.warnings.length, 1);
  assert.match(res.warnings[0], /lock/i);
  // Someone else's lock is never removed.
  assert.ok(fs.existsSync(lockDir));
});

test("commit: a stale lock is broken", () => {
  const root = makeBranchModeProject();
  const lockDir = path.join(root, ".plans", ".git-lock");
  fs.mkdirSync(lockDir);
  const old = new Date(Date.now() - 5 * 60 * 1000);
  fs.utimesSync(lockDir, old, old);
  const res = plansGit.commit(root, "msg", { lockRetries: 3, lockDelayMs: 10 });
  assert.strictEqual(res.committed, true);
  assert.ok(!fs.existsSync(lockDir));
});

// --- sync ---

test("sync: non-branch modes are a no-op", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  const res = plansGit.sync(root);
  assert.strictEqual(res.mode, "inline");
  assert.strictEqual(res.synced, false);
  assert.deepStrictEqual(res.warnings, []);
});

test("sync: no upstream is a quiet no-op that still configures merge.ours", () => {
  const root = makeBranchModeProject();
  plansGit.commit(root, "first");
  const res = plansGit.sync(root);
  assert.strictEqual(res.mode, "branch");
  assert.strictEqual(res.synced, false);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(gitOk(path.join(root, ".plans"), "config", "merge.ours.driver"), "true");
});

test("sync: pulls remote commits into the .plans worktree", () => {
  const root = makeBranchModeProject();
  const plansDir = path.join(root, ".plans");
  const bare = path.join(tmpRoot, "remote.git");
  gitOk(tmpRoot, "init", "-q", "--bare", bare);
  gitOk(plansDir, "remote", "add", "origin", bare);
  plansGit.commit(root, "first", { syncPush: true });

  // Another machine pushes a new task to the plans branch.
  const other = path.join(tmpRoot, "other");
  gitOk(tmpRoot, "clone", "-q", "-b", "plans", bare, other);
  fs.writeFileSync(path.join(other, "remote-task.md"), "# remote\n");
  gitOk(other, "add", "-A");
  gitOk(other, "commit", "-q", "-m", "remote capture");
  gitOk(other, "push", "-q", "origin", "plans");

  const res = plansGit.sync(root);
  assert.strictEqual(res.synced, true);
  assert.deepStrictEqual(res.warnings, []);
  assert.ok(fs.existsSync(path.join(plansDir, "remote-task.md")));
  assert.ok(!fs.existsSync(path.join(plansDir, ".git-lock")));
});
