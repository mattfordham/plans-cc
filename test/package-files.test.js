const { test } = require("node:test");
const assert = require("node:assert");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

// bin/install.js copies these from the packaged tarball. A path missing from
// package.json "files" is silently absent from npx installs, and the installer
// skips it without error — so assert the tarball actually ships each one.
const REQUIRED = [
  "bin/install.js",
  "bin/dashboard.js",
  "bin/plan-touch.js",
  "bin/plans-git.js",
  "lib/plans-git.js",
  "skills/plan-execute/SKILL.md",
  "agents/plan-executor.md",
];

test("npm package ships every path the installer copies", () => {
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: path.join(__dirname, ".."),
    encoding: "utf8",
  });
  assert.strictEqual(result.status, 0, result.stderr);
  const packed = new Set(JSON.parse(result.stdout)[0].files.map((f) => f.path));
  for (const file of REQUIRED) {
    assert.ok(packed.has(file), `${file} missing from npm package`);
  }
});
