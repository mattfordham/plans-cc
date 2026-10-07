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

// --- init-branch / migrate / join / renumber (two clones of one origin) ---

// A bare `origin` with one `main` commit, plus a clone of it at `name`.
function makeOrigin() {
  const bare = path.join(tmpRoot, "origin.git");
  gitOk(tmpRoot, "init", "-q", "--bare", "-b", "main", bare);
  const seed = makeRepo(path.join(tmpRoot, "seed"));
  gitOk(seed, "remote", "add", "origin", bare);
  gitOk(seed, "push", "-q", "origin", "main");
  return bare;
}

function cloneOf(bare, name) {
  const dir = path.join(tmpRoot, name);
  gitOk(tmpRoot, "clone", "-q", bare, dir);
  return dir;
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function taskFile(id, title, extra = "") {
  return `# ${title}\n\n**ID:** ${id}\n**Created:** 2026-10-01T10:00\n**Type:** feature\n**Status:** pending\n${extra}\n## What\n${title}\n\n## Notes\n- captured\n`;
}

// An existing local-mode .plans/ (what /plan-init writes) in `root`.
function seedLocalPlans(root, config = { git_commits: true, next_id: 43, idea_next_id: 2 }) {
  const plansDir = path.join(root, ".plans");
  writeConfig(plansDir, config);
  write(path.join(plansDir, "PROGRESS.md"), "# Current Progress\n");
  write(path.join(plansDir, "HISTORY.md"), "# Task History\n");
  write(path.join(plansDir, "pending", "042-existing.md"), taskFile("042", "Existing"));
  write(path.join(plansDir, "completed", "001-first.md"), taskFile("001", "First"));
  write(path.join(plansDir, "ideas", "001-big-idea.md"), "# Idea #001: Big idea\n\n## Summary\nbig\n");
  write(path.join(plansDir, "artifacts", "nested", "deep.md"), "deep\n");
  return plansDir;
}

function excludeFile(root) {
  return read(path.join(root, ".git", "info", "exclude"));
}

function idsIn(plansDir) {
  const ids = [];
  for (const dir of ["pending", "completed", "backlog"]) {
    const full = path.join(plansDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const f of fs.readdirSync(full)) {
      const m = f.match(/^(\d{3,})-/);
      if (m) ids.push(m[1]);
    }
  }
  return ids.sort((x, y) => Number(x) - Number(y));
}

test("initBranch: creates an orphan plans worktree with the scaffold and pushes it", () => {
  const bare = makeOrigin();
  const root = cloneOf(bare, "a");
  const res = plansGit.initBranch(root);
  const plansDir = path.join(root, ".plans");

  assert.strictEqual(res.ok, true, res.error);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(plansGit.detectMode(root), "branch");
  assert.strictEqual(gitOk(plansDir, "branch", "--show-current"), "plans");
  assert.match(read(path.join(plansDir, ".gitattributes")), /^HISTORY\.md merge=union$/m);
  assert.match(read(path.join(plansDir, ".gitattributes")), /^PROGRESS\.md merge=ours$/m);
  assert.match(read(path.join(plansDir, ".gitattributes")), /^config\.json merge=ours$/m);
  assert.match(read(path.join(plansDir, ".gitignore")), /^\.DS_Store$/m);
  assert.match(read(path.join(plansDir, ".gitignore")), /^\.git-lock$/m);
  const config = JSON.parse(read(path.join(plansDir, "config.json")));
  assert.strictEqual(config.git_commits, true);
  assert.deepStrictEqual(config.sync, { remote: "origin", branch: "plans", auto_push: true });
  assert.strictEqual(gitOk(plansDir, "config", "merge.ours.driver"), "true");
  // Orphan: no shared history with main.
  assert.notStrictEqual(run(root, "merge-base", "main", "plans").status, 0);
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");
  // The outer repo stays clean and ignores .plans via info/exclude.
  assert.strictEqual(gitOk(root, "status", "--porcelain"), "");
  assert.match(excludeFile(root), /^\.plans$/m);
  // Pushed with upstream.
  assert.strictEqual(res.pushed, true);
  assert.ok(gitOk(bare, "rev-parse", "plans"));
  assert.strictEqual(gitOk(plansDir, "rev-parse", "--abbrev-ref", "@{u}"), "origin/plans");
});

test("initBranch: the commit-tree fallback produces the same orphan setup", () => {
  const bare = makeOrigin();
  const root = cloneOf(bare, "a");
  const res = plansGit.initBranch(root, { forceFallback: true });
  const plansDir = path.join(root, ".plans");

  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.fallback, true);
  assert.strictEqual(plansGit.detectMode(root), "branch");
  assert.strictEqual(gitOk(plansDir, "branch", "--show-current"), "plans");
  assert.notStrictEqual(run(root, "merge-base", "main", "plans").status, 0);
  assert.ok(fs.existsSync(path.join(plansDir, ".gitattributes")));
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");
  assert.strictEqual(gitOk(root, "status", "--porcelain"), "");
});

test("initBranch: no remote is fine — committed locally, nothing pushed", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  const res = plansGit.initBranch(root);
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.pushed, false);
  assert.deepStrictEqual(res.warnings, []);
  assert.strictEqual(commitCount(path.join(root, ".plans")), 1);
});

test("initBranch: an unreachable remote is a warning, not a failure", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  gitOk(root, "remote", "add", "origin", path.join(tmpRoot, "nowhere.git"));
  const res = plansGit.initBranch(root);
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.pushed, false);
  assert.strictEqual(res.warnings.length, 1);
  assert.match(res.warnings[0], /push/i);
});

test("initBranch: refuses a root that is not a git repo", () => {
  const root = path.join(tmpRoot, "parent");
  fs.mkdirSync(root);
  const res = plansGit.initBranch(root);
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /not a git repo/);
  assert.ok(!fs.existsSync(path.join(root, ".plans")));
});

test("initBranch: refuses when .plans already has content (use migrate)", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  seedLocalPlans(root);
  const res = plansGit.initBranch(root);
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /migrate/);
});

test("migrate: moves an existing local .plans onto the plans branch, keeping every file", () => {
  const bare = makeOrigin();
  const root = cloneOf(bare, "a");
  const plansDir = seedLocalPlans(root, { git_commits: false, next_id: 43 });
  write(path.join(plansDir, ".DS_Store"), "junk");
  fs.mkdirSync(path.join(plansDir, "backlog"));
  const before = {};
  for (const rel of ["PROGRESS.md", "HISTORY.md", "pending/042-existing.md", "completed/001-first.md", "ideas/001-big-idea.md", "artifacts/nested/deep.md"]) {
    before[rel] = read(path.join(plansDir, rel));
  }

  const res = plansGit.migrate(root);
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(plansGit.detectMode(root), "branch");
  for (const [rel, content] of Object.entries(before)) {
    assert.strictEqual(read(path.join(plansDir, rel)), content, rel);
  }
  const config = JSON.parse(read(path.join(plansDir, "config.json")));
  assert.strictEqual(config.next_id, 43);
  assert.strictEqual(config.git_commits, true);
  // The flip from false is announced, never silent.
  assert.ok(res.messages.some((m) => /git_commits/.test(m)));
  // Everything is committed on the plans branch; .DS_Store is not carried over.
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");
  assert.ok(!fs.existsSync(path.join(plansDir, ".DS_Store")));
  assert.match(gitOk(plansDir, "ls-files"), /artifacts\/nested\/deep\.md/);
  // Empty directories survive (git can't track them bare).
  assert.match(gitOk(plansDir, "ls-files"), /^backlog\/\.gitkeep$/m);
  // The backup is gone and the outer repo is clean.
  assert.deepStrictEqual(fs.readdirSync(root).filter((f) => f.startsWith(".plans.bak-")), []);
  assert.strictEqual(gitOk(root, "status", "--porcelain"), "");
  assert.match(excludeFile(root), /^\.plans$/m);
  assert.ok(gitOk(bare, "rev-parse", "plans"));
});

test("migrate: keeps the backup when the copied files don't verify", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  seedLocalPlans(root);
  const res = plansGit.migrate(root, {
    _afterCopy: (plansDir) => fs.rmSync(path.join(plansDir, "artifacts", "nested", "deep.md")),
  });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /backup/i);
  const backups = fs.readdirSync(root).filter((f) => f.startsWith(".plans.bak-"));
  assert.strictEqual(backups.length, 1);
  assert.strictEqual(read(path.join(root, backups[0], "artifacts", "nested", "deep.md")), "deep\n");
  assert.ok(res.error.includes(backups[0]));
});

test("migrate: keeps the backup when a checksum differs", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  seedLocalPlans(root);
  const res = plansGit.migrate(root, {
    _afterCopy: (plansDir) => fs.writeFileSync(path.join(plansDir, "HISTORY.md"), "tampered\n"),
  });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /HISTORY\.md/);
  assert.strictEqual(fs.readdirSync(root).filter((f) => f.startsWith(".plans.bak-")).length, 1);
});

test("migrate: refuses inline mode (.plans tracked in the code repo)", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  seedLocalPlans(root);
  gitOk(root, "add", ".plans");
  gitOk(root, "commit", "-q", "-m", "track plans");
  const res = plansGit.migrate(root);
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /tracked/);
  assert.strictEqual(plansGit.detectMode(root), "inline");
});

test("join: a second clone attaches to origin/plans and sets the merge driver", () => {
  const bare = makeOrigin();
  const a = cloneOf(bare, "a");
  seedLocalPlans(a);
  fs.mkdirSync(path.join(a, ".plans", "backlog"));
  assert.strictEqual(plansGit.migrate(a).ok, true);

  const b = cloneOf(bare, "b");
  const res = plansGit.join(b);
  const plansDir = path.join(b, ".plans");
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(plansGit.detectMode(b), "branch");
  assert.strictEqual(gitOk(plansDir, "branch", "--show-current"), "plans");
  assert.ok(fs.existsSync(path.join(plansDir, "pending", "042-existing.md")));
  assert.ok(fs.statSync(path.join(plansDir, "backlog")).isDirectory());
  assert.strictEqual(gitOk(plansDir, "config", "merge.ours.driver"), "true");
  assert.strictEqual(gitOk(plansDir, "rev-parse", "--abbrev-ref", "@{u}"), "origin/plans");
  assert.match(read(path.join(b, ".gitignore")), /^\.plans$/m);
  assert.strictEqual(res.gitignoreChanged, true);
  assert.match(excludeFile(b), /^\.plans$/m);
});

test("join: rewrites a slashed .plans/ ignore line to the slashless form", () => {
  const bare = makeOrigin();
  const a = cloneOf(bare, "a");
  assert.strictEqual(plansGit.initBranch(a).ok, true);
  const b = cloneOf(bare, "b");
  fs.writeFileSync(path.join(b, ".gitignore"), "node_modules\n.plans/\n");
  assert.strictEqual(plansGit.join(b).ok, true);
  assert.strictEqual(read(path.join(b, ".gitignore")), "node_modules\n.plans\n");
});

test("join: fails cleanly when the remote has no plans branch", () => {
  const bare = makeOrigin();
  const b = cloneOf(bare, "b");
  const res = plansGit.join(b);
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /plans/);
  assert.ok(!fs.existsSync(path.join(b, ".plans")));
});

// Two machines share origin/plans; both capture #043 while offline.
function twoClones() {
  const bare = makeOrigin();
  const a = cloneOf(bare, "a");
  seedLocalPlans(a);
  assert.strictEqual(plansGit.migrate(a).ok, true);
  const b = cloneOf(bare, "b");
  assert.strictEqual(plansGit.join(b).ok, true);
  return { bare, a, b, pa: path.join(a, ".plans"), pb: path.join(b, ".plans") };
}

function bumpConfig(plansDir, nextId) {
  const config = JSON.parse(read(path.join(plansDir, "config.json")));
  config.next_id = nextId;
  writeConfig(plansDir, config);
}

test("sync: a two-clone ID collision renumbers the later clone's task", () => {
  const { a, b, pa, pb } = twoClones();

  // Clone A captures #043 offline.
  write(path.join(pa, "pending", "043-alpha.md"), taskFile("043", "Alpha"));
  bumpConfig(pa, 44);
  write(path.join(pa, "PROGRESS.md"), "# Current Progress\n\nA's version\n");
  gitOk(pa, "add", "-A");
  gitOk(pa, "commit", "-q", "-m", "plan: capture #043 - Alpha");

  // Clone B captures its own #043 offline, references it, and starts it.
  write(path.join(pb, "pending", "043-beta.md"), taskFile("043", "Beta"));
  const existing = path.join(pb, "pending", "042-existing.md");
  fs.writeFileSync(existing, read(existing).replace("**Status:** pending\n", "**Status:** pending\n**Blocked by:** #043\n"));
  const idea = path.join(pb, "ideas", "001-big-idea.md");
  fs.appendFileSync(idea, "\n## Expanded Into\n- Task #043: Beta\n");
  write(path.join(pb, "state", "043-state.md"), "# Execution State: Task #043\n\n**Started:** 2026-10-05T10:00\n");
  bumpConfig(pb, 44);
  write(path.join(pb, "PROGRESS.md"), "# Current Progress\n\nB's version\n");
  gitOk(pb, "add", "-A");
  gitOk(pb, "commit", "-q", "-m", "plan: capture #043 - Beta");
  gitOk(b, "branch", "feature/043-beta");

  // A reaches the remote first.
  const syncA = plansGit.sync(a);
  assert.deepStrictEqual(syncA.warnings, []);
  assert.deepStrictEqual(syncA.renumbered, []);
  gitOk(pa, "push", "-q");

  // B syncs: rebases onto A, finds the duplicate, and moves its own copy.
  const syncB = plansGit.sync(b);
  assert.strictEqual(syncB.synced, true);
  assert.deepStrictEqual(syncB.renumbered, [{ from: "043", to: "044" }]);
  assert.strictEqual(syncB.warnings.length, 1, syncB.warnings.join("\n"));
  assert.match(syncB.warnings[0], /feature\/043-beta/);

  assert.deepStrictEqual(idsIn(pb), ["001", "042", "043", "044"]);
  assert.ok(fs.existsSync(path.join(pb, "pending", "043-alpha.md")));
  const moved = read(path.join(pb, "pending", "044-beta.md"));
  assert.match(moved, /^\*\*ID:\*\* 044$/m);
  assert.match(moved, /Renumbered from #043 after sync collision/);
  assert.match(read(existing), /^\*\*Blocked by:\*\* #044$/m);
  assert.match(read(idea), /^- Task #044: Beta$/m);
  assert.ok(fs.existsSync(path.join(pb, "state", "044-state.md")));
  assert.ok(!fs.existsSync(path.join(pb, "state", "043-state.md")));
  assert.match(read(path.join(pb, "state", "044-state.md")), /Task #044/);
  // A's task is untouched.
  assert.match(read(path.join(pb, "pending", "043-alpha.md")), /^\*\*ID:\*\* 043$/m);
  // Counters rebuilt from the files, PROGRESS.md rebuilt, everything committed.
  assert.strictEqual(JSON.parse(read(path.join(pb, "config.json"))).next_id, 45);
  assert.match(read(path.join(pb, "PROGRESS.md")), /^- Pending: 3$/m);
  assert.strictEqual(gitOk(pb, "status", "--porcelain"), "");
  // The renumber was pushed, so A picks it up on its next sync without renumbering.
  const again = plansGit.sync(a);
  assert.deepStrictEqual(again.renumbered, []);
  assert.deepStrictEqual(idsIn(pa), ["001", "042", "043", "044"]);
  assert.strictEqual(JSON.parse(read(path.join(pa, "config.json"))).next_id, 45);
  // The code branches were never touched.
  assert.strictEqual(gitOk(a, "status", "--porcelain"), "");
  // (join's slashless .gitignore line is left for the caller to commit.)
  assert.strictEqual(gitOk(b, "status", "--porcelain"), "?? .gitignore");
});

test("sync: a 4-digit (>=1000) ID collision renumbers and rewrites references un-truncated", () => {
  const { a, b, pa, pb } = twoClones();

  // Clone A captures #1000 offline.
  write(path.join(pa, "pending", "1000-alpha.md"), taskFile("1000", "Alpha"));
  bumpConfig(pa, 1001);
  gitOk(pa, "add", "-A");
  gitOk(pa, "commit", "-q", "-m", "plan: capture #1000 - Alpha");

  // Clone B captures its own #1000 offline and references it from a blocked-by
  // and an idea's Expanded Into.
  write(path.join(pb, "pending", "1000-beta.md"), taskFile("1000", "Beta"));
  const existing = path.join(pb, "pending", "042-existing.md");
  fs.writeFileSync(existing, read(existing).replace("**Status:** pending\n", "**Status:** pending\n**Blocked by:** #1000\n"));
  const idea = path.join(pb, "ideas", "001-big-idea.md");
  fs.appendFileSync(idea, "\n## Expanded Into\n- Task #1000: Beta\n");
  bumpConfig(pb, 1001);
  gitOk(pb, "add", "-A");
  gitOk(pb, "commit", "-q", "-m", "plan: capture #1000 - Beta");

  // A reaches the remote first.
  const syncA = plansGit.sync(a);
  assert.deepStrictEqual(syncA.renumbered, []);
  gitOk(pa, "push", "-q");

  // B syncs: the later #1000 moves to #1001 (never truncated to #100 / #101).
  const syncB = plansGit.sync(b);
  assert.strictEqual(syncB.synced, true);
  assert.deepStrictEqual(syncB.renumbered, [{ from: "1000", to: "1001" }]);

  assert.ok(fs.existsSync(path.join(pb, "pending", "1000-alpha.md")));
  const moved = read(path.join(pb, "pending", "1001-beta.md"));
  assert.match(moved, /^\*\*ID:\*\* 1001$/m);
  assert.match(moved, /Renumbered from #1000 after sync collision/);
  // References were renumbered to the 4-digit id, not truncated.
  assert.match(read(existing), /^\*\*Blocked by:\*\* #1001$/m);
  assert.match(read(idea), /^- Task #1001: Beta$/m);
  // A's task is untouched.
  assert.match(read(path.join(pb, "pending", "1000-alpha.md")), /^\*\*ID:\*\* 1000$/m);
});

test("sync: collisions spanning 999 and 1000 renumber in numeric id order", () => {
  const { a, b, pa, pb } = twoClones();

  for (const [pd, who] of [[pa, "A"], [pb, "B"]]) {
    write(path.join(pd, "pending", `999-${who.toLowerCase()}-low.md`), taskFile("999", `${who} low`));
    write(path.join(pd, "pending", `1000-${who.toLowerCase()}-high.md`), taskFile("1000", `${who} high`));
    bumpConfig(pd, 1001);
    gitOk(pd, "add", "-A");
    gitOk(pd, "commit", "-q", "-m", `plan: capture #999 and #1000 on ${who}`);
  }

  const syncA = plansGit.sync(a);
  assert.deepStrictEqual(syncA.renumbered, []);
  gitOk(pa, "push", "-q");

  // #999 is renumbered before #1000 — a lexical sort would put "1000" first.
  const syncB = plansGit.sync(b);
  assert.strictEqual(syncB.synced, true);
  assert.deepStrictEqual(syncB.renumbered, [
    { from: "999", to: "1001" },
    { from: "1000", to: "1002" },
  ]);
  assert.ok(fs.existsSync(path.join(pb, "pending", "1001-b-low.md")));
  assert.ok(fs.existsSync(path.join(pb, "pending", "1002-b-high.md")));
  assert.deepStrictEqual(idsIn(pb), ["001", "042", "999", "1000", "1001", "1002"]);
});

test("sync: an add/add conflict at the same path aborts the rebase with a warning", () => {
  const { a, b, pa, pb } = twoClones();
  write(path.join(pa, "pending", "043-same.md"), taskFile("043", "From A"));
  gitOk(pa, "add", "-A");
  gitOk(pa, "commit", "-q", "-m", "a");
  gitOk(pa, "push", "-q");
  write(path.join(pb, "pending", "043-same.md"), taskFile("043", "From B"));
  gitOk(pb, "add", "-A");
  gitOk(pb, "commit", "-q", "-m", "b");
  const localHead = gitOk(pb, "rev-parse", "HEAD");

  const res = plansGit.sync(b);
  assert.strictEqual(res.synced, false);
  assert.strictEqual(res.warnings.length, 1);
  assert.match(res.warnings[0], /abort/i);
  // No rebase left in progress; the local commit is intact.
  assert.strictEqual(gitOk(pb, "rev-parse", "HEAD"), localHead);
  assert.strictEqual(gitOk(pb, "status", "--porcelain"), "");
  assert.match(read(path.join(pb, "pending", "043-same.md")), /From B/);
  assert.ok(!fs.existsSync(path.join(pb, ".git-lock")));
  void a;
});

test("sync: rebuilds next_id from the files even without a collision", () => {
  const { a, b, pa } = twoClones();
  write(path.join(pa, "backlog", "050-shelved.md"), taskFile("050", "Shelved"));
  gitOk(pa, "add", "-A");
  gitOk(pa, "commit", "-q", "-m", "shelve");
  gitOk(pa, "push", "-q");
  const res = plansGit.sync(b);
  assert.strictEqual(res.synced, true);
  assert.deepStrictEqual(res.renumbered, []);
  assert.strictEqual(JSON.parse(read(path.join(b, ".plans", "config.json"))).next_id, 51);
  assert.strictEqual(gitOk(path.join(b, ".plans"), "status", "--porcelain"), "");
  void a;
});

test("renumber: no upstream means nothing to compare against — a no-op", () => {
  const root = makeBranchModeProject();
  write(path.join(root, ".plans", "pending", "001-x.md"), taskFile("001", "X"));
  write(path.join(root, ".plans", "backlog", "001-y.md"), taskFile("001", "Y"));
  const res = plansGit.renumber(root);
  assert.deepStrictEqual(res.renumbered, []);
});

// --- bootstrap (remote sessions) ---

test("bootstrap: outside any git repo is a quiet skip", () => {
  const dir = path.join(tmpRoot, "plain");
  fs.mkdirSync(dir);
  const res = plansGit.bootstrap(dir);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.action, "skipped");
  assert.match(res.reason, /not inside a git repo/);
  assert.deepStrictEqual(res.warnings, []);
});

test("bootstrap: a repo with no remote is a quiet skip", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"), { ignorePlans: true });
  const res = plansGit.bootstrap(root);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.action, "skipped");
  assert.match(res.reason, /no "origin" remote/);
  assert.ok(!fs.existsSync(path.join(root, ".plans")));
});

test("bootstrap: an unreachable remote is a warning and a skip, never an error", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"), { ignorePlans: true });
  gitOk(root, "remote", "add", "origin", path.join(tmpRoot, "nowhere.git"));
  const res = plansGit.bootstrap(root);
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.action, "skipped");
  assert.strictEqual(res.error, null);
  assert.ok(res.warnings.some((w) => /could not reach origin/.test(w)));
});

test("bootstrap: an attached .plans with an unreachable remote is a warning and a skip, never a false 'synced'", () => {
  const bare = makeOrigin();
  const b = cloneOf(bare, "b");
  assert.strictEqual(plansGit.initBranch(b).ok, true);
  // First run: remote is reachable, so it syncs cleanly.
  assert.strictEqual(plansGit.bootstrap(b).action, "synced");
  // Break the remote so the next pull inside the .plans worktree fails.
  gitOk(
    path.join(b, ".plans"),
    "remote",
    "set-url",
    "origin",
    path.join(tmpRoot, "nonexistent-remote-048.git")
  );
  const res = plansGit.bootstrap(b);
  assert.strictEqual(res.action, "skipped", JSON.stringify(res));
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.error, null);
  assert.match(res.reason, /unreachable/);
  assert.ok(res.warnings.some((w) => /plans sync failed/.test(w)), JSON.stringify(res.warnings));
});

test("bootstrap: run from a subdirectory of a fresh clone resolves the git toplevel", () => {
  const bare = makeOrigin();
  assert.strictEqual(plansGit.initBranch(cloneOf(bare, "a")).ok, true);
  const b = cloneOf(bare, "b");
  const sub = path.join(b, "src", "deep");
  fs.mkdirSync(sub, { recursive: true });
  const res = plansGit.bootstrap(sub);
  assert.strictEqual(res.ok, true, res.error);
  assert.strictEqual(res.action, "joined");
  assert.strictEqual(res.root, b);
  assert.strictEqual(plansGit.detectMode(b), "branch");
});

test("bootstrap: an empty .plans directory is treated as missing and joined", () => {
  const bare = makeOrigin();
  assert.strictEqual(plansGit.initBranch(cloneOf(bare, "a")).ok, true);
  const b = cloneOf(bare, "b");
  fs.mkdirSync(path.join(b, ".plans"));
  const res = plansGit.bootstrap(b);
  assert.strictEqual(res.action, "joined", res.error);
  assert.strictEqual(plansGit.detectMode(b), "branch");
});

test("bootstrap: --branch attaches a non-default plans branch", () => {
  const bare = makeOrigin();
  assert.strictEqual(plansGit.initBranch(cloneOf(bare, "a"), { branch: "notes" }).ok, true);
  const b = cloneOf(bare, "b");
  assert.strictEqual(plansGit.bootstrap(b).action, "skipped");
  const res = plansGit.bootstrap(b, { branch: "notes" });
  assert.strictEqual(res.action, "joined", res.error);
  assert.strictEqual(gitOk(path.join(b, ".plans"), "branch", "--show-current"), "notes");
  // Second run reads sync.branch from the joined config — no flag needed.
  const again = plansGit.bootstrap(b);
  assert.strictEqual(again.action, "synced");
  assert.strictEqual(again.branch, "notes");
});

test("bootstrap: prunes a stale .plans worktree record and re-attaches", () => {
  const bare = makeOrigin();
  assert.strictEqual(plansGit.initBranch(cloneOf(bare, "a")).ok, true);
  const b = cloneOf(bare, "b");
  assert.strictEqual(plansGit.bootstrap(b).action, "joined");
  // The .plans directory vanishes (an ephemeral session wiped it) but git
  // still has the worktree registered — without a prune, `worktree add` fails.
  fs.rmSync(path.join(b, ".plans"), { recursive: true, force: true });
  const res = plansGit.bootstrap(b);
  assert.strictEqual(res.action, "joined", res.error);
  assert.strictEqual(plansGit.detectMode(b), "branch");
});

test("bootstrap: refuses inline .plans (tracked in the code repo)", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"));
  writeConfig(path.join(root, ".plans"), { git_commits: true });
  gitOk(root, "add", ".plans");
  gitOk(root, "commit", "-q", "-m", "track plans");
  const res = plansGit.bootstrap(root);
  assert.strictEqual(res.ok, false);
  assert.strictEqual(res.action, "refused");
  assert.match(res.error, /run \/plan-init branch to convert/);
  assert.strictEqual(plansGit.detectMode(root), "inline");
});

// --- isPlansBranch ---

test("isPlansBranch: defaults to `plans`, with ref and remote prefixes", () => {
  assert.strictEqual(plansGit.isPlansBranch("plans", null), true);
  assert.strictEqual(plansGit.isPlansBranch("refs/heads/plans", null), true);
  assert.strictEqual(plansGit.isPlansBranch("origin/plans", null), true);
  assert.strictEqual(plansGit.isPlansBranch(" plans ", null), true);
  assert.strictEqual(plansGit.isPlansBranch("main", null), false);
  assert.strictEqual(plansGit.isPlansBranch("plans/feature", null), false);
  assert.strictEqual(plansGit.isPlansBranch("", null), false);
  assert.strictEqual(plansGit.isPlansBranch(undefined, null), false);
});

test("isPlansBranch: honors sync.branch outside branch mode", () => {
  const root = makeRepo(path.join(tmpRoot, "proj"), { ignorePlans: true });
  writeConfig(path.join(root, ".plans"), { sync: { branch: "notes" } });
  assert.strictEqual(plansGit.isPlansBranch("notes", root), true);
  assert.strictEqual(plansGit.isPlansBranch("plans", root), false);
});

test("isPlansBranch: the branch checked out at .plans counts even if config disagrees", () => {
  const root = makeBranchModeProject({ git_commits: true, sync: { branch: "notes" } });
  assert.strictEqual(plansGit.isPlansBranch("plans", root), true);
  assert.strictEqual(plansGit.isPlansBranch("notes", root), true);
  assert.strictEqual(plansGit.isPlansBranch("main", root), false);
});

// --- syncStatus (read-only, for the dashboard header) ---

// A branch-mode project whose .plans tracks origin/plans in a bare remote.
function makeTrackedBranchProject() {
  const root = makeBranchModeProject();
  const plansDir = path.join(root, ".plans");
  const bare = path.join(tmpRoot, "remote.git");
  gitOk(tmpRoot, "init", "-q", "--bare", bare);
  gitOk(plansDir, "remote", "add", "origin", bare);
  gitOk(plansDir, "add", "-A");
  gitOk(plansDir, "commit", "-q", "-m", "seed");
  gitOk(plansDir, "push", "-q", "-u", "origin", "plans");
  return { root, plansDir, bare };
}

// A raw local plan commit (no push), bypassing commit()'s background push.
function localPlanCommit(plansDir, name) {
  fs.writeFileSync(path.join(plansDir, name), `${name}\n`);
  gitOk(plansDir, "add", "-A");
  gitOk(plansDir, "commit", "-q", "-m", name);
}

test("syncStatus: non-branch modes return only the mode", () => {
  const none = path.join(tmpRoot, "none");
  writeConfig(path.join(none, ".plans"), { git_commits: true });
  assert.deepStrictEqual(plansGit.syncStatus(none), { mode: "none" });

  const local = makeRepo(path.join(tmpRoot, "local"), { ignorePlans: true });
  writeConfig(path.join(local, ".plans"), { git_commits: true });
  assert.deepStrictEqual(plansGit.syncStatus(local), { mode: "local" });

  const inline = makeRepo(path.join(tmpRoot, "inline"));
  writeConfig(path.join(inline, ".plans"), { git_commits: true });
  assert.deepStrictEqual(plansGit.syncStatus(inline), { mode: "inline" });
});

test("syncStatus: never throws on a nonexistent root", () => {
  assert.deepStrictEqual(plansGit.syncStatus(path.join(tmpRoot, "ghost")), { mode: "none" });
  assert.deepStrictEqual(plansGit.syncStatus(undefined), { mode: "none" });
});

test("syncStatus: branch mode with no upstream reports upstream:false and zero counts", () => {
  const root = makeBranchModeProject();
  localPlanCommit(path.join(root, ".plans"), "a.md");
  assert.deepStrictEqual(plansGit.syncStatus(root), {
    mode: "branch",
    branch: "plans",
    remote: "origin",
    upstream: false,
    ahead: 0,
    behind: 0,
    rebaseStuck: false,
  });
});

test("syncStatus: ahead counts unpushed plan commits and drops to 0 after pushing", () => {
  const { root, plansDir } = makeTrackedBranchProject();
  assert.deepStrictEqual(plansGit.syncStatus(root), {
    mode: "branch",
    branch: "plans",
    remote: "origin",
    upstream: true,
    ahead: 0,
    behind: 0,
    rebaseStuck: false,
  });

  localPlanCommit(plansDir, "a.md");
  localPlanCommit(plansDir, "b.md");
  const status = plansGit.syncStatus(root);
  assert.strictEqual(status.ahead, 2);
  assert.strictEqual(status.behind, 0);
  // Read-only: no lock taken, nothing written.
  assert.ok(!fs.existsSync(path.join(plansDir, ".git-lock")));
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");

  gitOk(plansDir, "push", "-q");
  assert.strictEqual(plansGit.syncStatus(root).ahead, 0);
});

test("syncStatus: behind comes from the local tracking ref and never fetches", () => {
  const { root, plansDir, bare } = makeTrackedBranchProject();
  const other = path.join(tmpRoot, "other");
  gitOk(tmpRoot, "clone", "-q", "-b", "plans", bare, other);
  localPlanCommit(other, "remote-1.md");
  gitOk(other, "push", "-q", "origin", "plans");

  // Not fetched yet: the tracking ref has not moved, so nothing is behind.
  assert.strictEqual(plansGit.syncStatus(root).behind, 0);

  gitOk(plansDir, "fetch", "-q");
  assert.strictEqual(plansGit.syncStatus(root).behind, 1);

  // A push after the last fetch is invisible: syncStatus must not fetch.
  localPlanCommit(other, "remote-2.md");
  gitOk(other, "push", "-q", "origin", "plans");
  const trackingBefore = gitOk(plansDir, "rev-parse", "origin/plans");
  const status = plansGit.syncStatus(root);
  assert.strictEqual(status.behind, 1);
  assert.strictEqual(status.ahead, 0);
  assert.strictEqual(gitOk(plansDir, "rev-parse", "origin/plans"), trackingBefore);
});

test("syncStatus: rebaseStuck when rebase-merge or rebase-apply exists", () => {
  const { root, plansDir } = makeTrackedBranchProject();
  for (const name of ["rebase-merge", "rebase-apply"]) {
    const dir = path.resolve(plansDir, gitOk(plansDir, "rev-parse", "--git-path", name));
    fs.mkdirSync(dir, { recursive: true });
    assert.strictEqual(plansGit.syncStatus(root).rebaseStuck, true, name);
    fs.rmSync(dir, { recursive: true, force: true });
    assert.strictEqual(plansGit.syncStatus(root).rebaseStuck, false, name);
  }
});
