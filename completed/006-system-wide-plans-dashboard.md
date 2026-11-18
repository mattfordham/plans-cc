# System-wide plans registry + desktop app handoff spec

**ID:** 006
**Created:** 2026-04-13T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-06-04T21:15
**Branch:** feature/006-system-wide-plans-dashboard

## What

Two deliverables, both produced in this repo:

1. **Self-registering project registry (JS, this repo).** Maintain a machine-wide index of every project that uses plans-cc, written to `~/.claude/plans-cc/projects.json`. Projects self-register on any "touch" (per-project dashboard launch, `plan-init`, `plan-capture`). No filesystem scans, no manual `/plan-register`. This is the *producer* of the registry data.

2. **Desktop app handoff spec (markdown, this repo).** A standalone requirements-and-contract document (`.plans/artifacts/desktop-app-spec.md`) describing a separate macOS Swift app — a menu bar "glance" surface plus a cross-project browser window — that *consumes* the registry. The app itself is built elsewhere by a different agent in its own project/directory; this task produces only the registry it depends on and the spec that defines it.

The registry file is the contract between the two halves: JS writes it, the future Swift app reads it. Neither needs to know how the other is implemented.

Key decisions already made:
- **Self-registering projects**: write absolute path to `~/.claude/plans-cc/projects.json` on any touch (project dashboard launch, `plan-init`, `plan-capture`). No filesystem scans, no manual `/plan-register` step.
- **Registry is the only seam**: this task ships the producer (registry) + the spec. The consumer (Swift menu bar + cross-project window) is a separate deliverable built in another directory. No Swift code or terminal global-UI lives here.
- **Spec is requirements + contract only**: define what the app must do and the data contracts (registry JSON schema, `.plans/` markdown format + parse rules). Leave UI layout and architecture choices to the building agent.
- **Registration hook scope**: only `plan-init`, `plan-capture`, and the per-project dashboard register. Other skills piggyback — anyone who has ever captured or init'd will already be in the registry. Avoids editing 27 SKILL.md files.

**Superseded design:** the original capture proposed a blessed-based global *TUI* (split-view, `render-global.js`, `dashboard-global.js`, second launcher). That terminal global view is dropped — the cross-project browse experience now lives in the Swift desktop app instead, leaving this task to ship only the registry + spec. Original design notes: `~/.claude/plans/woolly-finding-hearth.md`.

## Why

The existing dashboard (`bin/dashboard.js`) is project-scoped — it resolves `.plans/` from `process.cwd()` and exits if that directory doesn't exist. Answering "what's in flight across all my projects?" currently requires `cd`-ing between projects and running `plans-cc-dashboard` in each. For anyone juggling multiple repos (the common case), this is friction the tool should eliminate.

The core design question is how a global dashboard "knows" about individual projects. Alternatives considered and rejected:
- **Filesystem scan** — slow on large trees, requires config for which roots to search, intrusive.
- **Manual `/plan-register`** — predictable but high-friction and easy to forget.

Self-registration wins because every real use of plans-cc already involves touching a specific `.plans/` directory — we just need to record that path. Pruning happens on read, so the registry self-heals when projects are deleted or moved.

## How

- [x] **Step 1: Add `lib/registry.js`** (~80 lines)
  - Exports `registerProject(projectRoot)`, `readProjects()`, `pruneProjects()`
  - Reads/writes `~/.claude/plans-cc/projects.json` with schema `{ version: 1, projects: [{ path, lastSeen }] }`
  - Atomic writes: `fs.writeFileSync(tmp, data); fs.renameSync(tmp, final)`
  - `readProjects()` filters out entries whose `.plans/` no longer exists (live prune)
  - **Must never throw** — all errors swallowed; corrupt registry returns `[]` and is rewritten fresh on next write
  - Duplicate detection by exact path string; no symlink canonicalization (v1)

- [x] **Step 2: Add `bin/plan-touch.js`** (~20 lines)
  - Tiny CLI: `node plan-touch.js <projectRoot>` → calls `require('../lib/registry').registerProject(projectRoot)`
  - Exits 0 always (best-effort)
  - Installed to `~/.claude/plans-cc/plan-touch.js` alongside the dashboard runtime

- [x] **Step 3: Wire registration into the per-project dashboard**
  - In `bin/dashboard.js`, immediately after the `.plans/` existence check passes (~line 23), call `registerProject(process.cwd())` from `lib/registry.js`
  - Best-effort, wrapped so a registry failure can't break the dashboard

- [x] **Step 4: Hook `plan-init` and `plan-capture` to register**
  - Append a new "Register project" step to `skills/plan-init/SKILL.md` (after step 7) that runs `node ~/.claude/plans-cc/plan-touch.js "$PWD"` via Bash, best-effort
  - Append the same line to the end of `skills/plan-capture/SKILL.md`
  - Both are silent on failure — must never break the skill
  - **Do NOT** hook the other 25 skills. Coverage from dashboard + init + capture is sufficient.

- [x] **Step 5: Extend the installer**
  - In `bin/install.js#installDashboardRuntime()`:
    - Copy `bin/plan-touch.js` → `~/.claude/plans-cc/plan-touch.js`
    - `lib/registry.js` is copied automatically by the existing `fs.cpSync(LIB_SOURCE, ...)` — no new code needed for the lib
  - Confirm `plan-touch.js` lands executable and resolves `../lib/registry` from its installed location

- [x] **Step 6: Write the desktop app handoff spec** → `.plans/artifacts/desktop-app-spec.md`
  - **Standalone** — assume the reader (a fresh agent in another directory) has zero context from this repo or this discussion. Everything it needs must be in the document.
  - **Requirements + contract only**: define WHAT the app must do and the data contracts. Do NOT prescribe UI layout, framework internals, or architecture beyond "macOS, native, menu bar + window" — leave those to the building agent.
  - Must cover:
    - **Purpose & two surfaces**: menu bar (20k-foot glance — per-project task counts by status) + a cross-project browser window (read task bodies, filter by status across all projects e.g. "all in-progress everywhere", sort by staleness, drill from glance → window).
    - **Registry contract**: exact path (`~/.claude/plans-cc/projects.json`), JSON schema (`{ version, projects: [{ path, lastSeen }] }`), live-prune semantics, that it may be missing/empty/corrupt and the app must tolerate that.
    - **`.plans/` parse contract**: directory layout (`pending/`, `completed/`, `config.json`), task filename format (`NNN-slug.md`), the task markdown structure (frontmatter fields `**ID:** / **Type:** / **Status:**`, sections What/Why/How/Verification), the checkbox progress convention in How (`[x]`/`[ ]`), and the status vocabulary (pending, elaborated, in-progress, review, in-review, completed). Point at `lib/parse-tasks.js` in this repo as the reference implementation of the parse rules.
    - **Status glyph / type vocabulary** the glance view should convey.
    - **Live-update expectation**: the app should reflect changes to registered `.plans/` dirs without manual refresh (file-watch or poll — implementation left to the builder).
    - **Platform/distribution note**: personal macOS tooling, built and installed separately from the npm package; no signing/notarization requirement.

- [x] **Step 7: Documentation**
  - Add a short note to `CLAUDE.md` describing the registry (`~/.claude/plans-cc/projects.json`, self-registration touchpoints) and pointing to the desktop app spec in `.plans/artifacts/`.

## Verification

1. **Registration fires from capture**: In two different project directories, run `/plan-capture test task`. Inspect `~/.claude/plans-cc/projects.json` — both absolute paths should appear with recent `lastSeen` stamps.
2. **Registration fires from per-project dashboard**: In a project that has never been captured-in, launch `plans-cc-dashboard`. The project should appear in the registry file afterward.
3. **Registration fires from plan-init**: In a fresh directory, run `/plan-init`. After it finishes, the registry should contain the new project path.
4. **Self-pruning**: `rm -rf .plans/` in one registered project, then call `readProjects()` (e.g. `node -e "console.log(require('~/.claude/plans-cc/lib/registry').readProjects())"`). That project should no longer appear and should be removed from the registry file.
5. **No regression**: Run `plans-cc-dashboard` in this repo. It must work identically to before; the only observable change is a registry entry being written on launch.
6. **Corrupt registry resilience**: `echo "garbage" > ~/.claude/plans-cc/projects.json`, then trigger a registration touch (e.g. `/plan-capture`). `readProjects()` should return `[]` for the garbage state and the file should be rewritten cleanly after the touch.
7. **Install path**: `npm pack && npx $(npm pack | tail -1)` in a temp dir. Confirm `~/.claude/plans-cc/plan-touch.js` and `~/.claude/plans-cc/lib/registry.js` are installed and a touch writes the registry.
8. **Spec is standalone**: Read `.plans/artifacts/desktop-app-spec.md` cold — verify a reader with no other context could build the app from it. It must contain the registry JSON schema, the `.plans/` parse contract, the status/glyph vocabulary, both surfaces (menu bar glance + cross-project window), the live-update expectation, and the platform note. No dangling references to "this discussion" or unexplained internals.

## Assumptions

### Discovered during execution

- [high] `registry.js` uses CommonJS, `os.homedir()`, top-of-file requires, and double-quoted strings to match the existing `lib/` style. **Why:** Direct pattern-match to `lib/parse-tasks.js`.
- [low] Atomic write uses a fixed temp filename `projects.json.tmp` (not a PID/random suffix). **Why:** Single-writer best-effort tool; touches are infrequent and the rename is atomic. A concurrent touch could clobber the tmp file, but the final rename still leaves a valid registry. Simpler than uuid temp names and adequate for v1.
- [low] `loadRegistry()` normalizes the version to `1` and only trusts `data.projects` if it's an array, discarding any other top-level fields. **Why:** Spec defines schema `{ version: 1, projects: [...] }`; defensively coercing keeps a malformed-but-parseable file from propagating bad shape, treating it like a fresh registry on next write.
- [high] In `bin/plan-touch.js`, the `require("../lib/registry")` → `require("./lib/registry")` try/catch fallback handles both repo and installed layouts. **Why:** Explicitly required by the segment spec; lib/ is a sibling in both layouts but at different relative depths.
- [low] `registerProject` mutates the in-memory entry's `lastSeen` (via `find`) rather than rebuilding the array. **Why:** Simplest correct approach; the object came from a fresh `JSON.parse`, so mutation is safe.
- [high] Registration step uses a hardcoded absolute-via-`~` path `node ~/.claude/plans-cc/plan-touch.js "$PWD" 2>/dev/null || true`. **Why:** plan-touch.js only ever lives at the installed location (`~/.claude/plans-cc/`); the skills run on end-user machines where the repo isn't present. The `2>/dev/null || true` guarantees the step is silent and never fails the skill.
- [high] In plan-init the registration was added as new step 10 (before the marker, now step 11); in plan-capture as new step 9 (before commit), renumbering old 9–12 to 10–13. **Why:** Keeps the end-of-action marker as the final output line and runs registration during normal execution. In plan-capture, placing it before the commit/chaining steps means it also runs on the auto-elaborate/auto-execute paths (which skip the commit step but still pass through step 9).
- [high] No frontmatter change needed — both plan-init and plan-capture already list `Bash` in `allowed-tools`. **Why:** Verified by reading the frontmatter of both files.
- [low] Used `fs.cpSync` (not `copyFileSync`) for plan-touch.js to mirror the adjacent dashboard.js/lib copy lines. **Why:** Consistency with surrounding installer style; both work for a single file.
- [low] Spec proposes concrete emoji glyphs (🔨/🟡/⚪/📋/👀/✅ for status; 🐞/✨/♻️/🔧 for type) as the glance vocabulary, explicitly labeled as refinable suggestions. **Why:** The task asked for a "compact glyph/label scheme" to propose; emoji read at a glance and the builder is told they may swap to SF Symbols/dots. No canonical scheme exists in the repo to mirror.
- [low] Spec tells the builder to treat the `completed/` directory as authoritative for completion regardless of the file's `**Status:**` line. **Why:** Mirrors `parse-tasks.js`, which force-sets status to `completed` for files read from `completed/`. Keeps the contract unambiguous.
- [low] Spec says the reader is NOT required to rewrite the registry to remove stale entries (skip-on-read is enough), preserving the app's read-only constraint. **Why:** `lib/registry.js` already self-heals the file on its next write; having the viewer write would violate the explicit read-only requirement.
- [high] Documentation note added as a new `### Machine-Wide Project Registry` subsection directly under `### File Structure Created by Skills` (before `### Task Statuses`). **Why:** Natural sibling to the file-structure block; keeps registry/structure info adjacent without restructuring the doc.

## Impact Scope

New files (3):
- `lib/registry.js`
- `bin/plan-touch.js`
- `.plans/artifacts/desktop-app-spec.md` (handoff document)

Modified files (5):
- `bin/dashboard.js` — call `registerProject` on launch
- `bin/install.js` — copy `plan-touch.js` into the dashboard runtime dir
- `skills/plan-init/SKILL.md` — append registration step
- `skills/plan-capture/SKILL.md` — append registration step
- `CLAUDE.md` — document the registry + point to the desktop app spec

**Out of this repo (separate deliverable):** the macOS Swift desktop app itself, built in its own project/directory from `.plans/artifacts/desktop-app-spec.md`.

## Changes

**Producer (registry):**
- `lib/registry.js` (new) — `registerProject()` / `readProjects()` / `pruneProjects()`. Writes `~/.claude/plans-cc/projects.json` (`{ version: 1, projects: [{ path, lastSeen }] }`), atomic tmp+rename, never throws, live-prune on read, dedupe by exact absolute path.
- `bin/plan-touch.js` (new, executable) — `node plan-touch.js [projectRoot]` (defaults to cwd) → `registerProject`. Dual-layout `require` fallback (`../lib/registry` then `./lib/registry`) so it resolves both in-repo and from the installed `~/.claude/plans-cc/`.
- `bin/dashboard.js` — registers `process.cwd()` on launch, right after the `.plans/` existence check, best-effort wrapped.
- `skills/plan-init/SKILL.md`, `skills/plan-capture/SKILL.md` — silent best-effort registration step (`node ~/.claude/plans-cc/plan-touch.js "$PWD" 2>/dev/null || true`) placed before the end-of-action marker.
- `bin/install.js` — `installDashboardRuntime()` copies `plan-touch.js` into the runtime dir and chmods it executable (`lib/registry.js` rides along via the existing `lib/` copy).

**Spec + docs:**
- `.plans/artifacts/desktop-app-spec.md` (new) — standalone handoff spec for the separate macOS Swift app: two surfaces, registry contract, `.plans/` parse contract, glyph/type vocabulary, live-update + platform notes, read-only constraint.
- `CLAUDE.md` — new "Machine-Wide Project Registry" subsection documenting the registry + pointing to the spec.

**Verified:** `node -c` syntax-clean on all 4 JS files; `plan-touch.js` smoke-tested against a throwaway HOME (correct schema, absolute path, ISO `lastSeen`). Tracked file changes match Impact Scope (5 modified + 2 new; spec lives under gitignored `.plans/`).

## Notes

**Architecture (settled in `/plan-discuss`, 2026-06-04):** two altitudes, two surfaces — a menu bar *glance* (counts/status per project) and a *cross-project browser window* (read bodies, filter "all in-progress everywhere", sort by staleness). Both live in a separate macOS Swift app built in another directory. This task ships only the **registry producer** (JS, here) + the **handoff spec** the Swift app is built from. The registry JSON file is the sole contract between producer and consumer.

Earlier-considered design (blessed global TUI) was dropped in favor of the Swift app; original notes: `~/.claude/plans/woolly-finding-hearth.md`.

**Out of scope (explicit):**
- No Swift code or app build in this repo — that's a separate deliverable in its own project/directory, driven by `.plans/artifacts/desktop-app-spec.md`.
- No blessed global TUI / `dashboard-global.js` / `render-global.js` / second launcher — superseded by the Swift app.
- No manual `/plan-register` or `/plan-unregister` skill — self-registration covers every real case.
- No cross-project task *operations* (moving tasks between projects). The desktop app stays read-only; the spec should say so.
- No symlink canonicalization — two symlinks to the same dir register as two entries. Acceptable v1 tradeoff.
- No hooking into the other 25 skills — dashboard + init + capture covers ≥99% of real usage.

**Key reuse points** — do not rewrite:
- `lib/parse-tasks.js#parseTasks` — the reference implementation of the `.plans/` parse rules; the spec should point the Swift builder at it as the source of truth for the format.
- `bin/install.js#installDashboardRuntime` — extended (copy `plan-touch.js`), not rewritten.
