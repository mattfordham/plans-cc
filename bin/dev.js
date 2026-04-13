#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SKILLS_PREFIX = "plan-";
const AGENTS_PREFIX = "plan-";
const HOME = require("os").homedir();
const TARGET_DIR = path.join(HOME, ".claude", "skills");
const SOURCE_DIR = path.join(__dirname, "..", "skills");
const AGENTS_SOURCE = path.join(__dirname, "..", "agents");
const AGENTS_TARGET = path.join(HOME, ".claude", "agents");
const REPO_ROOT = path.join(__dirname, "..");
const DASHBOARD_SOURCE = path.join(__dirname, "dashboard.js");
const LIB_SOURCE = path.join(REPO_ROOT, "lib");
const NODE_MODULES_SOURCE = path.join(REPO_ROOT, "node_modules");
const RUNTIME_TARGET = path.join(HOME, ".claude", "plans-cc");
const LAUNCHER_DIR = path.join(HOME, ".claude", "bin");
const LAUNCHER_PATH = path.join(LAUNCHER_DIR, "plans-cc-dashboard");

function launcherDirOnPath() {
  const envPath = process.env.PATH || "";
  return envPath.split(path.delimiter).includes(LAUNCHER_DIR);
}

function linkDashboardRuntime() {
  // Tear down any previous install/symlinks so reruns are idempotent.
  fs.rmSync(RUNTIME_TARGET, { recursive: true, force: true });
  fs.mkdirSync(RUNTIME_TARGET, { recursive: true });

  // Symlink dashboard entry, lib dir, and node_modules back to the repo.
  fs.symlinkSync(DASHBOARD_SOURCE, path.join(RUNTIME_TARGET, "dashboard.js"), "file");
  fs.symlinkSync(LIB_SOURCE, path.join(RUNTIME_TARGET, "lib"), "dir");
  fs.symlinkSync(NODE_MODULES_SOURCE, path.join(RUNTIME_TARGET, "node_modules"), "dir");

  // Launcher shim.
  if (!fs.existsSync(LAUNCHER_DIR)) {
    fs.mkdirSync(LAUNCHER_DIR, { recursive: true });
  }
  fs.rmSync(LAUNCHER_PATH, { force: true });
  const shim = `#!/usr/bin/env bash\nexec node "$HOME/.claude/plans-cc/dashboard.js" "$@"\n`;
  fs.writeFileSync(LAUNCHER_PATH, shim);
  fs.chmodSync(LAUNCHER_PATH, 0o755);
}

function main() {
  console.log("\n  plans-cc dev — Symlinking skills for development\n");

  // Ensure target directory exists
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // Remove existing plan-* skill directories (real or symlinks)
  const existing = fs.readdirSync(TARGET_DIR).filter((d) => d.startsWith(SKILLS_PREFIX));
  for (const dir of existing) {
    const fullPath = path.join(TARGET_DIR, dir);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
  if (existing.length > 0) {
    console.log(`  Removed ${existing.length} existing plan-* skill(s)`);
  }

  // Symlink skills from source to target
  const skills = fs.readdirSync(SOURCE_DIR).filter((d) => {
    return fs.statSync(path.join(SOURCE_DIR, d)).isDirectory();
  });

  let linked = 0;
  for (const skill of skills) {
    const srcDir = path.join(SOURCE_DIR, skill);
    const destDir = path.join(TARGET_DIR, skill);
    fs.symlinkSync(srcDir, destDir, "dir");
    linked++;
  }

  console.log(`  Symlinked ${linked} skill(s):\n`);
  for (const skill of skills.sort()) {
    console.log(`    ${TARGET_DIR}/${skill} -> ${SOURCE_DIR}/${skill}`);
  }

  // Symlink agents
  if (fs.existsSync(AGENTS_SOURCE)) {
    // Ensure agents directory exists
    if (!fs.existsSync(AGENTS_TARGET)) {
      fs.mkdirSync(AGENTS_TARGET, { recursive: true });
    }

    // Remove existing plan-* agents (real files or symlinks)
    const existingAgents = fs.readdirSync(AGENTS_TARGET).filter((f) => f.startsWith(AGENTS_PREFIX) && f.endsWith(".md"));
    for (const file of existingAgents) {
      fs.unlinkSync(path.join(AGENTS_TARGET, file));
    }
    if (existingAgents.length > 0) {
      console.log(`  Removed ${existingAgents.length} existing plan-* agent(s)`);
    }

    // Symlink agents
    const agentFiles = fs.readdirSync(AGENTS_SOURCE).filter((f) => f.endsWith(".md"));
    for (const file of agentFiles) {
      fs.symlinkSync(
        path.join(AGENTS_SOURCE, file),
        path.join(AGENTS_TARGET, file)
      );
    }

    if (agentFiles.length > 0) {
      console.log(`  Symlinked ${agentFiles.length} agent(s):\n`);
      for (const file of agentFiles.sort()) {
        console.log(`    ${AGENTS_TARGET}/${file} -> ${AGENTS_SOURCE}/${file}`);
      }
      console.log();
    }
  }

  // Wire up the dashboard runtime via symlinks so repo edits are live.
  try {
    linkDashboardRuntime();
    console.log(`  Symlinked dashboard runtime:`);
    console.log(`    ${RUNTIME_TARGET}/dashboard.js -> ${DASHBOARD_SOURCE}`);
    console.log(`    ${RUNTIME_TARGET}/lib -> ${LIB_SOURCE}`);
    console.log(`    ${RUNTIME_TARGET}/node_modules -> ${NODE_MODULES_SOURCE}`);
    console.log(`  Launcher: ${LAUNCHER_PATH}\n`);
    if (!launcherDirOnPath()) {
      console.log("  Add ~/.claude/bin to your PATH to run `plans-cc-dashboard` from anywhere:");
      console.log('    export PATH="$HOME/.claude/bin:$PATH"\n');
    }
  } catch (err) {
    console.log(`  Dashboard runtime not linked: ${err.message}\n`);
  }

  console.log("  Edits to skills/ and agents/ are now live. No reinstall needed.\n");
}

main();
