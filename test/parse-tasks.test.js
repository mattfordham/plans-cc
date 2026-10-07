const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { parseTasks } = require("../lib/parse-tasks");

let plansDir;

function write(rel, content) {
  const file = path.join(plansDir, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function task(id, title, status, extra = "") {
  return `# ${title}\n\n**ID:** ${id}\n**Created:** 2026-10-01T10:00\n**Type:** feature\n**Status:** ${status}\n${extra}\n## What\nx\n`;
}

beforeEach(() => {
  plansDir = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "parse-tasks-"))), ".plans");
  fs.mkdirSync(plansDir);
});

afterEach(() => {
  fs.rmSync(path.dirname(plansDir), { recursive: true, force: true });
});

test("parseTasks: #-prefixed Blocked by ids parse to bare ids and block on an uncompleted blocker", () => {
  write("pending/045-blocked.md", task("045", "Blocked", "pending", "**Blocked by:** #043, #044\n"));

  const { tasks } = parseTasks(plansDir);
  const blocked = tasks.find((t) => t.id === "045");

  assert.deepStrictEqual(blocked.blockedBy, ["043", "044"]);
  assert.strictEqual(blocked.isBlocked, true);
});

test("parseTasks: bare Blocked by ids still parse", () => {
  write("pending/045-blocked.md", task("045", "Blocked", "pending", "**Blocked by:** 043 044\n"));

  const { tasks } = parseTasks(plansDir);

  assert.deepStrictEqual(tasks[0].blockedBy, ["043", "044"]);
  assert.strictEqual(tasks[0].isBlocked, true);
});

test("parseTasks: a #-prefixed blocker that is completed does not block", () => {
  write("pending/045-blocked.md", task("045", "Blocked", "pending", "**Blocked by:** #043\n"));
  write("completed/043-done.md", task("043", "Done", "completed"));

  const { tasks } = parseTasks(plansDir);

  assert.deepStrictEqual(tasks[0].blockedBy, ["043"]);
  assert.strictEqual(tasks[0].isBlocked, false);
});

test("parseTasks: Blocked by tokens that are not 3-digit ids are ignored", () => {
  write("pending/045-blocked.md", task("045", "Blocked", "pending", "**Blocked by:** #43, ##043, #0430, abc, #044\n"));

  const { tasks } = parseTasks(plansDir);

  assert.deepStrictEqual(tasks[0].blockedBy, ["044"]);
});

test("parseTasks: ids >= 1000 are not truncated and do not collide", () => {
  write("pending/1000-first.md", task("1000", "First", "pending"));
  write("pending/1001-second.md", task("1001", "Second", "pending"));

  const { tasks } = parseTasks(plansDir);
  const ids = tasks.map((t) => t.id).sort();

  // Must be the full ids, never truncated to "100".
  assert.deepStrictEqual(ids, ["1000", "1001"]);
  assert.strictEqual(new Set(tasks.map((t) => t.id)).size, 2);
});

test("parseTasks: a >= 1000 blocker that is completed does not block", () => {
  write("pending/1001-blocked.md", task("1001", "Blocked", "pending", "**Blocked by:** #1000\n"));
  write("completed/1000-done.md", task("1000", "Done", "completed"));

  const { tasks } = parseTasks(plansDir);
  const blocked = tasks.find((t) => t.id === "1001");

  assert.deepStrictEqual(blocked.blockedBy, ["1000"]);
  assert.strictEqual(blocked.isBlocked, false);
});
