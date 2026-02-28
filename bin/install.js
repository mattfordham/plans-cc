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

  console.log("  Run /plan-help in Claude Code to get started.\n");
}

main();
