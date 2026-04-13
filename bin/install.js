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
const DASHBOARD_SOURCE = path.join(__dirname, "dashboard.js");
const LIB_SOURCE = path.join(__dirname, "..", "lib");
const RUNTIME_TARGET = path.join(HOME, ".claude", "plans-cc");
const LAUNCHER_DIR = path.join(HOME, ".claude", "bin");
const LAUNCHER_PATH = path.join(LAUNCHER_DIR, "plans-cc-dashboard");

// Recursively collect a package and all of its runtime deps, resolved from
// this package's own node_modules tree. Returns a map of pkgName -> dir.
function collectRuntimeDeps(pkgName, seen) {
  if (seen.has(pkgName)) return;
  let pkgJsonPath;
  try {
    pkgJsonPath = require.resolve(`${pkgName}/package.json`);
  } catch (err) {
    throw new Error(`cannot resolve ${pkgName}: ${err.message}`);
  }
  const pkgDir = path.dirname(pkgJsonPath);
  const pkgJson = JSON.parse(fs.readFileSync(pkgJsonPath, "utf8"));
  seen.set(pkgName, pkgDir);
  const deps = pkgJson.dependencies || {};
  for (const dep of Object.keys(deps)) {
    collectRuntimeDeps(dep, seen);
  }
}

function installDashboardRuntime() {
  // Remove prior install so upgrades are clean.
  if (fs.existsSync(RUNTIME_TARGET)) {
    fs.rmSync(RUNTIME_TARGET, { recursive: true, force: true });
  }
  fs.mkdirSync(RUNTIME_TARGET, { recursive: true });

  // Copy dashboard entry point and lib helpers.
  fs.cpSync(DASHBOARD_SOURCE, path.join(RUNTIME_TARGET, "dashboard.js"));
  fs.cpSync(LIB_SOURCE, path.join(RUNTIME_TARGET, "lib"), { recursive: true });

  // Walk runtime deps starting from blessed, copy each into node_modules/.
  const nodeModulesTarget = path.join(RUNTIME_TARGET, "node_modules");
  fs.mkdirSync(nodeModulesTarget, { recursive: true });
  const pkgMap = new Map();
  collectRuntimeDeps("blessed", pkgMap);
  for (const [name, srcDir] of pkgMap.entries()) {
    const destDir = path.join(nodeModulesTarget, name);
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    fs.cpSync(srcDir, destDir, { recursive: true, dereference: true });
  }

  // Write the launcher shim.
  if (!fs.existsSync(LAUNCHER_DIR)) {
    fs.mkdirSync(LAUNCHER_DIR, { recursive: true });
  }
  // fs.rmSync with force removes files/symlinks and ignores ENOENT.
  fs.rmSync(LAUNCHER_PATH, { force: true });
  const shim = `#!/usr/bin/env bash\nexec node "$HOME/.claude/plans-cc/dashboard.js" "$@"\n`;
  fs.writeFileSync(LAUNCHER_PATH, shim);
  fs.chmodSync(LAUNCHER_PATH, 0o755);
}

function launcherDirOnPath() {
  const envPath = process.env.PATH || "";
  return envPath.split(path.delimiter).includes(LAUNCHER_DIR);
}

function main() {
  console.log("\n  plans-cc — Installing skills to ~/.claude/skills/\n");

  // Ensure target directory exists
  if (!fs.existsSync(TARGET_DIR)) {
    fs.mkdirSync(TARGET_DIR, { recursive: true });
  }

  // Remove existing plan-* skill directories
  const existing = fs.readdirSync(TARGET_DIR).filter((d) => d.startsWith(SKILLS_PREFIX));
  for (const dir of existing) {
    const fullPath = path.join(TARGET_DIR, dir);
    fs.rmSync(fullPath, { recursive: true, force: true });
  }
  if (existing.length > 0) {
    console.log(`  Removed ${existing.length} existing plan-* skill(s)`);
  }

  // Copy skills from package to target
  const skills = fs.readdirSync(SOURCE_DIR).filter((d) => {
    return fs.statSync(path.join(SOURCE_DIR, d)).isDirectory();
  });

  let installed = 0;
  for (const skill of skills) {
    const srcDir = path.join(SOURCE_DIR, skill);
    const destDir = path.join(TARGET_DIR, skill);
    fs.mkdirSync(destDir, { recursive: true });

    const files = fs.readdirSync(srcDir);
    for (const file of files) {
      fs.copyFileSync(path.join(srcDir, file), path.join(destDir, file));
    }
    installed++;
  }

  console.log(`  Installed ${installed} skill(s):\n`);
  for (const skill of skills.sort()) {
    console.log(`    /${skill}`);
  }

  // Install agents
  if (fs.existsSync(AGENTS_SOURCE)) {
    // Ensure agents directory exists
    if (!fs.existsSync(AGENTS_TARGET)) {
      fs.mkdirSync(AGENTS_TARGET, { recursive: true });
    }

    // Remove existing plan-* agents
    const existingAgents = fs.readdirSync(AGENTS_TARGET).filter((f) => f.startsWith(AGENTS_PREFIX) && f.endsWith(".md"));
    for (const file of existingAgents) {
      fs.unlinkSync(path.join(AGENTS_TARGET, file));
    }
    if (existingAgents.length > 0) {
      console.log(`  Removed ${existingAgents.length} existing plan-* agent(s)`);
    }

    // Copy agents
    const agentFiles = fs.readdirSync(AGENTS_SOURCE).filter((f) => f.endsWith(".md"));
    for (const file of agentFiles) {
      fs.copyFileSync(
        path.join(AGENTS_SOURCE, file),
        path.join(AGENTS_TARGET, file)
      );
    }

    if (agentFiles.length > 0) {
      console.log(`  Installed ${agentFiles.length} agent(s):\n`);
      for (const file of agentFiles.sort()) {
        console.log(`    ${file.replace(".md", "")}`);
      }
      console.log();
    }
  }

  // Install the dashboard runtime (dashboard.js + lib + blessed) to a
  // persistent location so `plans-cc-dashboard` works after `npx plans-cc`.
  try {
    installDashboardRuntime();
    console.log(`  Installed dashboard runtime to ~/.claude/plans-cc/`);
    console.log(`  Launcher: ~/.claude/bin/plans-cc-dashboard\n`);
    if (!launcherDirOnPath()) {
      console.log("  Add ~/.claude/bin to your PATH to run `plans-cc-dashboard` from anywhere:");
      console.log('    export PATH="$HOME/.claude/bin:$PATH"\n');
    }
  } catch (err) {
    console.log(`  Dashboard runtime not installed: ${err.message}. Run 'npm install' in the plans-cc package directory, or reinstall via npx.\n`);
  }

  console.log("  Run /plan-help in Claude Code to get started.\n");
}

main();
