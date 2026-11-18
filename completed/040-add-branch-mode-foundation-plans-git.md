# Add branch mode foundation: plans-git helper and storage-mode contract

**ID:** 040
**Created:** 2026-10-05T14:56
**Type:** feature
**Status:** completed
**Completed:** 2026-10-05T16:05
**Branch:** feature/040-add-branch-mode-foundation-plans-git

## What
Add branch mode foundation: plans-git helper and storage-mode contract. Spec: `.plans/artifacts/branch-mode-spec.md` (task 1 of 3).

- Add `lib/plans-git.js` + `bin/plans-git.js` (installed by `bin/install.js` to `~/.claude/plans-cc/` next to `plan-touch.js`).
- Mode detection: local / inline / branch, per the spec's single rule.
- `commit "<msg>"` / `sync` subcommands: lock via `mkdir .plans/.git-lock` with retries, `add -A`, `pull --rebase --autostash`, async best-effort push (synchronous push flag for ID-minting callers), `merge.ours` driver config, warn once when `git_commits` is false in branch mode.
- Replace the duplicated "Commit .plans/ changes" block in all 25 skills with a call to the helper. Local/inline mode must stay byte-for-byte identical.
- Document the three storage modes, detection rule, `sync` config key, and invariants in CLAUDE.md as a cross-skill contract.
- Unit tests for detection + helper (no-op when clean, push failure non-fatal) and a find-root test with `.plans` as a worktree.

## Why
Every skill commits `.plans/` through a copied block that skips silently whenever `.plans` is gitignored. In branch mode `.plans` is always ignored by the code repo, so nothing would ever be committed or synced. One shared helper fixes that, gives #041 (plan-init/ID allocation) and #042 (cleanup/bootstrap) something to build on, and removes 26 copies of duplicated logic, all without changing behavior for projects that stay in local or inline mode.

## How Summary
A zero-dependency Node module (`lib/plans-git.js`) detects the storage mode (none / local / inline / branch) and implements `commit` and `sync`. Non-branch modes reproduce today's skill block exactly. Branch mode commits inside the `.plans` worktree under a `mkdir` lock, bypassing code-repo hooks and signing, and pushes in the background (synchronously on request). A thin CLI (`bin/plans-git.js`) is installed to `~/.claude/plans-cc/`, and every skill's commit block becomes a one-line call to it, with a loud "missing helper, reinstall" warning when it's absent. CLAUDE.md gains the storage-mode contract.

**Files of note:**
- `lib/plans-git.js`: mode detection, commit, sync, lock (new)
- `bin/plans-git.js`: CLI wrapper, mirrors `bin/plan-touch.js` (new)
- `test/plans-git.test.js`: unit tests against real temp git repos (new)
- `bin/install.js` / `bin/dev.js`: ship and link the helper
- `skills/*/SKILL.md` (25 skills): commit block replaced by a helper call
- `CLAUDE.md`: new "Plans storage mode & plans-git" cross-skill contract

## How
- [x] Step 1: Write failing tests first in `test/plans-git.test.js`, using real git in temp repos. Use the `fs.realpathSync(mkdtemp)` fixture style from `test/find-root.test.js`. Isolate git with `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1` and author/committer env vars, and always pass `-C`/`cwd` with absolute paths (see the scratch-git memory note). Cover:
  - `detectMode` returning none / local / inline / branch;
  - local mode never commits;
  - `git_commits:false` skips;
  - an inline commit uses `git add .plans/` plus a bare `git commit -m` (anything else already staged is included, as today);
  - a clean tree is a no-op;
  - a branch-mode commit lands on the orphan worktree's branch and leaves the outer repo's status clean;
  - branch mode bypasses a failing pre-commit hook;
  - a push to an unreachable remote is non-fatal;
  - `sync` with no upstream is a quiet no-op;
  - a held lock is waited on, then a stale lock is broken.

  Also add a `test/find-root.test.js` case where `.plans` is a git worktree.
- [x] Step 2: Implement `lib/plans-git.js` (CommonJS, never throws, header comment per function, `spawnSync("git", argv)` with no shell):
  - `detectMode(root)`, using the spec rule: `.plans` is the top level of its own worktree and differs from the root's toplevel → branch; root not a git repo → none; `check-ignore -q .plans` → local; else inline.
  - `readSyncConfig(root)`, which defensively applies the defaults `{remote:"origin", branch:"plans", auto_push:true}`.
  - `commit(root, msg, {syncPush})`, returning `{mode, committed, pushed, warnings}`.
    - Non-branch modes: today's exact sequence.
    - Branch mode: warn once when `git_commits !== true` (marker stored as `git -C .plans config plans-cc.warnedGitCommits true`), take a `mkdir .plans/.git-lock` lock (retry about 20×100ms; break it if older than 60s), `git -C .plans add -A -- . ':!.git-lock'`, then `-c commit.gpgsign=false commit --no-verify -m msg`, then release the lock.
    - Push: detached and unref'd in the background by default; synchronous when `syncPush` is set. Failure only adds a warning.
  - `sync(root)`: branch mode only (otherwise a no-op). Set `merge.ours.driver true` idempotently, skip quietly with no upstream, otherwise `pull --rebase --autostash` under the lock. On rebase failure, return a warning and never auto-abort.
- [x] Step 3: Add `bin/plans-git.js`, mirroring `bin/plan-touch.js`:
  - the dual `require("../lib/…")` / `require("./lib/…")`;
  - root resolution via `findProjectRoot(process.cwd())`;
  - subcommands `commit [--sync-push] <msg>`, `sync` and `mode`;
  - warnings printed to stdout as `Warning: …` lines (the model surfaces them);
  - always `exit 0`.

  Copy and chmod it in `bin/install.js` `installDashboardRuntime()`, next to `plan-touch.js`. Symlink it in `bin/dev.js`, and fix the existing missing `plan-touch.js` symlink at the same time.
- [x] Step 4: Replace the `.plans/` commit block in the 20 skills that use the standard shape (backlog, brainstorm, capture, clarify, cleanup, combine, complete, context, delete, depends, elaborate, execute ×2 (7h, 15), import, issue, mine, pick, reopen, restore, review, unpack). The replacement text:
  - "Run `node ~/.claude/plans-cc/plans-git.js commit "<msg>"`; if the file is missing, print `Warning: plans-git helper missing — run npx plans-cc to reinstall` and continue; surface any `Warning:` lines but never fail the skill."
  - Keep each skill's own preconditions in front of the call (capture's `auto_*` skip, depends' `show` skip) and its commit-message template verbatim.
  - Update plan-context step 8's reference to "step 9's `git add .plans/`".
- [x] Step 5: Convert the five that differ:
  - `plan-discuss` step 9: variable message.
  - `plan-merge-reviews` step 4: points at the new call instead of "exactly as /plan-combine does".
  - `plan-spawn` 8d: note that the helper reads `git_commits` itself after the loop, which doesn't violate the no-re-read rule (that rule covers mid-loop reads).
  - `plan-pause` step 6, no-branch path only.

  Leave `plan-init` step 11 for #041. Leave every code-commit `git add -A` path (complete 13, review 4, pause/backlog branch paths, execute/spawn worktree finishes) untouched, because inline mode depends on them sweeping `.plans`.
- [x] Step 6: In CLAUDE.md, add a "### Plans storage mode & `plans-git` (cross-skill contract)" section right after Project-root discovery. It should cover:
  - the three storage modes plus none, and the detection rule;
  - the `sync` key (read defensively, never seeded);
  - the invariants: `.plans` stays ignored, slashless, on code branches; the plans branch is never a merge target, base or execution branch; the worktree symlinks are unchanged; branch-mode commits use `--no-verify` and no signing;
  - the helper-missing behavior.

  Also fix the out-of-date text: "no runtime code", the Project Structure listing (add `lib/`, `test/`), the skill count, the config key list (add `sync`), and "No automated tests" under Testing.
- [x] Step 7: Run `npm test` (the full suite) and reinstall via `node bin/dev.js`. Confirm `~/.claude/plans-cc/plans-git.js mode` prints `local` in this repo. Grep that no skill still contains `git check-ignore -q .plans` except plan-init step 11 and plan-cleanup's integrity check.

## Verification
- `npm test` passes, including the new `plans-git` tests (all four modes, branch commit on the orphan branch with the outer repo clean, hook bypass, non-fatal push failure, quiet no-upstream sync, lock contention) and the find-root worktree case.
- `grep -l "git check-ignore -q .plans" skills/*/SKILL.md` lists only plan-init (step 11, deferred to #041) and plan-cleanup (integrity check, not a commit block).
- Inline-mode parity: in a scratch repo with `.plans` tracked and `git_commits:true`, `/plan-capture Test` produces the same `plan: capture #001 - Test` commit as before. In local mode (ignored), no commit is made and nothing is printed.
- After `node bin/dev.js`, both `~/.claude/plans-cc/plans-git.js` and `plan-touch.js` exist. Temporarily renaming `plans-git.js` makes a skill print the reinstall warning without failing.

## Impact Scope

### Files to Modify
- [x] `lib/plans-git.js`: new module
- [x] `bin/plans-git.js`: new CLI
- [x] `test/plans-git.test.js`: new tests
- [x] `test/find-root.test.js`: worktree case
- [x] `bin/install.js`: copy and chmod the helper
- [x] `bin/dev.js`: symlink the helper and plan-touch
- [x] `CLAUDE.md`: contract plus fixes to out-of-date text
- [x] `skills/{plan-backlog,plan-brainstorm,plan-capture,plan-clarify,plan-cleanup,plan-combine,plan-complete,plan-context,plan-delete,plan-depends,plan-elaborate,plan-execute,plan-import,plan-issue,plan-mine,plan-pick,plan-reopen,plan-restore,plan-review,plan-unpack}/SKILL.md`: standard commit block replaced
- [x] `skills/{plan-discuss,plan-merge-reviews,plan-spawn,plan-pause}/SKILL.md`: non-standard commit blocks converted

### Related Files (may need updates)
- `skills/plan-init/SKILL.md`: step 11 is deliberately left for #041
- `lib/find-root.js`: used by the CLI; should need no change
- `README.md`: says "no runtime code" too; #042 owns the README remote-setup section, so only fix the out-of-date line here if it's trivial

## Assumptions

### Initial (from elaboration)
_To be filled during elaboration_

### Discovered during execution
- [low] In branch mode, `git_commits !== true` both warns once AND skips the commit; it does not commit anyway. **Why:** the spec says "warn once" and "never flips the value silently". Honoring the setting keeps it meaningful in every mode, and the warning tells the user that sync is off.
- [low] `detectMode` returns `none` whenever the project root is not a git repo, even if `.plans` is a repo of its own. **Why:** this matches today's "not a git repo: skip silently". Multi-repo parent roots are explicitly unsupported for branch mode in v1 (spec decision 2).
- [low] Pushes skip silently when `sync.remote` is not configured in the `.plans` worktree, and when `auto_push` is false (unless `--sync-push` is passed). **Why:** a branch-mode project with no remote is a valid local-only setup and shouldn't warn on every commit. A configured but unreachable remote still warns under sync push.
- [low] Push uses `push -u <remote> HEAD:refs/heads/<branch>`, so the first push sets the upstream that `sync` relies on. **Why:** without an upstream, `sync` is a quiet no-op forever. #041/#042 may set the upstream explicitly during init/bootstrap as well.
- [low] If the lock can't be acquired within the retries (and isn't stale), the commit is skipped with a warning rather than forced. **Why:** the uncommitted changes stay on disk and the next commit's `add -A` picks them up, so nothing is lost. Forcing it would race another writer.
- [high] `commit()`/`sync()` accept `lockRetries`/`lockDelayMs`/`lockStaleMs` overrides (defaults 20 / 100ms / 60s) so tests run fast. The CLI never passes them. **Why:** standard test seam, and it leaves the spec defaults unchanged.
- [high] All git calls run with `GIT_TERMINAL_PROMPT=0`, so a remote that needs credentials fails fast instead of hanging a skill. **Why:** the helper runs non-interactively under the model.
- [high] The inline-mode `git add .plans/` + bare `git commit -m` sweeps in other already-staged files, exactly as today. A hook failure there becomes a `Warning:`, not a failure. **Why:** byte-for-byte parity with the old skill block ("warn but do not fail").
- [low] Each replaced skill block keeps a short parenthetical listing the skip conditions the helper now owns (not a git repo, `.plans` gitignored, `git_commits` not `true`, nothing changed), so the skips stay visible to a reader. **Why:** the old ~10-line blocks spelled these out. Dropping them entirely would hide that local mode is still a silent no-op.
- [low] "Helper missing" is phrased as "if `~/.claude/plans-cc/plans-git.js` does not exist". The model checks for the file rather than reading a `node` "Cannot find module" error. **Why:** it gives a deterministic trigger for the reinstall warning, and either way the skill continues.
- [low] plan-pause's shared "Check if inside a git repo" line ahead of the branch/no-branch split is left in place. Only the no-branch commit block was replaced. **Why:** the branch path still needs that check for its `git add -A` / checkout, and the helper repeats it harmlessly.
- [low] plan-context step 8 now says "picked up by step 9's `.plans/` commit" instead of "step 9's `git add .plans/`". **Why:** in branch mode the helper runs `add -A` inside the `.plans` worktree, so naming the old command would be wrong.
- [low] plan-complete step 7's debug-cleanup commit (`git add [affected files]`, gated on `git_commits`) is left untouched. **Why:** it commits code files, not `.plans/`, so it's out of scope like the other code-commit paths.
- [low] CLAUDE.md's new contract states the detection order as none → branch → local → inline (branch is checked before `check-ignore`, because a branch-mode `.plans` is also gitignored). **Why:** this matches `detectMode` exactly; the spec's "otherwise local/inline applies" reads the same way.
- [low] The CLAUDE.md slashless-footgun rationale is "a `.plans/` pattern doesn't match a symlink, so a worktree's `.plans` symlink once got committed and destroyed the task dir on checkout". **Why:** this is the memory note's account of the incident, and it explains why branch mode can't relax the rule.
- [low] README.md line 7 ("There is no runtime code") was rewritten as a one-line fix. **Why:** the task allowed a trivial one-line fix, and the sentence was simply false now. #042 still owns the README remote-setup section.
- [low] The Project Structure listing names every current `bin/`, `lib/`, `test/` file plus `agents/plan-executor.md`, and gives the skill count as 40 (36 plan-* + 4 des-*). **Why:** `ls` ground truth. The old "31 total" was stale and omitted des-*.
- [high] Step 7 ran only the targeted `node --test test/plans-git.test.js test/find-root.test.js test/registry.test.js` (43/43 pass), not `npm test`. **Why:** the executor rule is to never run the full suite; the full run is the user's responsibility.
- [high] The missing-helper check was done non-destructively by running the skill-equivalent `test -e` snippet against a nonexistent path instead of renaming the installed helper. It printed the reinstall warning and exited 0. **Why:** renaming a file under `~/.claude` would break the live install if the run were interrupted.

## Changes
- **Segment 1 (steps 1-3):** Added `lib/plans-git.js` (`detectMode`, `readSyncConfig`, `commit`, `sync`; never throws, no shell), `bin/plans-git.js` CLI (`commit [--sync-push] <msg>`, `sync`, `mode`; `Warning:` lines, always exit 0), and `test/plans-git.test.js` (26 tests against real temp git repos). Added a `.plans`-as-worktree case to `test/find-root.test.js` (passed unchanged; `lib/find-root.js` needs no edit). `bin/install.js` copies and chmods the helper; `bin/dev.js` now symlinks both `plans-git.js` and the previously missing `plan-touch.js`. Targeted tests: 35/35 pass.
- **Segment 2 (steps 4-5):** Replaced the copied `.plans/` commit block with one `node ~/.claude/plans-cc/plans-git.js commit "<msg>"` call (plus a missing-helper reinstall warning) in 20 standard skills (plan-execute at 7h and 15) and in the 4 non-standard ones (discuss 9, merge-reviews 4, spawn 8d, pause 6 no-branch path). Commit-message templates and per-skill preconditions are kept verbatim. plan-init step 11 and all code-commit `git add -A` paths are untouched. `check-ignore -q .plans` now remains only in plan-init (lines 129, 215) and plan-cleanup's integrity check.
- **Segment 3 (steps 6-7):** Added the `### Plans storage mode & `plans-git` (cross-skill contract)` section to CLAUDE.md, after Project-root discovery. It covers the mode table and detection order, local/inline parity, branch-mode commit/push/sync, the `sync` key, the invariants, the missing-helper rule, the call sites, and plan-init step 11 as pending on #041. Fixed stale CLAUDE.md text: "no runtime code", the Project Structure tree (`lib/`, `test/`, bin scripts, `agents/`, 40 skills), `sync` in the config key list, and Testing (`npm test` / node:test). Fixed README's "no runtime code" line. Targeted tests 43/43 pass. `node bin/dev.js` links both helpers; `plans-git.js mode` prints `local` here; only plan-init and plan-cleanup still contain `check-ignore -q .plans`.

## Notes
- Full design, resolved decisions, and code verification: `.plans/artifacts/branch-mode-spec.md`.
- Blocks #041 and #042 (both call the helper and cite the contract).
- Decisions made at elaboration (2026-10-05):
  - Missing helper → loud one-line warning plus reinstall pointer, not a legacy fallback.
  - Branch-mode commits use `--no-verify` and `commit.gpgsign=false`.
  - The PROGRESS.md Node renderer is deferred to #041; #040's sync only guarantees PROGRESS.md is never left conflicted.
  - plan-init step 11 is left for #041.
- Research flagged that `bin/dev.js` never linked `plan-touch.js` (an existing gap, fixed in Step 3).
