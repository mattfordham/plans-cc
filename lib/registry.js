const fs = require("fs");
const path = require("path");
const os = require("os");

const RUNTIME_DIR = path.join(os.homedir(), ".claude", "plans-cc");
const REGISTRY_FILE = path.join(RUNTIME_DIR, "projects.json");

function emptyRegistry() {
  return { version: 1, projects: [] };
}

// Read and parse the registry. Never throws — a missing, unreadable, or
// corrupt registry is treated as empty.
function loadRegistry() {
  try {
    const raw = fs.readFileSync(REGISTRY_FILE, "utf8");
    const data = JSON.parse(raw);
    if (!data || typeof data !== "object" || !Array.isArray(data.projects)) {
      return emptyRegistry();
    }
    return { version: 1, projects: data.projects };
  } catch (_) {
    return emptyRegistry();
  }
}

// Atomically write the registry to disk. Never throws.
function saveRegistry(registry) {
  try {
    fs.mkdirSync(RUNTIME_DIR, { recursive: true });
    const tmp = REGISTRY_FILE + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(registry, null, 2) + "\n");
    fs.renameSync(tmp, REGISTRY_FILE);
  } catch (_) {
    // best-effort — swallow
  }
}

// Recover the true project root from any path that sits inside a
// .worktrees/<name>/ tree. plan-execute runs every command from inside the
// worktree (cd .worktrees/NNN-slug && …), so $PWD — and thus the registered
// path — can be a worktree path. Stripping from the .worktrees segment onward
// ensures worktree paths can never enter the registry.
function normalizeProjectRoot(projectRoot) {
  const resolved = path.resolve(projectRoot);
  const parts = resolved.split(path.sep);
  const i = parts.indexOf(".worktrees");
  if (i === -1) return resolved;
  return parts.slice(0, i).join(path.sep) || path.sep;
}

// True if the registered project ROOT directory still exists. We deliberately
// do NOT require <root>/.plans to resolve: in worktree workflows .plans is a
// symlink that dangles after teardown, and fs.existsSync() on a dangling
// symlink returns false — which would wrongly prune a live project (and, via
// saveRegistry, can empty projects.json entirely). statSync follows symlinks
// and throws only when the root itself is gone, so we prune solely on that.
function hasPlansDir(projectPath) {
  try {
    return fs.statSync(projectPath).isDirectory();
  } catch (_) {
    return false;
  }
}

// Return the list of registered projects, filtering out any whose .plans/
// directory no longer exists (live prune). Returns [] on any error.
function readProjects() {
  try {
    return loadRegistry().projects.filter((entry) => hasPlansDir(entry.path));
  } catch (_) {
    return [];
  }
}

// Prune dead entries and write the cleaned registry back to disk. Never throws.
function pruneProjects() {
  try {
    const projects = readProjects();
    saveRegistry({ version: 1, projects });
    return projects;
  } catch (_) {
    return [];
  }
}

// Record a touch of the given project root. The path is first normalized to the
// true project root (worktree paths are stripped back to their parent), then
// deduped by exact absolute path string; updates lastSeen if already present,
// otherwise appends. Never throws.
function registerProject(projectRoot) {
  try {
    const resolved = normalizeProjectRoot(projectRoot);
    const registry = loadRegistry();
    const now = new Date().toISOString();
    const existing = registry.projects.find((entry) => entry.path === resolved);
    if (existing) {
      existing.lastSeen = now;
    } else {
      registry.projects.push({ path: resolved, lastSeen: now });
    }
    saveRegistry(registry);
  } catch (_) {
    // best-effort — swallow
  }
}

module.exports = {
  registerProject,
  readProjects,
  pruneProjects,
  normalizeProjectRoot,
};
