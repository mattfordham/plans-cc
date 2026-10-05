const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync, execFileSync } = require("node:child_process");

// End-to-end branch mode: drives the REAL CLI (`node bin/plans-git.js …`)
// against throwaway repos with a bare origin. Same safety rules as
// plans-git.test.js (a past harness bug sent scratch commits into the real
// repo): every git call takes an ABSOLUTE cwd confined to the per-test temp
// dir, git is isolated from the user's config, and GIT_CEILING_DIRECTORIES
// stops repo discovery at the temp base. process.env is set so the spawned
// CLI inherits the isolation too.
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

const CLI = path.resolve(__dirname, "..", "bin", "plans-git.js");
const plansGit = require("../lib/plans-git");

// `git worktree add --orphan` needs git >= 2.42; older git runs the same
// scenarios through init-branch's mktree/commit-tree fallback.
const GIT_VERSION = (spawnSync("git", ["--version"], { encoding: "utf8" }).stdout || "").match(/(\d+)\.(\d+)/);
const HAS_ORPHAN_WORKTREE = Boolean(GIT_VERSION) && (Number(GIT_VERSION[1]) > 2 || (Number(GIT_VERSION[1]) === 2 && Number(GIT_VERSION[2]) >= 42));
const SETUP_FLAGS = HAS_ORPHAN_WORKTREE ? [] : ["--force-fallback"];

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(TMP_BASE, "plans-branch-it-")));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function confined(cwd) {
  assert.ok(path.isAbsolute(cwd), `cwd must be absolute: ${cwd}`);
  assert.ok(cwd.startsWith(tmpRoot), `cwd escaped the temp dir: ${cwd}`);
}

function git(cwd, ...args) {
  confined(cwd);
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { status: r.status, out: (r.stdout || "").trim(), err: (r.stderr || "").trim() };
}

function gitOk(cwd, ...args) {
  const r = git(cwd, ...args);
  assert.strictEqual(r.status, 0, `git ${args.join(" ")} failed: ${r.err}`);
  return r.out;
}

// Run the CLI and capture both streams plus the exit code.
function cli(cwd, ...args) {
  confined(cwd);
  const r = spawnSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout || "", stderr: r.stderr || "" };
}

// The stdout-only form, via execFileSync (throws on a non-zero exit, which
// the CLI must never produce).
function cliOut(cwd, ...args) {
  confined(cwd);
  return execFileSync(process.execPath, [CLI, ...args], { cwd, encoding: "utf8" });
}

function write(file, content) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function taskFile(id, title, status = "pending") {
  return `# ${title}\n\n**ID:** ${id}\n**Created:** 2026-10-05T10:00\n**Type:** feature\n**Status:** ${status}\n\n## What\n${title}\n`;
}

// Bare origin with one `main` commit (plus .gitignore with the slashless
// `.plans` line, as plan-init writes), and a clone of it at `name`.
function makeOrigin() {
  const bare = path.join(tmpRoot, "origin.git");
  gitOk(tmpRoot, "init", "-q", "--bare", "-b", "main", bare);
  const seed = path.join(tmpRoot, "seed");
  fs.mkdirSync(seed);
  gitOk(seed, "init", "-q", "-b", "main");
  write(path.join(seed, "README.md"), "code\n");
  write(path.join(seed, ".gitignore"), ".plans\n.worktrees\n");
  gitOk(seed, "add", "-A");
  gitOk(seed, "commit", "-q", "-m", "init");
  gitOk(seed, "remote", "add", "origin", bare);
  gitOk(seed, "push", "-q", "origin", "main");
  return bare;
}

function cloneOf(bare, name) {
  const dir = path.join(tmpRoot, name);
  gitOk(tmpRoot, "clone", "-q", bare, dir);
  return dir;
}

function lastLine(text) {
  const lines = text.trim().split("\n");
  return lines[lines.length - 1];
}

// init-branch through the CLI from the project root.
function initBranch(root) {
  const out = cliOut(root, "init-branch", ...SETUP_FLAGS);
  assert.match(lastLine(out), /^OK: \.plans is on branch plans/, out);
  return path.join(root, ".plans");
}

// Simulated /plan-capture: a task file plus a bumped next_id, then the
// shared commit helper.
function capture(root, plansDir, id, title) {
  write(path.join(plansDir, "pending", `${id}-${title.toLowerCase().replace(/\s+/g, "-")}.md`), taskFile(id, title));
  const config = JSON.parse(read(path.join(plansDir, "config.json")));
  config.next_id = Number(id) + 1;
  write(path.join(plansDir, "config.json"), JSON.stringify(config, null, 2) + "\n");
  return cliOut(root, "commit", "--sync-push", `plan: capture task #${id} - ${title}`);
}

test("capture on a review branch commits to plans and never touches the code branch", () => {
  const root = cloneOf(makeOrigin(), "a");
  const plansDir = initBranch(root);
  gitOk(root, "checkout", "-q", "-b", "review/x");

  const out = capture(root, plansDir, "001", "First task");
  assert.strictEqual(out.trim(), "", `commit printed: ${out}`);

  assert.strictEqual(gitOk(plansDir, "branch", "--show-current"), "plans");
  assert.strictEqual(gitOk(plansDir, "log", "-1", "--format=%s"), "plan: capture task #001 - First task");
  assert.match(gitOk(plansDir, "ls-tree", "-r", "--name-only", "plans"), /^pending\/001-first-task\.md$/m);
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");

  const codeFiles = gitOk(root, "ls-tree", "-r", "--name-only", "review/x").split("\n");
  assert.ok(!codeFiles.some((f) => f.startsWith(".plans") || f.startsWith("pending/") || f === "config.json"), codeFiles.join(", "));
  assert.strictEqual(gitOk(root, "status", "--porcelain"), "");
  assert.strictEqual(gitOk(root, "branch", "--show-current"), "review/x");
});

test("an execution worktree writes through its .plans symlink and commits on plans", () => {
  const root = cloneOf(makeOrigin(), "a");
  const plansDir = initBranch(root);
  capture(root, plansDir, "001", "X");

  const wt = path.join(root, ".worktrees", "001-x");
  gitOk(root, "worktree", "add", "-q", "-b", "feature/001-x", wt);
  fs.symlinkSync(plansDir, path.join(wt, ".plans"));

  // Write status through the symlink, then commit from inside the worktree.
  const viaLink = path.join(wt, ".plans", "pending", "001-x.md");
  write(viaLink, read(viaLink).replace("**Status:** pending", "**Status:** in-progress"));
  const out = cliOut(wt, "commit", "plan: start work on task #001");
  assert.strictEqual(out.trim(), "", `commit printed: ${out}`);

  assert.match(read(path.join(plansDir, "pending", "001-x.md")), /\*\*Status:\*\* in-progress/);
  assert.strictEqual(gitOk(plansDir, "log", "-1", "--format=%s"), "plan: start work on task #001");
  assert.match(gitOk(plansDir, "show", "plans:pending/001-x.md"), /\*\*Status:\*\* in-progress/);
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");

  // The symlink is ignored in the worktree too: `add -A` never stages it.
  gitOk(wt, "add", "-A");
  const staged = gitOk(wt, "diff", "--cached", "--name-only");
  assert.ok(!staged.split("\n").some((f) => f.startsWith(".plans")), `staged: ${staged}`);
  assert.strictEqual(gitOk(wt, "status", "--porcelain"), "");
  assert.strictEqual(gitOk(wt, "check-ignore", ".plans"), ".plans");
});

test("the root's .plans survives a code checkout and an execution worktree's removal", () => {
  const root = cloneOf(makeOrigin(), "a");
  const plansDir = initBranch(root);
  capture(root, plansDir, "001", "X");
  gitOk(root, "checkout", "-q", "-b", "other");
  write(path.join(root, "other.txt"), "other\n");
  gitOk(root, "add", "other.txt");
  gitOk(root, "commit", "-q", "-m", "other work");

  gitOk(root, "checkout", "-q", "main");
  assert.ok(fs.existsSync(path.join(plansDir, "pending", "001-x.md")));
  assert.strictEqual(plansGit.detectMode(root), "branch");
  gitOk(root, "checkout", "-q", "other");
  assert.ok(fs.existsSync(path.join(plansDir, "pending", "001-x.md")));

  const wt = path.join(root, ".worktrees", "001-x");
  gitOk(root, "worktree", "add", "-q", "-b", "feature/001-x", wt);
  fs.symlinkSync(plansDir, path.join(wt, ".plans"));
  if (git(root, "worktree", "remove", wt).status !== 0) gitOk(root, "worktree", "remove", "--force", wt);
  gitOk(root, "worktree", "prune");

  assert.ok(!fs.existsSync(wt));
  assert.ok(fs.existsSync(path.join(plansDir, "pending", "001-x.md")));
  assert.ok(fs.existsSync(path.join(plansDir, "config.json")));
  assert.strictEqual(plansGit.detectMode(root), "branch");
  assert.strictEqual(gitOk(plansDir, "branch", "--show-current"), "plans");
  assert.strictEqual(gitOk(plansDir, "status", "--porcelain"), "");
});

test("bootstrap attaches a fresh clone, then just syncs, printing nothing on stdout", () => {
  const bare = makeOrigin();
  const a = cloneOf(bare, "a");
  const pa = initBranch(a);
  capture(a, pa, "001", "From A");

  const b = cloneOf(bare, "b");
  const first = cli(b, "bootstrap");
  assert.strictEqual(first.status, 0);
  assert.strictEqual(first.stdout, "", "bootstrap must print nothing on stdout");
  assert.match(lastLine(first.stderr), /^OK: \.plans is attached to origin\/plans/, first.stderr);
  const pb = path.join(b, ".plans");
  assert.strictEqual(plansGit.detectMode(b), "branch");
  assert.ok(fs.existsSync(path.join(pb, "pending", "001-from-a.md")));
  assert.strictEqual(gitOk(pb, "config", "merge.ours.driver"), "true");

  // A new capture on A arrives on B's second bootstrap, which only syncs.
  capture(a, pa, "002", "Later");
  const second = cli(b, "bootstrap");
  assert.strictEqual(second.status, 0);
  assert.strictEqual(second.stdout, "");
  assert.match(lastLine(second.stderr), /^OK: \.plans synced with origin\/plans/, second.stderr);
  assert.ok(fs.existsSync(path.join(pb, "pending", "002-later.md")));
  assert.strictEqual(gitOk(b, "worktree", "list", "--porcelain").match(/^worktree /gm).length, 2);
});

test("bootstrap refuses a plain local .plans/ and exits 0", () => {
  const bare = makeOrigin();
  initBranch(cloneOf(bare, "a"));
  const c = cloneOf(bare, "c");
  write(path.join(c, ".plans", "config.json"), '{ "git_commits": true }\n');
  write(path.join(c, ".plans", "pending", "001-local.md"), taskFile("001", "Local"));

  const r = cli(c, "bootstrap");
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, "");
  assert.match(r.stderr, /local \.plans\/ exists, run \/plan-init branch to convert/);
  assert.strictEqual(plansGit.detectMode(c), "local");
  assert.ok(fs.existsSync(path.join(c, ".plans", "pending", "001-local.md")));
  assert.strictEqual(git(c, "rev-parse", "--verify", "-q", "refs/heads/plans").status, 1);
});

test("bootstrap with no plans branch on the remote is a quiet no-op", () => {
  const b = cloneOf(makeOrigin(), "b");
  const r = cli(b, "bootstrap");
  assert.strictEqual(r.status, 0);
  assert.strictEqual(r.stdout, "");
  assert.doesNotMatch(r.stderr, /^(Error|Warning):/m);
  assert.match(r.stderr, /no plans branch/i);
  assert.ok(!fs.existsSync(path.join(b, ".plans")));
});

test("the plans branch is recognized by isPlansBranch so it can never be a Base", () => {
  const root = cloneOf(makeOrigin(), "a");
  initBranch(root);
  assert.strictEqual(plansGit.isPlansBranch("plans", root), true);
  assert.strictEqual(plansGit.isPlansBranch("main", root), false);
  assert.strictEqual(plansGit.isPlansBranch("feature/plans-ui", root), false);
  assert.strictEqual(cliOut(root, "is-plans-branch", "plans").trim(), "yes");
  assert.strictEqual(cliOut(root, "is-plans-branch", "main").trim(), "no");

  // A configured sync.branch is the plans branch; the default no longer is.
  const configFile = path.join(root, ".plans", "config.json");
  const config = JSON.parse(read(configFile));
  config.sync.branch = "notes";
  write(configFile, JSON.stringify(config, null, 2) + "\n");
  assert.strictEqual(plansGit.isPlansBranch("notes", root), true);
  assert.strictEqual(cliOut(root, "is-plans-branch", "notes").trim(), "yes");
});
