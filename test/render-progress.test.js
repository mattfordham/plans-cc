const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const { renderProgress, scanIds } = require("../lib/render-progress");

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
  plansDir = path.join(fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "render-progress-"))), ".plans");
  fs.mkdirSync(plansDir);
});

afterEach(() => {
  fs.rmSync(path.dirname(plansDir), { recursive: true, force: true });
});

test("renderProgress: an empty project renders the plan-init template shape", () => {
  assert.strictEqual(
    renderProgress(plansDir, { date: "2026-10-05" }),
    [
      "# Current Progress",
      "",
      "**Last updated:** 2026-10-05",
      "",
      "## Active Work",
      "_No active tasks_",
      "",
      "## Recently Completed",
      "_No completed tasks yet_",
      "",
      "## Stats",
      "- Pending: 0",
      "- Elaborated: 0",
      "- In Progress: 0",
      "- In Review: 0",
      "- Backlogged: 0",
      "- Completed: 0",
      "",
    ].join("\n")
  );
});

test("renderProgress: active work, the last 5 completions newest-first, and stats", () => {
  write("pending/010-alpha-task.md", task("010", "Alpha task", "in-progress"));
  write("state/010-state.md", "# Execution State: Task #010\n\n**Started:** 2026-10-04T09:30\n");
  write("pending/011-beta-task.md", task("011", "Beta task", "review"));
  write("pending/012-gamma-task.md", task("012", "Gamma task", "in-review"));
  write("pending/013-delta.md", task("013", "Delta", "pending"));
  write("pending/014-epsilon.md", task("014", "Epsilon", "elaborated"));
  write("pending/015-zeta.md", task("015", "Zeta", "elaborated"));
  write("backlog/016-eta.md", task("016", "Eta", "pending"));
  const days = { "001": "01", "002": "03", "003": "02", "004": "05", "005": "04", "006": "06" };
  for (const [id, day] of Object.entries(days)) {
    write(`completed/${id}-done-${id}.md`, task(id, `Done ${id}`, "completed", `**Completed:** 2026-09-${day}T12:00\n`));
  }

  assert.strictEqual(
    renderProgress(plansDir, { date: "2026-10-05" }),
    [
      "# Current Progress",
      "",
      "**Last updated:** 2026-10-05",
      "",
      "## Active Work",
      "- **#010** - Alpha task (started 2026-10-04)",
      "- **#012** - Gamma task (in-review)",
      "- **#011** - Beta task (review)",
      "",
      "## Recently Completed",
      "- **#006** - Done 006 (completed 2026-09-06)",
      "- **#004** - Done 004 (completed 2026-09-05)",
      "- **#005** - Done 005 (completed 2026-09-04)",
      "- **#002** - Done 002 (completed 2026-09-03)",
      "- **#003** - Done 003 (completed 2026-09-02)",
      "",
      "## Stats",
      "- Pending: 1",
      "- Elaborated: 2",
      "- In Progress: 1",
      "- In Review: 2",
      "- Backlogged: 1",
      "- Completed: 6",
      "",
    ].join("\n")
  );
});

test("renderProgress: an in-progress task with no state file omits the started date", () => {
  write("pending/020-solo.md", task("020", "Solo", "in-progress"));
  assert.match(renderProgress(plansDir, { date: "2026-10-05" }), /^- \*\*#020\*\* - Solo$/m);
});

test("scanIds: max task id spans pending, completed, backlog and archive; ideas separately", () => {
  write("pending/003-a.md", "x");
  write("completed/007-b.md", "x");
  write("backlog/012-c.md", "x");
  write("archive/old/015-d.md", "x");
  write("ideas/004-idea.md", "x");
  write("state/099-state.md", "x");
  assert.deepStrictEqual(scanIds(plansDir), { maxTaskId: 15, maxIdeaId: 4 });
});

test("scanIds: an empty project is zero", () => {
  assert.deepStrictEqual(scanIds(plansDir), { maxTaskId: 0, maxIdeaId: 0 });
});
