const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");

// A per-project PID lock for the terminal dashboard, so launching a second
// dashboard for the same project refuses rather than silently running two
// process-storms side by side.
//
// The lock file lives OUTSIDE .plans/ — at
// ~/.claude/plans-cc/dashboards/<sha1(projectRoot)>.pid — deliberately: a file
// inside .plans/ would be committed (and, worse, would retrigger the recursive
// fs.watch on every acquire/release). The sha1 of the absolute project root
// gives a stable, collision-free name per project.
//
// Liveness is probed with process.kill(pid, 0) (injectable for tests): it
// throws ESRCH for a dead PID and returns for a live one. A stale lock from a
// crashed dashboard (dead PID) or a garbage/unparseable file is taken over; a
// live owner is refused.

const DASH_SUBDIR = path.join(".claude", "plans-cc", "dashboards");

// Default dashboards dir: ~/.claude/plans-cc/dashboards. Overridable for tests.
function defaultDashDir() {
  return path.join(os.homedir(), DASH_SUBDIR);
}

// Deterministic lock path for a project root under a dashboards dir.
function lockPathFor(projectRoot, dashDir) {
  const sha1 = crypto.createHash("sha1").update(projectRoot).digest("hex");
  return path.join(dashDir, sha1 + ".pid");
}

// Default liveness probe: process.kill(pid, 0) returns for a live PID and
// throws (ESRCH) for a dead one. Any throw ⇒ not alive (take over).
function defaultIsAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function createPidLock(opts) {
  const o = opts || {};
  const root = o.root;
  const dashDir = o.dashDir || defaultDashDir();
  const pid = o.pid !== undefined ? o.pid : process.pid;
  const isAlive = o.isAlive || defaultIsAlive;
  const file = lockPathFor(root, dashDir);

  function writeOurs() {
    fs.mkdirSync(dashDir, { recursive: true });
    fs.writeFileSync(file, String(pid) + "\n");
  }

  // Try to acquire the lock. Returns { ok: true } on success (we now own the
  // file), or { ok: false, pid: <owner> } when a live owner holds it.
  function acquire() {
    fs.mkdirSync(dashDir, { recursive: true });
    try {
      // Exclusive create: succeeds only when no lock exists.
      fs.writeFileSync(file, String(pid) + "\n", { flag: "wx" });
      return { ok: true };
    } catch (err) {
      if (err && err.code !== "EEXIST") throw err;
    }
    // A lock already exists — decide whether to take it over.
    let owner = null;
    try {
      const raw = fs.readFileSync(file, "utf8").trim();
      const n = Number(raw);
      if (raw !== "" && Number.isInteger(n) && n > 0) owner = n;
    } catch (_) {
      owner = null; // unreadable ⇒ treat as garbage ⇒ take over
    }
    if (owner !== null && isAlive(owner)) {
      return { ok: false, pid: owner };
    }
    // Dead PID or garbage/unparseable ⇒ take over.
    writeOurs();
    return { ok: true };
  }

  // Release the lock, but only if we still own it — never clobber a foreign
  // lock a newer dashboard may have taken.
  function release() {
    try {
      const raw = fs.readFileSync(file, "utf8").trim();
      if (raw === String(pid)) fs.unlinkSync(file);
    } catch (_) {
      // nothing to release / already gone
    }
  }

  return { acquire, release, file };
}

// Wire process exit paths so a dashboard releases its lock when the terminal
// goes away (SIGHUP) or stdin closes ('end'). onExit (release) runs at most
// once, then exit() is called.
function installExitHandlers(opts) {
  const o = opts || {};
  const proc = o.proc;
  const stdin = o.stdin;
  const exit = o.exit || (() => {});
  const onExit = o.onExit || (() => {});
  let fired = false;
  function handle() {
    if (!fired) {
      fired = true;
      onExit();
    }
    exit(0);
  }
  if (proc && typeof proc.on === "function") proc.on("SIGHUP", handle);
  if (stdin && typeof stdin.on === "function") {
    stdin.on("end", handle);
    // Resume so a flowing/paused stdin can still emit 'end'.
    if (typeof stdin.resume === "function") {
      try {
        stdin.resume();
      } catch (_) {
        // best effort
      }
    }
  }
}

module.exports = { createPidLock, lockPathFor, installExitHandlers, defaultDashDir };
