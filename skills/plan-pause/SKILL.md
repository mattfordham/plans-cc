---
name: plan-pause
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
description: Pause an in-progress or in-review task to switch context
---

# plan-pause

Pause an in-progress or in-review task so you can switch to another task. Progress (checked boxes) is preserved — resume later with `/plan-execute` or `/plan-review`.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001") — optional if only one task is in-progress

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Resolve task ID**

   **If `$ARGUMENTS` provided:**
   - Extract the numeric ID (first word)
   - Zero-pad to 3 digits
   - Find task file in `.plans/pending/NNN-*.md`

   **If no `$ARGUMENTS`:**
   - Find in-progress, review, or in-review tasks in `.plans/pending/`
   - If exactly one: auto-select it
   - If multiple: list them and ask which to pause
   - If none: error "No in-progress, review, or in-review tasks to pause."

3. **Validate task state**
   - Read the task file
   - Check Status:
     - If `in-progress`: proceed (in-progress flow)
     - If `review` or `in-review`: proceed (review flow)
     - If `elaborated` or `pending`: error "Task #NNN is not in progress."
     - If `completed`: error "Task #NNN is already completed."
   - Extract title from H1 heading
   - Parse checkbox progress from How section:
     - Count total: all `- [ ]` and `- [x]` lines
     - Count completed: `- [x]` lines

4. **Update task file**

   **In-progress flow:**
   - Change Status from `in-progress` to `elaborated`
   - **Do NOT touch checkboxes** — leave all `[x]` and `[ ]` as-is
   - Do NOT change any other metadata fields (Branch, Created, Type, etc.)

   **Review flow:**
   - If current status is `in-review`: change Status to `review` (pausing an active review returns the task to the awaiting-review queue)
   - If current status is already `review`: leave Status unchanged
   - Do NOT touch checkboxes or any other fields

   **Both flows:**
   - Add or append to Notes section:
     ```markdown
     **Paused:** [ISO timestamp YYYY-MM-DDTHH:MM]
     ```
     If Notes section already exists, append the line to it.

5. **Update PROGRESS.md**

   **In-progress flow only:**
   - Remove task from "Active Work" section (if present)
   - Update Stats section:
     - Decrement In Progress count
     - Increment Elaborated count
   - Update "Last updated" date

   **Review flow:**
   - If status was `in-review` and is now `review`: decrement In Review count, increment Review count
   - If status was already `review`: no stat changes
   - Update "Last updated" date

6. **Commit changes and switch branch**

   - **Kept-worktree review task** (the task has a live `**Worktree:**` field — i.e. it was executed with `keep` — and its status is `in-review`): the work lives in a separate checkout, and main was never moved onto the task branch (the branch lives in the worktree), so there is nothing to switch main off of. Commit any stray changes **inside the worktree** and leave the worktree in place — mirror `/plan-backlog`'s "don't remove the worktree" path:
     - `cd [worktree] && git status --porcelain`; if dirty, `cd [worktree] && git add -A && git commit -m "plan: pause #NNN - [title]"`.
     - **Multi-repo** (also has a `**Repos:**` field or `(multi-repo: ...)` parenthetical): do the commit per sub-repo checkout under the worktree tree.
     - **SKIP** the main `git checkout [default-branch]` step — main is not on the task branch. Do NOT remove the worktree; `/plan-review` resumes it in place.
     - If any commit fails (e.g. hooks): warn but do not fail the skill.
     - Then skip the remaining single-/multi-repo git handling below and continue to step 7. (For the confirmation in step 7, omit the "Switched to branch:" line since no branch switch occurred.)
   - **Multi-repo task** (the task has a `**Repos:**` field, or a `(multi-repo: ...)` parenthetical on its `**Branch:**` line): the parent directory is not itself a git repo, so the per-repo branch must be unwound in each sub-repo. Parse the repo set the same way as `/plan-review` step 3.6 (prefer the `**Repos:**` field; fall back to the parenthetical). For each listed repo:
     - Check for uncommitted changes: `cd [repo] && git status --porcelain`
     - If any exist, stage and commit: `cd [repo] && git add -A && git commit -m "plan: pause #NNN - [title]"`
     - Determine that repo's default branch: `cd [repo] && git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` or fall back to main/master
     - If not already on it: `cd [repo] && git checkout [default-branch]`
     - Then skip the single-repo git handling below and continue to step 7.
   - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
   - If not a git repo: skip silently to step 7

   **If the task has a `**Branch:**` field (single-repo):**
   - Check for any uncommitted changes: `git status --porcelain`
   - If uncommitted changes exist:
     - Stage and commit everything:
       ```bash
       git add -A
       git commit -m "plan: pause #NNN - [title]"
       ```
   - Determine the default branch: `git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'` or fall back to main/master
   - If not already on the default branch: `git checkout [default-branch]`

   **If the task has no branch:**
   - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`
   - If exit code 0 (ignored): skip silently
   - Read `.plans/config.json` for `git_commits` setting
   - If `git_commits` is not `true`: skip silently
   - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
   - If no changes: skip silently
   - Commit:
     ```bash
     git add .plans/
     git commit -m "plan: pause #NNN - [title]"
     ```
   - If commit fails (e.g. hooks): warn but do not fail the skill

7. **Display confirmation**

   **In-progress flow:**

   Print EXACTLY this format (substitute values in {braces}):

   ```
   Task #{id} paused: {title}

   Progress: {completed}/{total} steps complete (preserved)
   Switched to branch: {default-branch}

   Resume with: /plan-execute {id}
   ```

   If the task had no branch, omit the "Switched to branch:" line.

   End-of-action marker (final line): `⏸️ PAUSED · Task #{id} → Next: /plan-execute {id} to resume`

   **Review flow:**

   Print EXACTLY this format (substitute values in {braces}):

   ```
   Review paused: Task #{id} — {title}

   Progress: {completed}/{total} steps complete (preserved)
   Switched to branch: {default-branch}

   Resume with: /plan-review {id}
   ```

   If the task had no branch, omit the "Switched to branch:" line.

   End-of-action marker (final line): `⏸️ PAUSED · Task #{id} → Next: /plan-review {id} to resume`

   **STOP after the marker line. Do not add anything else.**

## Edge Cases

- **Not initialized**: Error: "Not initialized. Run `/plan-init` first."
- **No in-progress, review, or in-review tasks**: Error: "No in-progress, review, or in-review tasks to pause."
- **Task not found**: Error: "Task #NNN not found."
- **Task not pausable**: Error with appropriate message based on actual status
- **Multiple pausable tasks, no ID**: List them and ask which to pause
- **Task has no How section**: Show "Progress: 0/0 steps" — still allow pause
- **Git commit fails**: Warn but don't fail the pause operation
- **Review task with no branch**: Pause without branch switch (just add paused note)
- **Already on default branch during review pause**: Skip checkout, just commit
- **Kept-worktree in-review task** (live `**Worktree:**` field, executed with `keep`): commit any stray changes inside the worktree and leave the worktree in place — skip the main `git checkout [default-branch]` (main was never on the task branch). Status transition `in-review` → `review` is unchanged; omit the "Switched to branch:" line from the confirmation.
