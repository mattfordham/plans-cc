const { test } = require("node:test");
const assert = require("node:assert");

const { buildHeaderContent, COLORS } = require("../lib/render-dashboard");

const BASE = {
  project: "demo",
  branches: { root: "main", rootDirty: false, subRepos: [] },
};

function fg(color, text) {
  return "{" + color + "-fg}" + text + "{/" + color + "-fg}";
}

function plansLine(header) {
  return header.split("\n").find((l) => l.includes("plans:"));
}

function branchSync(overrides = {}) {
  return {
    mode: "branch",
    branch: "plans",
    remote: "origin",
    upstream: true,
    ahead: 0,
    behind: 0,
    rebaseStuck: false,
    ...overrides,
  };
}

test("buildHeaderContent: no sync input adds no plans line", () => {
  const header = buildHeaderContent(BASE);
  assert.strictEqual(plansLine(header), undefined);
});

test("buildHeaderContent: mode none is byte-identical to no sync input", () => {
  const without = buildHeaderContent(BASE);
  const withNone = buildHeaderContent({ ...BASE, sync: { mode: "none" } });
  assert.strictEqual(withNone, without);
});

test("buildHeaderContent: null sync is byte-identical to no sync input", () => {
  assert.strictEqual(
    buildHeaderContent({ ...BASE, sync: null }),
    buildHeaderContent(BASE)
  );
});

test("buildHeaderContent: plans line sits directly under the branch line", () => {
  const lines = buildHeaderContent({ ...BASE, sync: { mode: "local" } }).split("\n");
  const branchIdx = lines.findIndex((l) => l.includes("branch: main"));
  assert.ok(branchIdx >= 0);
  assert.ok(lines[branchIdx + 1].includes("plans:"));
});

test("buildHeaderContent: plans line is added even when there is no branch line", () => {
  const lines = buildHeaderContent({
    project: "demo",
    branches: { root: null, subRepos: [] },
    sync: { mode: "local" },
  }).split("\n");
  assert.ok(lines[lines.length - 1].includes("plans: local"));
});

test("buildHeaderContent: the plans line adds exactly one header line", () => {
  const base = buildHeaderContent(BASE).split("\n").length;
  const withSync = buildHeaderContent({ ...BASE, sync: branchSync({ ahead: 2, behind: 1 }) })
    .split("\n").length;
  assert.strictEqual(withSync, base + 1);
});

for (const mode of ["local", "inline"]) {
  test(`buildHeaderContent: ${mode} mode shows a quiet label`, () => {
    const line = plansLine(buildHeaderContent({ ...BASE, sync: { mode } }));
    assert.strictEqual(line, " " + fg(COLORS.branch, "  plans: " + mode));
  });
}

test("buildHeaderContent: branch mode in sync shows a clean check", () => {
  const line = plansLine(buildHeaderContent({ ...BASE, sync: branchSync() }));
  assert.strictEqual(
    line,
    " " + fg(COLORS.branch, "  plans: branch") + " " + fg(COLORS.clean, "✓")
  );
});

test("buildHeaderContent: unpushed commits show ↑N in the dirty color", () => {
  const line = plansLine(buildHeaderContent({ ...BASE, sync: branchSync({ ahead: 3 }) }));
  assert.ok(line.includes(fg(COLORS.dirty, "↑3")), line);
  assert.ok(!line.includes("✓"), line);
});

test("buildHeaderContent: behind shows ↓N (as of last fetch)", () => {
  const line = plansLine(buildHeaderContent({ ...BASE, sync: branchSync({ behind: 2 }) }));
  assert.ok(line.includes("↓2"), line);
  assert.ok(line.includes("(as of last fetch)"), line);
  assert.ok(!line.includes("✓"), line);
});

test("buildHeaderContent: ahead and behind both show", () => {
  const line = plansLine(
    buildHeaderContent({ ...BASE, sync: branchSync({ ahead: 1, behind: 4 }) })
  );
  assert.ok(line.includes("↑1"), line);
  assert.ok(line.includes("↓4"), line);
});

test("buildHeaderContent: no upstream shows a warning label", () => {
  const line = plansLine(buildHeaderContent({ ...BASE, sync: branchSync({ upstream: false }) }));
  assert.ok(line.includes(fg(COLORS.dirty, "⚠ no upstream")), line);
  assert.ok(!line.includes("✓"), line);
});

test("buildHeaderContent: stuck rebase shows a warning in the blocked color", () => {
  const line = plansLine(
    buildHeaderContent({ ...BASE, sync: branchSync({ rebaseStuck: true }) })
  );
  assert.ok(line.includes(fg(COLORS.blocked, "⚠ rebase stuck")), line);
  assert.ok(!line.includes("✓"), line);
});

test("buildHeaderContent: is exported as a pure string builder", () => {
  // Requiring the module loads blessed but creates no screen, so the header
  // builder is callable without a terminal.
  assert.strictEqual(typeof buildHeaderContent, "function");
  assert.strictEqual(typeof buildHeaderContent(BASE), "string");
});
