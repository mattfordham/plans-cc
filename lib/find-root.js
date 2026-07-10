const fs = require("fs");
const path = require("path");
const os = require("os");
const { normalizeProjectRoot } = require("./registry");

// True if <dir>/.plans/config.json exists. Best-effort — any filesystem error
// (permissions, ENOENT, a non-directory in the way) reads as "not a root".
function hasPlansConfig(dir) {
  try {
    return fs.statSync(path.join(dir, ".plans", "config.json")).isFile();
  } catch (_) {
    return false;
  }
}

// Ascend from startDir to the nearest ancestor containing .plans/config.json,
// returning its absolute path — or null if none is found. This is the shared
// project-root discovery walk (see CLAUDE.md "Project-root discovery"):
//
//   - First hit wins: a nested .plans/ closer to cwd shadows a centralized
//     ancestor, preserving any per-repo setup.
//   - Stop conditions: $HOME (inclusive) and the filesystem root. A root above
//     $HOME still resolves — its walk never reaches $HOME and terminates at the
//     filesystem root instead.
//   - Never throws: a permissions error on any probe simply ends the walk with
//     null, so a skill's init check can't crash.
//
// The .worktrees collapse is delegated to registry.normalizeProjectRoot, which
// runs FIRST: a startDir inside .worktrees/<name>/ collapses to the path just
// above .worktrees before we begin ascending. In a worktree .plans is a symlink
// to the parent, so the parent IS the root; collapsing first also guarantees we
// can never return a .plans/ that lives inside the worktree. This does not pull
// a review out of its worktree — which checkout a skill works in is decided
// separately, from the task's **Worktree:** field.
function findProjectRoot(startDir) {
  try {
    const home = path.resolve(os.homedir());
    let dir = normalizeProjectRoot(startDir);

    while (true) {
      if (hasPlansConfig(dir)) return dir;
      if (dir === home) return null;
      const parent = path.dirname(dir);
      if (parent === dir) return null;
      dir = parent;
    }
  } catch (_) {
    return null;
  }
}

module.exports = { findProjectRoot };
