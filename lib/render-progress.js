const fs = require("fs");
const path = require("path");
const { parseTasks } = require("./parse-tasks");

// Node renderer for .plans/PROGRESS.md — the same file the skills maintain by
// hand (plan-init template, plan-execute "Active Work", plan-complete "Recently
// Completed" capped at 5, plan-cleanup's ground-truth rebuild). Branch-mode
// sync uses it to regenerate PROGRESS.md after a pull, since that file is
// merge=ours and may come back from a rebase stale.

const ACTIVE = ["in-progress", "in-review", "review"];
const RECENT_LIMIT = 5;
const TASK_DIRS = ["pending", "completed", "backlog", "archive"];

function today() {
  const d = new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function readMd(dir) {
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
  } catch (_) {
    return [];
  }
}

// The YYYY-MM-DD part of a `**Field:** <ISO timestamp>` header line, or "".
function fieldDate(content, field) {
  const m = content.match(new RegExp(`^\\*\\*${field}:\\*\\*[^\\S\\n]*(\\d{4}-\\d{2}-\\d{2})`, "m"));
  return m ? m[1] : "";
}

function readFileSafe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch (_) {
    return "";
  }
}

// Completed tasks newest-first by their **Completed:** date (ties: higher id
// first), each { id, title, date }.
function recentCompleted(plansDir) {
  const dir = path.join(plansDir, "completed");
  const out = [];
  for (const f of readMd(dir)) {
    const content = readFileSafe(path.join(dir, f));
    const title = (content.match(/^# (.+)$/m) || [])[1] || "";
    // IDs are a MINIMUM of 3 digits but may be 4+ (1000+). Match the leading
    // digit run rather than a fixed slice, which truncated 1000 → "100".
    const id = (f.match(/^(\d+)-/) || [])[1] || f.slice(0, 3);
    out.push({ id, title: title.trim(), date: fieldDate(content, "Completed") });
  }
  // Descending recent-completed order (newest date first; ties: higher id
  // first). The id tiebreak is numeric so 1000 orders above 999.
  out.sort((a, b) => (a.date === b.date ? Number(b.id) - Number(a.id) : b.date.localeCompare(a.date)));
  return out.slice(0, RECENT_LIMIT);
}

// Render PROGRESS.md for the .plans directory. opts.date overrides the
// "Last updated" date (tests); defaults to today in local time.
function renderProgress(plansDir, opts) {
  const date = (opts && opts.date) || today();
  const { tasks, summary } = parseTasks(plansDir);

  const active = tasks
    .filter((t) => ACTIVE.includes(t.status))
    .map((t) => {
      let suffix = ` (${t.status})`;
      if (t.status === "in-progress") {
        const started = fieldDate(readFileSafe(path.join(plansDir, "state", `${t.id}-state.md`)), "Started");
        suffix = started ? ` (started ${started})` : "";
      }
      return `- **#${t.id}** - ${t.title}${suffix}`;
    });

  const recent = recentCompleted(plansDir).map(
    (t) => `- **#${t.id}** - ${t.title}${t.date ? ` (completed ${t.date})` : ""}`
  );

  return [
    "# Current Progress",
    "",
    `**Last updated:** ${date}`,
    "",
    "## Active Work",
    ...(active.length ? active : ["_No active tasks_"]),
    "",
    "## Recently Completed",
    ...(recent.length ? recent : ["_No completed tasks yet_"]),
    "",
    "## Stats",
    `- Pending: ${summary.pending}`,
    `- Elaborated: ${summary.elaborated}`,
    `- In Progress: ${summary.inProgress}`,
    `- In Review: ${summary.review + summary.inReview}`,
    `- Backlogged: ${summary.backlogged}`,
    `- Completed: ${summary.completed}`,
    "",
  ].join("\n");
}

// Highest numeric NNN- prefix among .md files under dir (recursively, so
// archive/ subfolders count).
function maxIdIn(dir) {
  let max = 0;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (_) {
    return 0;
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      max = Math.max(max, maxIdIn(path.join(dir, e.name)));
    } else {
      const m = e.name.match(/^(\d{3,})-.*\.md$/);
      if (m) max = Math.max(max, Number(m[1]));
    }
  }
  return max;
}

// The ID scan that reconstructs next_id / idea_next_id from ground truth:
// task ids across pending/, completed/, backlog/ and archive/; idea ids from
// ideas/. Returns { maxTaskId, maxIdeaId } (0 when none).
function scanIds(plansDir) {
  let maxTaskId = 0;
  for (const d of TASK_DIRS) maxTaskId = Math.max(maxTaskId, maxIdIn(path.join(plansDir, d)));
  return { maxTaskId, maxIdeaId: maxIdIn(path.join(plansDir, "ideas")) };
}

module.exports = { renderProgress, scanIds, TASK_DIRS };
