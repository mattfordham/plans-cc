---
name: plan-restore
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
description: Restore a backlogged task to the active list
---

# plan-restore

Move a deferred task out of `.plans/backlog/` and back into `.plans/pending/`, returning it to the active list (`/plan-status`, `/plan-list`, `/plan-guide`). The task's existing Status is **preserved** — a restored elaborated task stays `elaborated`, a still-pending one stays pending — so restore is a pure inverse of `/plan-backlog`.

This is the inverse of `/plan-backlog`.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Resolve task ID**
   - If `$ARGUMENTS` is empty: error "Usage: `/plan-restore <id>`"
   - Extract the numeric ID (first word) and zero-pad to 3 digits.
   - Find the task file in `.plans/backlog/NNN-*.md`.

3. **Validate location**
   - If the task is found in `.plans/backlog/NNN-*.md`: proceed.
   - If `.plans/backlog/` does not exist, or the task is not there: error "Task #NNN not found in the backlog. Run `/plan-list backlog` to see backlogged tasks."
   - (If the task already lives in `.plans/pending/`, it isn't backlogged — same not-found message applies.)

4. **Read and parse the task**
   - Read the task file.
   - Extract the title from the `# ` heading.
   - Extract Status from the `**Status:**` line. **Do NOT change it** — restore preserves the pre-backlog status. The status drives the confirmation marker in step 9.

5. **Append the restored note**
   - Append a `**Restored:** [ISO timestamp YYYY-MM-DDTHH:MM]` line to the task's Notes section (create the `## Notes` section if it doesn't exist; replace a `_Additional context_` placeholder if that's all that's there).
   - Leave all other fields — including Status and every checkbox — untouched.

6. **Move the file**
   - Move the task file from `.plans/backlog/NNN-slug.md` to `.plans/pending/NNN-slug.md`:
     ```bash
     mv .plans/backlog/NNN-slug.md .plans/pending/NNN-slug.md
     ```

7. **Update PROGRESS.md**
   - Update the Stats section:
     - Decrement the `Backlogged` count.
     - Increment the count for the task's preserved status (`pending`, `elaborated`, `in-progress`, `review`, or `in-review`).
   - Update the "Last updated" date.

8. **Self-register (best-effort)**
   - Best-effort touch the machine-wide project registry: `node bin/plan-touch.js 2>/dev/null` (or the project's `bin/plan-touch.js`). This is non-fatal — if it errors or the script is absent, ignore it and proceed.

9. **Commit .plans/ changes**
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
     git commit -m "plan: restore #NNN - [title]"
     ```
   - If commit fails (e.g. hooks): warn but do not fail the skill.

10. **Display confirmation**

    Print EXACTLY this format (substitute values in {braces}):

    ```
    Task #{id} restored: {title}

    Status: {preserved-status} (preserved)
    Moved to: .plans/pending/{id}-{slug}.md

    Next: {next-command}
    ```

    where `{next-command}` is conditional on the preserved status:
    - If the status is still `pending` (never elaborated): `/plan-elaborate {id}`
    - Otherwise (`elaborated`, `in-progress`, `review`, `in-review`): `/plan-execute {id}`

    End-of-action marker (final line) — **the `→ Next:` command varies by the preserved status**:
    - If status is `pending`: `🟢 RESTORED · Task #{id} → Next: /plan-elaborate {id}`
    - Otherwise: `🟢 RESTORED · Task #{id} → Next: /plan-execute {id}`

    **STOP after the marker line. Do not add anything else.**

## Edge Cases

- **Not initialized**: Error: "Not initialized. Run `/plan-init` first."
- **No ID argument**: Error with usage hint: "Usage: `/plan-restore <id>`"
- **Task not found in backlog**: Error: "Task #NNN not found in the backlog. Run `/plan-list backlog` to see backlogged tasks."
- **`backlog/` directory doesn't exist**: Treat as "no backlogged tasks" — same not-found error.
- **Restoring a still-pending task**: Status stays `pending`; the Next command and marker point to `/plan-elaborate {id}`.
- **Restoring an elaborated (or further) task**: Status preserved; the Next command and marker point to `/plan-execute {id}`.
- **Git commit fails**: Warn but don't fail the restore operation.
- **plan-touch unavailable**: Ignore silently — registration is best-effort.
