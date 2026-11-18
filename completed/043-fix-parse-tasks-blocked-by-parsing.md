# Fix parse-tasks Blocked-by parsing dropping #-prefixed IDs

**ID:** 043
**Created:** 2026-10-05T15:10
**Type:** bug
**Status:** completed
**Completed:** 2026-10-05T16:37
**Branch:** fix/043-fix-parse-tasks-blocked-by-parsing

## What
Fix parse-tasks Blocked-by parsing dropping #-prefixed IDs. `lib/parse-tasks.js` (around lines 42–45) splits the `**Blocked by:**` value on `[,\s]+` and keeps only tokens matching `/^\d{3}$/`. But `/plan-depends` writes the documented form `**Blocked by:** #MMM, #PPP`, so the `#` survives the split and `blockedBy` appears to always be empty. That would leave the dashboard / desktop app unable to show blocked tasks. Found during #041 research by reading the code, not by running it. Confirm with a failing test first.

## Why
Improves reliability: `/plan-depends` writes blocker IDs as `#NNN`, but the parser silently drops every `#`-prefixed token, so `blockedBy` is always empty and the dashboard can never render a task as blocked. Fixing the reader to match the documented writer format restores the blocked-task signal that the dashboard and desktop app depend on.

## How Summary
Normalize blocker-ID tokens in `parse-tasks.js` so the filter accepts both the documented `#NNN` form (what `/plan-depends` writes) and the bare `NNN` form, capturing the 3 digits and discarding the optional `#` — mirroring the `(#?)(\d{3})` tolerance already used in `lib/plans-git.js`. The normalized value stays bare so the downstream `completedIds.has(bid)` comparison keeps working. Pin the behavior with a new `test/parse-tasks.test.js` that currently fails.

**Files of note:**
- `lib/parse-tasks.js` — the buggy parser; the token filter at lines 42–45 is the fix site
- `test/parse-tasks.test.js` — new test file (does not exist yet) pinning the `#NNN` → `blockedBy` behavior
- `lib/plans-git.js` — reuse precedent: its `(#?)(\d{3})` pattern (~line 393) already tolerates the optional `#`
- `skills/plan-depends/SKILL.md` — documents the writer format `**Blocked by:** #MMM, #PPP` (~line 56), the input the parser must accept
- `test/render-progress.test.js` — reusable tmpdir + `write`/`task` test-harness pattern to copy

## Diagnosis

**Most likely:** The blocker-ID filter rejects the `#` prefix that `/plan-depends` actually writes, so every token is discarded and `blockedBy` is always empty (`lib/parse-tasks.js:45`).
**Evidence:** The reader filters with `/^\d{3}$/` after splitting on `/[,\s]+/` (`lib/parse-tasks.js:43–45`), but the writer emits `**Blocked by:** #MMM, #PPP` (`skills/plan-depends/SKILL.md:56`). Splitting `"#043, #044"` yields `["#043","#044"]`; each still starts with `#`, so `/^\d{3}$/.test("#043")` is `false` and both are filtered out. `isBlocked` is then derived from an empty `blockedBy` (`lib/parse-tasks.js:89`), so the dashboard's `[BLOCKED]`/`⊘` markers never fire.
**Confidence:** high

**To confirm:** Add a failing unit test: parse a pending task whose header contains `**Blocked by:** #043, #044` and assert `blockedBy` deep-equals `["043","044"]` (and `isBlocked === true`). It currently returns `[]`/`false`.

## How
- [x] Step 1: Add a failing test in a new `test/parse-tasks.test.js` that writes a pending task with `**Blocked by:** #043, #044` (plus an uncompleted blocker) and asserts `parseTasks(plansDir).tasks[0].blockedBy` deep-equals `["043","044"]` and `isBlocked === true` (confirms the Diagnosis; agent-verifiable via `npm test`, so untagged)
- [x] Step 2: Fix the token handling in `lib/parse-tasks.js` lines 42–45 so each token is matched with `/^#?(\d{3})$/` and normalized to the captured bare 3-digit id — accepting both `#043` and `043`, still rejecting anything that is not a 3-digit id, and keeping the value `#`-free so `completedIds.has(bid)` at line 89 still matches bare filenames
- [x] Step 3: Add a second test asserting the bare-number form (`**Blocked by:** 043 044`) still parses to `["043","044"]`, so the fix stays backward-compatible with any pre-existing bare-ID task files
- [x] Step 4: Run `npm test` and confirm the whole suite (including the two new assertions) passes

## Verification
- `npm test` passes with the new `test/parse-tasks.test.js` included.
- A task written with `**Blocked by:** #043, #044` now yields `blockedBy === ["043","044"]` and `isBlocked === true` (previously `[]`/`false`).
- The bare-number form (`**Blocked by:** 043 044`) still parses correctly — no regression for older task files.
- No changes to `/plan-depends`'s written format or to `lib/render-progress.js`; the fix is confined to `lib/parse-tasks.js` and the new test.

## Impact Scope
_Fewer than 3 files modified (lib/parse-tasks.js + new test/parse-tasks.test.js) — section intentionally omitted._

## Assumptions

### Initial (from elaboration)
- [low] Normalize the parsed blocker ID to the **bare** `NNN` form (strip `#`) rather than keeping the `#`. **Why:** `isBlocked`'s `completedIds.has(bid)` check at `lib/parse-tasks.js:89` compares against bare 3-digit filenames, so leaving the `#` in would fix the empty-array symptom but silently break the completed-blocker comparison; research surfaced no consumer that expects a leading `#`.
- [low] Fix at the filter/normalization step only, leaving `/plan-depends`'s `#NNN` writer format and `lib/render-progress.js` untouched. **Why:** the writer format is documented (`plan-depends/SKILL.md:56`) and used elsewhere; the reader is the side that diverged from it, so correcting the reader is the minimal, lowest-risk fix. Research explicitly warned against reformatting the writer.

### Discovered during execution
- [high] Malformed tokens (`#43`, `##043`, `#0430`, `abc`) are silently dropped rather than warned about, and this is now pinned by a test. **Why:** it keeps the existing filter's behavior (silently ignore non-ids). The parser feeds the dashboard and has no warning channel.
- [high] The bare-form regression test (Step 3) was written alongside the Step 1 test in the same new file, so it passed during the red run. Only the three `#`-dependent tests failed. **Why:** the bare form already worked before the fix, so it acts as a regression guard and could never have been red.

## Changes
- `lib/parse-tasks.js`: the `**Blocked by:**` tokens are now matched with `/^#?(\d{3})$/` and stored as bare ids. The documented `#NNN` form that `/plan-depends` writes now fills `blockedBy`, and `completedIds.has(bid)` still matches completed filenames.
- `test/parse-tasks.test.js` (new) has 4 tests:
  - `#043, #044` parses to `["043","044"]` with `isBlocked`.
  - The bare `043 044` form still parses.
  - A completed `#` blocker gives `isBlocked === false`.
  - Malformed tokens are dropped.
- Tests: before the fix, 3 of 4 failed. After the fix, `node --test test/parse-tasks.test.js` passes 4/4. Only this file was run, not the full `npm test`, per the targeted-tests rule.

## Notes
_Additional context_
