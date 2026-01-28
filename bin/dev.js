#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const SKILLS_PREFIX = "plan-";
const HOME = require("os").homedir();
const TARGET_DIR = path.join(HOME, ".claude", "skills");
const SOURCE_DIR = path.join(__dirname, "..", "skills");

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

  console.log("\n  Edits to skills/ are now live. No reinstall needed.\n");
}

main();
