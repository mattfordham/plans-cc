---
name: plan-complete
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Mark a task as done and archive it
---

# plan-complete

Mark a task as completed, archive it, and update tracking files.

## Critical Requirements

**YOU MUST FOLLOW THESE RULES:**

1. **Branch merge requires interactive prompt** — If the task has a `**Branch:**` field, you MUST call the `AskUserQuestion` tool to ask the user what to do. Do NOT just print "ready to merge" or suggest manual steps.

2. **Follow the exact output format** — Use the format specified in step 16. Do NOT invent your own format or add sections like "Changes Made", "Verification", etc.

3. **No hallucinated commands** — Only suggest `/plan-status` or `/plan-capture`. Commands like `/commit` do not exist.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001") — optional if only one task is in-progress
- Optionally followed by an **auto-accept keyword** that skips confirmation prompts for verification criteria and incomplete checkboxes

### Auto-Accept Keywords

If `$ARGUMENTS` contains any of these words (case-insensitive) alongside the task ID, **automatically accept all remaining criteria** — skip the verification prompt (step 6) and auto-confirm incomplete checkboxes (step 4):

`verified`, `verify`, `quick`, `accept`, `accepted`, `skip`, `done`, `lgtm`, `good`, `approved`, `confirmed`, `yep`, `yolo`, `ship`, `ship it`

**Examples:**
- `/plan-complete 5 verified` — completes task #5, skips verification prompt
- `/plan-complete 12 quick` — completes task #12, auto-accepts everything
- `/plan-complete lgtm` — auto-selects the in-progress task, skips prompts
- `/plan-complete 3 ship it` — completes task #3, skips prompts

**Parsing:** Extract the numeric task ID first, then check if any remaining text matches an auto-accept keyword. If no number is found, treat the entire non-keyword portion as empty (auto-select logic applies).

## Steps

> **`MAIN`-checkout invariant.** `plan-complete` never checks out a branch in a working directory it does not own, and never occupies the shared `MAIN` checkout (the single main working directory that `plan-review` step 3.6 serializes on). Its merge dispatch (step 14) touches no shared tree in cases A and D (a ref fast-forward and a throwaway worktree, respectively), operates in case B only inside *this session's own* working directory, and in case C **refuses** rather than checking out a directory another session owns. Because it can never contend for `MAIN`, `plan-complete` needs no concurrency serializer and deliberately has **no** analogue of `plan-review`'s step 3.6 guard.

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Resolve which task to complete**

   **If `$ARGUMENTS` provided:**
   - Zero-pad to 3 digits
   - Find task file in `.plans/pending/NNN-*.md`

   **If no `$ARGUMENTS`:**
   - Find in-progress, review, and in-review tasks
   - If exactly one: auto-select it
   - If multiple: list and ask which to complete
   - If none in-progress/review/in-review but pending exist: list pending and ask (with warning)

3. **Validate task state**
   - Read the task file
   - Check Status:
     - If `in-progress`, `review`, or `in-review`: proceed (ideal)
     - If `pending` or `elaborated`: warn "Task #NNN wasn't started. Are you sure you want to mark it complete?" Require confirmation.
     - If not found: "Task #NNN not found."

4. **Check checkbox completion**
   Parse the How section for checkboxes:
   - Count total: all `- [ ]` and `- [x]` lines
   - Count completed: `- [x]` lines
   - Count incomplete: `- [ ]` lines

   **If incomplete checkboxes exist:**

   **If auto-accept keyword was provided:** Skip the prompt, proceed as if user said "yes". Still log a brief note: `Note: X/Y steps complete (auto-accepted).`

   **Otherwise:** Prompt the user:
   ```
   Task #NNN has incomplete steps (X/Y complete):
   - [ ] Incomplete step 1
   - [ ] Incomplete step 2

   Complete anyway? (yes/no)
   ```
   - If "no": exit and suggest `/plan-execute NNN`
   - If "yes": proceed with warning noted

5. **Check for unresolved issues**
   Parse the Issues section (if present) for checkboxes:
   - Count unchecked issues: `- [ ]` lines
   - Count resolved issues: `- [x]` lines

   **If unresolved issues exist (unchecked items in Issues section):**
   ```
   Cannot complete task #NNN — X unresolved issue(s):
   - [ ] Login button doesn't respond on mobile Safari
   - [ ] Timeout error shows raw stack trace

   Run `/plan-execute NNN` to resolve issues, or manually check them off.
   ```
   - **Block completion** — do not proceed until issues are resolved
   - This is a hard block, not a warning (unlike incomplete How steps)

5b. **Check deferred observations**
    - Check if `.plans/state/NNN-state.md` exists (where NNN is the zero-padded task ID)
    - If it exists, read it and look for the Observations section
    - Search for entries containing `⏳ Deferred to review` that have NOT been replaced with `✓ User confirmed`, `✗`, or `⊘ Skipped`
    - If unreviewed deferred observations exist:

      **If auto-accept keyword was provided:** Skip the prompt, proceed. Log: `Note: N unreviewed observation(s) auto-accepted.`

      **Otherwise:** Warn and prompt:
      ```
      Warning: Task #NNN has N unreviewed observation(s):
      - Step 3: [observation description] ⏳ Deferred to review
      - Step 7: [observation description] ⏳ Deferred to review

      Run `/plan-review NNN` to walk through observations first, or complete anyway?
      ```
      Use AskUserQuestion:
      - Header: "Observations"
      - Question: "Task has N unreviewed observation(s). What would you like to do?"
      - Options:
        1. "Review first" — Stop completion, suggest `/plan-review NNN`
        2. "Complete anyway" — Accept unreviewed observations and proceed
      - If "Review first": exit and suggest `/plan-review NNN`
      - If "Complete anyway": proceed to step 6

6. **Display verification criteria**

   **If auto-accept keyword was provided:** Skip the prompt entirely. Proceed without asking. Do NOT display the verification criteria or ask for confirmation.

   **Otherwise:** Show the Verification section and ask:
   ```
   Verification criteria for #NNN:
   [Verification section content]

   Have these criteria been met? (yes/no)
   ```
   - If "no": warn but allow completion if user insists
   - If "yes": proceed

7. **Clean up debug artifacts**

   Search for debug/logging statements that may have been added during task execution (especially during observation steps).

   **Identify files to search:**
   - Parse the task's Changes section for modified file paths
   - If the task has a `**Branch:**` field, also run `git diff --name-only [default-branch]...[task-branch]` to get all changed files
   - If no files can be identified, skip this step silently

   **Search for common debug patterns using Grep:**
   - JS/TS files (`*.js`, `*.ts`, `*.jsx`, `*.tsx`): `console\.log`, `console\.debug`, `debugger`
   - Ruby files (`*.rb`): `\bputs\b`, `\bpp?\b `, `binding\.pry`, `binding\.irb`
   - Python files (`*.py`): `breakpoint\(\)`, `pdb\.set_trace`
   - Go files (`*.go`): `fmt\.Println` (flag for review, may be intentional)
   - Any file: `// DEBUG`, `# DEBUG`, `TODO.*#NNN`, `FIXME.*#NNN` (where NNN is the task ID)

   Only search within the files identified above — do not scan the entire project.

   **If no debug patterns found:** skip silently and proceed to step 8.

   **If debug patterns found:**
   - List each match with file path, line number, and line content
   - **MUST use `AskUserQuestion` tool**:
     - Header: "Debug cleanup"
     - Question: "Found {count} possible debug/logging statement(s) in task files:\n{list of matches}\n\nWhat would you like to do?"
     - Options:
       1. "Remove all" (description: "Delete all identified debug lines")
       2. "Review each" (description: "Review each match individually and decide")
       3. "Keep all" (description: "Leave everything as-is, these are intentional")

   **Based on user response:**
   - "Remove all": Use Edit to remove each debug line from its file
   - "Review each": For each match, show it in context (a few surrounding lines) and use AskUserQuestion with options "Remove" / "Keep" per line. Apply removals with Edit.
   - "Keep all": Proceed without changes

   **If removals were made** and the task has a `**Branch:**` field and `git_commits` is enabled in config.json:
   - Commit the cleanup separately:
     ```bash
     git add [affected files]
     git commit -m "chore: remove debug statements from task #NNN"
     ```

8. **Update task file**
   - Change Status to `completed`
   - Add completion timestamp: `**Completed:** [YYYY-MM-DDTHH:MM]`
   - Remove `**Worktree:**` line if present (and the `**Repos:**` line if multi-repo). For a non-kept task this is defensive cleanup — the worktree should already be removed by `/plan-execute`, but remove stale metadata if it persists. For a kept-worktree task (executed with `keep`), this is the deliberate field-strip that finishes the teardown begun in step 14b, which removed the actual worktree after merging from main.
   - Write updated file (still in pending/ temporarily)

9. **Move to completed/**
   - Move file from `.plans/pending/NNN-slug.md` to `.plans/completed/NNN-slug.md`

10. **Clean up state file**
    - Check if `.plans/state/NNN-state.md` exists
    - If it exists, delete it: `rm .plans/state/NNN-state.md`
    - If the `state/` directory is now empty, remove it: `rmdir .plans/state`

11. **Update HISTORY.md**
    - Append row to the history table:
      ```
      | NNN | [Title] | [type] | [YYYY-MM-DD] | [Brief summary from Changes section] |
      ```

12. **Update PROGRESS.md**
    - Remove task from "Active Work" section
    - Add to "Recently Completed" (keep last 5):
      ```
      ## Recently Completed
      - **#NNN** - [Title] (completed [YYYY-MM-DD])
      ```
    - Update Stats section:
      - Decrement In Progress count
      - Increment Completed count
    - Update "Last updated" date

13. **Pre-merge git check** (if task has a branch)
    - Check if task file has `**Branch:**` field
    - If no branch field, skip to step 16
    - Run `git status --porcelain` to check for uncommitted changes
    - If no uncommitted changes: proceed to step 14
    - If uncommitted changes exist: commit everything together. The user is working alongside you and may have made changes you're not aware of — include them all without prompting.
      ```bash
      git add -A && git commit -m "plan: changes for task #NNN - [title]"
      ```

14. **Ask about branch merge** (if task has a branch)
    - Check if task file has `**Branch:**` field
    - If no branch field, skip to step 16
    - Get the branch name from the task file
    - Determine the default/target branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` or fall back to main/master
    - **REQUIRED: You MUST use the `AskUserQuestion` tool here** — do NOT skip this or print instructions for the user to follow manually. Call AskUserQuestion with:
      - Header: "Merge branch"
      - Question: "Branch '[branch-name]' is ready to merge to [default-branch]. What would you like to do?"
      - Options:
        1. "Merge and delete branch" — Merge to [default-branch] and delete the feature branch
        2. "Merge and keep branch" — Merge to [default-branch] but keep the feature branch
        3. "Skip merge" — Leave branch as-is, I'll handle it manually
    - **After user responds via AskUserQuestion:**

      - **If "Skip merge":** Note in the completion message that the branch was not merged. Do NOT run any of the merge steps below.

      - **If "Merge and delete branch" or "Merge and keep branch":** dispatch to one of four cases (A/B/C/D). This skill NEVER checks out `[default-branch]` in a directory it does not own — the dispatch is the mechanism that guarantees it. The cwd-relative git commands here (Case A's `git fetch .`, Case D's `git worktree add .worktrees/.merge-NNN`) rely on the **Project-root discovery** invariant from step 1: after that step's `cd`, cwd IS the discovered project root, so `.worktrees/` resolves at the root even when the session was started from a sub-repo. (Git semantics, the merge dispatch, and teardown are unchanged — this note only pins *where* cwd is.)

        **Detect where `[default-branch]` is checked out, if anywhere:**
        ```bash
        git worktree list --porcelain | grep -B2 "^branch refs/heads/[default-branch]$" | head -1 | cut -d' ' -f2
        ```
        Call this `[default-checkout-path]` (empty = checked out nowhere).

        **Test whether the task branch fast-forwards onto the default** (exit 0 = yes, is a descendant):
        ```bash
        git merge-base --is-ancestor [default-branch] [task-branch]
        ```

        Now pick the case:

        - **Case A — `[default-checkout-path]` is empty AND fast-forward test passed.** The default is checked out nowhere and the task branch is strictly ahead. Advance the ref with zero working-tree effect:
          ```bash
          git fetch . [task-branch]:[default-branch]
          ```
          (If `[default-branch]` is later checked out somewhere unexpected, this fatals with exit 128 rather than stomping — treat that as case C and report.)

        - **Case B — `[default-checkout-path]` equals this session's own current working directory** (`git rev-parse --show-toplevel`). The default is already checked out right here. First assert the tree is clean:
          ```bash
          git status --porcelain
          ```
          If that prints anything, **refuse** — do not merge over uncommitted work: report `Cannot merge: [default-branch] is checked out here with uncommitted changes. Commit or stash them, then re-run /plan-complete NNN.` and STOP. If clean, merge in place:
          ```bash
          git merge [task-branch]
          ```

        - **Case C — `[default-checkout-path]` is non-empty and is NOT this session's own working directory.** Another session may own that directory. **Refuse and STOP** — do not fall through to completion. Print VERBATIM:
          ```
          Cannot merge: [default-branch] is checked out at
            [default-checkout-path]
          which is not this session's working directory.

          Another session may be working there. Complete this task from that
          directory, or re-run /plan-complete NNN once it is free.
          ```

        - **Case D — `[default-checkout-path]` is empty but the fast-forward test FAILED** (the branches diverged). Merge in an isolated throwaway worktree so no shared tree is touched. Every command below is addressed with `git -C` and never depends on the current directory — a `cd` in one command does not persist into the next:
          ```bash
          git worktree add -q .worktrees/.merge-NNN [default-branch]
          git -C .worktrees/.merge-NNN merge --no-ff [task-branch] -m "merge: #NNN [title]"
          ```
          - **On merge conflict:** abort the merge *inside the throwaway worktree* (`git merge --abort` run from the project root fails with `fatal: There is no merge to abort` and silently leaves the worktree mid-conflict), tear it down, then STOP and report the conflict for manual resolution:
            ```bash
            git -C .worktrees/.merge-NNN merge --abort
            git worktree remove .worktrees/.merge-NNN || git worktree remove --force .worktrees/.merge-NNN
            test ! -e .worktrees/.merge-NNN || echo "WARNING: .worktrees/.merge-NNN still exists — a process may hold it open"
            git worktree prune
            ```
          - **On clean merge:** tear down the throwaway worktree (the merge commit already landed on `[default-branch]`):
            ```bash
            git worktree remove .worktrees/.merge-NNN || git worktree remove --force .worktrees/.merge-NNN
            test ! -e .worktrees/.merge-NNN || echo "WARNING: .worktrees/.merge-NNN still exists — a process may hold it open"
            git worktree prune
            ```

        **After a successful merge in case A, B, or D:**
        - If the user chose "Merge and delete branch": `git branch -d [task-branch]`. This is a ref operation and works from any directory — no checkout needed.
        - Report success (or, for cases B/D, any merge conflict already handled above).

14b. **Tear down a kept worktree** (if the task still has a live `**Worktree:**` field)

    Completion is the OWNER of kept-worktree teardown. A task executed with `keep` keeps its execution worktree alive through review (`/plan-execute` no longer removes it), so the live `**Worktree:**` field will still be present here. If the task has NO `**Worktree:**` field, skip this step entirely.

    **Merge and teardown are independent.** `git worktree remove` removes a *checkout*, not a *branch* — the branch ref and all its commits survive in the main repo's `.git` regardless of removal order (the same truth plan-spawn states in its "Invariant" after `git worktree remove`). The ordering below is chosen for cleanliness, not correctness.

    1. **Merge.** The merge was already handled by step 14 above via its A/B/C/D decision table — do NOT re-merge, do NOT `cd` to the project root and `git checkout [default-branch]`. If the user chose "Skip merge" in step 14, skip merging here too. (Step 14 never checks out inside this kept worktree; its case dispatch keeps the merge off the worktree's tree.)
    2. **Remove the worktree** using the canonical teardown sequence (`remove` → `remove --force` fallback → `test ! -e` warning → `git worktree prune`).
       - **Single-repo:**
         ```bash
         git worktree remove [worktree-path] || git worktree remove --force [worktree-path]
         test ! -e [worktree-path] || echo "WARNING: [worktree-path] still exists — a process may hold it open"
         git worktree prune
         ```
       - **Multi-repo** (task has a `**Repos:**` field or `(multi-repo: ...)` parenthetical): apply the canonical sequence to each per-repo worktree, then remove the symlinked parent tree. Address each repo with `git -C` rather than `cd`, so no command depends on a directory change persisting from the previous one. For each listed repo:
         ```bash
         git -C [repo] worktree remove [repo-worktree-path] || git -C [repo] worktree remove --force [repo-worktree-path]
         test ! -e [repo]/[repo-worktree-path] || echo "WARNING: [repo]/[repo-worktree-path] still exists — a process may hold it open"
         git -C [repo] worktree prune
         ```
         Once every per-repo worktree is gone, remove the parent tree at `.worktrees/NNN-slug`. It now contains nothing but the per-repo symlinks and the `.plans` symlink (all their targets already removed above), so a plain `rm -rf .worktrees/NNN-slug` unlinks only dangling symlinks and the empty dir — no real checkout is touched.
    3. **Strip the field(s).** This is handled by step 8's existing field-strip (which removed `**Worktree:**`, and `**Repos:**` for multi-repo) — do not duplicate it here.

15. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`
    - If exit code 0 (ignored): skip silently
    - Read `.plans/config.json` for `git_commits` setting
    - If `git_commits` is not `true`: skip silently
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: complete #NNN - [title]"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill

16. **Display confirmation**

    Print EXACTLY this format (substitute values in {braces}):

    ```
    Task #{id} completed: {title}

    Summary: {one sentence from Changes section}

    Archived to: .plans/completed/{id}-{slug}.md
    Branch: {branch-name} merged to {default-branch}

    Next: /plan-status or /plan-capture
    ```

    **Example output (copy this style exactly):**

    ```
    Task #005 completed: User Model Additions

    Summary: Added company association and pricing override fields to User model.

    Archived to: .plans/completed/005-user-model-additions.md
    Branch: feature/005-user-model-additions merged to main

    Next: /plan-status or /plan-capture
    ```

    Then add the end-of-action marker as the final line:
    `✅ COMPLETED · Task #NNN → Next: /plan-status`

    **STOP after the marker line. Do not add anything else.**

## Edge Cases

- **No ID + one active task**: Auto-select it
- **No ID + multiple active**: List and ask
- **Unresolved issues**: Block completion, show issue list, suggest `/plan-execute`
- **Verification not met**: Warn but allow completion with explicit confirmation
- **Pending/elaborated task** (never started): Extra warning, require confirmation
- **Task not found**: Error with suggestion to `/plan-list`
- **Git commit fails**: Warn but don't fail the completion
- **HISTORY.md malformed**: Append row anyway, it's just a log
- **No files changed**: Skip debug cleanup silently
- **Debug code is intentional**: User selects "Keep all" to preserve it
- **False positives in debug scan**: User selects "Review each" to inspect individually
- **Auto-accept keyword provided**: Skip verification and checkbox prompts, but still enforce unresolved issues block (step 5) and branch merge prompt (step 14) — those are never auto-skipped
- **Task completed with a kept worktree** (live `**Worktree:**` field, executed with `keep`): remove it during completion (step 14b) — step 14 already merged via its A/B/C/D dispatch, then step 14b removes the worktree with the canonical teardown sequence and step 8 strips the field. Merge and teardown are independent — `git worktree remove` drops a checkout, never the branch, so ordering is a cleanliness choice, not a correctness one.
