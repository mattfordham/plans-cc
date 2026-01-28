#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SKILLS_PREFIX = "plan-";
const HOME = require("os").homedir();
const TARGET_DIR = path.join(HOME, ".claude", "skills");
const SOURCE_DIR = path.join(__dirname, "..", "skills");

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

  console.log("\n  Run /plan-help in Claude Code to get started.\n");
}

main();
