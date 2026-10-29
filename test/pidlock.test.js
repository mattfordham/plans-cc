const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { createPidLock, lockPathFor, installExitHandlers } = require("../lib/pidlock");

// Each test gets its own throwaway dashboards dir so lock files never collide
// and never touch the real ~/.claude/plans-cc/dashboards.
function tmpDashDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "pidlock-"));
}

// An injected liveness probe: `alive` is a Set of PIDs considered alive. Mirrors
// process.kill(pid, 0) — returns true for a live PID, throws ESRCH for a dead
// one — so tests are deterministic (no real foreign PID required).
function fakeIsAlive(alivePids) {
  return (pid) => alivePids.has(pid);
}

test("lockPathFor: deterministic sha1-named path under dashboards dir", () => {
  const p1 = lockPathFor("/some/project", "/dash");
  const p2 = lockPathFor("/some/project", "/dash");
  assert.strictEqual(p1, p2);
  assert.strictEqual(path.dirname(p1), "/dash");
  assert.ok(p1.endsWith(".pid"));
  // different project → different file
  assert.notStrictEqual(p1, lockPathFor("/other/project", "/dash"));
});

test("acquire: succeeds when no lockfile exists", () => {
  const dir = tmpDashDir();
  const lock = createPidLock({
    root: "/proj",
    dashDir: dir,
    pid: 4242,
    isAlive: fakeIsAlive(new Set()),
  });
  const r = lock.acquire();
  assert.strictEqual(r.ok, true);
  const file = lockPathFor("/proj", dir);
  assert.strictEqual(fs.readFileSync(file, "utf8").trim(), "4242");
});

test("acquire: refuses when recorded PID is alive", () => {
  const dir = tmpDashDir();
  const file = lockPathFor("/proj", dir);
  fs.writeFileSync(file, "999\n");
  const lock = createPidLock({
    root: "/proj",
    dashDir: dir,
    pid: 4242,
    isAlive: fakeIsAlive(new Set([999])),
  });
  const r = lock.acquire();
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.pid, 999, "refusal names the live owner's PID");
  // the live owner's lock is untouched
  assert.strictEqual(fs.readFileSync(file, "utf8").trim(), "999");
});

test("acquire: takes over when recorded PID is dead", () => {
  const dir = tmpDashDir();
  const file = lockPathFor("/proj", dir);
  fs.writeFileSync(file, "999\n");
  const lock = createPidLock({
    root: "/proj",
    dashDir: dir,
    pid: 4242,
    isAlive: fakeIsAlive(new Set()), // 999 is dead
  });
  const r = lock.acquire();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(fs.readFileSync(file, "utf8").trim(), "4242");
});

test("acquire: takes over when lockfile is garbage/unparseable", () => {
  const dir = tmpDashDir();
  const file = lockPathFor("/proj", dir);
  fs.writeFileSync(file, "not-a-pid\n");
  const lock = createPidLock({
    root: "/proj",
    dashDir: dir,
    pid: 4242,
    isAlive: fakeIsAlive(new Set()),
  });
  const r = lock.acquire();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(fs.readFileSync(file, "utf8").trim(), "4242");
});

test("release: removes our own lock", () => {
  const dir = tmpDashDir();
  const lock = createPidLock({
    root: "/proj",
    dashDir: dir,
    pid: 4242,
    isAlive: fakeIsAlive(new Set()),
  });
  lock.acquire();
  const file = lockPathFor("/proj", dir);
  assert.ok(fs.existsSync(file));
  lock.release();
  assert.ok(!fs.existsSync(file), "our own lock removed on release");
});

test("release: does NOT remove a lock owned by a different PID", () => {
  const dir = tmpDashDir();
  const file = lockPathFor("/proj", dir);
  const lock = createPidLock({
    root: "/proj",
    dashDir: dir,
    pid: 4242,
    isAlive: fakeIsAlive(new Set()),
  });
  lock.acquire(); // writes 4242
  // another process overwrites the lock after we acquired it
  fs.writeFileSync(file, "7777\n");
  lock.release();
  assert.ok(fs.existsSync(file), "did not remove a foreign lock");
  assert.strictEqual(fs.readFileSync(file, "utf8").trim(), "7777");
});

// --- installExitHandlers -------------------------------------------------

// Minimal fake EventEmitter-ish objects so we can drive signals/stdin end
// without touching the real process.
function fakeEmitter() {
  const handlers = {};
  return {
    on(event, fn) {
      (handlers[event] = handlers[event] || []).push(fn);
      return this;
    },
    emit(event, ...args) {
      (handlers[event] || []).forEach((fn) => fn(...args));
    },
    resume() {},
  };
}

test("installExitHandlers: SIGHUP calls onExit then exit", () => {
  const proc = fakeEmitter();
  const stdin = fakeEmitter();
  const order = [];
  installExitHandlers({
    proc,
    stdin,
    exit: (code) => order.push(["exit", code]),
    onExit: () => order.push(["onExit"]),
  });
  proc.emit("SIGHUP");
  assert.deepStrictEqual(order, [["onExit"], ["exit", 0]]);
});

test("installExitHandlers: stdin 'end' calls onExit then exit", () => {
  const proc = fakeEmitter();
  const stdin = fakeEmitter();
  const order = [];
  installExitHandlers({
    proc,
    stdin,
    exit: (code) => order.push(["exit", code]),
    onExit: () => order.push(["onExit"]),
  });
  stdin.emit("end");
  assert.deepStrictEqual(order, [["onExit"], ["exit", 0]]);
});

test("installExitHandlers: release runs exactly once even if fired twice", () => {
  const proc = fakeEmitter();
  const stdin = fakeEmitter();
  let onExitCount = 0;
  installExitHandlers({
    proc,
    stdin,
    exit: () => {},
    onExit: () => {
      onExitCount++;
    },
  });
  proc.emit("SIGHUP");
  stdin.emit("end");
  assert.strictEqual(onExitCount, 1, "onExit should be idempotent");
});
