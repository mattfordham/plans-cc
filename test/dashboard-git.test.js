const { test } = require("node:test");
const assert = require("node:assert");
const path = require("path");

const { createDashboardGit, parseStatusV2 } = require("../lib/dashboard-git");

// A fake git runner with the same { ok, status, stdout, stderr } contract as
// the real spawnSync-based runner in lib/plans-git.js. It records every call
// as { cwd, args } and answers from a per-(cwd, subcommand) response map so a
// test can assert exactly which argv ran, how many times, and against which
// cwd — without spawning a real process (Node 16.7 floor: no node:test mock).
function fakeRunner(responder) {
  const calls = [];
  function run(cwd, args) {
    calls.push({ cwd, args: args.slice() });
    const res = responder(cwd, args) || {};
    return {
      ok: res.ok !== undefined ? res.ok : true,
      status: res.status !== undefined ? res.status : 0,
      stdout: res.stdout !== undefined ? res.stdout : "",
      stderr: res.stderr !== undefined ? res.stderr : "",
    };
  }
  run.calls = calls;
  return run;
}

// Match calls by their first non-flag git subcommand (skipping --no-optional-locks).
function subcommand(args) {
  for (const a of args) {
    if (a === "--no-optional-locks") continue;
    return a;
  }
  return "";
}

function countCalls(runner, pred) {
  return runner.calls.filter((c) => pred(c)).length;
}

// --- parseStatusV2 -------------------------------------------------------

test("parseStatusV2: extracts branch from # branch.head", () => {
  const out = [
    "# branch.oid 08d0bda",
    "# branch.head fix/054-foo",
  ].join("\n");
  const r = parseStatusV2(out);
  assert.strictEqual(r.branch, "fix/054-foo");
});

test("parseStatusV2: detached HEAD → branch null", () => {
  const out = [
    "# branch.oid 08d0bda",
    "# branch.head (detached)",
  ].join("\n");
  const r = parseStatusV2(out);
  assert.strictEqual(r.branch, null);
});

test("parseStatusV2: dirty is false when only # header lines present", () => {
  const out = [
    "# branch.oid 08d0bda",
    "# branch.head main",
  ].join("\n");
  const r = parseStatusV2(out);
  assert.strictEqual(r.dirty, false);
});

test("parseStatusV2: dirty is true when any non-# line present", () => {
  const out = [
    "# branch.oid 08d0bda",
    "# branch.head main",
    "1 .M N... 100644 100644 100644 abc abc lib/foo.js",
  ].join("\n");
  const r = parseStatusV2(out);
  assert.strictEqual(r.dirty, true);
});

test("parseStatusV2: untracked (?) line counts as dirty", () => {
  const out = [
    "# branch.head main",
    "? new-file.txt",
  ].join("\n");
  assert.strictEqual(parseStatusV2(out).dirty, true);
});

test("parseStatusV2: upstream + ahead/behind from branch.upstream and branch.ab", () => {
  const out = [
    "# branch.oid 08d0bda",
    "# branch.head plans",
    "# branch.upstream origin/plans",
    "# branch.ab +2 -3",
  ].join("\n");
  const r = parseStatusV2(out);
  assert.strictEqual(r.upstream, true);
  assert.strictEqual(r.ahead, 2);
  assert.strictEqual(r.behind, 3);
});

test("parseStatusV2: no upstream → upstream false, ahead/behind 0", () => {
  const out = [
    "# branch.oid 08d0bda",
    "# branch.head plans",
  ].join("\n");
  const r = parseStatusV2(out);
  assert.strictEqual(r.upstream, false);
  assert.strictEqual(r.ahead, 0);
  assert.strictEqual(r.behind, 0);
});

// --- one status call per repo per refresh --------------------------------

test("readBranches: exactly one status call per repo per refresh", () => {
  const root = "/proj";
  // /proj is NOT a git repo; it has one sub-repo /proj/web that is.
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse") {
      // toplevel probe: /proj fails, /proj/web ok
      if (cwd === root) return { ok: false };
      return { ok: true, stdout: cwd };
    }
    if (sub === "check-ignore") return { ok: false };
    if (sub === "status") {
      return { ok: true, stdout: "# branch.head main\n" };
    }
    return { ok: true };
  });
  const dg = createDashboardGit({
    root,
    runGit: runner,
    listSubRepos: () => ["web"],
  });
  dg.readBranches();
  // exactly one status call, and it targets the sub-repo
  const statusCalls = runner.calls.filter((c) => subcommand(c.args) === "status");
  assert.strictEqual(statusCalls.length, 1);
  assert.strictEqual(statusCalls[0].cwd, path.join(root, "web"));
});

test("readBranches: root that IS a git repo → one status call for root", () => {
  const root = "/proj";
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse") return { ok: true, stdout: cwd };
    if (sub === "check-ignore") return { ok: false };
    if (sub === "status") return { ok: true, stdout: "# branch.head main\n" };
    return { ok: true };
  });
  const dg = createDashboardGit({ root, runGit: runner, listSubRepos: () => [] });
  dg.readBranches();
  const statusCalls = runner.calls.filter((c) => subcommand(c.args) === "status");
  assert.strictEqual(statusCalls.length, 1);
  assert.strictEqual(statusCalls[0].cwd, root);
});

// --- rev-parse / check-ignore / git-path cached across refreshes ---------

test("readSync: toplevel/check-ignore (mode detection) run once across refreshes", () => {
  const root = "/proj";
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse") return { ok: true, stdout: cwd };
    if (sub === "check-ignore") return { ok: false }; // inline
    if (sub === "status") return { ok: true, stdout: "# branch.head main\n" };
    return { ok: true };
  });
  const dg = createDashboardGit({
    root,
    runGit: runner,
    listSubRepos: () => [],
    plansExists: () => false,
  });
  dg.readSync();
  dg.readSync();
  dg.readSync();
  // mode detection (root toplevel + check-ignore) ran once total, then cached
  const toplevel = countCalls(
    runner,
    (c) => subcommand(c.args) === "rev-parse" && c.args.includes("--show-toplevel")
  );
  const checkIgnore = countCalls(runner, (c) => subcommand(c.args) === "check-ignore");
  assert.strictEqual(toplevel, 1, "show-toplevel ran more than once");
  assert.strictEqual(checkIgnore, 1, "check-ignore ran more than once");
});

test("readBranches: status re-runs each refresh but toplevel probe is per-call", () => {
  const root = "/proj";
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse") return { ok: true, stdout: cwd };
    if (sub === "status") return { ok: true, stdout: "# branch.head main\n" };
    return { ok: true };
  });
  const dg = createDashboardGit({ root, runGit: runner, listSubRepos: () => [] });
  dg.readBranches();
  dg.readBranches();
  dg.readBranches();
  // status re-reads fresh git state every refresh — that is the point
  const statusCalls = countCalls(runner, (c) => subcommand(c.args) === "status");
  assert.strictEqual(statusCalls, 3);
});

test("gitPaths: --git-path lookups cached per repo across calls", () => {
  const root = "/proj";
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse" && args.includes("--git-path")) {
      const which = args[args.length - 1];
      return { ok: true, stdout: ".git/" + which };
    }
    if (sub === "rev-parse") return { ok: true, stdout: cwd };
    if (sub === "check-ignore") return { ok: false };
    return { ok: true };
  });
  const dg = createDashboardGit({ root, runGit: runner, listSubRepos: () => [] });
  const first = dg.gitPaths(root);
  const second = dg.gitPaths(root);
  assert.deepStrictEqual(first, second);
  assert.ok(first.HEAD && first.index, "HEAD and index paths resolved");
  // each of the 4 git-path probes ran exactly once
  const gitPathCalls = countCalls(
    runner,
    (c) => subcommand(c.args) === "rev-parse" && c.args.includes("--git-path")
  );
  assert.strictEqual(gitPathCalls, 4);
});

// --- readBranches / readSync return today's shapes -----------------------

test("readBranches: shape is { root, rootDirty, subRepos:[{name,branch,dirty}] }", () => {
  const root = "/proj";
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse") {
      if (cwd === root) return { ok: false }; // root not a git repo
      return { ok: true, stdout: cwd };
    }
    if (sub === "check-ignore") return { ok: false };
    if (sub === "status") {
      if (cwd === path.join(root, "web")) {
        return { ok: true, stdout: "# branch.head feature/x\n1 .M N... a a a f\n" };
      }
      return { ok: true, stdout: "# branch.head main\n" };
    }
    return { ok: true };
  });
  const dg = createDashboardGit({
    root,
    runGit: runner,
    listSubRepos: () => ["web", "api"],
  });
  const b = dg.readBranches();
  assert.strictEqual(b.root, null);
  assert.strictEqual(b.rootDirty, null);
  assert.deepStrictEqual(b.subRepos, [
    { name: "web", branch: "feature/x", dirty: true },
    { name: "api", branch: "main", dirty: false },
  ]);
});

test("readBranches: single-git-repo root populates root + rootDirty", () => {
  const root = "/proj";
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse") return { ok: true, stdout: cwd };
    if (sub === "check-ignore") return { ok: false };
    if (sub === "status") return { ok: true, stdout: "# branch.head main\n" };
    return { ok: true };
  });
  const dg = createDashboardGit({ root, runGit: runner, listSubRepos: () => [] });
  const b = dg.readBranches();
  assert.strictEqual(b.root, "main");
  assert.strictEqual(b.rootDirty, false);
  assert.deepStrictEqual(b.subRepos, []);
});

test("readSync: non-branch mode returns { mode } only", () => {
  const root = "/proj";
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse") return { ok: true, stdout: cwd }; // root is a repo
    if (sub === "check-ignore") return { ok: false }; // not local → inline
    return { ok: true };
  });
  const dg = createDashboardGit({ root, runGit: runner, listSubRepos: () => [] });
  const s = dg.readSync();
  assert.deepStrictEqual(s, { mode: "inline" });
});

test("readSync: none mode when root is not a git repo", () => {
  const root = "/proj";
  const runner = fakeRunner(() => ({ ok: false }));
  const dg = createDashboardGit({ root, runGit: runner, listSubRepos: () => [] });
  const s = dg.readSync();
  assert.deepStrictEqual(s, { mode: "none" });
});

test("readSync: branch mode returns syncStatus shape from one .plans status call", () => {
  const root = "/proj";
  const plansDir = path.join(root, ".plans");
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse" && args.includes("--show-toplevel")) {
      // mode detection: root toplevel is root; .plans toplevel is .plans itself
      if (cwd === plansDir) return { ok: true, stdout: plansDir };
      return { ok: true, stdout: root };
    }
    if (sub === "rev-parse" && args.includes("--git-path")) {
      const which = args[args.length - 1];
      return { ok: true, stdout: path.join(".git", which) };
    }
    if (sub === "check-ignore") return { ok: false };
    if (sub === "status") {
      return {
        ok: true,
        stdout: [
          "# branch.head plans",
          "# branch.upstream origin/plans",
          "# branch.ab +1 -4",
        ].join("\n"),
      };
    }
    return { ok: true };
  });
  const dg = createDashboardGit({
    root,
    runGit: runner,
    listSubRepos: () => [],
    plansExists: () => true,
  });
  const s = dg.readSync();
  assert.strictEqual(s.mode, "branch");
  assert.strictEqual(s.branch, "plans");
  assert.strictEqual(s.remote, "origin");
  assert.strictEqual(s.upstream, true);
  assert.strictEqual(s.ahead, 1);
  assert.strictEqual(s.behind, 4);
  assert.strictEqual(s.rebaseStuck, false);
  // exactly one status call against .plans
  const statusCalls = runner.calls.filter((c) => subcommand(c.args) === "status");
  assert.strictEqual(statusCalls.length, 1);
  assert.strictEqual(statusCalls[0].cwd, plansDir);
});

test("readSync: branch mode mode-detection cached across repeated calls", () => {
  const root = "/proj";
  const plansDir = path.join(root, ".plans");
  const runner = fakeRunner((cwd, args) => {
    const sub = subcommand(args);
    if (sub === "rev-parse" && args.includes("--show-toplevel")) {
      if (cwd === plansDir) return { ok: true, stdout: plansDir };
      return { ok: true, stdout: root };
    }
    if (sub === "rev-parse" && args.includes("--git-path")) {
      return { ok: true, stdout: path.join(".git", args[args.length - 1]) };
    }
    if (sub === "check-ignore") return { ok: false };
    if (sub === "status") return { ok: true, stdout: "# branch.head plans\n" };
    return { ok: true };
  });
  const dg = createDashboardGit({
    root,
    runGit: runner,
    listSubRepos: () => [],
    plansExists: () => true,
  });
  const first = dg.readSync();
  dg.readSync();
  dg.readSync();
  // mode resolved to branch (so detection ran) and the root toplevel probe —
  // the one unconditional mode-detection call — ran exactly once across all
  // three readSync() calls, proving the mode is cached.
  assert.strictEqual(first.mode, "branch");
  const rootToplevel = countCalls(
    runner,
    (c) =>
      subcommand(c.args) === "rev-parse" &&
      c.args.includes("--show-toplevel") &&
      c.cwd === root
  );
  assert.strictEqual(rootToplevel, 1, "mode detection re-ran — should be cached");
});
