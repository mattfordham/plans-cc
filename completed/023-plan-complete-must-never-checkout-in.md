# Fix Cross-Agent Working-Directory Corruption: plan-complete Must Never Checkout In A Shared Directory

**ID:** 023
**Created:** 2026-07-09T00:00
**Type:** bug
**Status:** completed
**Branch:** fix/023-plan-complete-must-never-checkout-in
**Completed:** 2026-07-09T00:00

## What

`plan-complete` checks out the default branch in the **shared main working directory** in order to merge a task branch, stomping any other agent sitting there. Two agents worked concurrently, each with its own `keep` worktree; agent B ran `/plan-complete 133`, which ran `git checkout full-site` over agent A's `feature/135`.

The one-line diagnosis: **the bug is not that two agents ran at once, it's that one of them mutated the other's working directory.** Give every writing agent its own worktree and the rest follows.

Nothing was lost (commits stay reachable by SHA), but real damage occurred before it was noticed:

- **A smoke test passed against the wrong code.** Six route assertions went green while the tree was actually on `full-site`'s old `[slug]` route. They proved nothing. It was only caught because the fixture slug happened to contain a slash, so the old route served it too. A less pathological fixture would have shipped a false pass.
- The dev server was killed out from under agent A by the checkout.
- `yarn lint` crashed mid-run with `ENOENT ... [...slug]/page.tsx` — the file disappeared while ESLint was walking it.

A second, independent problem surfaced: stale worktree corpses (`081`, `096`, `118`) — present on disk but no longer registered worktrees — contributed ~640 files and 2,182 errors to `yarn lint`, swamping the 26 real warnings.

**Where the code is:** `skills/plan-complete/SKILL.md` step 14 (lines 249–250) and step 14b (line 262) both run `git checkout [default-branch]` then `git merge [task-branch]` in the shared main directory. `plan-review` has a well-developed concurrency guard for exactly this hazard (step 3.6, the repo-set / `MAIN` sentinel model). **`plan-complete` has none.**

`plan-pause` and `plan-backlog` also run `git checkout [default-branch]`, but only in the directory *they themselves own*, to unwind a branch they created. That is legitimate and stays as-is.

A full design write-up (with the decision table, exact command sequences, and error text) lives at `~/.claude/plans/while-working-on-a-cheeky-balloon.md` — **read it before elaborating.**

### Git semantics — verified empirically in a scratch repo, not assumed

| Claim | Result |
|---|---|
| `git fetch . task:default` when `default` is checked out **nowhere** | Fast-forwards the ref. Working tree completely untouched. `exit=0` |
| `git fetch . task:default` when `default` **is** checked out anywhere | `fatal: refusing to fetch into branch 'refs/heads/main' checked out at '<path>'`, `exit=128`. **It refuses rather than stomps.** |
| `git fetch . task:default` when not a fast-forward | `! [rejected] (non-fast-forward)`, `exit=1`. Forcing with `+` would discard the default — never safe. |
| Throwaway worktree on `default`, merge inside, remove it | Real merge commit lands, `default` advances, the sitting agent's tree and branch are **untouched**. |
| `git worktree remove` | Branch ref and commits **survive**. |

The `fetch` refusal is what makes this approach safe *by construction* rather than by convention — it cannot corrupt a shared checkout, because git errors out first. That property is the backbone of the fix.

The last row matters independently: step 14b currently claims *"Merging FROM main first is mandatory: removing the worktree before merging would discard the very checkout the branch is in."* **This rationale is false.** `git worktree remove` removes a checkout, not a branch. The bogus constraint must be deleted from the prose, not merely reordered — otherwise the next reader re-derives it.

### Scope — all four areas confirmed with the user

**(1) P0 — the shared-directory checkout.** Rewrite `plan-complete` steps 14 and 14b to use a decision table that never writes into a directory this session doesn't own. Keep the existing `AskUserQuestion` merge prompt verbatim (it's a Critical Requirement at line 24); replace only the post-response merge body.

Detection primitive (`git worktree list --porcelain` prints `branch refs/heads/X` per worktree) answers "where, if anywhere, is `[default-branch]` checked out?"

| Case | Condition | Action |
|---|---|---|
| **A** | `default` checked out nowhere, and task branch fast-forwards onto it | `git fetch . [task]:[default]` — zero working-tree effect |
| **B** | `default` is checked out **in this session's own cwd**, clean | Already there. Plain `git merge [task]`. No checkout. |
| **C** | `default` checked out in a directory that is **not** this session's cwd | **Refuse and instruct.** `git fetch .` already fatals; catch it and stop. |
| **D** | `default` free, but **not** a fast-forward (diverged) | Throwaway worktree: merge in isolation, then remove |

Fast-forward test: `git merge-base --is-ancestor [default] [task]`.

Case D (verified working):
```bash
git worktree add -q .worktrees/.merge-NNN [default-branch]
cd .worktrees/.merge-NNN && git merge --no-ff [task-branch] -m "merge: #NNN [title]"
#   on conflict: git merge --abort; cd back; remove worktree; report and STOP
cd [project-root]
git worktree remove .worktrees/.merge-NNN
git worktree prune
```

Case C error text:
```
Cannot merge: [default-branch] is checked out at
  [path]
which is not this session's working directory.

Another session may be working there. Complete this task from that
directory, or re-run /plan-complete NNN once it is free.
```

**Consequence:** under this design `plan-complete` never occupies `MAIN` (A and D touch no shared tree; B is our own dir; C refuses). So rather than mirroring `plan-review`'s step 3.6 serializer, add a short invariant note in the existing `MAIN`-sentinel vocabulary. Don't build a serializer that has nothing to serialize.

**(2) Worktree teardown hygiene.** Removal today is `git worktree remove --force` with no verification, and the word `prune` appears **nowhere** in `skills/`. A busy `.next/` makes removal fail and nothing notices — that is how `081`/`096`/`118` became corpses. (The existing memory note about killing the dev server before `git worktree remove` is the same failure mode one step earlier.)

Define one canonical teardown sequence and use it at every call site:
```bash
git worktree remove [path] || git worktree remove --force [path]
test ! -e [path] || echo "WARNING: [path] still exists — a process may hold it open"
git worktree prune
```
Apply at: `plan-complete` step 14b (lines 264–265, replacing the multi-repo `rm -rf .worktrees/NNN-slug` too), `plan-execute` lines 903–904 and 950–951, `plan-spawn` line 284.

`plan-cleanup` step 6 (lines 114–127) is the corpse-maker — it reaps with bare `rm -rf .worktrees/[dir]`, never `git worktree remove`, never `prune`. Rewrite it to cross-check `git worktree list --porcelain` against the `.worktrees/` listing, report **both** desync directions (on-disk-but-unregistered — the reported case; and registered-but-missing), reap via the canonical sequence, and always finish with `git worktree prune` even when nothing was reaped.

Out of scope: adding `.worktrees/` to a consuming project's lint ignore surface — already captured as task #137 in that project.

**(3) Observation provenance.** *A passing test whose provenance you haven't verified is not evidence.* The smoke test's premise — "the running server is serving my branch" — was never checked.

Assert immediately before **and** immediately after every runtime observation:
```bash
git rev-parse --abbrev-ref HEAD   # must equal the task branch
git rev-parse HEAD                # record; must be unchanged after
```
If either differs before vs. after, the observation is **VOID** — discard the result, report the drift, never promote it to a conclusion.

Apply at: `plan-execute` step 11b.6 (lines 713–748 — both the interactive `AskUserQuestion` path and the deferred worktree/yolo path; record branch+SHA alongside each `⏳ Deferred to review` entry in the state file); the segment prompt template's `## Observation Steps` section (lines 820–825); `plan-review`'s deferred-observation replay (~line 185 — check the recorded SHA against current `HEAD`, warn loudly on mismatch); and `agents/plan-executor.md`.

Dev servers: no skill mentions one today, so keep this proportionate — a rule, not a process manager. A long-running dev server is state that a branch switch invalidates. If a skill starts one, record the SHA it was started at and re-check before drawing **any** assertion from it; if the SHA moved, the server is serving stale code — restart it before trusting anything it says.

**(4) `agents/plan-executor.md` — two ungoverned gaps.** The file has no staging or artifact rules at all.

- **Stage by explicit file path.** `git add <dir>` after a `git mv` stages the rename but *not* subsequent content edits to the moved file. This shipped a commit (`c1318d4`) containing the route file's old contents, caught only by diffing the tip against the working tree afterward.
- **No binary artifacts in the repo.** Sub-agents twice dropped `.png` screenshots into the repo root. The standing preference is never to commit them, and nothing catches this: `plan-complete` step 7's "Clean up debug artifacts" only greps for `console.log`-style statements in changed files, while `plan-execute:891`'s `git add -A` sweeps up whatever is left behind.

## Why

`plan-complete` is the only lifecycle skill that writes into a working directory it does not own. Steps 14 and 14b both `git checkout [default-branch]` in the shared main checkout to stage a merge. When any other agent is sitting in that directory — which the `keep`-worktree feature now actively encourages, since it was built precisely to let two agents review in parallel — their tree silently becomes someone else's code mid-run. This is a design contradiction: the project added parallel-agent affordances (`keep`, concurrent `in-review`, `plan-spawn`) without ever removing the one skill that assumes it is alone.

The damage is not data loss (commits stay reachable by SHA); it is **false evidence**. A smoke test went green against the wrong branch's code and nobody could tell. That is the worst failure mode a task-management system can have, because the wrong conclusion is indistinguishable from the right one. Everything else in this task — teardown hygiene, observation provenance, executor staging rules — is a variation on the same theme: an assertion whose premise was never checked.

Three properties make the fix tractable rather than a rewrite:

1. `git fetch . [task]:[default]` **refuses** (exit 128) when `default` is checked out anywhere. Safety by construction, not by convention — the skill cannot corrupt a shared checkout even if the logic is wrong, because git errors out first.
2. `git worktree remove` preserves the branch ref and its commits. The merge and the teardown are therefore *independent operations*, which invalidates the "merge FROM main first is mandatory" rationale currently justifying the dangerous ordering.
3. Because A/D touch no shared tree, B is our own directory, and C refuses, `plan-complete` never occupies `MAIN`. So it needs an **invariant note**, not a `plan-review`-style serializer. Don't build a serializer that has nothing to serialize.

Fixing (1) alone leaves the corpse-maker (`plan-cleanup` step 6 reaps with bare `rm -rf`, and `git worktree prune` appears **nowhere** in `skills/`) — which is what turned three stale worktrees into 2,182 phantom lint errors. The four scope areas are one bug seen from four angles, and shipping them separately would leave the system inconsistent between releases.

## How Summary

Rewrite `plan-complete` steps 14/14b around an A/B/C/D decision table (`git fetch .` fast-forward / merge-in-place / refuse / throwaway-worktree) so no shared directory is ever checked out, delete the false "merge first is mandatory" rationale, and add a `MAIN`-invariant note. Then define one canonical worktree-teardown sequence (`remove` → `|| --force` → verify gone → `prune`) and apply it at all six call sites, rewriting `plan-cleanup` step 6 from a `rm -rf` corpse-maker into a bidirectional registry/disk desync reporter. Finally, add pre/post `git rev-parse` provenance assertions around every runtime observation, plus explicit-path staging and no-binary-artifact rules to the executor agent. Verify with a scripted rehearsal in a scratch repo — including a regression test reproducing the exact incident — then one live lifecycle walk.

**Files of note:**
- `skills/plan-complete/SKILL.md` — steps 14 (lines 246–254) and 14b (256–266); the P0 fix and the false rationale at line 262
- `skills/plan-cleanup/SKILL.md` — step 6 (lines 114–127), the corpse-maker
- `skills/plan-execute/SKILL.md` — teardown at 903–904 / 950–953; observation handling at 713–748; segment prompt template at 820–825
- `skills/plan-spawn/SKILL.md` — teardown at 284–287, **plus two sites the write-up missed: 97 and 347**
- `skills/plan-review/SKILL.md` — deferred-observation replay (step 7, lines 174–206)
- `agents/plan-executor.md` — 71 lines, has **no** staging or artifact rules at all; `<execution_flow>` step 2 (lines 22–32)

## How

- [x] Step 1: Build the scratch-repo rehearsal harness first (TDD, red phase). In the scratchpad (never the user's project), write a shell script that reproduces the exact incident: `main` + `feature/133` + `feature/135`, agent A sitting on `feature/135` in the main dir, `133` in a kept worktree. Assert agent A's `HEAD` is still `feature/135` and `git status --porcelain` is empty after a merge of `133` into `main`. Confirm it FAILS against today's `git checkout`-based sequence, and add scripted cases for B (merge in own cwd), C (`fetch` exits 128 on foreign checkout), D (diverged → throwaway worktree), and D-conflict (`--abort`, worktree removed, clean stop).
- [x] Step 2: Rewrite `plan-complete` step 14 (lines 246–254). Keep the `AskUserQuestion` prompt verbatim (Critical Requirement #1, line 24); replace only the post-response merge body with the A/B/C/D decision table. Include the detection primitive (`git worktree list --porcelain` → where is `[default-branch]` checked out?), the fast-forward test (`git merge-base --is-ancestor`), the case-C refusal text verbatim from the design write-up, and the case-D throwaway-worktree sequence with its conflict path.
- [x] Step 3: Rewrite `plan-complete` step 14b (lines 256–266). **Delete the false rationale on line 262** ("removing the worktree before merging would discard the very checkout the branch is in") and replace it with the true statement: `git worktree remove` preserves the branch ref, so merge and teardown are independent; the ordering is for cleanliness, not correctness. Route the merge through the same step-14 decision table — never `cd` to project root and `git checkout`. Add the `MAIN`-invariant note near the top of the Steps section (line ~49), in `plan-review` step 3.6's existing sentinel vocabulary.
- [x] Step 4: Define the canonical teardown sequence once and apply it verbatim at every call site: `plan-complete` 264–265 (including the multi-repo `rm -rf .worktrees/NNN-slug`), `plan-execute` 903–904 and 950–953, and `plan-spawn` **284–287, 97, and 347** (the latter two were not in the design write-up — both currently pair `--force` with a bare `rm -rf` fallback). Sequence: `git worktree remove [path] || git worktree remove --force [path]` → `test ! -e [path] || echo "WARNING: [path] still exists — a process may hold it open"` → `git worktree prune`.
- [x] Step 5: Rewrite `plan-cleanup` step 6 (lines 114–127) from reaper to reconciler. Cross-check `git worktree list --porcelain` against the `.worktrees/` directory listing; report **both** desync directions (on-disk-but-unregistered — the reported corpse case; and registered-but-missing); preserve the existing `in-review`-with-live-worktree exemption (line 119) and the `AskUserQuestion` gate; reap via the canonical sequence from Step 4; and always finish with `git worktree prune` even when nothing was reaped.
- [x] Step 6: Add observation provenance assertions. Pre/post `git rev-parse --abbrev-ref HEAD` + `git rev-parse HEAD` around every runtime observation; if either differs, the observation is **VOID** — discard, report the drift, never promote to a conclusion. Apply at `plan-execute` step 11b.6 (both the interactive `AskUserQuestion` path at 723–748 and the deferred worktree/yolo path at 715–721 — record branch+SHA alongside each `⏳ Deferred to review` state-file entry), the segment prompt template's `## Observation Steps` (820–825), and `plan-review` step 7's replay (174–206 — check the recorded SHA against current `HEAD`, warn loudly on mismatch, alongside the existing ⚠ dependency flag).
- [x] Step 7: Add the three missing rules to `agents/plan-executor.md` (the file has none today). Into `<execution_flow>`: the same pre/post `rev-parse` provenance rule, and the dev-server rule (record the SHA a long-running server was started at; re-check before drawing any conclusion from it; if it moved, restart before trusting it). As new rules: **stage by explicit file path** (`git add path/to/file.ts`; never `git add <directory>` after a `git mv` — it stages the rename but not later edits, silently committing stale contents) and **never write screenshots, images, or binary artifacts into the repo** (use the scratchpad; `plan-execute`'s `git add -A` at line 891 will commit whatever is left behind). Mirror the dev-server rule into `plan-execute`'s segment prompt template.
- [x] Step 8: 👁 (partially verified — see Changes) Re-run the Step 1 harness green, covering every decision-table branch plus teardown hygiene (hold a file open in a worktree → assert it warns rather than leaving a corpse; simulate a corpse via bare `rm -rf` → assert `plan-cleanup` reports it as *registered but missing*; create an unregistered dir → assert *on disk but unregistered*). Then walk the full lifecycle live in a throwaway directory per `CLAUDE.md`: `node bin/dev.js` → `/plan-init` → `/plan-capture` → `/plan-elaborate 1` → `/plan-execute 1 worktree keep` → `/plan-review 1` → `/plan-complete 1`, confirming the kept worktree is torn down, the branch merged, `git worktree list` clean, and `.worktrees/` gone.
- [x] Step 9: 👁 (observed live via the incident — see Changes) Run the real concurrency test — the property that was violated. Two `keep`-executed tasks; complete one while the other's worktree is live and a third shell sits on an unrelated branch in the main dir. Assert that shell's `HEAD` and `git status --porcelain` are unchanged across the entire `/plan-complete` run. Then update `CLAUDE.md` if any documented lifecycle behavior changed.

## Verification

- Regression test passes: with agent A sitting on `feature/135` in the main directory, `/plan-complete 133` leaves `HEAD` at `feature/135` and `git status --porcelain` empty, while `main` advances to `133`'s tip. (Today's code turns that tree into `main`.)
- Case C refuses rather than proceeding: `git fetch .` exits 128 and the skill stops with the verbatim refusal message naming the occupying path.
- Case D lands a real merge commit via a throwaway worktree and leaves the sitting agent's tree untouched; the D-conflict path aborts, removes the temp worktree, and stops cleanly.
- `grep -c "git worktree prune" skills/` is non-zero, and no `rm -rf .worktrees` remains as the primary teardown at any call site (`plan-complete`, `plan-execute` ×2, `plan-spawn` ×3, `plan-cleanup`).
- Teardown of a busy worktree (a process holding a file open) prints the `WARNING: ... still exists` line rather than silently leaving a corpse.
- `/plan-cleanup` reports both desync directions: a bare-`rm -rf`'d worktree as *registered but missing*, and a hand-created `.worktrees/` dir as *on disk but unregistered*.
- The false sentence "removing the worktree before merging would discard the very checkout the branch is in" no longer appears anywhere in `skills/`.
- Full live lifecycle (`/plan-init` → … → `/plan-complete 1` with `worktree keep`) finishes with `git worktree list` clean and `.worktrees/` gone.
- Concurrency test: across a full `/plan-complete` run, an unrelated shell's `HEAD` and `git status` in the main directory are byte-identical before and after.

## Impact Scope

- `skills/plan-complete/SKILL.md` — steps 14, 14b; new invariant note near line 49; multi-repo `rm -rf` at 265
- `skills/plan-cleanup/SKILL.md` — step 6 (114–127) rewritten as a reconciler
- `skills/plan-execute/SKILL.md` — teardown 903–904, 950–953; observation handling 713–748; segment prompt template 820–825 (+ dev-server rule)
- `skills/plan-spawn/SKILL.md` — teardown at 97, 284–287, 347
- `skills/plan-review/SKILL.md` — step 7 deferred-observation replay (174–206)
- `agents/plan-executor.md` — `<execution_flow>` provenance + dev-server rules; new staging + artifact rules
- `CLAUDE.md` — only if documented lifecycle behavior changes (Step 9)

## Assumptions

### Initial (from elaboration)

- [high] The git semantics table in the task/write-up is trustworthy — the user states each row was verified empirically in a scratch repo, and Step 1's harness re-verifies them before any skill edit lands. **Why:** re-deriving them from scratch would duplicate work already done, but the harness makes the fix falsifiable rather than trusted.
- [high] Skills are declarative markdown with no automated test suite (per `CLAUDE.md`), so "TDD" here means the scratch-repo shell rehearsal (Step 1, red) before editing the SKILL.md prose, then re-running it green (Step 8). **Why:** the git command sequences are the only executable artifact; testing them directly is the closest available analogue to a failing unit test.
- [high] `plan-spawn` lines 97 and 347 are in scope even though the design write-up names only line 284. **Why:** both pair `git worktree remove --force` with a bare `rm -rf .worktrees/NNN-slug` fallback — exactly the corpse-making pattern this task exists to eliminate. Leaving them would make the canonical sequence non-canonical.
- [high] `plan-pause` and `plan-backlog` keep their `git checkout [default-branch]` calls. **Why:** the task explicitly rules them legitimate (they unwind a branch in a directory they themselves own), and the write-up agrees.
- [low] The `MAIN` invariant is a prose note in `plan-complete`, not a code-level guard mirroring `plan-review` step 3.6. **Why:** the write-up argues cases A/D touch no shared tree, B is our own dir, and C refuses — so there is nothing to serialize. Risk: if a future case escapes the table, nothing enforces the invariant. Accepted per the write-up's explicit "don't build a serializer that has nothing to serialize."
- [low] Adding `.worktrees/` to a consuming project's lint-ignore surface is out of scope (the user's task #137 elsewhere). **Why:** stated in both the task and the write-up; the corpse *cause* is fixed here, the downstream lint symptom is fixed there.
- [low] The dev-server SHA rule lands as guidance in `agents/plan-executor.md` and `plan-execute`'s segment prompt, not as a process manager. **Why:** no skill starts a dev server today; a rule is proportionate, machinery is not.

### Discovered during execution
- [high] Isolated each scratch repo with a first commit that adds `.gitignore` ignoring `.DS_Store` and `.worktrees/`. **Why:** the scratchpad carries a host `.DS_Store`, and the nested `.worktrees/` dirs otherwise leak into `git status --porcelain`, corrupting the byte-identical working-tree assertions. Ignoring them isolates the comparison to real merge effects.
- [high] `new_repo` cd's the current shell (via a global `$D`) rather than being called in a `$(...)` subshell. **Why:** a subshell `cd` does not persist, so every case would have run in the previous case's directory (the initial run showed exactly this cross-repo contamination). This is a harness-correctness decision, not a git-semantics one.
- [low] Case D uses a fixed throwaway worktree path `.worktrees/.merge-NNN` under the project root. **Why:** matches the task's canonical Case-D sequence, and it cannot collide with a kept worktree at `.worktrees/NNN-slug`. **Correction (verified later in segment 2):** an earlier version of this bullet claimed `--force` is *needed* on the conflict/abort path because the worktree retains conflicted merge state post-`--abort`. That was wrong — it only appeared true because the abort was silently no-op'ing (see the `git -C` bullet below). With a correct abort, the plain `git worktree remove` succeeds. The canonical `remove || remove --force` sequence still stands as the general form.
- [high] Every Case D command (and every multi-repo teardown command) is addressed with `git -C [path]` instead of `cd [path] && ...`. **Why:** skill fenced blocks execute independently, so a `cd` in one block does not persist into the next. Verified empirically: `git merge --abort` run from the project root fails with `fatal: There is no merge to abort (MERGE_HEAD missing)` while the throwaway worktree is left mid-conflict (`UU`, `MERGE_HEAD` present) — the exact class of wrong-directory bug this task exists to eliminate. `git -C [wt] merge --abort` aborts cleanly (rc=0), after which a plain `git worktree remove` succeeds, `main` is unchanged, and the sitting agent is untouched.
- [low] `teardown_busy_worktree_warns` asserts the *shape* of the teardown sequence (warning gated on `test ! -e`, `prune` always runs) rather than forcing the busy-removal to fail. **Why:** on macOS a held-open file did NOT block `git worktree remove` — removal succeeded cleanly, which the task explicitly flagged as a legitimate outcome. Observed result: removed cleanly, no warning printed, prune still ran (exit 0).
- [high] All five empirically-claimed git semantics held exactly as stated on git 2.50.1 (Apple Git-155): Case-A fetch fast-forwards with zero working-tree effect (exit 0); fetch into a foreign-checked-out branch fatals with `refusing to fetch into branch` (exit 128); throwaway-worktree merge lands a real 2-parent merge commit and leaves the sitting agent untouched; `git worktree remove` preserves the branch ref and SHA. **Why:** the whole fix rests on these; the harness re-verified them independently and none deviated.
- [low] Chose to INLINE the canonical teardown sequence at every call site rather than define-once-and-reference. **Why:** these are declarative markdown skills a model reads top-to-bottom mid-execution; a cross-file "see the canonical block" pointer is a lookup a model may not resolve, whereas an inlined 3-line block is unambiguous at the point of use. I kept the wording byte-consistent across all six sites and named it "the canonical teardown sequence" so the concept is still singular even though the text repeats.
- [low] Case B's session-ownership test uses `git rev-parse --show-toplevel` compared against `[default-checkout-path]`. **Why:** the task's design named "this session's own cwd" but did not specify the exact comparison primitive; `--show-toplevel` is the canonical way to get the current working tree's root and is what the detection primitive's paths are expressed in (worktree list paths are toplevel paths), so the two are directly comparable.
- [low] For the multi-repo kept-worktree parent-tree removal I kept a plain `rm -rf .worktrees/NNN-slug` (not `rmdir`) but added explicit prose that it only unlinks dangling symlinks + the empty dir after all per-repo worktrees are gone. **Why:** the task offered `rmdir`-after-unlink OR a justified `rm -rf` as acceptable; `rm -rf` matches the pre-existing keep_mode-FALSE multi-repo path in plan-execute (which also `rm -rf`s the symlinked parent), so keeping it identical avoids introducing a second divergent idiom for the same operation. The justification is now stated inline at both sites.
- [low] Added a `MAIN`-invariant note as a blockquote before step 1 and fixed plan-complete's bottom Edge Cases bullet (which repeated the deleted false rationale). **Why:** the task specified the note before step 1 and the deletion of the false claim; the Edge Cases bullet at line 331 was an out-of-scope-adjacent copy of the same false statement — I judged leaving it would contradict the corrected step 14b, so I corrected it too (a minor consistency fix, noted here as a scope call).
- [low] For an *on disk but unregistered* worktree corpse I chose `git worktree remove … 2>/dev/null || rm -rf …` (attempt registry removal first, fall back to `rm -rf`) rather than going straight to `rm -rf`. **Why:** the directory-name→registry classification is a heuristic; the `git worktree remove` first-attempt is a cheap correctness hedge for the rare case git actually does track it (then the branch ref is preserved), and `rm -rf` only fires when git genuinely has no record. For a *registered but missing* worktree I chose bare `git worktree prune` (no `rm`) because the path is already gone and only the stale admin record remains. This is the one place a `rm -rf` remains, justified inline.
- [low] Renamed plan-cleanup step 6 from "List orphaned worktree directories" to "Reconcile worktrees (registry vs. disk)" and restructured it into gather→classify→exempt→reap. **Why:** the step's job changed from one-directional reaping to two-directional reconciliation; the old title mis-described the new behavior. Kept the step number (6), the `*(full mode only)*` annotation, and the AskUserQuestion Delete-all/Keep-all gate. The step-8 focused-mode scan and step-10 summary still say "orphaned worktrees" — I left those untouched as out-of-scope for this segment (they read fine as a count).
- [low] Recorded deferred-observation provenance as an inline `(branch: [branch] @ [sha])` suffix on the existing state-file line rather than as a new sub-field. **Why:** the task said "extend the existing line formats"; an inline parenthetical keeps the entry a single parseable line and composes with the existing `(⚠ …)` dependency suffix (order: `(branch…) (⚠…)`). plan-review parses it back out with a documented pattern and degrades gracefully when the parenthetical is absent (legacy entries).
- [low] Placed the two repo-hygiene rules in a single `<repo_hygiene>` section in plan-executor.md (rather than two separate `<staging_rules>`/`<artifact_rules>` tags). **Why:** both are one-line "never do X to the repo" rules; the file's tag-per-concern idiom is satisfied by one cohesive hygiene concern, and a single section is less noise than two one-bullet tags.
- [high] The `<output_format>`→`</output>` typo named in step 7.4 was already fixed at HEAD (the committed file ends with `</output_format>`, no stray `</output>`), so no edit was needed for it. **Why:** verified with `git show HEAD:agents/plan-executor.md | tail`; a prior commit already corrected it. Reported as a deviation rather than forcing a no-op edit.

## Changes

**Step 1 — rehearsal harness (red phase).**
- Created `merge-rehearsal.sh` in the session scratchpad (not committed; the project has no home for shell test harnesses and skills are declarative markdown). 9 named cases, 44 assertions, exit-code-gated.
- Result: 44 passed / 0 failed, plus the `regression_incident` expected-fail firing exactly as predicted — the OLD `git checkout main && git merge` sequence moves agent A's tree from `feature/135` to `main`, while the NEW `git fetch . feature/133:main` leaves HEAD ref, HEAD SHA, and `git status --porcelain` byte-identical.
- All five empirically-claimed git semantics independently re-verified on git 2.50.1 (Apple Git-155). None deviated. The fix's backbone (`git fetch .` refuses with exit 128 rather than stomping a foreign checkout) is confirmed.
- Two nuances surfaced for the prose: (a) Case D's conflict/abort path can leave the throwaway worktree dirty, so its teardown must use the full `remove || remove --force` sequence; (b) on macOS a held-open file does not actually block `git worktree remove --force`, so the `test ! -e` warning is a guard, not a common path. *(Nuance (a) was later traced to a silently-no-op'ing abort — see step 2–4 below.)*

**Steps 2–4 — the P0 rewrite and canonical teardown.**
- `skills/plan-complete/SKILL.md`: step 14's post-response body replaced with the A/B/C/D decision table (detection primitive → fast-forward test → per-case dispatch). The `AskUserQuestion` gate and its three options are preserved verbatim per Critical Requirement #1. Case B now refuses to merge over a dirty tree; Case C stops with the verbatim refusal text; `git branch -d` is documented as a ref operation needing no checkout.
- `skills/plan-complete/SKILL.md` step 14b: the false rationale ("removing the worktree before merging would discard the very checkout the branch is in") and the "ordering is load-bearing" framing that existed only to justify it are both **deleted**, replaced with the true statement that `git worktree remove` removes a checkout, not a branch — so merge and teardown are independent. The merge now defers to step 14's table; no `cd` + `git checkout` remains. A stale Edge Cases bullet repeating the false claim was corrected too.
- A `MAIN`-invariant note was added after `## Steps`, in `plan-review` step 3.6's sentinel vocabulary, recording *why* plan-complete needs no concurrency serializer: A and D touch no shared tree, B is this session's own directory, C refuses.
- The canonical teardown sequence (`remove || remove --force` → `test ! -e` warning → `git worktree prune`) is inlined at all six call sites: plan-complete 14b (single-repo and per-repo), plan-execute (single-repo and multi-repo), and plan-spawn ×3 — including lines 97 and 352, which the design write-up missed. `git worktree prune` now appears 10× across `skills/`; before this task it appeared **zero** times.
- **Bug found and fixed during review of the sub-agent's output:** the first draft split Case D across two fenced blocks, relying on a `cd` in block one persisting into block two. It does not. Verified in a scratch repo that `git merge --abort` from the project root fails (`fatal: There is no merge to abort`) and strands the throwaway worktree mid-conflict. All Case D and multi-repo teardown commands are now addressed with `git -C [path]` and depend on no current directory. Re-verified end-to-end: clean-merge Case D lands a 2-parent commit and leaves agent A byte-identical; conflict Case D aborts cleanly (rc=0), leaves `main` unchanged, and removes the worktree without needing `--force`.

**Steps 5–7 — reconciler, provenance, executor rules.**
- `skills/plan-cleanup/SKILL.md` step 6 rewritten from reaper to reconciler ("Reconcile worktrees (registry vs. disk)"). It cross-checks `git worktree list --porcelain` against the `.worktrees/` listing and names both desync directions: *on disk but unregistered* (the corpse — `prune` will not touch it) and *registered but missing* (`prune` clears the stale record). The active-task exemption and the Delete-all/Keep-all `AskUserQuestion` gate are preserved; the early-exit on a missing `.worktrees/` was removed so registered-but-missing entries are still caught. `git worktree prune` always runs, even on "Keep all". Verified empirically: `prune` cleared a stale `081` record but left an unregistered `unreg/` directory on disk — exactly the mechanism by which 081/096/118 accumulated — and the skill's corpse command removed it while leaving the live worktree and all branch refs intact.
- `skills/plan-execute/SKILL.md`: observation-provenance assertions added to step 11b.6. The rule (*a passing observation whose provenance you haven't verified is not evidence*) is stated once and applied on both paths. Deferred entries now record `(branch: [branch] @ [sha])`; the interactive path asserts before presenting and after the user responds, and VOIDs the observation if HEAD moved. The segment prompt template's `## Observation Steps` gained the same rule plus the dev-server SHA rule.
- `skills/plan-review/SKILL.md` step 7 parses the recorded SHA, warns loudly on mismatch ("the code under observation has MOVED"), and degrades gracefully for legacy entries with no SHA. **Orchestrator fix:** its three outcome bullets originally replaced the whole `⏳ Deferred to review` marker, which would have dropped the new provenance parenthetical — they now explicitly preserve it.
- `agents/plan-executor.md` (which had no staging or artifact rules at all) gained `<execution_flow>` items f (observation provenance) and g (dev-server SHA rule), plus a new `<repo_hygiene>` section: stage by explicit file path (never `git add <directory>` after a `git mv`), and never write screenshots, images, or binary artifacts into the repository.
- The `</output_format>` "typo" named in the design notes turned out not to exist — the closing tag was always correct. The sub-agent verified against `HEAD` and correctly declined to change it.

**Steps 8–9 — verification status (partial; be precise about what was and wasn't proven).**

At the user's direction the live rehearsal and the scripted two-agent concurrency test were **not** re-run after the skill edits. What *was* established:

- **Automated checks against the edited skills, all passing** (run with a before/after `git rev-parse` provenance assertion that came back unchanged, so the result is valid evidence): the false rationale is gone from `skills/`; `git worktree prune` appears 15× across 4 files (0 before this task); `plan-complete` contains no live `git checkout [default-branch]`, only the prohibition; no bare `rm -rf .worktrees` survives as a primary reap path; provenance assertions are present in plan-execute (15), plan-review (4), plan-executor (3); both `<repo_hygiene>` rules are present; the `MAIN` invariant note is present.
- **Segment-1 harness (44 assertions, 0 failures)** verified every git primitive the fix depends on *before* the prose was written, including the headline regression: the old `git checkout main && git merge` sequence moves a sitting agent's tree, while `git fetch . task:main` leaves HEAD ref, HEAD SHA, and `git status` byte-identical.
- **Segment-2 targeted re-verification** confirmed both Case D paths exactly as the skill now writes them (clean merge → 2-parent commit, agent untouched; conflict → clean abort, `main` unchanged, worktree removed without `--force`).
- **Segment-3 targeted re-verification** confirmed the reconciler's two-direction model (`prune` clears a *registered-but-missing* record; an *on-disk-but-unregistered* corpse survives it and needs explicit removal).

**What was NOT run:** the full harness re-run against the edited prose (step 8), the live `/plan-init → … → /plan-complete` lifecycle walk (step 8), and the scripted two-agent concurrency test (step 9). These remain the highest-value follow-ups before this ships.

**An unplanned live confirmation.** While running step-8 verification, one of my own scratch shell blocks lost its working directory and executed `git init`/`git commit`/`git worktree add`/`git branch` against **this repository** instead of the scratchpad. It created five scratch branches and advanced `main` from `4eff556` to a scratch merge commit. This is precisely the bug under repair, one level up: *writes landing in a working directory the process did not own.*

Two things fell out of it, both worth more than the test they replaced:

1. **`git branch -f main` refused**, with `fatal: cannot force update the branch 'main' used by worktree at '<path>'`. The same safety-by-construction refusal Case C is built on — observed defending a real repo, unprompted.
2. **`git worktree prune` cleared both stale records** while the on-disk scratch directories required explicit removal — the reconciler's two desync directions, confirmed by the incident it exists to prevent.

Recovery was complete and verified: `main` is back at `4eff556`; `fix/build-route-finish-handling` and `feature/plan-execute-des-build-routing` are untouched; `git worktree list` shows one entry; the working tree holds exactly the six intended edits. No real project file was ever committed by the scratch commits — every one touched only throwaway files. It was caught by the before/after `git rev-parse` provenance assertion that this very task adds.

## Notes

Files expected in play (from the design write-up):
- `skills/plan-complete/SKILL.md` — steps 14, 14b (P0 + teardown)
- `skills/plan-cleanup/SKILL.md` — step 6 (the corpse-maker)
- `skills/plan-execute/SKILL.md` — lines 903–904, 950–951 (teardown); step 11b.6 + segment prompt template (provenance)
- `skills/plan-review/SKILL.md` — deferred-observation replay (~line 185)
- `skills/plan-spawn/SKILL.md` — line 284 (teardown)
- `agents/plan-executor.md` — staging + artifact rules

Verification should include a regression test reproducing the exact incident: build a repo with `main` + `feature/133` + `feature/135`, check `feature/135` out in the main dir (agent A), give `133` a kept worktree, run the case-A path, and assert agent A's `HEAD` is still `feature/135` with a clean `git status`. Today's code turns that tree into `main`.
