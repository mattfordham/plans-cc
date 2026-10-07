const fs = require("fs");
const path = require("path");

const STATUS_ORDER = ["in-progress", "in-review", "review", "elaborated", "pending"];

function readMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
}

function parseFile(filePath, filename, forceStatus) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  // IDs are a MINIMUM of 3 digits (001…999), but may be 4+ (1000+). Match the
  // leading digit run rather than a fixed slice, which truncated 1000 → "100".
  const id = (filename.match(/^(\d+)-/) || [])[1] || filename.slice(0, 3);

  let title = "";
  for (const line of lines) {
    if (line.startsWith("# ")) {
      title = line.slice(2).trim();
      break;
    }
  }

  const typeMatch = content.match(/^\*\*Type:\*\*\s*(.+)$/m);
  const statusMatch = content.match(/^\*\*Status:\*\*\s*(.+)$/m);
  const blockedMatch = content.match(/^\*\*Blocked by:\*\*\s*(.+)$/m);
  // Match only same-line content after the field: `\s*` would span the newline
  // and capture the next non-empty line, so an empty **Worktree:** would read
  // as kept. `[^\S\n]*` restricts the gap to horizontal whitespace.
  const worktreeMatch = content.match(/^\*\*Worktree:\*\*[^\S\n]*(.+)$/m);

  const type = typeMatch ? typeMatch[1].trim() : "";
  const status = forceStatus || (statusMatch ? statusMatch[1].trim() : "");
  // A kept-worktree task carries a live **Worktree:** field (written by
  // plan-execute with `keep`, stripped by plan-complete at teardown). Treat a
  // present-but-empty value as not kept.
  const kept = !!(worktreeMatch && worktreeMatch[1].trim());

  // /plan-depends writes `#043, #044`; accept bare `043` too. Normalize to the
  // bare 3-digit id so it matches completedIds (filename prefixes).
  let blockedBy = [];
  if (blockedMatch) {
    for (const token of blockedMatch[1].split(/[,\s]+/)) {
      // A valid id is either exactly 3 digits (001…999) or 4+ digits with no
      // leading zero (1000+). Zero-padding is to a MINIMUM of 3, so a 4+ digit
      // id never carries a leading zero — `#0430` stays rejected as malformed.
      const m = token.trim().match(/^#?(\d{3}|[1-9]\d{3,})$/);
      if (m) blockedBy.push(m[1]);
    }
  }

  // Count checkboxes within the ## How section only.
  let done = 0;
  let total = 0;
  let inHow = false;
  for (const line of lines) {
    if (line === "## How") {
      inHow = true;
      continue;
    }
    if (inHow && line.startsWith("## ")) break;
    if (!inHow) continue;
    if (/^\s*- \[[ xX]\]/.test(line)) {
      total++;
      if (/^\s*- \[[xX]\]/.test(line)) done++;
    }
  }

  return { id, title, type, status, blockedBy, done, total, kept };
}

function parseTasks(plansDir) {
  const pendingDir = path.join(plansDir, "pending");
  const completedDir = path.join(plansDir, "completed");
  const backlogDir = path.join(plansDir, "backlog");

  const pendingFiles = readMdFiles(pendingDir);
  const completedFiles = readMdFiles(completedDir);
  // Backlogged (deferred) tasks are counted separately and EXCLUDED from the
  // active pending/elaborated/in-progress counts. readMdFiles tolerates a
  // missing backlog/ dir by returning [].
  const backlogFiles = readMdFiles(backlogDir);

  const completedIds = new Set();
  for (const f of completedFiles) {
    // Same leading-digit-run match as parseFile — never truncate 1000 → "100".
    completedIds.add((f.match(/^(\d+)-/) || [])[1] || f.slice(0, 3));
  }

  const tasks = [];
  for (const filename of pendingFiles) {
    const filePath = path.join(pendingDir, filename);
    const task = parseFile(filePath, filename, null);
    task.isBlocked = task.blockedBy.some((bid) => !completedIds.has(bid));
    tasks.push(task);
  }

  const summary = {
    pending: 0,
    elaborated: 0,
    inProgress: 0,
    review: 0,
    inReview: 0,
    completed: completedFiles.length,
    backlogged: backlogFiles.length,
  };

  for (const t of tasks) {
    if (t.status === "pending") summary.pending++;
    else if (t.status === "elaborated") summary.elaborated++;
    else if (t.status === "in-progress") summary.inProgress++;
    else if (t.status === "in-review") summary.inReview++;
    else if (t.status === "review") summary.review++;
  }

  tasks.sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    const aKey = ai === -1 ? STATUS_ORDER.length : ai;
    const bKey = bi === -1 ? STATUS_ORDER.length : bi;
    if (aKey !== bKey) return aKey - bKey;
    // Numeric, not lexicographic: "1000" must order after "999", not before it.
    return Number(a.id) - Number(b.id);
  });

  return { tasks, summary };
}

module.exports = { parseTasks };
