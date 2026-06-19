const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// registry.js computes RUNTIME_DIR from os.homedir() at require time, so we
// point HOME/USERPROFILE at a throwaway dir BEFORE requiring it, and reload it
// fresh for each test (require-cache isolation). This keeps the real registry
// at ~/.claude/plans-cc/projects.json untouched.

const REGISTRY_MODULE = require.resolve("../lib/registry");

let tmpHome;
let registry;

function registryFile() {
  return path.join(tmpHome, ".claude", "plans-cc", "projects.json");
}

function readRegistryFile() {
  return JSON.parse(fs.readFileSync(registryFile(), "utf8"));
}

beforeEach(() => {
  tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), "plans-reg-home-"));
  process.env.HOME = tmpHome;
  process.env.USERPROFILE = tmpHome;
  delete require.cache[REGISTRY_MODULE];
  registry = require(REGISTRY_MODULE);
});

afterEach(() => {
  delete require.cache[REGISTRY_MODULE];
  fs.rmSync(tmpHome, { recursive: true, force: true });
});

// --- Defect #1: worktree $PWD must be normalized to the real project root ---

test("worktree path is normalized to the project root, not registered verbatim", () => {
  const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plans-proj-"));
  fs.mkdirSync(path.join(projRoot, ".plans"));
  try {
    registry.registerProject(path.join(projRoot, ".worktrees", "019-slug"));
    const data = readRegistryFile();
    assert.deepStrictEqual(
      data.projects.map((p) => p.path),
      [projRoot],
      "stored path should be the real project root"
    );
    assert.ok(
      !data.projects.some((p) => p.path.split(path.sep).includes(".worktrees")),
      "no entry should contain a .worktrees segment"
    );
  } finally {
    fs.rmSync(projRoot, { recursive: true, force: true });
  }
});

test("nested worktree subrepo path is normalized to the project root", () => {
  const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plans-proj-"));
  fs.mkdirSync(path.join(projRoot, ".plans"));
  try {
    registry.registerProject(
      path.join(projRoot, ".worktrees", "019-slug", "subrepo")
    );
    const data = readRegistryFile();
    assert.deepStrictEqual(
      data.projects.map((p) => p.path),
      [projRoot]
    );
  } finally {
    fs.rmSync(projRoot, { recursive: true, force: true });
  }
});

// --- Defect #2: a dangling .plans symlink must NOT prune the entry ---

test("a dangling .plans symlink does not prune a live project", () => {
  const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plans-proj-"));
  // .plans is a symlink to a non-existent target — mirrors a torn-down worktree.
  fs.symlinkSync(
    path.join(projRoot, "does-not-exist"),
    path.join(projRoot, ".plans")
  );
  try {
    registry.registerProject(projRoot);
    const survivors = registry.pruneProjects();
    assert.deepStrictEqual(
      survivors.map((p) => p.path),
      [projRoot],
      "live project with dangling .plans symlink must survive prune"
    );
    const data = readRegistryFile();
    assert.ok(
      data.projects.length > 0,
      "projects.json must not be emptied by the prune"
    );
  } finally {
    fs.rmSync(projRoot, { recursive: true, force: true });
  }
});

// --- Guard: a genuinely-removed root IS pruned ---

test("a removed project root is pruned", () => {
  const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plans-proj-"));
  fs.mkdirSync(path.join(projRoot, ".plans"));
  registry.registerProject(projRoot);
  fs.rmSync(projRoot, { recursive: true, force: true });
  const survivors = registry.pruneProjects();
  assert.deepStrictEqual(survivors, [], "removed root should be pruned");
});

// --- Regression: existing behavior preserved ---

test("re-registering the same root updates lastSeen, not appends", () => {
  const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plans-proj-"));
  fs.mkdirSync(path.join(projRoot, ".plans"));
  try {
    registry.registerProject(projRoot);
    registry.registerProject(path.join(projRoot, ".worktrees", "001-x"));
    const data = readRegistryFile();
    assert.strictEqual(data.projects.length, 1, "should dedupe by resolved root");
    assert.strictEqual(data.projects[0].path, projRoot);
  } finally {
    fs.rmSync(projRoot, { recursive: true, force: true });
  }
});

test("registry file keeps the {version:1, projects:[...]} shape", () => {
  const projRoot = fs.mkdtempSync(path.join(os.tmpdir(), "plans-proj-"));
  fs.mkdirSync(path.join(projRoot, ".plans"));
  try {
    registry.registerProject(projRoot);
    const data = readRegistryFile();
    assert.strictEqual(data.version, 1);
    assert.ok(Array.isArray(data.projects));
    assert.ok(
      data.projects.every(
        (p) => typeof p.path === "string" && typeof p.lastSeen === "string"
      )
    );
  } finally {
    fs.rmSync(projRoot, { recursive: true, force: true });
  }
});

test("missing registry reads as empty", () => {
  assert.deepStrictEqual(registry.readProjects(), []);
});

test("corrupt registry reads as empty", () => {
  const file = registryFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, "{ not json");
  assert.deepStrictEqual(registry.readProjects(), []);
});
