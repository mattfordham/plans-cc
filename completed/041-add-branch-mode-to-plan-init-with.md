# Add branch mode to plan-init with migration, second-machine join, and safe ID allocation

**ID:** 041
**Created:** 2026-10-05T14:56
**Type:** feature
**Status:** completed
**Completed:** 2026-10-05T17:00
**Blocked by:** #040
**Branch:** feature/041-add-branch-mode-to-plan-init-with

## What
Add branch mode to plan-init with migration, second-machine join, and safe ID allocation. Spec: `.plans/artifacts/branch-mode-spec.md` (task 2 of 3).

- `plan-init` step 7: third option "Track on a dedicated plans branch (for remote access)"; "Ignore" stays recommended. Refuse when the root is not a git repo (multi-repo parents unsupported in v1).
- Fresh: `git worktree add --orphan -b <branch> .plans` (commit-tree fallback for git < 2.42), scaffold `.gitattributes` (`HISTORY.md merge=union`, `PROGRESS.md merge=ours`) and `.gitignore` (`.DS_Store`, `.git-lock`), set `merge.ours.driver`, write `git_commits: true` + `sync` config, commit, push with upstream.
- Migration of an existing local `.plans/`: move aside, create orphan worktree, copy back, commit, push. Loss-proof: verify file counts before deleting the backup.
- Join: when `origin/<branch>` exists, offer `git fetch origin <branch>:<branch> && git worktree add .plans <branch>` instead of creating a new root.
- Safe IDs in the 8 minting skills (capture, brainstorm, import, init, mine, pick, spawn, unpack): in branch mode `sync` before reading `next_id`/`idea_next_id`, commit + synchronous push right after writing. On collision, renumber the local task to max(existing)+1, rename the file, fix `**Blocked by:**` references, update `next_id`. Reconstruction must scan `backlog/` too (pre-existing gap).
- Tests: simulated two-clone ID collision → renumber path.

## Why
#040 makes branch mode possible to commit and sync, but nothing creates it yet, existing projects can't move to it, a second machine can't join it, and two machines would still hand out the same task IDs. This task delivers the user-facing half: setting it up, converting to it, joining it, and making sure concurrent captures never collide. It also finishes the PROGRESS.md handling (rebuilt in Node after a sync) that #040 deferred.

## How Summary
`plans-git.js` gains testable subcommands: `init-branch` (an orphan worktree, with a fallback for git older than 2.42), `migrate` (loss-proof conversion of an existing `.plans/`), `join` (attach to an existing remote `plans` branch), and a sync that rebuilds `next_id` and PROGRESS.md and renumbers colliding local IDs. `plan-init` asks only the questions and calls those subcommands:
- `/plan-init branch` converts an initialized project;
- join is detected before any files are created;
- step 7 gets a third option.

The six ID-creating skills pull before reading the counter and push synchronously right after writing.

**Files of note:**
- `lib/plans-git.js` / `bin/plans-git.js`: new subcommands `init-branch`, `migrate`, `join`, `renumber`; sync post-processing
- `lib/render-progress.js`: Node PROGRESS.md renderer built on `lib/parse-tasks.js` (new)
- `skills/plan-init/SKILL.md`: `branch` argument, early join detection, step-7 option 3, branch versions of steps 8/10/11
- `skills/plan-{capture,brainstorm,import,mine,pick,unpack}/SKILL.md`: sync before reading the ID, push after writing it
- `CLAUDE.md`: an "Allocate ID (branch mode)" rule inside the #040 contract
- `test/plans-git.test.js`: init/migrate/join tests and the two-clone collision test

## How
- [x] Step 1: Write failing tests first in `test/plans-git.test.js`, using a bare repo as `origin` plus two clones, with the git isolation and absolute `-C` paths from #040. Cover:
  - `init-branch` creates an orphan `plans` worktree at `.plans` with the scaffold, and the outer repo stays clean. Exercise the `commit-tree` fallback by forcing it with an option.
  - `migrate` preserves every file and leaves the `.plans.bak-*` backup in place when the file-count/checksum comparison fails.
  - `join` on the second clone attaches to `origin/plans` and sets `merge.ours.driver`.
  - Two-clone collision: both capture #043 offline, then each syncs. The result has no duplicate IDs, the later clone's task becomes #044 with its `**Blocked by:**` references and idea back-references updated, and `next_id` equals max+1.
  - `renderProgress` output matches the PROGRESS.md format.
- [x] Step 2: Add `lib/render-progress.js`, built on `lib/parse-tasks.js`, which renders PROGRESS.md the way the skills do today. Add an ID scan that takes the max across `pending/`, `completed/`, `backlog/` and `archive/` (and `ideas/` for `idea_next_id`). Extend `sync`:
  - make `config.json` `merge=ours` as well, since its counters can always be rebuilt from the files;
  - after a successful pull, rebuild `next_id`/`idea_next_id` from the scan;
  - rebuild PROGRESS.md if task files changed;
  - run renumber;
  - commit the result.
  - Any remaining rebase conflict (e.g. two clones adding a file at the same path) aborts the rebase with a warning and is never resolved automatically.
- [x] Step 3: Add `renumber` to `lib/plans-git.js`:
  - Find duplicate IDs. The copy added in local commits not yet on upstream (`git log @{u}..HEAD --diff-filter=A`) is the one that moves.
  - Give it max+1, `git mv` the file, and rewrite `**ID:**`.
  - Rewrite `**Blocked by:**` (matching `#?\d{3}`) in `pending/` and `backlog/`, the `Task #NNN` lines under the idea file's `## Picked`/`## Expanded Into`, and `state/NNN-state.md`. Add a Notes line: `Renumbered from #NNN after sync collision`.
  - If a `feature/NNN-*` branch or `.worktrees/NNN-*` exists for the old ID, leave it alone and warn.
  - Return the old→new mapping so the calling skill can print it.
- [x] Step 4: Add the `init-branch`, `migrate` and `join` subcommands (lib plus CLI), each doing its own git version check.
  - `init-branch`: use `git worktree add --orphan -b <branch> .plans` on git 2.42 or newer; otherwise `mktree` → `commit-tree` → `branch` → `worktree add`.
  - Scaffold `.gitattributes` (`HISTORY.md merge=union`, `PROGRESS.md merge=ours`, `config.json merge=ours`) and `.gitignore` (`.DS_Store`, `.git-lock`).
  - Set `merge.ours.driver true`, write `sync` plus `git_commits:true` into config (announcing the change if it was false), commit, and `push -u` (non-fatal if offline).
  - `migrate`: move `.plans` to `.plans.bak-<ts>`, run `init-branch`, copy the contents back (excluding `.git`/`.DS_Store`), and compare file counts and sha1 checksums. Delete the backup only when they match.
  - `join`: `git fetch <remote> <branch>:<branch>`, `git worktree add .plans <branch>`, set the merge driver, and make sure the outer `.gitignore` has the slashless `.plans`.
  - All three subcommands (`init-branch`, `migrate`, `join`) also add `.plans` to the outer repo's `.git/info/exclude`, so it is ignored on every code branch in that clone, including old branches whose `.gitignore` lacks it (decided in #042's elaboration).
  - Refuse when the root isn't a git repo (multi-repo parent) with a clear message.
- [x] Step 5: Update `skills/plan-init/SKILL.md`:
  - Step 1: an initialized project still errors, plus a hint line `Run /plan-init branch to track plans on a dedicated branch`. `/plan-init branch` (a new argument) runs `migrate` after one confirmation.
  - New step 1.5 (before any files are created): in a git repo with a remote, if `git ls-remote --exit-code --heads origin <branch>` succeeds, offer "Join existing plans (recommended)" or "Start separate local plans". Join runs `join`, skips steps 2–9, registers via plan-touch, and finishes.
  - Step 7: offer the option even when `.plans` is already ignored, as long as the repo has a remote. Add option 3, "Track on a dedicated plans branch (for remote access)". "Ignore" stays recommended. Option 3 runs `migrate` on the files just created, so fresh and existing projects share one path.
  - Step 8: recommend "No plan references" in branch mode.
  - Steps 10–11: branch versions of the text. Commit through the helper, and still commit the outer `.gitignore` if it changed.
- [x] Step 6: Update the ID-creating skills, citing a new "Allocate ID (branch mode)" rule added to the #040 contract in CLAUDE.md rather than copying it into each skill:
  - `plan-capture`: run `plans-git.js sync` before step 3, and a new step 7.5, `plans-git.js commit --sync-push "plan: capture #NNN - [title]"`, so the auto-capture chains in execute and elaborate (which run steps 1–8) still push the new ID. Step 10 then has nothing left to commit in branch mode.
  - `plan-brainstorm`: sync before reading `idea_next_id`.
  - `plan-import`, `plan-mine`, `plan-pick`, `plan-unpack`: sync once before the loop and one `commit --sync-push` after it.
  - If sync returns a renumber mapping, print `Renumbered #A → #B` lines.
  - Fix every "reconstruct next_id" edge case to scan `backlog/` as well (capture, pick, unpack), and add the same rule to import and mine.
  - In local and inline mode, `sync` is a no-op, so behavior is unchanged.
- [x] Step 7: Run `npm test` (full suite). Then walk a scratch repo through the flow, using absolute `git -C` paths:
  - `/plan-init` → option 3;
  - capture on a review branch, and confirm the commit is on `plans` and the code branch is untouched;
  - clone it a second time and run `/plan-init` → Join;
  - capture on both clones, sync, and confirm there are no duplicate IDs.

## Verification
- `npm test` passes, including init-branch (with the forced fallback), migrate (with the backup kept on a mismatch), join, the two-clone collision/renumber test, and renderProgress.
- Scratch walkthrough:
  - after `/plan-init` option 3, `git -C .plans branch --show-current` is `plans`, `git status` in the root is clean, and `origin/plans` exists;
  - capturing while the root is on `review/x` creates a commit on `plans` and nothing on `review/x`;
  - a second clone's `/plan-init` offers Join and ends with the same tasks visible;
  - concurrent captures resolve to distinct IDs with a `Renumbered` line printed.
- `/plan-init branch` on an existing local project keeps every file (counts match) and removes the backup only after verification.
- Local and inline mode projects: `/plan-init` and `/plan-capture` behave exactly as before (sync is a no-op; the step-7 options are unchanged when no remote exists).

## Impact Scope

### Files to Modify
- [ ] `lib/plans-git.js`: init-branch, migrate, join, renumber, sync post-processing
- [ ] `bin/plans-git.js`: new subcommands
- [ ] `lib/render-progress.js`: new PROGRESS.md renderer
- [ ] `test/plans-git.test.js`: new cases (and possibly `test/render-progress.test.js`)
- [ ] `skills/plan-init/SKILL.md`: `branch` argument, step 1.5 join, step-7 option 3, branch versions of steps 8/10/11
- [ ] `skills/plan-capture/SKILL.md`: sync before step 3, new step 7.5, backlog in the reconstruction rule
- [ ] `skills/plan-{brainstorm,import,mine,pick,unpack}/SKILL.md`: sync before reading the ID, one push after the loop, reconstruction rule
- [ ] `CLAUDE.md`: Allocate ID (branch mode) rule; `config.json merge=ours`

### Related Files (may need updates)
- `lib/parse-tasks.js`: reused by the renderer. Its separate `Blocked by` parsing bug is tracked on its own, not fixed here.
- `skills/plan-execute/SKILL.md`, `skills/plan-elaborate/SKILL.md`: their auto-capture runs capture steps 1–8, which is why the push sits at step 7.5. No edit should be needed, but confirm.
- `skills/plan-spawn/SKILL.md`: doesn't create IDs; no change (the spec's list was wrong).

## Assumptions

### Initial (from elaboration)
_To be filled during elaboration_

### Discovered during execution
- [low] Renumber rewrites `**Blocked by:**` refs and idea `Task #NNN` lines only in files this clone changed relative to upstream (`git diff @{u} HEAD` plus uncommitted/untracked), plus the moved file itself, rather than in every file under pending/ and backlog/. **Why:** an upstream file's `#043` means upstream's #043, so rewriting every file would corrupt the other machine's references.
- [low] "Local copy" is detected with `git diff -M --diff-filter=A @{u} HEAD` (plus staged-added and untracked files) instead of `git log @{u}..HEAD --diff-filter=A`. **Why:** the two are equivalent after a rebase, and the diff form ignores files that were added and then removed in between. If every copy of a duplicate id is local, the lowest-sorted path keeps the id.
- [low] Counters never move backwards: `next_id = max(config.next_id, scanMax+1)`, and new ids from renumber start at `max(scanMax, next_id-1)+1`. A missing `next_id`/`idea_next_id` key is only added when files exist for it. **Why:** this avoids reusing the ids of deleted tasks. The two-clone test still lands on max+1.
- [low] The `sync` rebase-conflict behavior changed from "reported, never auto-aborted" (#040) to "`git rebase --abort` + warning, never auto-resolved", as Step 2 asks. **Why:** this is the task's explicit instruction. The CLAUDE.md contract text still says "never auto-aborted" and needs updating in the docs segment.
- [low] `sync` commits its post-processing as `plan: sync — renumber #A → #B` (or `plan: sync — rebuild counters`) and then pushes **synchronously**, so the renumbered id is claimed on the remote right away. **Why:** an unpushed renumber would leave the other clone still free to hand out the same id.
- [low] PROGRESS.md renderer: Active Work shows in-progress tasks as `(started YYYY-MM-DD)`, with the date taken from `state/NNN-state.md` `**Started:**` (the suffix is omitted when there is no state file), and review/in-review tasks as `(review)`/`(in-review)`. Stats follow the live sample's order and labels (Pending, Elaborated, In Progress, In Review = review + in-review, Backlogged, Completed), not plan-init's older template. **Why:** the skills don't define a format for review entries, and the sample PROGRESS.md is the best evidence of what's actually in use.
- [low] `migrate` refuses only when `.plans` is actually **tracked** in the code index (`git ls-files .plans` is non-empty), not whenever `detectMode` says "inline". **Why:** detectMode reports an unignored, untracked `.plans` as inline, and that case is safe to migrate.
- [high] Setup commands (`init-branch`, `migrate`, `join`) use the current directory as the root, with no discovery walk. **Why:** plan-init is exempt from discovery, and join runs before `.plans` exists.
- [low] Setup commands keep the always-exit-0 rule and end with exactly one `OK: …` or `Error: …` line for the skill to branch on, instead of using a non-zero exit code. **Why:** the helper contract says it always exits 0.
- [high] `finalize` writes a `.gitkeep` into every empty directory under `.plans`. **Why:** git can't track empty dirs, so plan-init's empty pending/ and completed/ would otherwise vanish from the branch and never reach a joining clone. The smoke test caught this.
- [high] The `:!.git-lock` exclude pathspec was dropped from the branch-mode `git add -A`. **Why:** once the scaffold `.gitignore` lists `.git-lock`, that pathspec makes `git add` fail with "paths are ignored". The lock is an empty directory, which git never stages anyway.
- [low] `init-branch`/`migrate` only add `.plans` to `.git/info/exclude` and never edit the outer `.gitignore` (plan-init's step 7 owns that). `join` does ensure the slashless `.gitignore` line (rewriting `.plans/` → `.plans`) and reports `gitignoreChanged` so the skill can commit it. **Why:** the task scopes the `.gitignore` edit to join, and editing it elsewhere would dirty the outer repo during init.
- [low] The Allocate ID rule, including plan-capture's step 7.5 commit, applies only when `plans-git.js mode` prints `branch`. Other modes skip it entirely, so they don't even call `sync`. **Why:** an unconditional 7.5 `commit` in inline mode would add an early commit to the execute/elaborate auto-capture chains and change inline behavior, and the task requires local and inline mode to stay unchanged.
- [low] For the loop minters (import, mine, pick, unpack) and brainstorm, the "one `commit --sync-push` after the loop" is done by adding `--sync-push` to their existing commit step, not by a separate commit right after the loop. **Why:** it's still one synchronous push per batch, and that commit also picks up the PROGRESS.md and idea-file edits, so there's no second commit to push.
- [low] plan-init step 11 now goes through the helper in every mode. It commits a changed outer `.gitignore` first, on its own, then runs `plans-git.js commit "plan: initialize .plans/"`. **Why:** the helper's inline path reproduces the old check-in block, its local path is a no-op (as before), and committing `.gitignore` first stops inline's bare `git commit` from sweeping it up. This also resolves the CLAUDE.md "pending #041" sentence.
- [low] The `/plan-init branch` argument is handled like this. On an initialized `local` project it runs `migrate` after one confirmation and STOPs. On a fresh project it pre-selects step-7 option 3 when there is an origin remote. The "Already initialized" hint line is printed only in `local` mode, because inline, branch, and non-git projects have nothing that `/plan-init branch` could convert. **Why:** the task specifies only the initialized-project path, and a hint that leads to a refusal is noise.
- [low] Step 7 option 3 is offered only when an `origin` remote exists and step 1.5 did not find `origin/plans`. That applies whether or not `.plans` is already ignored. When `.plans` is already ignored, the choice is "Keep ignored (recommended)" or the branch option. **Why:** the Verification requires the step-7 options to be unchanged when there's no remote, and with an existing `origin/plans`, `init-branch`/`migrate` would refuse.
- [low] Step 1.5 probes only `origin` + `plans`. **Why:** no config exists yet before files are created, so there's no configured remote or branch to read. A non-default plans branch can still be joined with `plans-git.js join --branch`.
- [low] Failure handling in plan-init. A migrate `Error:` naming a kept backup STOPs with `🔴 BRANCH MODE FAILED`. A refusal before anything moved falls back to the Ignore path. A join `Error:` STOPs with `🔴 JOIN FAILED`, which is safe because nothing was created. New markers: `🟢 JOINED`, `🟢 CONVERTED`. **Why:** continuing steps 8–13 against a half-migrated `.plans/` could write into the wrong place, whereas a pre-move refusal leaves a valid local project.
- [low] The CLAUDE.md wording on the `sync` key changed from "NOT seeded by /plan-init" to "not in plan-init's config template; written only by init-branch/migrate". **Why:** segment 1's `finalizeBranch` writes the key, so the old sentence would have become false.
- [high] Step 7 ran only `node --test test/plans-git.test.js test/render-progress.test.js` (48/48), not `npm test`. **Why:** the orchestrator rule forbids full-suite runs in executor segments, so the user runs the full suite.

## Changes
### Segment 1 (steps 1-4)
- `lib/render-progress.js` (new): `renderProgress(plansDir, {date})` built on parse-tasks; `scanIds(plansDir)` → `{maxTaskId, maxIdeaId}` across pending/completed/backlog/archive (+ ideas/).
- `lib/plans-git.js`: new `renumber`, `initBranch`, `migrate`, `join`. `sync` now runs pull → renumber → rebuild counters → rebuild PROGRESS.md (if task files changed) → commit → sync push, and returns `renumbered`. A failed rebase is aborted with a warning. `.gitkeep` files keep empty dirs. Dropped the `:!.git-lock` add exclude (the scaffold `.gitignore` now covers it).
- `bin/plans-git.js`: subcommands `sync`, `renumber`, `init-branch`, `migrate`, `join` (`--branch`, `--remote`, `--no-push`, `--force-fallback`). Always exits 0; prints a final `OK: …` or `Error: …` line.
- `test/plans-git.test.js`, `test/render-progress.test.js` (new): init-branch (incl. forced fallback), migrate (backup kept on mismatch), join, two-clone collision/renumber, add/add conflict abort, renderProgress. Targeted run: 48/48 pass.

### Segment 2 (steps 5-7)
- `skills/plan-init/SKILL.md`: `[branch]` argument (converts a local-mode project via `migrate` after one confirmation); a hint on the "already initialized" error; step 1.5 checks for `origin/plans` and offers Join before any files are created (ends `🟢 JOINED`); step 7 option 3 (only when there is an origin remote, refused when the root is not a git repo); step 8 recommends "No plan references" in branch mode; step 11 commits through the helper in every mode.
- `CLAUDE.md`: an "Allocate ID (branch mode)" rule; merge attributes (`config.json merge=ours`); the renumber-on-collision and setup-subcommand paragraphs; sync order; a failed rebase is now aborted with a warning; `.git-lock` wording; call sites 24 → 25; `lib/render-progress.js` added to the Project Structure.
- `plan-capture`: sync in step 3 + new step 7.5 `commit --sync-push` (branch mode only); reconstruction scans `backlog/`.
- `plan-brainstorm`: sync before `idea_next_id` + `--sync-push`. `plan-import`/`mine`/`pick`/`unpack`: one sync before the loop, `--sync-push` on the commit, reconstruction includes `backlog/`.
- Targeted tests: 48/48 pass. Full `npm test` NOT run (plan-execute targeted-tests rule); the user should run it.
- Scratch walkthrough (CLI, isolated git): all 7 checks passed — migrate → `.plans` on `plans` with a clean root and `origin/plans` present; capture on `review/x` landed only on `plans`; clone B Join saw the same tasks; B's offline same-ID capture → `Renumbered #002 → #003`, no duplicates, `next_id=4`; local mode unchanged; `/plan-init branch` without a remote kept all files.

## Notes
- Blocked by #040 (helper + contract).
- Decisions made at elaboration (2026-10-05):
  - Migration via `/plan-init branch`, plus a hint on the "Already initialized" error.
  - The create/migrate/join git logic lives in `plans-git.js` subcommands (#042's bootstrap reuses `join`).
  - Renumbering covers files and references only; existing branches and worktrees are left alone with a warning.
  - The `parse-tasks.js` Blocked-by parsing bug is captured separately.
- Chosen without asking (object if you disagree):
  - Join is detected automatically before any files are created (origin only).
  - Loop minters push once per batch.
  - `config.json` gets `merge=ours`, with counters rebuilt from the files after every sync.
- The PROGRESS.md Node renderer moved here from #040.
- Full design and decisions: `.plans/artifacts/branch-mode-spec.md`.
