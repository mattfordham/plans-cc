# Fix bootstrap leaving an uncommitted .gitignore edit

**ID:** 047
**Created:** 2026-10-05T16:32
**Type:** bug
**Status:** completed
**Completed:** 2026-10-05T21:56
**Branch:** fix/047-fix-bootstrap-leaving-uncommitted-gitignore

## What
`plans-git.js bootstrap` reuses `join` unchanged. On a clone whose `.gitignore` lacks the slashless `.plans` line, `join` edits `.gitignore` and leaves the change uncommitted, so a remote SessionStart hook leaves the code checkout dirty. `.git/info/exclude` already keeps `.plans` ignored, so bootstrap could skip the `.gitignore` edit (e.g. a `join` option) and rely on the exclude, maybe printing a hint instead. Decide the behavior and cover it in `test/branch-mode.integration.test.js`.

## Why
A remote SessionStart hook runs `plans-git.js bootstrap` non-interactively. When it leaves the code checkout dirty (a modified `.gitignore` nobody will commit), every subsequent `git status` in that session is noisy and any `git add -A` risks sweeping the edit into an unrelated commit — the opposite of bootstrap's "attach quietly, touch nothing on the code branch" contract. Since `.git/info/exclude` already keeps `.plans` ignored in the clone, the `.gitignore` edit is redundant and should not happen on the bootstrap path.

## How Summary
Give `join` an opt-in `skipGitignore` flag that bypasses the `ensureSlashlessIgnore` write (the unconditional `addInfoExclude` already keeps `.plans` ignored via `.git/info/exclude`), and have `bootstrap` pass it. When bootstrap would otherwise have edited `.gitignore`, surface a one-line **stderr** hint (bootstrap's stdout must stay empty) telling the user to add a slashless `.plans` line for other clones — the checkout stays clean. The interactive `join` CLI is unchanged: it still edits `.gitignore` and prints its `(commit it)` hint. Cover the clean-checkout behavior in the integration test.

**Files of note:**
- `lib/plans-git.js` — `join` (~L973) gains `skipGitignore`; `bootstrap` (~L1049) passes it and records whether the hint is needed. `ensureSlashlessIgnore` (~L689) and `addInfoExclude` (~L674) are the two ignore mechanisms in play.
- `bin/plans-git.js` — bootstrap output block (~L93-107): drop/replace the `added .plans to .gitignore (commit it)` branch for bootstrap; emit the exclude hint via `res.messages` (already printed to stderr).
- `test/branch-mode.integration.test.js` — `makeOrigin` (~L92) seeds `.gitignore` WITH `.plans`; a new test needs a line-less variant plus clean-checkout / still-ignored assertions.

## Diagnosis

**Most likely:** `join` unconditionally edits the code repo's `.gitignore` via `ensureSlashlessIgnore` but never commits it, and `bootstrap` reuses `join` as-is, so a non-interactive remote session is left with a dirty working tree. (`lib/plans-git.js:1008` the edit; `lib/plans-git.js:1116` bootstrap calls join; `bin/plans-git.js:104` advertises the dirty state with a `(commit it)` hint nobody acts on)
**Evidence:** `ensureSlashlessIgnore` (`lib/plans-git.js:689-708`) writes `.gitignore` and returns `true` whenever the slashless `.plans` line is absent; `join` has no `git add`/`commit` for the code repo (its only commits go to the `.plans` worktree). Meanwhile `addInfoExclude` (`lib/plans-git.js:674`, called at `:997`) already writes `.plans` into `.git/info/exclude` unconditionally, so `.plans` stays ignored even without the `.gitignore` edit — the edit is redundant for this clone.
**Confidence:** high

**To confirm:** With a line-less `.gitignore`, running bootstrap today leaves ` M .gitignore` in `git status --porcelain` while `git check-ignore .plans` still prints `.plans` — proving the exclude alone suffices and the edit is the sole source of dirtiness. Encode this as a failing integration test (clean checkout expected) before the fix.

## How
- [x] Step 1: Add a failing integration test in `test/branch-mode.integration.test.js` that reproduces the dirtying path — seed an origin whose `.gitignore` omits `.plans`, `initBranch` on clone `a`, capture a task, clone `b`, run `cli(b, "bootstrap")`, and assert `gitOk(b, "status", "--porcelain") === ""` plus `gitOk(b, "check-ignore", ".plans") === ".plans"` (confirms the Diagnosis; agent-verifiable via `npm test`, so untagged)
- [x] Step 2: Add a `skipGitignore` option to `join` in `lib/plans-git.js` — when truthy, skip the `result.gitignoreChanged = ensureSlashlessIgnore(root)` call (~L1008) and leave `gitignoreChanged` false; `addInfoExclude` (~L997) stays unconditional so `.plans` remains ignored. Leave the default (interactive `join`) path unchanged.
- [x] Step 3: In `bootstrap` (`lib/plans-git.js`), pass `{ ..., skipGitignore: true }` to the `join` call (~L1116). Compute and record whether the clone's `.gitignore` lacks a slashless `.plans` line (a small read, reusing the same line-check logic as `ensureSlashlessIgnore`) so a hint can be surfaced — push a one-line hint onto `result.messages` (e.g. `` `.plans` not in .gitignore; add a slashless `.plans` line so other clones ignore it (now covered by .git/info/exclude) ``) only when the line is missing.
- [x] Step 4: In `bin/plans-git.js`, update the bootstrap output block (~L93-107) so the `joined` OK line no longer appends `; added \`.plans\` to .gitignore (commit it)` (that branch keyed on `res.gitignoreChanged`, now always false for bootstrap); confirm `res.messages` are still printed to stderr so the Step 3 hint shows. Leave the interactive `join` CLI output (~L118) untouched.
- [x] Step 5: Update the existing bootstrap integration tests if they assert the old `(commit it)` suffix, and extend/adjust assertions so both the line-present and line-absent cases leave the checkout clean; run `npm test` and confirm all pass (previously 83/83).

## Verification
- A clone whose committed `.gitignore` lacks a slashless `.plans` line, after `plans-git.js bootstrap`, has a clean working tree: `git status --porcelain` is empty, `.gitignore` is unmodified.
- `.plans` is still ignored in that clone: `git check-ignore .plans` prints `.plans` (via `.git/info/exclude`).
- Bootstrap's stdout stays empty; its stderr OK line reads `OK: .plans is attached to <remote>/<branch>` with no `(commit it)` suffix, plus (only when the line is absent) the one-line add-to-.gitignore hint.
- The interactive `join` CLI still edits `.gitignore` and still prints `; added \`.plans\` to .gitignore (commit it)` — unchanged.
- `npm test` passes (all existing scenarios plus the new line-less bootstrap test).

## Impact Scope

### Files to Modify
- [x] `lib/plans-git.js` — add `skipGitignore` option to `join`; have `bootstrap` pass it and record the missing-line hint
- [x] `bin/plans-git.js` — drop the `(commit it)` suffix on bootstrap's joined OK line; ensure `res.messages` hint prints to stderr
- [x] `test/branch-mode.integration.test.js` — add a line-less `.gitignore` bootstrap test; adjust existing bootstrap assertions

### Related Files (may need updates)
- `test/plans-git.test.js` — unit tests for `join`/`bootstrap`; check whether any assert the old `gitignoreChanged`/suffix behavior

### Endpoints/UI Affected
- `plans-git.js bootstrap` CLI output — no `(commit it)` suffix; optional one-line exclude hint on stderr (stdout unchanged: empty)
- `plans-git.js join` CLI output — unchanged

## Assumptions

### Initial (from elaboration)
- [low] Behavior chosen: bootstrap SKIPS the `.gitignore` edit via a new `join` `skipGitignore` option and relies on `.git/info/exclude`, AND prints a one-line stderr hint when the slashless `.plans` line is missing. **Why:** the task says "decide the behavior" and "maybe printing a hint"; the module's quiet/never-dirty invariant rules out committing the edit, and `.git/info/exclude` is already written unconditionally, so skipping is safe. The hint goes to stderr (bootstrap's stdout must stay empty) so it adds no risk — chosen over fully silent because it helps a human fix the shared `.gitignore` for non-bootstrap clones. A reviewer may prefer fully silent (drop Step 3's hint).
- [high] The fix is scoped to the bootstrap path only; the interactive `join` CLI keeps editing `.gitignore` and printing `(commit it)`. **Why:** research confirmed interactive `join` legitimately wants the edit and a human to commit it (`bin/plans-git.js:118`); the task phrasing ("a `join` option") implies an opt-in that only bootstrap sets. Other `join` callers (`initBranch`, `migrate`) are unaffected since they don't pass the flag.
- [high] `addInfoExclude` keeps `.plans` ignored without the `.gitignore` edit, so skipping is behavior-preserving for ignore semantics. **Why:** `addInfoExclude` (`lib/plans-git.js:674`) is called unconditionally in `join` at `:997`, before the `.gitignore` write, and writes `.plans` to `.git/info/exclude`; `git check-ignore` honors `info/exclude`.

### Discovered during execution
- [high] Added a small standalone `hasSlashlessIgnore(root)` helper rather than refactoring `ensureSlashlessIgnore` to expose the check. **Why:** The segment explicitly forbids changing `ensureSlashlessIgnore`'s behavior; a separate read-only helper reuses the same line-check logic (`.trim() === ".plans" || "/.plans"`) without touching the existing function, and keeps the mutating/non-mutating concerns separate.
- [high] No change to `bin/plans-git.js` was needed for the hint to surface. **Why:** The CLI bootstrap block already iterates `res.messages` to stderr (`for (const m of res.messages || []) err(m)` at ~L98), so pushing the hint onto `result.messages` in `bootstrap()` prints it automatically — the CLI output change noted in the elaboration is already in place for messages.
- [low] Placed the new integration test immediately after the existing "bootstrap attaches a fresh clone" test and parameterized `makeOrigin` with an `{ plansIgnored }` option (default true) rather than adding a separate seeding function. **Why:** Keeps the one origin-seeding helper as the single source of truth; the default preserves byte-identical behavior for all existing callers.
- [high] Step 4: removed the `; added \`.plans\` to .gitignore (commit it)` suffix entirely from the CLI bootstrap "joined" OK line rather than leaving the (now-always-false) `res.gitignoreChanged` ternary in place. **Why:** bootstrap calls `join` with `skipGitignore: true`, so `gitignoreChanged` is structurally always false for the bootstrap path — keeping the ternary would be dead-but-misleading code. Replaced it with an unconditional `OK: .plans is attached to <r>/<b>` plus a comment explaining the line-absent case is surfaced via `res.messages`. The INTERACTIVE `join` CLI block (its own command handler, ~L116) was left completely untouched and still prints the suffix when its own `gitignoreChanged` is true.
- [high] Step 5: made NO test changes. **Why:** The two integration-test OK-line assertions use a start-anchored regex (`/^OK: \.plans is attached to origin\/plans/`) that never asserted the trailing suffix, so they are correct and suffix-agnostic as written; the `join: a second clone...` unit test's `res.gitignoreChanged === true` assertion exercises the DIRECT interactive `join` path (no `skipGitignore`), which is unchanged. No existing test encoded the old bootstrap suffix / bootstrap-`gitignoreChanged` behavior, so inventing changes would have been wrong per the segment's "do not invent changes" rule.

## Changes

Executed in worktree on branch `fix/047-fix-bootstrap-leaving-uncommitted-gitignore` (from `main`). All 5 How steps complete; status → review.

**`lib/plans-git.js`**
- Added read-only helper `hasSlashlessIgnore(root)` (above `ensureSlashlessIgnore`): returns true iff the code repo's `.gitignore` already carries a slashless `.plans` (or `/.plans`) line. Does not mutate anything.
- `join(root, opts)`: new `skipGitignore` option. The `.gitignore` write is now `result.gitignoreChanged = o.skipGitignore ? false : ensureSlashlessIgnore(root);`. `addInfoExclude(root)` stays unconditional (runs earlier), so `.plans` remains ignored via `.git/info/exclude`. Default/interactive path is byte-for-byte unchanged (flag falsy ⇒ original call).
- `bootstrap(startDir, opts)`: now calls `join(root, { branch, remote, skipGitignore: true })` so it never edits the tracked `.gitignore`. When `!hasSlashlessIgnore(root)`, it pushes a one-line hint onto `result.messages`: `` `.plans` not in .gitignore; add a slashless `.plans` line so other clones ignore it (now covered by .git/info/exclude) ``.

**`bin/plans-git.js`**
- Bootstrap output block: the "joined" OK line no longer appends the `; added `.plans` to .gitignore (commit it)` suffix (that ternary was keyed on `res.gitignoreChanged`, now structurally always false for bootstrap). It now reads exactly `OK: .plans is attached to <remote>/<branch>`. `res.messages` are still printed to stderr (loop at the top of the block), so the Step 3 hint surfaces. The interactive `join` command handler was left untouched — it still appends the `(commit it)` suffix when its own `gitignoreChanged` is true.

**`test/branch-mode.integration.test.js`**
- Parameterized `makeOrigin(originOpts)` with `{ plansIgnored }` (default `true`, so existing callers are byte-identical). `plansIgnored: false` seeds a `.gitignore` of just `.worktrees\n`, omitting `.plans`.
- New test `bootstrap leaves the checkout clean when the shared .gitignore omits .plans`: seeds a line-less origin, `initBranch` on clone `a`, captures a task, clones `b`, runs `cli(b, "bootstrap")`, and asserts stdout empty, OK line matches `/^OK: \.plans is attached to origin\/plans/`, `git status --porcelain` is empty (clean checkout), and `git check-ignore .plans` prints `.plans` (still ignored via `.git/info/exclude`). This test fails on the pre-fix code (` M .gitignore`) and passes after — TDD red→green.

**Tests (targeted, re-run by orchestrator; full suite deliberately not run):**
- `node --test test/plans-git.test.js` → tests 54, pass 54, fail 0.
- `node --test test/branch-mode.integration.test.js` → tests 8, pass 8, fail 0 (incl. the new test).

## Notes
- Follow-up found during #042 execution (see the Changes section of `042-add-branch-mode-cleanup-health-check.md`).
