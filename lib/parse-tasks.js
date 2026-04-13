const fs = require("fs");
const path = require("path");

const STATUS_ORDER = ["in-progress", "review", "elaborated", "pending"];

function readMdFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".md"));
}

function parseFile(filePath, filename, forceStatus) {
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split(/\r?\n/);

  const id = filename.slice(0, 3);

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

  const type = typeMatch ? typeMatch[1].trim() : "";
  const status = forceStatus || (statusMatch ? statusMatch[1].trim() : "");

  let blockedBy = [];
  if (blockedMatch) {
    blockedBy = blockedMatch[1]
      .split(/[,\s]+/)
      .map((s) => s.trim())
      .filter((s) => /^\d{3}$/.test(s));
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

  return { id, title, type, status, blockedBy, done, total };
}

function parseTasks(plansDir) {
  const pendingDir = path.join(plansDir, "pending");
  const completedDir = path.join(plansDir, "completed");

  const pendingFiles = readMdFiles(pendingDir);
  const completedFiles = readMdFiles(completedDir);

  const completedIds = new Set();
  for (const f of completedFiles) {
    completedIds.add(f.slice(0, 3));
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
    completed: completedFiles.length,
  };

  for (const t of tasks) {
    if (t.status === "pending") summary.pending++;
    else if (t.status === "elaborated") summary.elaborated++;
    else if (t.status === "in-progress") summary.inProgress++;
    else if (t.status === "review") summary.review++;
  }

  tasks.sort((a, b) => {
    const ai = STATUS_ORDER.indexOf(a.status);
    const bi = STATUS_ORDER.indexOf(b.status);
    const aKey = ai === -1 ? STATUS_ORDER.length : ai;
    const bKey = bi === -1 ? STATUS_ORDER.length : bi;
    if (aKey !== bKey) return aKey - bKey;
    return a.id.localeCompare(b.id);
  });

  return { tasks, summary };
}

module.exports = { parseTasks };
