const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const { findProjectRoot } = require("../lib/find-root");

// Each test builds a throwaway project tree under os.tmpdir() and tears it
// down after. fs.mkdtempSync returns a resolved absolute path (on macOS it may
// live under a /var -> /private/var symlink, so we fs.realpathSync the root we
// expect to match what findProjectRoot resolves).

let tmpRoot;

function makeConfig(dir) {
  fs.mkdirSync(path.join(dir, ".plans"), { recursive: true });
  fs.writeFileSync(path.join(dir, ".plans", "config.json"), "{}\n");
}

beforeEach(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "plans-root-")));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

test("returns startDir when .plans/config.json is in startDir itself", () => {
  makeConfig(tmpRoot);
  assert.strictEqual(findProjectRoot(tmpRoot), tmpRoot);
});

test("finds the root from a nested subdirectory", () => {
  makeConfig(tmpRoot);
  const nested = path.join(tmpRoot, "api", "src");
  fs.mkdirSync(nested, { recursive: true });
  assert.strictEqual(findProjectRoot(nested), tmpRoot);
});

test("returns null when no .plans/ exists anywhere up the tree", () => {
  const nested = path.join(tmpRoot, "a", "b", "c");
  fs.mkdirSync(nested, { recursive: true });
  assert.strictEqual(findProjectRoot(nested), null);
});

test("first-hit-wins: a nested .plans/ shadows a centralized ancestor", () => {
  makeConfig(tmpRoot);
  const apiRoot = path.join(tmpRoot, "api");
  makeConfig(apiRoot);
  const start = path.join(apiRoot, "src");
  fs.mkdirSync(start, { recursive: true });
  assert.strictEqual(findProjectRoot(start), apiRoot);
});

test(".worktrees stop: from inside a worktree, resolves to the worktree's parent root", () => {
  makeConfig(tmpRoot);
  const inWorktree = path.join(tmpRoot, ".worktrees", "001-slug");
  fs.mkdirSync(inWorktree, { recursive: true });
  assert.strictEqual(findProjectRoot(inWorktree), tmpRoot);
});

test(".worktrees strip happens first: a .plans inside the worktree is not returned", () => {
  makeConfig(tmpRoot);
  const inWorktree = path.join(tmpRoot, ".worktrees", "001-slug");
  fs.mkdirSync(inWorktree, { recursive: true });
  // A .plans/config.json placed inside the worktree dir must NOT be what the
  // ascent returns — the .worktrees strip runs before the walk.
  makeConfig(inWorktree);
  assert.strictEqual(findProjectRoot(inWorktree), tmpRoot);
});

test("a .plans/ without config.json is not treated as a root", () => {
  // .plans dir exists at an intermediate level but has no config.json; a real
  // root with config.json sits above it — the walk must skip past and find it.
  makeConfig(tmpRoot);
  const mid = path.join(tmpRoot, "mid");
  fs.mkdirSync(path.join(mid, ".plans"), { recursive: true });
  const start = path.join(mid, "sub");
  fs.mkdirSync(start, { recursive: true });
  assert.strictEqual(findProjectRoot(start), tmpRoot);
});

test("returns null (never throws) on a nonexistent startDir", () => {
  const ghost = path.join(tmpRoot, "does", "not", "exist");
  assert.strictEqual(findProjectRoot(ghost), null);
});

test("resolves through a .plans that is a git worktree (branch mode)", () => {
  // Real git, isolated from user config, every call pinned to an absolute cwd
  // inside tmpRoot so nothing can leak into an enclosing repo.
  const env = {
    ...process.env,
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CEILING_DIRECTORIES: path.dirname(tmpRoot),
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.com",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.com",
  };
  const git = (...args) => {
    const r = spawnSync("git", args, { cwd: tmpRoot, env, encoding: "utf8" });
    assert.strictEqual(r.status, 0, `git ${args.join(" ")} failed: ${r.stderr}`);
  };
  git("init", "-q", "-b", "main");
  fs.writeFileSync(path.join(tmpRoot, ".gitignore"), ".plans\n");
  git("add", "-A");
  git("commit", "-q", "-m", "init");
  git("worktree", "add", "-q", "--orphan", "-b", "plans", path.join(tmpRoot, ".plans"));
  makeConfig(tmpRoot);

  assert.ok(fs.statSync(path.join(tmpRoot, ".plans", ".git")).isFile(), ".plans should be a worktree");
  assert.strictEqual(findProjectRoot(tmpRoot), tmpRoot);
  // From inside the .plans worktree itself, the walk still lands on the root.
  assert.strictEqual(findProjectRoot(path.join(tmpRoot, ".plans")), tmpRoot);
});
