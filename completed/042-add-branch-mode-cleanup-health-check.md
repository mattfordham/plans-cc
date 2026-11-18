# Add branch mode cleanup health check, worktree-skill audit, remote bootstrap, and integration tests

**ID:** 042
**Created:** 2026-10-05T14:56
**Type:** feature
**Status:** completed
**Completed:** 2026-10-05T16:34
**Blocked by:** #040, #041
**Branch:** feature/042-add-branch-mode-cleanup-health-check

## What
Add branch mode cleanup health check, worktree-skill audit, remote bootstrap, and integration tests. Spec: `.plans/artifacts/branch-mode-spec.md` (task 3 of 3).

- `plan-cleanup`: document that step 7.5 does not false-flag branch mode (outer `git ls-files` never lists a nested worktree), keep the trailing-slash warning; add an explicit guard so the reconciler never reaps the `.plans` worktree; add a branch-mode health check (worktree present, on the configured branch, upstream set, not detached, no stuck rebase/autostash).
- Audit `plan-execute` 7e / multi-repo step 4, `plan-spawn`, `plan-review`, `plan-complete` (merge dispatch / `git worktree list` lookups) for identical behavior with a `.plans` worktree present.
- Remote bootstrap: `plans-git.js bootstrap [--branch <name>]`, idempotent (fetch, add the `.plans` worktree if missing, set `merge.ours.driver`, else `sync`). Document a SessionStart hook for the project's `.claude/settings.json` that runs `npx -y plans-cc` then the bootstrap.
- Integration test in a temp repo: init branch mode → capture on a review branch → assert task on `plans`, not the code branch → worktree execute flow through the symlink → assert status visible at root.

## Why
Branch mode is only trustworthy if three things hold. Cleanup has to recognize it as healthy and never damage it. Every skill that touches worktrees or the root has to behave the same with a `.plans` worktree present. And remote sessions have to get `.plans/` without anyone doing it by hand. This task closes those gaps and proves the whole flow end to end, which is what makes the "remote access" goal real.

## How Summary
Mostly guards and checks, little new behavior:
- `plan-cleanup` gets a branch-mode health check (worktree registered, on the right branch, upstream set, no stuck rebase or autostash, merge driver set, `.plans` ignored) and learns that `.git-lock` and the `.plans` worktree must never be reaped.
- The worktree-touching skills get short notes plus one enforced guard: the plans branch can never be a `**Base:**`.
- `plans-git.js bootstrap` (idempotent, always exits 0) and a documented SessionStart hook bring `.plans/` into remote sessions.
- An end-to-end integration test drives the real CLI in temporary repos.

**Files of note:**
- `skills/plan-cleanup/SKILL.md`: guard in steps 6/7, a note in 7.5, new health check (step 7.6), focused-mode and summary lines
- `lib/plans-git.js` / `bin/plans-git.js`: `bootstrap` subcommand (reuses #041's `join`)
- `skills/plan-execute/SKILL.md`, `skills/plan-complete/SKILL.md`: reject the plans branch as `**Base:**`
- `test/branch-mode.integration.test.js`: end-to-end flow (new)
- `README.md`: "Remote sessions (branch mode)" section with the hook, plus fixes to out-of-date text
- `CLAUDE.md`: invariants (ignore rule, never reap the `.plans` worktree, `git clean -x` warning)

## How
- [x] Step 1: Write the failing integration test first, `test/branch-mode.integration.test.js`. It drives `node bin/plans-git.js` through `execFileSync` in temp repos (bare origin, realpath'd temp dirs, isolated git config, absolute paths). Skip it on git older than 2.42, unless the fallback is used. Scenarios:
  - `init-branch`, then capture a task while the root is on `review/x`. Assert the commit is on `plans`, `git ls-tree -r review/x` has no plan files, and the root status is clean.
  - Execution worktree: `git worktree add .worktrees/001-x` plus the `.plans` symlink, write status through the symlink, run `plans-git commit` from inside the worktree. Assert the change is visible at the root and committed on `plans`, and that `git -C wt add -A` doesn't stage `.plans`.
  - `git checkout` of another code branch in the root leaves `.plans` intact. `git worktree remove` of the execution worktree leaves the root's `.plans` intact.
  - `bootstrap` on a fresh clone attaches `.plans`. Running it a second time just syncs. With a plain local `.plans/` present it refuses and exits 0.
  - A `.plans` branch name used as `--base` is rejected by the helper's validator.
- [x] Step 2: Add `bootstrap [--branch <name>] [--remote <name>]` to `lib/plans-git.js` and `bin/plans-git.js`:
  - resolve the root, then `git worktree prune`;
  - if `.plans` is missing, run #041's `join`;
  - if it's in branch mode, run `sync`;
  - if it's a plain directory, refuse with the message `local .plans/ exists, run /plan-init branch to convert`;
  - if no remote branch exists, print a quiet message.

  All output goes to stderr and it always exits 0. Also export `isPlansBranch(name, root)` for the Base guard.
- [x] Step 3: Update `skills/plan-cleanup/SKILL.md`:
  - Step 6: explicitly exclude any registry entry whose path is the realpath of `<root>/.plans` or whose branch is the configured plans branch. Comment that the `.worktrees/` filter already excludes it, so this is defense in depth.
  - Step 7: allow `.git-lock` in branch mode, and report a lock older than 60s as stale (flag only, never delete it while it may be held).
  - Step 7.5: note that the outer `ls-files` never lists the nested worktree. In branch mode, an unignored `.plans` is an error, with a fix offered (add to `.git/info/exclude`).
  - New step 7.6, the branch-mode health check (runs only when `plans-git.js mode` says `branch`; silent otherwise):
    - worktree registered and present;
    - `symbolic-ref` is `refs/heads/<branch>` (detached otherwise);
    - upstream set;
    - no `rebase-merge`/`rebase-apply`;
    - no leftover autostash;
    - `merge.ours.driver` set;
    - root `check-ignore -q .plans`;
    - `git_commits:true`;
    - a `.git` file that isn't registered points at `plans-git.js bootstrap`.

    All of these are flag-only with a pointer to the fix, except one-line prompted fixes for a missing merge driver and a missing ignore. Never auto-abort a rebase or pop a stash.
  - Wire stuck-rebase/detached/unregistered warnings into focused-mode step 8. Add a summary line, `Branch mode: healthy (plans ↔ origin/plans)` or a list of the problems found.
- [x] Step 4: Audit and guard the worktree-touching skills.
  - In `plan-execute` (Base resolution) and `plan-complete` (step 14 dispatch), add a guard: if the target branch equals the configured plans branch, stop with `the plans branch can never be a base or merge target`.
  - Add one-line branch-mode notes, citing the CLAUDE.md invariant, at:
    - `plan-execute` 7e.5 and `plan-spawn` 6b.4 (the symlink resolves to the worktree, and commits go through the helper);
    - `plan-complete` 13, `plan-review` 4, `plan-pause` 6, `plan-backlog` and `plan-merge-reviews` (their root `add -A`/`stash`/`reset --hard` rely on `.plans` being ignored).
  - Confirm each verdict from the research audit holds, and record any that turn out differently in Changes.
- [x] Step 5: Docs.
  - CLAUDE.md, in the #040 contract:
    - the ignore rule (both `.gitignore` and `.git/info/exclude`);
    - never reap or prune-steer the `.plans` worktree;
    - `git clean -fdx` destroys it;
    - the plans branch is rejected as a base.
  - README: a new "Remote sessions (branch mode)" section with the SessionStart hook for the project's `.claude/settings.json`, along the lines of `npx -y plans-cc >/dev/null 2>&1; node ~/.claude/plans-cc/plans-git.js bootstrap >&2 || true`. Check the exact hooks schema and matcher against the current Claude Code docs before writing it. Note that it needs network access and degrades quietly offline.
  - Fix the README's out-of-date lines ("no runtime code", skill counts, the Testing section).
- [x] Step 6: Run `npm test` (full suite). Then run `/plan-cleanup` on a scratch branch-mode repo: it reports healthy. Break things one at a time (detach HEAD, unset the upstream, leave a stale lock) and confirm each is flagged without being destroyed.

## Verification
- `npm test` passes, including the new integration test. It proves:
  - capturing on a code branch commits only to `plans`;
  - worktree writes through the symlink reach the root and get committed;
  - checkout and worktree removal never touch `.plans`;
  - bootstrap is idempotent and refuses a plain local `.plans/`;
  - a `plans` base is rejected.
- `/plan-cleanup` on a healthy branch-mode scratch repo shows `Branch mode: healthy`, offers nothing to untrack or reap, and doesn't flag `.git-lock`. Each induced fault (detached HEAD, no upstream, stale lock, unignored `.plans`, unregistered worktree) is flagged with its fix pointer, and nothing is deleted.
- The documented SessionStart hook, run by hand in a fresh clone, prints nothing to stdout, attaches `.plans`, and exits 0 even with the network disabled.
- In local and inline mode, `/plan-cleanup` output is unchanged (step 7.6 is silent).

## Impact Scope

### Files to Modify
- [ ] `test/branch-mode.integration.test.js`: new end-to-end test
- [ ] `lib/plans-git.js` / `bin/plans-git.js`: `bootstrap`, `isPlansBranch`
- [ ] `skills/plan-cleanup/SKILL.md`: steps 6, 7, 7.5, new 7.6, 8, summary
- [ ] `skills/plan-execute/SKILL.md`: Base guard, note at 7e.5
- [ ] `skills/plan-complete/SKILL.md`: Base guard at step 14, note at 13
- [ ] `skills/plan-{spawn,review,pause,backlog,merge-reviews}/SKILL.md`: one-line notes on the branch-mode rule
- [ ] `README.md`: Remote sessions section, fixes to out-of-date text
- [ ] `CLAUDE.md`: branch-mode rules in the #040 contract

### Related Files (may need updates)
- `bin/install.js`: runs non-interactively and exits 0, so it's fine for the hook. `package.json` `files` omits `agents/` (a pre-existing gap; capture it separately if it matters).

## Assumptions

### Initial (from elaboration)
_To be filled during elaboration_

### Discovered during execution
- [high] plan-cleanup step 7.6 also runs check (a) when `.plans/.git` is a file, not only when mode prints `branch`. **Why:** I verified in a scratch repo that once the worktree admin dir is gone, `detectMode` returns `local`. A mode-only gate would hide the "unregistered worktree" fault the check exists to find. Local and inline `.plans/` never have a `.git` file, so their output stays silent.
- [high] The leftover-autostash check filters stash entries by subject `autostash` plus ancestry onto the plans branch. **Why:** the `.plans` worktree belongs to the code repo and shares its `refs/stash`. I verified that a conflicted `pull --rebase --autostash` leaves `stash@{n}` with reflog subject `autostash`. During a stuck rebase the stash lives at `<git-dir>/rebase-merge/autostash` instead.
- [high] The stale-lock test uses `find .plans/.git-lock -maxdepth 0 -mmin +1` rather than `stat`. **Why:** `find` behaves the same on macOS and Linux, where `stat -f`/`-c` differ. The lock is a directory (mkdir lock), so the check matches it.
- [low] The plans-branch Base guard in plan-execute and plan-complete fires only when `plans-git.js mode` prints `branch`, and is skipped when the helper is missing. **Why:** in local or inline mode no plans branch exists, so a code branch literally named `plans` is legitimate. Gating keeps those modes byte-identical. `is-plans-branch` alone would say `yes` for `plans` by default in any mode.
- [low] plan-pause now runs the helper commit after its branch paths when in branch mode. **Why:** the branch paths never called the helper. The pause status write was swept by the code `add -A` in inline mode only, so in branch mode it was never committed or synced. This is the one audited site that did not behave the same, and the fix is gated so local and inline are unchanged.
- [high] merge.ours.driver and the `.plans` ignore are checked and fixed at repo level (`git config`, `git rev-parse --git-path info/exclude`). **Why:** `.plans` is a linked worktree of the code repo, so config and info/exclude live in the shared common dir.
- [high] `bootstrap` prints every line, including its final status line, to stderr, and keeps stdout empty, even when it hits an unexpected error. Its final line is `OK: .plans is attached to <r>/<b>`, `OK: .plans synced with <r>/<b>`, `Skipped: <reason>`, or `Error: <reason>`. **Why:** SessionStart hook stdout is injected into the session as context. `Skipped:` is a third prefix because "no plans branch / no remote / not a git repo / remote unreachable" are normal outcomes for a hook that runs in every repo. They are not errors.
- [high] `bootstrap` treats an empty `.plans` dir as missing, and refuses any other non-branch `.plans` (a local dir, inline-tracked plans, or a stray file) with `local .plans/ exists, run /plan-init branch to convert`. **Why:** this matches `join`'s own empty-dir rule. Converting existing plans is migrate's job, behind plan-init's consent prompt, never a hook's.
- [high] `bootstrap` checks the remote branch with `git ls-remote --exit-code --heads` before calling `join`. Exit 2 means a quiet skip. Any other failure is a `Warning:` plus a skip (offline). **Why:** this tells "no plans branch" (quiet, per the spec) apart from "network down" (worth one line). Otherwise both would surface as join's generic fetch error.
- [low] `bootstrap` reuses `join` unchanged, so on a clone whose committed `.gitignore` lacks the slashless `.plans` line, it edits `.gitignore` and says `(commit it)`. **Why:** the instruction was to reuse join. In practice the repo that set up branch mode already committed the line, so this rarely fires. `.git/info/exclude` keeps `.plans` ignored either way. If remote sessions should never dirty the tree, add a join option to skip the `.gitignore` edit.
- [high] Root resolution for `bootstrap` is discovery first, then the git toplevel of cwd. It lives in `lib/plans-git.js`, which now requires `./find-root`, so it can be unit-tested. **Why:** a fresh clone has no `.plans/config.json` for discovery to find. The installer copies all of `lib/`, so the new require is fine in the installed layout too.
- [high] `isPlansBranch(name, root)` matches the configured `sync.branch` (default `plans`) and, in branch mode, the branch actually checked out at `.plans`. It accepts `refs/heads/`, `refs/remotes/<remote>/`, and `<remote>/` prefixes. It is exposed as `plans-git.js is-plans-branch <name>`, which prints `yes`/`no` on stdout. **Why:** a hand-edited `sync.branch` that disagrees with the real worktree must not open a hole in the Base guard. The CLI form lets skills call the guard without parsing config themselves. It does not check the mode, so skills gate on `mode == branch` (see the plan-execute/complete assumption above).
- [high] plan-cleanup 7.6 check (e) uses `git -C .plans rev-parse -q --verify '<b>@{u}'`, not a bare `'@{u}'`. **Why:** I verified in a scratch repo that on a detached `.plans` HEAD the bare form also fails, so one fault was reported twice (b and e). `refs/heads/<b>@{u}` also fails to resolve under `--verify`. The short `<b>@{u}` works.
- [high] The fix pointer for check (a)'s "unregistered" case is `git worktree repair .plans`, then a manual `mv .plans .plans.bak && rm .plans.bak/.git && git worktree add .plans <b> && cp -R .plans.bak/. .plans/`. It is not `bootstrap`. **Why:** I verified that with the admin dir deleted, mode reads `local` and `bootstrap` refuses with `local .plans/ exists`. `repair` fixes the moved-repo variant. The manual re-add kept an uncommitted plan file byte-identical. `bootstrap` remains the right pointer only when `.plans` is *missing*.
- [high] The docs say `git clean -ffdx` destroys `.plans`, not "any `-x`". **Why:** on git 2.50.1 I verified that `-fdx` skips the `.plans` worktree as a nested repository, while `-ffdx` removes it. The docs still warn against relying on single `-f`.
- [low] The README offline wording distinguishes an unattached clone (`Skipped: origin unreachable`) from an attached one (a sync `Warning:` and then `OK: .plans synced with …`). **Why:** observed hook runs. The attached-offline `OK` line is slightly optimistic. Changing it would be a code change outside this docs step, so the docs describe it as it behaves.
- [low] README calls the runtime "a small Node runtime" instead of "zero-dependency". **Why:** `blessed` is a declared dependency, used by the dashboard. Only `lib/` and plans-git are dependency-free, and CONTEXT.md now says exactly that.

## Changes
- **Step 1–2 (runtime):** `test/branch-mode.integration.test.js` (new, 7 scenarios driving the real CLI). `lib/plans-git.js` / `bin/plans-git.js`: `bootstrap [--branch] [--remote]` (prune → join if missing → sync if branch mode → refuse a plain local `.plans/`; stderr only, exit 0; final line `OK:` / `Skipped:` / `Error:`) and `is-plans-branch <name>` (`isPlansBranch`). Setup flag parsing shared via `parseSetupOpts`. 11 new unit tests in `test/plans-git.test.js`.
- **Step 3 (`plan-cleanup`):** step 6 never-reap guard for the `.plans` worktree; step 7 treats `.git-lock` / `.plans/.git` as expected in branch mode and flags locks >60s (never deletes); step 7.5 makes an unignored `.plans` an error with a prompted `.git/info/exclude` fix; new step 7.6 health check (a)–(h); focused step 8 warnings; summary line `Branch mode: healthy (<b> ↔ <r>/<b>)`.
- **Step 4 (audit):** plans-branch `**Base:**` guard in `plan-execute` 7c and `plan-complete` 14 (branch mode only). Branch-mode notes in execute, spawn, complete, review, pause, backlog, merge-reviews. Audit verdicts: every site behaves the same with a `.plans` worktree present except `plan-pause` 6, which never committed via the helper on its branch paths — fixed (helper commit when mode is `branch`).
- **Step 5 (docs):** CLAUDE.md storage-mode contract (bootstrap/is-plans-branch, ignore rule in both files, never-reap invariant, `git clean -ffdx` warning, plans branch rejected as Base) plus Resolve-target/Base/Worktree-hygiene bullets. README: new "Remote sessions (branch mode)" section with a silent-stdout SessionStart hook (`startup|resume`, optional `$CLAUDE_CODE_REMOTE` gate); stale skill count / runtime / Testing text fixed. `.plans/CONTEXT.md` refreshed.
- **Step 6 (verification):** `npm test` 83/83. Hand-tested step 7.6 in scratch repos: healthy baseline, then each fault (detached HEAD, no upstream, stale lock, unignored `.plans`, unregistered worktree, stuck rebase, autostash) flagged with nothing deleted. Fixes to skill text from this: check (e) uses `<b>@{u}` (bare `@{u}` double-flagged a detached HEAD); check (a)'s fix pointer is now `git worktree repair .plans` / manual re-add (bootstrap refuses that case); `git clean -fdx` does NOT remove the worktree on git 2.50 — only `-ffdx` does, docs corrected. Hook run by hand: 0 bytes stdout, exit 0 in every case including offline.
- **Known follow-ups (not fixed here):**
  - On a clone whose `.gitignore` lacks `.plans`, bootstrap (via `join`) leaves an uncommitted `.gitignore` edit.
  - If `.plans` is already attached and the remote is unreachable, bootstrap still ends with `OK: … synced` after a warning.
  - `plan-complete` 14 parses `git worktree list` with `cut -d' ' -f2`, which breaks on paths with spaces, including this repo's own path.
  - `plan-spawn` 6b ignores `**Base:**`.

## Notes
- Blocked by #040 (helper) and #041 (plan-init creates branch mode).
- Decisions made at elaboration (2026-10-05):
  - `.plans` is also written to `.git/info/exclude` (implemented in #041's subcommands; checked here).
  - Bootstrap refuses a plain local `.plans/` and exits 0.
  - The plans branch used as `**Base:**` is refused in execute and complete.
  - The integration test drives the real CLI.
- The stale-lock threshold is 60s, matching #040's lock-breaking timeout.
- Full design and decisions: `.plans/artifacts/branch-mode-spec.md`.
- Related: #008 (mobile-capture inbox) solves the same "capture away from the machine" need; revisit once this ships.
