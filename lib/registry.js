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

// True if the given project root still contains a .plans/ directory.
function hasPlansDir(projectPath) {
  try {
    return fs.existsSync(path.join(projectPath, ".plans"));
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

// Record a touch of the given project root. Dedupes by exact absolute path
// string (no symlink canonicalization); updates lastSeen if already present,
// otherwise appends. Never throws.
function registerProject(projectRoot) {
  try {
    const resolved = path.resolve(projectRoot);
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

module.exports = { registerProject, readProjects, pruneProjects };
