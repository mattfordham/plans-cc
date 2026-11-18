# Backlog Option To Defer Pending Plans

**ID:** 021
**Created:** 2026-06-24T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-06-24T13:10
**Branch:** feature/021-backlog-option-defer-pending-plans

## What
How about a "backlog" option, that would move pending plans to/from a directory for future plans?

## Why
The active task list in `.plans/pending/` accumulates every captured-but-not-started task, so `/plan-status`, `/plan-list`, and `/plan-guide` surface work the user has consciously deferred — drowning the handful of "now" tasks in "someday" noise. A backlog gives deferred tasks a holding pen on disk (`.plans/backlog/`, mirroring how `completed/` works) so active views stay focused, while keeping the tasks fully captured and one command away from return.

## How Summary
Add a `.plans/backlog/` directory and two new symmetric skills — `/plan-backlog <id>` (pending → backlog) and `/plan-restore <id>` (backlog → pending) — that physically move the task file, mirroring `plan-complete`'s move-to-`completed/` pattern. Because active views glob `pending/`, moving the file makes backlogged tasks disappear from default `/plan-status`, `/plan-list`, and `/plan-guide` automatically; those views gain only a lightweight `+N backlogged` count badge. Locate-by-ID skills (`plan-show`, `plan-search`, `plan-audit`) extend their search to include `backlog/`, `plan-list` gains a `backlog` filter for the opt-in view, and `plan-cleanup`/`plan-init` learn `backlog/` as a canonical dir. Active tasks (`in-progress`/`in-review`) are auto-paused (reusing `plan-pause`'s status-transition + branch-handling logic) before being shelved, so no half-running task lands in `backlog/`. Restore preserves the task's pre-backlog status.

**Files of note:**
- `skills/plan-backlog/SKILL.md` — NEW: move pending → backlog, auto-pausing active tasks first
- `skills/plan-restore/SKILL.md` — NEW: move backlog → pending, preserving original status
- `skills/plan-pause/SKILL.md` — source of the auto-pause status-transition + branch logic to reuse
- `skills/plan-complete/SKILL.md` — the move-to-`completed/` precedent the backlog move mirrors
- `skills/plan-cleanup/SKILL.md` — add `backlog/` to the canonical/expected directory set
- `skills/plan-list/SKILL.md` — add `backlog` filter (opt-in view) + exclude from default
- `skills/plan-status/SKILL.md`, `skills/plan-guide/SKILL.md` — `+N backlogged` count badge
- `skills/plan-show/SKILL.md`, `skills/plan-search/SKILL.md`, `skills/plan-audit/SKILL.md` — extend locate-by-ID search to `backlog/`
- `skills/plan-init/SKILL.md` — create `backlog/` in the dir structure
- `lib/parse-tasks.js` — count `backlog/` separately so the desktop dashboard excludes it from active counts
- `CLAUDE.md` — document the backlog dir, statuses, lifecycle, and the two new skills

## How
- [x] Step 1: Create `skills/plan-backlog/SKILL.md` (move pending → backlog). Frontmatter: `name: plan-backlog`, `disable-model-invocation: true`, `argument-hint: "<id>"`, `allowed-tools: [Read, Write, Edit, Bash, Glob]`. Steps: verify init; resolve/zero-pad ID; locate `.plans/pending/NNN-*.md` (error if not found / already in backlog/completed); if status is `in-progress` or `in-review`, auto-pause first by reusing `plan-pause`'s logic (transition `in-progress`→`elaborated` / `in-review`→`review`, append `**Paused:**` note, handle branch/worktree commit + checkout per plan-pause step 6); create `.plans/backlog/` if missing; append `**Backlogged:** [ISO timestamp]` to Notes; move file `pending/ → backlog/` via Bash `mv`; update PROGRESS.md stats; best-effort `plan-touch.js`; commit `.plans/` per the standard git_commits gate. Marker: `🟢 BACKLOGGED · Task #NNN → Next: /plan-list backlog`.
- [x] Step 2: Create `skills/plan-restore/SKILL.md` (move backlog → pending), mirroring step 1 in reverse. Locate `.plans/backlog/NNN-*.md` (error if not found there); append `**Restored:** [ISO timestamp]` to Notes; preserve the task's existing Status (do NOT reset — a restored elaborated task stays `elaborated`); move file `backlog/ → pending/`; update PROGRESS.md; commit. Marker: `🟢 RESTORED · Task #NNN → Next: /plan-execute NNN` (or `/plan-elaborate NNN` if status is still `pending`).
- [x] Step 3: Teach `plan-cleanup` about `backlog/`: add `backlog` to the "Expected Directories Under `.plans/`" list and to the unexpected-directory check (skills/plan-cleanup/SKILL.md, the `pending/, completed/, ideas/, state/, archive/` set in both places), so cleanup never flags it as orphaned.
- [x] Step 4: Extend the locate-by-ID search in `plan-show`, `plan-search`, and `plan-audit` to also look in `.plans/backlog/` (add `.plans/backlog/NNN-*.md` to plan-show & plan-audit single-task lookups; add `.plans/backlog/*.md` to plan-search's Grep scope), so backlogged tasks remain findable by ID/keyword.
- [x] Step 5: Make `plan-list` backlog-aware: add `backlog` as a recognized filter that globs `.plans/backlog/*.md` only (the opt-in view), and ensure the default (no-filter) listing globs `pending/` only so backlogged tasks are excluded by default.
- [x] Step 6: Add the `+N backlogged` count badge (hidden-but-not-forgotten) to `plan-status` and `plan-guide`: glob `.plans/backlog/*.md`, count it, and surface the count as a one-line badge without listing the tasks; keep the main task lists sourced from `pending/` only.
- [x] Step 7: Add `backlog/` to the directory structure created by `plan-init` (alongside `pending/`, `completed/`, `ideas/`, `state/`) so new projects have it from the start; the move skills still lazily create it as a safety net.
- [x] Step 8: Update `lib/parse-tasks.js` (the desktop-dashboard parser) to read `.plans/backlog/` and count it as a separate `backlogged` summary field, excluded from the active pending/elaborated/in-progress counts, so the dashboard doesn't show deferred tasks as active work.
- [x] Step 9: Document the feature in `CLAUDE.md`: add `.plans/backlog/` to the File Structure block; note backlog as a deferral bucket in the Task Lifecycle section; and add `/plan-backlog` and `/plan-restore` rows to the All Skills table. Verify each new SKILL.md ends with the correct end-of-action marker and matches house frontmatter conventions.

## Verification
- Run `/plan-init` in a fresh test dir and confirm `.plans/backlog/` is created.
- `/plan-backlog <id>` on a pending task: file moves to `.plans/backlog/`, `**Backlogged:**` note added, task disappears from `/plan-status` and default `/plan-list`, and a `+1 backlogged` badge appears.
- `/plan-backlog <id>` on an `in-progress` task: task is auto-paused (status → `elaborated`, branch/worktree handled, `**Paused:**` note) before moving — no in-progress task left in `backlog/`.
- `/plan-list backlog` lists the backlogged task; `/plan-show <id>` and `/plan-search <keyword>` still find it.
- `/plan-restore <id>`: file moves back to `.plans/pending/`, original status preserved, reappears in active views; badge count drops.
- `/plan-cleanup` does NOT flag `.plans/backlog/` as an unexpected directory.

## Impact Scope

### Files to Modify
- [ ] `skills/plan-backlog/SKILL.md` — NEW skill: pending → backlog move with auto-pause
- [ ] `skills/plan-restore/SKILL.md` — NEW skill: backlog → pending move, status preserved
- [ ] `skills/plan-cleanup/SKILL.md` — add `backlog/` to expected/canonical dir set (two places)
- [ ] `skills/plan-show/SKILL.md` — extend single-task lookup to `backlog/`
- [ ] `skills/plan-search/SKILL.md` — add `backlog/` to Grep search scope
- [ ] `skills/plan-audit/SKILL.md` — extend single-task lookup to `backlog/`
- [x] `skills/plan-list/SKILL.md` — add `backlog` filter; exclude backlog from default
- [x] `skills/plan-status/SKILL.md` — `+N backlogged` count badge
- [x] `skills/plan-guide/SKILL.md` — `+N backlogged` count badge
- [x] `skills/plan-init/SKILL.md` — create `backlog/` in dir structure
- [x] `lib/parse-tasks.js` — count `backlog/` as a separate, non-active summary field
- [x] `CLAUDE.md` — document dir, lifecycle, and the two new skills

### Related Files (may need updates)
- `skills/plan-pause/SKILL.md` — not modified, but its auto-pause logic is the reference reused by `/plan-backlog`
- `skills/plan-complete/SKILL.md` — not modified; the move-to-`completed/` pattern is the template for the backlog move
- `bin/install.js` — verify it copies all `skills/plan-*` dirs (the two new skills should be picked up automatically by the existing glob)

### Endpoints/UI Affected
- `/plan-status`, `/plan-list`, `/plan-guide` — default output gains a `+N backlogged` badge; backlogged tasks no longer listed by default
- `/plan-list backlog` — new opt-in view
- Desktop dashboard — backlog count surfaced separately from active work

## Assumptions

### Initial (from elaboration)
- [high] Backlog is implemented as a physical directory move to `.plans/backlog/`, not a status flag. **Why:** settled in the pre-plan discuss gate; mirrors the existing `completed/` move precedent so views that glob `pending/` auto-hide backlogged tasks without per-view filter edits.
- [high] Two symmetric skills (`/plan-backlog`, `/plan-restore`) rather than a single toggle. **Why:** settled in the discuss gate; matches the discoverable `plan-*` family and the `complete`/`reopen` pairing.
- [high] Backlogged tasks are hidden by default but visible opt-in via `/plan-list backlog`, with a `+N backlogged` count badge on dashboards. **Why:** settled in the discuss gate ("opt-in views only") to avoid a forgotten graveyard.
- [high] Any non-completed task is eligible; an active (`in-progress`/`in-review`) task is auto-paused before shelving by reusing `plan-pause`'s logic. **Why:** settled in the discuss gate; avoids duplicating pause/worktree logic and prevents a half-running task landing in `backlog/`.
- [low] `/plan-restore` preserves the task's pre-backlog status rather than resetting to `elaborated`. **Why:** research left this open; preserving status is least-surprising and keeps restore a pure inverse of backlog, but the source description didn't specify it.
- [low] `backlog/` is created eagerly by `/plan-init` and lazily by the move skills as a safety net. **Why:** research noted `state/` is created lazily and `archive/` isn't in init at all; eager creation is friendlier but the exact convention was a judgement call.

### Discovered during execution
- [low] `/plan-backlog` decrements the count for the task's *effective* (post-auto-pause) status in PROGRESS.md, and tracks deferred tasks under a new `Backlogged` stat line. **Why:** the plan said "decrement the appropriate active count, note the backlog" but didn't pin down the exact stat field; a `Backlogged` count mirrors how PROGRESS.md already tracks per-status counts and how the desktop parser (Step 8) will expose a separate `backlogged` field.
- [low] On auto-pause, a task with a `**Worktree:**` field has its worktree committed but left in place (not removed), so a later `/plan-restore` + `/plan-execute` can resume it. **Why:** plan-pause itself never removes worktrees; removing on backlog would be a surprising, hard-to-reverse side effect for a deferral action. The plan named "branch/worktree commit + checkout" but didn't specify worktree teardown.
- [high] Both new skills reuse plan-complete's exact git_commits commit gate and plan-pause's status-transition/branch-handling text near-verbatim. **Why:** direct pattern-match against the named precedents (plan-complete for the move + commit, plan-pause for the auto-pause) per the segment brief.
- [high] `/plan-restore`'s confirmation Next-command and end-of-action marker branch on the preserved status: `pending` → `/plan-elaborate NNN`, everything else → `/plan-execute NNN`. **Why:** explicitly specified in the step; a still-pending task hasn't been elaborated yet so execute would be premature.
- [low] Updated plan-search's intro sentence (not just its Grep scope list) to mention `backlog/` for documentation consistency. **Why:** the step only required the Grep scope, but leaving the prose listing pending/completed/ideas would be stale; flagging as a minor scope addition within the same file.
- [low] The `backlog` filter is excluded from plan-list's `all` view (and from type filters); it's reachable ONLY via the explicit `backlog` keyword. **Why:** the step asked me to decide and note it; backlog is a "consciously deferred" bucket and the whole feature's point is to keep it out of broad views — folding it into `all` would re-surface the noise the user deferred. Opt-in only matches the segment-1 "opt-in views only" decision.
- [high] In plan-status, the `+N backlogged` badge is rendered as the line directly under the summary counts line, and the subagent report's COUNTS line gains a `backlogged=<n>` field. **Why:** the badge needs the count, and the status skill delegates all gathering to the subagent — extending its COUNTS contract is the only place the main agent can source the number without itself globbing (which the skill forbids). Placement under the summary counts reads as a natural "and also" footnote.
- [low] In plan-guide, the badge sits directly under the `# Plans Guide` header and includes a short `/plan-list backlog` / `/plan-restore` hint, rather than a bare `+N backlogged`. **Why:** guide is the contextual "what next" skill, so a one-line actionable hint fits its voice; status (a terse dashboard) gets the bare count instead. Header placement guarantees visibility regardless of which conditional sections render.
- [high] Backlogged tasks are excluded from plan-status's `<total>` in the end-of-action marker. **Why:** the marker counts active work; the whole feature treats backlog as non-active, and the desktop parser (Step 8) likewise counts it separately.
- [low] Added a `Backlogged: 0` line to plan-init's PROGRESS.md template and `backlog/` to its created directory structure. **Why:** segment 1 made PROGRESS.md carry a `Backlogged` stat and plan-status now refreshes it; seeding the template keeps new projects consistent so the first backlog op doesn't have to invent the line. The PROGRESS template edit is slightly beyond the literal "directory structure" wording of Step 7 — noted as a small in-file scope addition.
- [high] In `lib/parse-tasks.js`, the new summary field is named `backlogged` (camelCase singular noun, like the existing `completed`) and is computed as `backlogFiles.length` via the existing `readMdFiles` helper. **Why:** the helper already returns `[]` for a missing dir, so absence-tolerance and naming both pattern-match the established `pending`/`completed`/`inReview` style — no parallel mechanism invented. Backlog files are never pushed into the `tasks` array, so they are structurally excluded from the active per-status counts.
- [high] Did NOT touch `lib/render-dashboard.js` to display the new `backlogged` field. **Why:** the segment scope was strictly "count it as a separate field"; the dashboard's `STATUS_KEYS` rendering list is out of scope and rendering the badge is the desktop app's responsibility (built outside this repo per the registry/desktop-app contract). The field is now exposed for any consumer that wants it. Flagged as a scope boundary, not a deviation.
- [low] In CLAUDE.md, documented backlog/restore in three additional spots beyond the literal asks: a "**Deferral:**" line under the Task Lifecycle diagram and a backlog paragraph in the Task Statuses section, plus placing the two "All Skills" rows directly after `/plan-pause`. **Why:** CLAUDE.md has no flat complete/reopen-style pair list near the top (only ASCII lifecycle diagrams + a Shortcuts paragraph), so the closest in-pattern home for the lifecycle-summary mention is a one-line note attached to the diagram block; pause is the nearest conceptual neighbor (context-switch sibling) for table placement.

## Changes
_To be filled during execution_

## Notes
_Additional context_
