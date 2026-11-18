# Manage Collections of Plans (Epics)

**ID:** 012
**Created:** 2026-05-29T00:00
**Type:** feature
**Status:** elaborated

## What
Think about ways collections of plans could be managed. Maybe something like epics — a way to group related tasks under a larger umbrella, track their collective progress, and operate on them as a unit.

This task introduces **epics**: first-class, intentional collections of planned work. An epic groups one or more tasks, rolls up their collective progress, and lets the user operate on them together (e.g. spawn all the elaborated tasks in an epic at once). Epics are distinct from *ideas* (exploratory) and from *dependencies* (blocking relationships) — they are durable work containers that sit above tasks.

## Why
Adds value by giving users a way to organize larger initiatives that span multiple tasks. Today the backlog is a flat list of tasks, with only two grouping mechanisms — `ideas/` (exploratory, pre-task) and `plan-depends` (binary blocking). Neither expresses "these five tasks belong to one initiative; show me their combined progress; act on them together." Epics fill that gap, scaling the system from individual tasks to multi-task efforts while reusing existing conventions (the ideas precedent and the per-task-file source-of-truth pattern).

## How

This task is delivered as a set of new declarative SKILL.md files plus small patches to existing skills and the bootstrap. It follows the same pattern as the `ideas/` family: a separate id counter, a separate directory, and the parent→child link stored in the task file itself (single source of truth, grep-queryable, no index to keep in sync).

- [ ] Step 1: **Define the epic file format & storage contract.** Epic files live at `.plans/epics/NNN-slug.md` (mirrors `.plans/ideas/`). Slug generation reuses the plan-capture rule (lowercase, hyphens, 40-char cap at a word boundary). Epic id comes from a new `epic_next_id` counter in `config.json`. Epic file sections: title + `**ID:**` / `**Created:**` / `**Status:** [open|closed]`, then `## Goal`, `## Scope`, `## Child Tasks` (convenience view), `## Progress` (computed rollup), `## Notes`. Document this format inline in the new skills so they stay consistent.
- [ ] Step 2: **Patch `skills/plan-init/SKILL.md`.** Add `epics/` to the directory structure created in step 2 of plan-init, and add `"epic_next_id": 1` to the `config.json` template written in step 6. (Existing projects are backfilled lazily by plan-epic-create — see step 4.)
- [ ] Step 3: **Create `skills/plan-epic-create/SKILL.md`** (new skill). Args: `"<title>" [goal/description]`. Verify init; read & increment `epic_next_id` in `config.json`; create `.plans/epics/` if missing; slugify title; write `.plans/epics/NNN-slug.md` with `Status: open` and an empty `## Child Tasks`. If `epic_next_id` is absent from an older config, default it to 1 before incrementing (lazy backfill). `disable-model-invocation: true`. End-of-action marker: `🟢 CREATED · Epic #NNN → Next: /plan-epic-add <task> to NNN`.
- [ ] Step 4: **Create `skills/plan-epic-add/SKILL.md`** (new skill). Args: `<task-id> to <epic-id>` to assign, `<task-id> clear` to unassign. Assigning writes/updates a `**Epic:** #NNN` frontmatter field in the task file (located via Glob across `pending/` and `completed/`) and appends/updates the task line under the epic's `## Child Tasks`. Unassigning removes the field and the child line. Validate both ids exist; reject reassigning a task that already belongs to a different epic unless `clear`ed first. `disable-model-invocation: true`. Marker: `🟢 ASSIGNED · Task #NNN → Epic #MMM`.
- [ ] Step 5: **Create `skills/plan-epic/SKILL.md`** (new, read-only). Args: `[id]`. With no id, list all epics with rolled-up progress (`X/N tasks complete`). With an id, show that epic's Goal/Scope plus a child-task summary (id, title, status glyph, per-task step progress). Compute child membership by grepping task files for `**Epic:** #NNN` across `pending/` and `completed/` (the task file is the source of truth; the epic's `## Child Tasks` is a regenerated convenience view). `disable-model-invocation: false` (read-only, low-risk, consistent with plan-ideas/plan-status). Marker: `🔵 EPIC · #NNN` (single) or `🔵 EPICS · N epics` (list).
- [ ] Step 6: **Create `skills/plan-epic-close/SKILL.md`** (new skill). Args: `<epic-id>`. Check child task statuses; if any child is not `completed`, warn and require confirmation (auto-handled in any future skip/yolo path). Set the epic file's `**Status:**` to `closed`. Do not delete or move tasks. `disable-model-invocation: true`. Marker: `✅ CLOSED · Epic #NNN`.
- [ ] Step 7: **Patch `skills/plan-list/SKILL.md`** to support an `epic <id>` filter. `/plan-list epic 1` lists tasks whose file contains `**Epic:** #001`, reusing the existing filter-parsing block. Add an optional Epic column shown only when filtering by epic.
- [ ] Step 8: **Patch `skills/plan-status/SKILL.md`** to group tasks under their parent epic in the dashboard: render an `Epic #NNN — Title (3/5 complete)` header with the member task lines beneath it, then list unassigned tasks as today. If there are zero epics, fall back to the current flat display unchanged.
- [ ] Step 9: **Patch `skills/plan-spawn/SKILL.md`** to accept `epic <id>` as an alternative to an explicit id list: resolve to all `elaborated` tasks in that epic, then proceed through spawn's existing preflight/segment/fan-out logic unchanged. Respect existing `**Blocked by:**` ordering between members.
- [ ] Step 10: **Wire the new skills into project docs.** Add the four new skills to the "All Skills" table in `CLAUDE.md`, add their rows to the End-of-Action Markers emoji table (epic-create/epic-add → 🟢, epic → 🔵, epic-close → ✅), and document the epic lifecycle near the Task Lifecycle section. Update `skills/plan-help/SKILL.md` if it carries its own static command list. (No edits needed to `bin/install.js`, `bin/dev.js`, or `package.json` — all auto-discover any directory under `skills/`; verified in step 11.)
- [ ] Step 11: **Manual verification pass.** In a scratch directory, reinstall via `node bin/dev.js`, run `/plan-init`, then exercise the full epic lifecycle (create → add tasks → list/status rollup → spawn → close) and confirm files, config counter, and rollup numbers are correct.

## Verification

- `node bin/dev.js` installs the four new skills with no errors, and `/plan-help` lists them.
- `/plan-init` in a fresh directory creates `.plans/epics/` and writes `epic_next_id: 1` into `config.json`.
- `/plan-epic-create "Auth hardening"` creates `.plans/epics/001-auth-hardening.md` with `Status: open` and increments `epic_next_id` to 2.
- `/plan-epic-add 3 to 1` adds `**Epic:** #001` to task 3's file and a child line to the epic; `/plan-epic-add 3 clear` reverses both edits.
- `/plan-epic 1` shows the epic's goal/scope and child tasks with correct rolled-up progress (`X/N complete`); `/plan-epic` with no id lists all epics.
- `/plan-list epic 1` returns only tasks assigned to epic 1; `/plan-status` groups those tasks under an `Epic #001` header with a correct count, and renders the normal flat list when no epics exist.
- `/plan-spawn epic 1` resolves to the epic's `elaborated` tasks and fans them out via the existing spawn flow.
- `/plan-epic-close 1` warns when child tasks are incomplete and sets the epic file's status to `closed`.
- Running an older project (config without `epic_next_id`) through `/plan-epic-create` backfills the counter to 1 without error.

## Impact Scope

### Files to Modify
- [ ] `skills/plan-init/SKILL.md` — add `epics/` directory and `epic_next_id` to the bootstrap config template
- [ ] `skills/plan-list/SKILL.md` — add `epic <id>` filter and optional Epic column
- [ ] `skills/plan-status/SKILL.md` — group tasks under parent epics in the dashboard rollup
- [ ] `skills/plan-spawn/SKILL.md` — accept `epic <id>` to resolve member tasks for fan-out
- [ ] `skills/plan-help/SKILL.md` — list the new epic commands (if it carries a static list)
- [ ] `CLAUDE.md` — All Skills table, emoji marker table, epic lifecycle docs

### Files to Create
- [ ] `skills/plan-epic-create/SKILL.md` — create an epic
- [ ] `skills/plan-epic-add/SKILL.md` — assign/unassign a task to an epic
- [ ] `skills/plan-epic/SKILL.md` — list epics / show one epic (read-only)
- [ ] `skills/plan-epic-close/SKILL.md` — close an epic

### Related Files (may need updates)
- `skills/plan-capture/SKILL.md` — the canonical slug-generation rule the new skills reuse; no change required, but it is the reference implementation
- `skills/plan-depends/SKILL.md` — the `**Blocked by:**` ordering that plan-spawn must continue to honor within an epic
- `bin/install.js`, `bin/dev.js`, `package.json` — verified to auto-discover `skills/` subdirectories; confirm (no edit expected)

### Behavior/Commands Affected
- New commands: `/plan-epic`, `/plan-epic-create`, `/plan-epic-add`, `/plan-epic-close`
- Changed commands: `/plan-list` (new `epic` filter), `/plan-status` (epic grouping), `/plan-spawn` (`epic <id>` target), `/plan-init` (new dir + config key)

## Assumptions

### Initial (from elaboration)
- [low] **Epics use a separate `epic_next_id` namespace and a separate `.plans/epics/` directory**, mirroring the `idea_next_id` / `.plans/ideas/` precedent rather than reusing the task id space or co-locating with tasks. **Why:** Research found `ideas/` as the established precedent for a higher-level grouping with its own counter and directory; reusing that pattern keeps concerns separated and conversation unambiguous (Epic #001 vs Task #001). Flagged low because the source description didn't specify id/storage strategy and a single merged namespace was a plausible alternative.
- [low] **A task belongs to at most one epic, stored as a singular `**Epic:** #NNN` field in the task file** (not a multi-valued list, and not an index in config.json). **Why:** Mirrors how `plan-depends` stores `**Blocked by:**` directly in the task file as the single source of truth, keeping membership grep-queryable with no index to sync. Flagged low because multi-epic membership is a plausible richer model the description left open; single-membership was chosen for simplicity and can be widened later.
- [low] **Epic `Status` is a simple `open`/`closed` flag set by `plan-epic-close`, with progress computed at query time** (rather than an auto-derived status or a manually maintained progress field). **Why:** Computing `X/N completed` by grepping member task files avoids stored state drifting out of sync; an explicit close action mirrors `plan-complete`'s terminal step. Flagged low because auto-closing when all children complete was an equally reasonable alternative.
- [low] **Scope is held to four new skills plus targeted patches, explicitly excluding epic nesting, epic-level checkboxes/planning, and cascade-delete of member tasks.** **Why:** Research's Approach Warnings flagged these as over-engineering for a first cut; the existing ideas/tasks model proves flat grouping is sufficient. Flagged low because it is a scope call the source description ("think about ways…") left fully open.
- [high] **New skills require no changes to `bin/install.js`, `bin/dev.js`, or `package.json`.** **Why:** Verified directly — `install.js` (lines 100–115) and `dev.js` discover every directory under `skills/` at runtime, and `package.json`'s file list already covers `skills/`. Tagged high: confirmed against the actual installer code, not just inferred.
- [high] **`/plan-epic` (read/list) is `disable-model-invocation: false`; the three mutating skills are `disable-model-invocation: true`.** **Why:** Matches the documented convention in CLAUDE.md, where read-only/capture-only skills (plan-list, plan-show, plan-status, plan-ideas) are model-invocable and mutating skills are not.

### Discovered during execution
_To be filled during execution_

## Changes
_To be filled during execution_

## Notes
Closest existing precedents to follow during implementation:
- **Ideas family** (`plan-brainstorm` → `plan-expand`/`plan-pick`): the `idea_next_id` counter, `.plans/ideas/NNN-slug.md` files, and an `## Expanded Into` child-tracking section are the direct model for the epic counter, directory, and `## Child Tasks` view.
- **`plan-depends`**: stores cross-task relationships as a frontmatter field in the task file — the pattern reused for `**Epic:** #NNN`.
- **`plan-spawn`**: the existing "operate on a group as a unit" mechanism; `epic <id>` becomes a new way to select the spawn set.
- **`plan-status` / `plan-list`**: existing aggregation/rollup display logic to extend for epic grouping.

Deferred for a future iteration (intentionally out of scope here): multi-epic membership, epic nesting / roadmaps-of-epics, a `/plan-capture … epic N` inline-assign shortcut, an `epics-completed/` archive directory, and a PROGRESS.md epic summary section.

`/plan-merge-reviews` (#014) is the natural primitive a future `/plan-epic review <id>` would call to review all of an epic's review-state children as one combined diff.
