---
name: plan-backlog
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
description: Defer a pending task by moving it to the backlog
---

# plan-backlog

Move a pending task out of the active list and into `.plans/backlog/` — a holding pen for work you've consciously deferred. Backlogged tasks disappear from default `/plan-status`, `/plan-list`, and `/plan-guide` views (which glob `pending/`), but stay fully captured and one command away from return via `/plan-restore`. An active (`in-progress`/`in-review`) task is auto-paused first, so no half-running task lands in the backlog.

This is the inverse of `/plan-restore`.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Resolve task ID**
   - If `$ARGUMENTS` is empty: error "Usage: `/plan-backlog <id>`"
   - Extract the numeric ID (first word) and zero-pad to 3 digits.
   - Find the task file in `.plans/pending/NNN-*.md`.

3. **Validate location**
   - If the task is found in `.plans/pending/NNN-*.md`: proceed.
   - If the task is found in `.plans/backlog/NNN-*.md` (not pending): error "Task #NNN is already in the backlog. Run `/plan-restore NNN` to bring it back."
   - If the task is found in `.plans/completed/NNN-*.md`: error "Task #NNN is completed. Run `/plan-reopen NNN` first if you want to defer it."
   - If found nowhere: error "Task #NNN not found. Run `/plan-list` to see available tasks."

4. **Read and parse the task**
   - Read the task file.
   - Extract the title from the `# ` heading.
   - Extract Status from the `**Status:**` line.
   - Note whether the task has a `**Branch:**` field, a `**Repos:**` field or `(multi-repo: ...)` parenthetical, and/or a `**Worktree:**` field.

5. **Auto-pause if active** *(only when Status is `in-progress` or `in-review`)*

   If the task's Status is `in-progress` or `in-review`, pause it first by reusing `plan-pause`'s logic (this prevents a half-running task from landing in the backlog). If the status is `pending` or `elaborated`, skip this step entirely.

   **Status transition (mirrors plan-pause step 4):**
   - If `in-progress`: change Status to `elaborated`.
   - If `in-review`: change Status to `review`.
   - Do NOT touch any checkboxes — leave all `[x]` and `[ ]` as-is.
   - Append a `**Paused:** [ISO timestamp YYYY-MM-DDTHH:MM]` line to the Notes section (create the section if absent).

   **Branch/worktree commit + checkout (mirrors plan-pause step 6):**
   - **Multi-repo task** (has a `**Repos:**` field or a `(multi-repo: ...)` parenthetical on the `**Branch:**` line): for each listed repo — `cd [repo] && git status --porcelain`; if dirty, `cd [repo] && git add -A && git commit -m "plan: backlog #NNN - [title]"`; determine that repo's default branch (`cd [repo] && git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'`, fallback main/master); if not already on it, `cd [repo] && git checkout [default-branch]`. Then skip the single-repo handling below.
   - **Single-repo task with a `**Branch:**` field:** `git rev-parse --git-dir 2>/dev/null` to confirm a git repo (skip silently if not); `git status --porcelain`; if dirty, `git add -A && git commit -m "plan: backlog #NNN - [title]"`; determine the default branch (`git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null | sed 's@^refs/remotes/origin/@@'`, fallback main/master); if not already on it, `git checkout [default-branch]`.
   - **Worktree handling:** if the task has a `**Worktree:**` field, the work happened in a separate checkout. Commit any uncommitted changes there (`cd [worktree] && git status --porcelain` → `git add -A && git commit ...`) as above; the main checkout's branch does not need switching. Do NOT remove the worktree — `/plan-restore` + `/plan-execute` may resume it.
   - Decrement the appropriate active count here is handled in step 8 (PROGRESS.md); this step only handles git.
   - If any commit fails (e.g. hooks): warn but do not fail the skill.

   Record the resulting (paused) status — `elaborated` or `review` — as the task's effective status for the rest of this skill.

6. **Ensure the backlog directory exists**
   - Create `.plans/backlog/` if it does not already exist: `mkdir -p .plans/backlog`.

7. **Append the backlogged note**
   - Append a `**Backlogged:** [ISO timestamp YYYY-MM-DDTHH:MM]` line to the task's Notes section (create the `## Notes` section if it doesn't exist; replace a `_Additional context_` placeholder if that's all that's there).

8. **Move the file**
   - Move the task file from `.plans/pending/NNN-slug.md` to `.plans/backlog/NNN-slug.md`:
     ```bash
     mv .plans/pending/NNN-slug.md .plans/backlog/NNN-slug.md
     ```

9. **Update PROGRESS.md**
   - Remove the task from the "Active Work" section if present.
   - Update the Stats section:
     - Decrement the count for the task's effective status (after any auto-pause): `pending`, `elaborated`, `in-progress`, `review`, or `in-review`.
     - Increment (or add) a `Backlogged` count.
   - Update the "Last updated" date.

10. **Self-register (best-effort)**
    - Best-effort touch the machine-wide project registry: `node bin/plan-touch.js 2>/dev/null` (or the project's `bin/plan-touch.js`). This is non-fatal — if it errors or the script is absent, ignore it and proceed.

11. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently.
    - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`
    - If exit code 0 (ignored): skip silently.
    - Read `.plans/config.json` for `git_commits` setting.
    - If `git_commits` is not `true`: skip silently.
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently.
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: backlog #NNN - [title]"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill.

12. **Display confirmation**

    Print EXACTLY this format (substitute values in {braces}):

    ```
    Task #{id} backlogged: {title}

    Moved to: .plans/backlog/{id}-{slug}.md
    {If auto-paused: "Auto-paused before shelving (status now {effective-status})."}

    It's hidden from active views. Bring it back with: /plan-restore {id}
    ```

    Omit the auto-pause line if the task was not active.

    End-of-action marker (final line): `🟢 BACKLOGGED · Task #{id} → Next: /plan-list backlog`

    **STOP after the marker line. Do not add anything else.**

## Edge Cases

- **Not initialized**: Error: "Not initialized. Run `/plan-init` first."
- **No ID argument**: Error with usage hint: "Usage: `/plan-backlog <id>`"
- **Task not found**: Error: "Task #NNN not found. Run `/plan-list` to see available tasks."
- **Already in backlog**: Error: "Task #NNN is already in the backlog. Run `/plan-restore NNN` to bring it back."
- **Already completed**: Error: "Task #NNN is completed. Run `/plan-reopen NNN` first if you want to defer it."
- **Active task (`in-progress`/`in-review`)**: Auto-pause it first (status transition + branch/worktree commit + checkout), then move — never leave a half-running task in the backlog.
- **`backlog/` directory missing**: Create it lazily with `mkdir -p .plans/backlog` before moving.
- **Git commit fails**: Warn but don't fail the backlog operation.
- **plan-touch unavailable**: Ignore silently — registration is best-effort.
- **Task has a worktree**: Commit work in the worktree but leave it in place for a later `/plan-restore` + `/plan-execute`.
