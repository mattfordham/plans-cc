# Add optional per-task base-branch support to the plan skills

**ID:** 039
**Created:** 2026-09-28T14:16
**Type:** feature
**Status:** completed
**Completed:** 2026-09-28T14:47
**Branch:** feature/039-add-optional-per-task-base-branch-support

## What
Add optional per-task base-branch support to the plan skills.

A task file can carry an optional header field:

    **Base:** feature/example-feature

When it's present, the task branches FROM, rebases ONTO, and merges INTO that branch
instead of the repo's default branch. When it's absent, or equal to the default
branch, every skill must behave exactly as it does today, byte-for-byte. This is
opt-in only.

Add ONE shared "resolve target branch" rule: target = the **Base:** value if present,
otherwise the default branch (`git symbolic-ref refs/remotes/origin/HEAD | sed
's@^refs/remotes/origin/@@'`, falling back to main, then master). Reference the rule
everywhere instead of repeating the logic.

Required changes:
1. plan-execute — branch/switch from the target branch (branch AND worktree, single-
   AND multi-repo); create base locally from default if missing (never push).
2. plan-review — rebase onto target; diff stat uses <target>...<task-branch>; print
   base in summary header when set; keep the local-vs-origin comparison and the
   concurrency + .plans-protection guards.
3. plan-complete — merge dispatch (cases A/B/C/D) uses target everywhere; keep the
   MAIN-checkout invariant; name the real target in prompts/confirmation; stop with a
   clear error if the base no longer exists.
4. Keep the field when rewriting a task header: plan-elaborate, plan-clarify,
   plan-discuss, plan-reopen, plan-pause, plan-combine (ask which Base to keep on
   conflict), and anything else that rewrites the header.
5. Display: plan-show / plan-status / plan-list show base when set.
6. plan-pause: decide whether switch-back goes to base or default; write it down and
   justify.
7. Update every place that documents the header fields (task template comments,
   CLAUDE.md contract docs, edge-case lists).

Out of scope: merging the base into main; any pushing; auto-setting Base at capture.

Once the skill changes are done: add `**Base:** feature/example-feature` to the
headers of tasks #901-#906 in ~/work/multi-repo-app/.plans/pending/, directly
under the **Status:** line (after **Blocked by:** where present).

## Why
The plan lifecycle currently hardcodes the repo's default branch as the single integration
point: every task branches from it, rebases onto it, and merges into it. Stacked or
feature-grouped work (e.g. several tasks that all belong on `feature/example-feature`
before that feature lands on main) has no way to express "integrate against this branch
instead." Adding an opt-in `**Base:**` header field lets a task target an alternate
integration branch end-to-end, while leaving every existing (no-Base) task byte-for-byte
unchanged.

## How Summary
Introduce ONE shared "resolve target branch" rule — `target = **Base:** header value if
present, else the existing default-branch idiom (origin/HEAD → main → master)` — documented
once in `CLAUDE.md` and referenced by name from every skill that currently inlines the
default-branch idiom (9 sites across 6 skills). Each of those sites resolves `target`
instead of `default-branch` and behaves identically when Base is absent or equals the
default. plan-execute branches/switches from `target` (creating the base locally from the
repo default if missing, never pushing); plan-review rebases onto and diffs against `target`
and prints Base in its header; plan-complete's A/B/C/D merge dispatch merges into `target`
and errors if the base has vanished. Header-rewriting skills preserve the field; plan-combine
asks which Base to keep on conflict; display skills show it; plan-pause deliberately keeps
switching back to the **default** branch (justified in Notes). Finally, add `**Base:**` to
tasks #901–#906 in the multi-repo-app project.

**Files of note:**
- `CLAUDE.md` — home of the new shared "resolve target branch" rule + a `**Base:**` header-field contract section
- `skills/plan-execute/SKILL.md` — branch/worktree creation (4 combos) + 2 pre-switch-off sites now branch from `target`; create-base-if-missing
- `skills/plan-review/SKILL.md` — rebase onto `target` (keep local-vs-origin pick), diff `target...branch`, print Base in header
- `skills/plan-complete/SKILL.md` — A/B/C/D merge dispatch merges into `target`; base-missing error; prompt/confirmation name the real target
- `skills/plan-pause/SKILL.md` — switch-back stays on default branch (documented decision)
- `skills/plan-capture/SKILL.md` — task-template header comment documents the optional `**Base:**` slot
- `skills/plan-elaborate/SKILL.md`, `plan-clarify`, `plan-discuss`, `plan-reopen`, `plan-combine` — preserve/reconcile the field on header rewrite
- `skills/plan-show/SKILL.md`, `plan-status`, `plan-list` — display Base when set

## How
- [x] Step 1: Add the shared **"Resolve target branch"** rule to `CLAUDE.md` as a new cross-skill-contract section: `target = **Base:** header value if present, else default branch (git symbolic-ref refs/remotes/origin/HEAD → main → master)`; absence/equality ⇒ today's behavior byte-for-byte. Add a `### The **Base:** task-header field` section modeled on the `**Build:**` section (optional, opt-in, never seeded, never auto-set at capture). Update the header-field docs, Task Lifecycle (line ~104), and edge-case lists to mention Base.
- [x] Step 2: `plan-execute` — at the 4 branch-creation sites (single/multi-repo × branch/worktree) and the 2 pre-switch-off sites (~398, ~412), read the task's `**Base:**` field, resolve `target` per the shared rule, branch/switch from `target` instead of the default. Add: if the base branch doesn't exist in a repo, create it locally from that repo's default branch (`git branch <base> <default>` or checkout -b at add time) and print a one-line notice; never push. Multi-repo: one Base applies to every repo in the set, created per repo as needed. Add a `**Base:**` mention to the presented-state block.
- [x] Step 3: `plan-review` — resolve `target` and rebase onto it, keeping the local-vs-origin "whichever is further ahead" comparison applied to the base (origin/<base> may not exist → fall back to local <base>). Change the diff stat to `<target>...<task-branch>`. Print `**Base:** <base>` in the summary header when set. Do NOT touch the concurrency guard (3.6) or the .plans-protection guard.
- [x] Step 4: `plan-complete` — resolve `target` once (the single site feeding A/B/C/D) so every case (find-checkout, fast-forward check, throwaway merge worktree, case-C refusal text) uses the target. Keep the MAIN-checkout invariant. Make the AskUserQuestion merge prompt and the final confirmation name the real target ("merged to feature/x"). If the base branch no longer exists at completion, STOP with a clear error — never silently fall back to main.
- [x] Step 5: Header preservation on rewrite — `plan-elaborate` (mirror the "keeps its **Build:** field" precedent), `plan-clarify`, `plan-discuss`, `plan-reopen`, `plan-pause` (its "do NOT change other metadata" rule already covers it — confirm). `plan-combine`: build a new file, so add an explicit rule — if merged tasks have differing `**Base:**` values, ask (AskUserQuestion) which to keep; if all equal, carry it; if none, omit.
- [x] Step 6: `plan-pause` decision — switch-back goes to the **DEFAULT** branch, not the base. Write the decision + justification into the skill (Notes/step comment) and keep the existing `git checkout [default-branch]` behavior. (Justification in this task's Notes.)
- [x] Step 7: Display — `plan-show` prints `**Base:** <base>` beside Branch (review template, and in-progress template) when set; add a note to `plan-status` / `plan-list` about showing Base when set (list is compact — surface only where Branch is already shown). Omit entirely when absent.
- [x] Step 8: Also update `plan-backlog` (line ~59, switches to default when shelving a branched task) and `plan-merge-reviews` (line ~47, detects default "the same way plan-review does") — decide + document: plan-backlog switches to default (mirrors plan-pause); plan-merge-reviews resolves its integration base independent of per-task Base (document as out of scope / no change) — record whichever is chosen.
- [x] Step 9: Once skill changes are done, add `**Base:** feature/example-feature` to the headers of tasks #901–#906 in `~/work/multi-repo-app/.plans/pending/`, directly under the `**Status:**` line (after `**Blocked by:**` where present). This edits the multi-repo-app project files, NOT the plans-cc repo.
- [x] Step 10 (review rework): Add an explicit `--base <branch>` / `--base=<branch>` capture flag to `plan-capture` and the auto-capture paths of `plan-execute` / `plan-elaborate` (extracted before all other parsing, validated with `git check-ref-format --branch`, errors with an existing task ID). Replace "NEVER auto-set at capture" with "never inferred; set by the flag, by hand, or via /plan-discuss" in CLAUDE.md, the capture template, and plan-help.

## Verification
- Grep the skills: the shared "resolve target branch" phrasing is referenced (not re-inlined) at every former default-branch idiom site; no site silently keeps the old default-only logic where Base should apply.
- A task with NO `**Base:**` field produces byte-identical branch/rebase/merge commands to before (diff the relevant skill sections mentally against the described fallback).
- Read plan-execute, plan-review, plan-complete end-to-end: Base flows FROM (branch), ONTO (rebase), INTO (merge); base-missing is handled (create-local in execute, hard-error in complete).
- plan-combine's Base-conflict prompt is present; every header-rewriter preserves the field.
- The plan-pause switch-back decision is written down with justification.
- Tasks #901–#906 in multi-repo-app carry the `**Base:**` line under Status/Blocked-by.
- `node --test` (find-root + registry) still passes — no lib changes, should be unaffected.

## Impact Scope

### Files to Modify
- [ ] `CLAUDE.md` — shared target-branch rule + `**Base:**` contract section + doc/edge-case updates
- [ ] `skills/plan-execute/SKILL.md` — branch-from-target (4 combos + 2 pre-switch sites); create-base-if-missing
- [ ] `skills/plan-review/SKILL.md` — rebase-onto/diff-against target; header shows Base
- [ ] `skills/plan-complete/SKILL.md` — merge-into target across A/B/C/D; base-missing error; prompt/confirmation naming
- [ ] `skills/plan-pause/SKILL.md` — document default-switch-back decision
- [ ] `skills/plan-capture/SKILL.md` — template header comment documents `**Base:**`
- [ ] `skills/plan-elaborate/SKILL.md` — preserve Base on re-elaboration
- [ ] `skills/plan-clarify/SKILL.md` — confirm/note Base preserved
- [ ] `skills/plan-discuss/SKILL.md` — confirm/note Base preserved
- [ ] `skills/plan-reopen/SKILL.md` — preserve Base
- [ ] `skills/plan-combine/SKILL.md` — ask which Base to keep on conflict
- [ ] `skills/plan-show/SKILL.md` — display Base when set
- [ ] `skills/plan-status/SKILL.md` — display Base when set (where task branch shown)
- [ ] `skills/plan-list/SKILL.md` — display Base when set (compact)
- [ ] `skills/plan-backlog/SKILL.md` — target-aware switch-back decision
- [ ] `skills/plan-merge-reviews/SKILL.md` — document Base interaction (likely no change)

### Related Files (may need updates)
- `lib/parse-tasks.js` — dashboard parser; a `baseMatch` regex would be needed ONLY if Base is surfaced in the dashboard (out of scope) — leave unchanged, note it.

### Endpoints/UI Affected
- multi-repo-app project tasks #901–#906 (external repo) — add `**Base:**` header line.

## Assumptions

### Initial (from elaboration)
- [low] plan-pause switch-back goes to the DEFAULT branch, not the base. **Why:** pause means "put main back to a clean state so I can context-switch"; the base is itself work-in-progress and may not exist locally as a resting place. Keeping today's default-branch behavior is also the least surprising and the smallest diff. Justification recorded in Notes.
- [low] ~~`**Base:**` is authoritative as a HEADER field only — no new `base` keyword is added to plan-execute's argument parser.~~ — superseded in review: the user asked for an explicit flag. Base is still never inferred, but `--base <branch>` now sets it at capture (Step 10). **Why:** the task scopes "auto-setting Base at capture" out and says it's set by hand or via plan-discuss; adding an arg parser surface would be extra scope not requested.
- [low] One global `**Base:**` value applies to every repo in a multi-repo task's repo set (created per repo as needed), rather than a per-repo base map. **Why:** the task explicitly states "one **Base:** value applies to every repo in the task's repo set." A per-repo base is a larger design the task did not ask for.
- [low] plan-reopen PRESERVES the `**Base:**` field when sending a task back to pending. **Why:** the task lists plan-reopen among the header-rewriters that must "keep the field"; the base is the task's intended integration target regardless of lifecycle position.
- [low] plan-merge-reviews resolves its own integration base independently and is NOT changed to honor per-task Base. **Why:** it consolidates multiple review-state tasks (possibly with different bases) onto one integration branch; a single per-task Base doesn't define the consolidated target. Documented as no-change rather than silently ignored.
- [low] plan-backlog switches back to the DEFAULT branch when shelving a branched task (mirrors the plan-pause decision). **Why:** backlog auto-pauses first; the resting checkout should be the clean default, consistent with pause.
- [high] Absence of `**Base:**` (or Base == default) must be byte-for-byte identical to today at every site. **Why:** stated as a hard requirement in the task and modeled on the established `models` / `worktree_links` / `**Build:**` absence-discipline in CLAUDE.md.
- [high] The change is documentation/skill-markdown only (no `lib/` code changes), so the existing `node --test` suite is unaffected and needs no new tests. **Why:** research confirmed the two test files (find-root, registry) cover lib helpers only; skills are declarative markdown with no automated tests, per CLAUDE.md's Testing section.

### Discovered during execution
- [low] Placed the `### Resolve target branch (cross-skill contract)` section immediately before `### Model selection`, grouping the two git/config target contracts together as instructed. **Why:** the segment prompt specified this placement so the git-target contracts sit adjacent.
- [low] Did NOT add a one-liner to `### Task Statuses`; no status-value semantics change with `**Base:**` (it affects branch targets, not status), so any insertion would have been forced. **Why:** the segment marked the Task Statuses edit as skippable if forced.
- [low] Worded the plan-pause/plan-backlog resting-branch decision as "return to the default branch is the only reliably-present resting point" and framed it as a deliberate exception. **Why:** the base is in-flight work that may not exist locally, so the default branch is the only guaranteed-clean park point.
- [low] In plan-execute, defined the create-if-missing rule ONCE in Step 7c and had the four branch-creation/pre-switch sites reference it by name rather than re-inlining the `git branch <target> <default-branch>` + notice text at each site. **Why:** the segment prompt asked for a single definition the four sites can reference; keeps the sites terse and avoids drift.
- [low] Named the resolved variable `target` (matching the CLAUDE.md contract wording) throughout Step 7c and the multi-repo path. **Why:** the segment prompt used `target`, and reusing the contract's own noun keeps the SKILL and the contract legible together.
- [low] Wrote the Step 9 presented-state annotation as "read from the header only, never inferred; omit the line entirely when absent." **Why:** mirrors the existing `Build route:` line's flag-only / header-only discipline so the two conditional lines read consistently.
- [low] In plan-complete, renamed the whole A/B/C/D dispatch vocabulary from `[default-branch]`/`[default-checkout-path]` to `[target-branch]`/`[target-checkout-path]` rather than keeping the old names and redefining them. **Why:** the segment prompt offered either option and asked for the clearer one; renaming makes it unambiguous at every site that the value is the resolved target, not literally the default.
- [low] Placed the base-missing hard error immediately after the target-resolution bullet in Step 14 and before the AskUserQuestion prompt, and gated it on "`**Base:**` present AND branch missing locally AND target != default". **Why:** the segment prompt required it fire only when a real base was set, so the no-Base path is untouched.
- [low] Updated Step 7's debug-cleanup `git diff --name-only ...` to use `[target-branch]` too (resolved inline, since Step 7 precedes Step 14's resolution). **Why:** with a Base set, the changed-file diff should be scoped to the base so debug scanning covers only this task's changes; with no Base it is the default branch, byte-for-byte unchanged.
- [low] In plan-review, named the resolved variable `[target]` throughout Step 6 and Step 10, replacing every prior `[default-branch]` placeholder at those sites (including the rebase-success/conflict AskUserQuestion prompt/message text and the "favor [target] for unrelated drift" resolve hint). **Why:** the segment prompt used `target`; converting the whole placeholder keeps the site internally consistent and the messages accurate when a base is set, while remaining byte-identical text in the no-Base case (target == default).
- [low] Rendered the `**Base:**` summary line whenever the field is set (not only when it differs from the default), placed directly under `**Branch:**` and above `**Type:** | **Status:**`. **Why:** the segment allowed either "differs-only" or "whenever set" and called the latter fine and clearer; placement mirrors the header field's own position (under Status → adapted to under Branch in the review summary where Status is on the combined line).
- [low] Added a base-aware Edge Cases entry rather than mutating the existing "Rebase onto latest main" / "Local main ahead of origin" prose entries. **Why:** those entries remain accurate for the common no-Base case; a separate entry documents the base behavior without rewording working default-case text.
- [low] Added the "a non-default base does not change which shared checkout is occupied" clarifying note as the first bullet of step 3.6 (guard logic untouched). **Why:** the segment explicitly permitted this one-line note; it preempts the reasonable question of whether Base interacts with the concurrency guard.
- [low] In plan-pause, placed the base-branch decision note as a blockquote at the TOP of Step 6 (above the kept-worktree / multi-repo / single-repo bullets) so it governs all `git checkout [default-branch]` paths at once, rather than repeating it beside each checkout. **Why:** one note above the three checkout paths avoids drift and reads as the step's governing rule; the git commands themselves were left byte-for-byte unchanged.
- [low] (Step 5) In plan-elaborate, placed the `**Base:**` preservation rule directly under the existing `**Build:**` "keeps it (never strip it)" line in Step 13, not in Step 14. **Why:** that is where the Build precedent lives; mirroring its spot keeps the two field-preservation rules adjacent and consistent.
- [low] (Step 5) In plan-clarify and plan-discuss, appended the header-preservation note to the existing full-file-rewrite-fallback Edge Cases bullet rather than adding a separate bullet. **Why:** the note is a qualifier on that fallback specifically, so co-locating it keeps the fallback's contract in one place.
- [low] (Step 5) In plan-combine, added the "Base logic" block between the Status logic and Content merging blocks of Step 9. **Why:** the segment prompt asked for a block parallel to the status/type determination; placing it adjacent to Status logic (also a header-field determination) reads most naturally.
- [low] (Step 5) Worded plan-combine's differing-base prompt options as each distinct base value labeled with "Used by task #NNN" plus a "No base" option. **Why:** the segment specified listing each distinct value plus a no-base option; attributing each value to its source task helps the user choose.
- [low] In plan-pause, extended the Step 4 "do NOT change other metadata" parenthetical to name `**Base:**` explicitly (Branch, Base, Created, Type) and cross-referenced the CLAUDE.md header-field contract. **Why:** makes the header-preservation half of the base contract obvious at the point of the metadata rule, matching how the field is already listed among preserved header rewriters.
- [low] (Step 7) In plan-show, added the `**Base:** [base]` line to the in-progress template (which does NOT print Branch) directly under its `**Status:** | **Type:** | **Created:**` line, in addition to the review template (under `**Branch:**`). **Why:** the segment prompt said to add it under the Status/Type/Created line when the in-progress template lacks a Branch line, making the base visible earlier in the lifecycle.
- [low] (Step 7) In plan-show, documented the Base-line omission rule as a new bullet at the TOP of the existing Step 8 "Handle sparse task files" list, and added a Base parse line to Step 5. **Why:** Step 8 already governs which conditional lines/sections are omitted when empty, so the omit-when-absent rule for Base belongs there; parsing must be declared in Step 5 alongside the other header fields.
- [low] (Step 7) In plan-status, placed the "Base is intentionally not surfaced" documentation note as the last bullet of the "Branch display rules" block; in plan-list, placed the parallel note directly above the "Progress column" definitions (nearest the column layout). **Why:** the segment prompt asked for a documented note near the branch/column definitions in each; these are the closest documentation anchors, and neither changes any rendered output.
- [low] (Step 8) In plan-backlog, placed the DEFAULT-not-base switch-back note as a new first bullet at the TOP of the Step 5 "Branch/worktree commit + checkout" sub-block (above the multi-repo/single-repo/worktree bullets) so it governs both `git checkout [default-branch]` paths at once. **Why:** one governing note above the two checkout paths mirrors how Step 8's plan-pause edit placed its note above the three paths, avoids drift, and left the git commands byte-for-byte unchanged.
- [low] (Step 8) In plan-backlog, added the "backlog is a location, not a status — preserve all header metadata verbatim" note as a bullet under Step 8 "Move the file" naming `**Base:**`/`**Branch:**`/`**Repos:**`/`**Worktree:**`, rather than a broader rewrite of the move step. **Why:** the `mv` already preserves content verbatim, so the note documents the existing behavior at the exact step where the file changes hands; naming the fields makes the no-strip guarantee explicit.
- [low] (Step 8) In plan-merge-reviews, placed the "per-task Base is out of scope; integration base is the repo default" note as a new bullet immediately BEFORE the existing "Detect the default branch" bullet in Step 2, and appended a clause to that detect bullet noting `[default]` serves as both integration base and the overlap-diff comparison base. **Why:** the segment prompt asked for the note near the default-branch detection (~line 47) and permitted the optional overlap-diff clause; co-locating both keeps the decision adjacent to the code it governs. Git command logic left unchanged (doc-only).

## Changes

Implemented on branch `feature/039-add-optional-per-task-base-branch-support` (16 files).

**Foundation (CLAUDE.md):**
- Added `### Resolve target branch (cross-skill contract)` (before Model selection): canonical rule `target = **Base:** if present/non-empty, else default (origin/HEAD → main → master)`, absence discipline, auditable consuming-site list, multi-repo semantics, scope boundaries.
- Added `### The **Base:** task-header field` (after the **Build:** section): format, placement (under Status/after Blocked-by), opt-in/never-inferred/never-seeded, header preservation, plan-combine conflict prompt, display, pause/backlog-return-to-default decision, plan-complete hard-stop on missing base.
- Added a base clause to the Task Lifecycle merge-dispatch paragraph.

**Core git skills:**
- `plan-execute` — resolves `target` in Step 7c; all 4 branch/worktree creation sites + both pre-switch-off sites branch/switch FROM `[target]` (`git checkout -b … [target]`, `git worktree add … -b … [target]`); create-base-locally-if-missing rule (from repo default, one-line notice, never push); per-repo target in multi-repo; conditional `Base:` line in presented state.
- `plan-review` — rebases ONTO `[target]`; local-vs-origin "further ahead" comparison applied to base with `origin/<target>`-missing fallback to local; diff stat `[target]...[branch]`; `**Base:**` in summary header when set; concurrency (3.6) and .plans-protection guards untouched.
- `plan-complete` — resolves `[target-branch]` once feeding A/B/C/D + find-checkout + FF check + throwaway merge worktree + case-C refusal + confirmation; base-missing hard error (`🔴 BLOCKED · … base branch '…' no longer exists`); merge prompt + confirmation name the real target; MAIN-checkout invariant intact.

**Header preservation / rewriters:**
- `plan-elaborate` (mirrors **Build:** keep-it rule), `plan-clarify` + `plan-discuss` (full-file-rewrite fallback preserves header metadata incl. Base), `plan-reopen` (preserves Base), `plan-combine` (new Step-9 Base-reconciliation: none→omit, all-same→carry, differ→AskUserQuestion which to keep; + edge case).
- `plan-pause` — documented decision: switch back to DEFAULT (not base) with 4-point justification; Base added to preserve-metadata list; git commands unchanged.

**Display:**
- `plan-show` — `**Base:**` line in in-progress + review templates when set (omitted when absent).
- `plan-status` / `plan-list` — documented notes that per-task Base is intentionally not surfaced in the compact views (shown by `/plan-show`); no rendered output change.

**Other branch-touching skills:**
- `plan-backlog` — switch-back stays on DEFAULT (mirrors pause) + metadata-preservation note; commands unchanged.
- `plan-merge-reviews` — documented that its integration base is the repo default independent of per-task Base (out of scope); logic unchanged.

**Task template:** `plan-capture` template header comment documents the optional `**Base:**` slot.

**multi-repo-app project:** added `**Base:** feature/example-feature` to tasks #901–#906 (under Status, after Blocked-by for #903/#904).

**Tests:** `node --test` → 16/16 pass (no lib changes; markdown-only skill edits).

**Not done (out of scope):** merging base→main, pushing, auto-setting Base at capture, dashboard/TUI Base surfacing (`lib/parse-tasks.js`).

## Notes

### plan-pause switch-back decision (required by the task)
**Decision:** After pausing a task, plan-pause switches the working checkout back to the
**DEFAULT branch** (today's behavior), NOT to the task's `**Base:**`.

**Justification:**
1. **Pause is a "return to clean slate" operation.** The user pauses to context-switch to
   unrelated work. The default branch is the canonical clean resting point; a feature base
   like `feature/example-feature` is itself in-flight work and a poor place to land.
2. **The base may not exist as a checkout-able resting branch.** Base can be created
   lazily/locally by plan-execute; forcing pause to check it out would couple pause to
   execute's create-if-missing logic for no benefit.
3. **Smallest, safest diff + least surprise.** Keeping the existing `git checkout
   [default-branch]` behavior means pause is fully backward-compatible and predictable.
   The task's opt-in Base semantics are about *integration* (branch-from / rebase-onto /
   merge-into), and pause performs none of those three — it only parks the checkout.
4. **Consistency with plan-backlog**, which auto-pauses and should land on the same clean
   default. Both are documented identically.

### Out of scope (from the task)
- Merging the base branch into main (user does that by hand).
- Any pushing (create-base-if-missing is local-only).
- Auto-setting `**Base:**` at capture time (set by hand or via plan-discuss).
- Dashboard/TUI surfacing of Base (`lib/parse-tasks.js` `baseMatch`) — noted, not implemented.

### Off-design observations
- The default-branch idiom appears 9× across 6 skills; centralizing it as a named rule in
  CLAUDE.md and referencing it (rather than re-inlining) is the cleanest way to satisfy
  "reference the rule everywhere instead of repeating the logic."
- plan-combine is the only header-rewriter that builds a brand-new file from scratch, so it
  needs an explicit carry/ask rule; every other rewriter preserves the field automatically
  via in-place edits.
