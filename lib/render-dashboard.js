const blessed = require("blessed");

const COLORS = {
  banner: "#a89984",
  project: "#ebdbb2",
  branch: "#7c6f64",
  border: "#504945",
  label: "#a89984",
  inProgress: "#ebdbb2",
  review: "#458588",
  inReview: "#d3869b",
  elaborated: "#d5c4a1",
  pending: "#665c54",
  blocked: "#cc6666",
  completed: "#8ec07c",
  id: "#ebdbb2",
  type: "#665c54",
  barEmpty: "#3c3836",
  hint: "#665c54",
};

const STAT_CARDS = [
  { key: "pending", label: "pending", color: COLORS.pending },
  { key: "elaborated", label: "ready", color: COLORS.elaborated },
  { key: "inProgress", label: "in progress", color: COLORS.inProgress },
  { key: "review", label: "ready for review", color: COLORS.review },
  { key: "inReview", label: "in review", color: COLORS.inReview },
  { key: "completed", label: "completed", color: COLORS.completed },
];

const STAT_SEPARATOR = " · ";

// Single-row title banner — one color per letter of "PLANS"
const BANNER_LETTER_COLORS = [
  COLORS.blocked,
  COLORS.elaborated,
  COLORS.completed,
  COLORS.review,
  COLORS.inReview,
];
const BANNER_LETTERS = "PLANS";

function colorForTask(task) {
  if (task.isBlocked) return COLORS.blocked;
  if (task.status === "in-progress") return COLORS.inProgress;
  if (task.status === "in-review") return COLORS.inReview;
  if (task.status === "review") return COLORS.review;
  if (task.status === "elaborated") return COLORS.elaborated;
  if (task.status === "pending") return COLORS.pending;
  return COLORS.id;
}

function glyphFor(task) {
  if (task.isBlocked) return "⊘";
  if (task.status === "in-progress") return "▶";
  if (task.status === "in-review") return "◉";
  if (task.status === "review") return "★";
  if (task.status === "elaborated") return "○";
  if (task.status === "pending") return "·";
  return " ";
}

function padRight(text, width) {
  if (text.length >= width) return text.slice(0, width);
  return text + " ".repeat(width - text.length);
}

function fg(color, text) {
  return "{" + color + "-fg}" + text + "{/" + color + "-fg}";
}

function buildStatsContent(summary) {
  const segments = STAT_CARDS.map((card) =>
    fg(card.color, (summary[card.key] || 0) + " " + card.label)
  );
  return "  " + segments.join(fg(COLORS.hint, STAT_SEPARATOR));
}

function buildHeaderContent({ branches, project }) {
  const lines = [];
  let banner = "  ";
  for (let i = 0; i < BANNER_LETTERS.length; i++) {
    banner += "{bold}" + fg(BANNER_LETTER_COLORS[i], BANNER_LETTERS[i]) + "{/bold}";
  }
  lines.push(banner);
  if (project) {
    lines.push(" " + fg(COLORS.project, "  " + project));
  }
  const b = branches || { root: null, subRepos: [] };
  if (b.root) {
    lines.push(" " + fg(COLORS.branch, "  branch: " + b.root));
  }
  if (b.subRepos && b.subRepos.length > 0) {
    const nameWidth = Math.max(...b.subRepos.map((r) => r.name.length));
    const header = b.subRepos.length === 1 ? "sub-repo:" : "sub-repos:";
    lines.push(" " + fg(COLORS.branch, "  " + header));
    for (const r of b.subRepos) {
      const paddedName = padRight(r.name, nameWidth);
      lines.push(
        " " + fg(COLORS.branch, "    " + paddedName + " → " + (r.branch || "—"))
      );
    }
  }
  return lines.join("\n");
}

function buildTaskLine(task) {
  const color = colorForTask(task);
  const glyph = glyphFor(task);
  const parts = [];
  parts.push(fg(color, glyph));
  parts.push(fg(COLORS.id, task.id));
  parts.push(fg(color, task.title));
  if (task.type) {
    parts.push(fg(COLORS.type, "[" + task.type + "]"));
  }
  if (task.isBlocked) {
    parts.push(fg(COLORS.blocked, "[BLOCKED]"));
  }
  if (task.total > 0) {
    parts.push(fg(color, task.done + "/" + task.total));
  }
  return parts.join(" ");
}

function buildTasksContent(tasks) {
  if (!tasks || tasks.length === 0) {
    return "\n" + fg(COLORS.pending, "no active tasks — /plan-capture to add one");
  }
  return tasks.map(buildTaskLine).join("\n");
}

function buildFooterContent() {
  const legend =
    fg(COLORS.inProgress, "▶") + " In Progress   " +
    fg(COLORS.review, "★") + " Ready for Review   " +
    fg(COLORS.inReview, "◉") + " In Review   " +
    fg(COLORS.elaborated, "○") + " Ready   " +
    fg(COLORS.pending, "·") + " Pending   " +
    fg(COLORS.blocked, "⊘") + " Blocked";
  const hint = fg(COLORS.hint, "press q or Ctrl+C to exit");
  return legend + "\n" + hint;
}

function buildLayout(screen) {
  const headerBox = blessed.box({
    top: 0,
    left: 0,
    width: "100%",
    height: 6,
    tags: true,
    style: { fg: "white" },
  });

  const statsBox = blessed.box({
    top: 7,
    left: 0,
    width: "100%",
    height: 1,
    tags: true,
    style: { fg: "white" },
  });

  const tasksBox = blessed.box({
    top: 11,
    left: 0,
    width: "100%",
    height: "100%-14",
    tags: true,
    scrollable: true,
    alwaysScroll: true,
    keys: true,
    mouse: true,
    padding: { left: 2, right: 2 },
    border: { type: "line" },
    label: " ACTIVE TASKS ",
    style: {
      fg: "white",
      border: { fg: COLORS.border },
      label: { fg: COLORS.label },
    },
  });

  const footerBox = blessed.box({
    bottom: 0,
    left: 0,
    width: "100%",
    height: 3,
    tags: true,
    padding: { left: 2 },
    style: { fg: "white" },
  });

  screen.append(headerBox);
  screen.append(statsBox);
  screen.append(tasksBox);
  screen.append(footerBox);

  return { headerBox, statsBox, tasksBox, footerBox };
}

const STATS_HEIGHT = 1;
const HEADER_STATS_GAP = 1;
const STATS_TASKS_GAP = 1;
const FOOTER_HEIGHT = 3;

function updateLayout(widgets, { tasks, summary, branches, project }) {
  const { headerBox, statsBox, tasksBox, footerBox } = widgets;
  const headerContent = buildHeaderContent({ branches, project });
  const headerHeight = headerContent.split("\n").length;

  headerBox.height = headerHeight;
  statsBox.top = headerHeight + HEADER_STATS_GAP;
  statsBox.height = STATS_HEIGHT;
  tasksBox.top = headerHeight + HEADER_STATS_GAP + STATS_HEIGHT + STATS_TASKS_GAP;
  tasksBox.height =
    "100%-" + (tasksBox.top + FOOTER_HEIGHT);

  headerBox.setContent(headerContent);
  statsBox.setContent(buildStatsContent(summary || {}));
  tasksBox.setContent(buildTasksContent(tasks || []));
  footerBox.setContent(buildFooterContent());
}

module.exports = { buildLayout, updateLayout };
