---
name: plan-cleanup
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Rebuild state from ground truth and clean up orphaned resources
---

# plan-cleanup

Rebuild PROGRESS.md from actual task files and clean up orphaned state files, branches, and worktrees.

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Rebuild PROGRESS.md**
   - Scan `.plans/pending/*.md` for all tasks. For each:
     - Extract status from `**Status:**` line
     - Extract title from `# ` header
     - Extract checkbox progress if status is `in-progress` or `elaborated`
   - Count tasks in `.plans/completed/`
   - Build accurate counts: pending, elaborated, in-progress, review, completed
   - Find in-progress and review tasks for "Active Work" section
   - Find last 5 completed tasks (by `**Completed:**` date) for "Recently Completed" section
   - Rewrite PROGRESS.md with ground-truth data
   - Report what changed: "Rebuilt PROGRESS.md: X pending, Y elaborated, Z in-progress, W completed"

3. **Clean up orphaned state files**
   - Check if `.plans/state/` directory exists. If not, skip to step 4.
   - List all files in `.plans/state/`
   - For each file (e.g., `NNN-state.md`), extract the task ID from the filename
   - Check if a corresponding task exists in `.plans/pending/NNN-*.md`
   - Files with no matching pending task are orphaned
   - **If orphaned files found, use `AskUserQuestion` tool:**
     - Header: "State files"
     - Question: "Found N orphaned state file(s) with no matching task:\n[list filenames]\n\nDelete them?"
     - Options:
       1. "Delete all" — Remove all orphaned state files
       2. "Keep all" — Leave them as-is
   - If "Delete all": remove each orphaned file. If state/ is now empty, remove the directory.
   - Report: "Deleted N orphaned state file(s)" or "No orphaned state files"

4. **List stale git branches**
   - Skip this step if not in a git repository
   - Get all local branches: `git branch --list`
   - Collect all `**Branch:**` values from tasks in `.plans/pending/*.md`
   - Branches that match a task-branch naming pattern (e.g., `feature/NNN-*`, `plan-NNN-*`) but have no matching task in pending/ are "stale candidates"
   - **If stale candidates found, use `AskUserQuestion` tool:**
     - Header: "Branches"
     - Question: "Found N branch(es) that may be stale (no matching active task):\n[list branch names]\n\nWhat would you like to do?"
     - Options:
       1. "Delete all" — Remove all stale branches
       2. "Review each" — Decide per branch
       3. "Keep all" — Leave them as-is
   - If "Delete all": `git branch -D [branch]` for each
   - If "Review each": for each branch, use AskUserQuestion with "Delete" / "Keep" options
   - Report: "Deleted N stale branch(es)" or "No stale branches found"

5. **List orphaned worktree directories**
   - Check if `.worktrees/` directory exists. If not, skip to step 6.
   - List subdirectories of `.worktrees/`
   - For each, extract the task ID from the directory name (first 3 digits)
   - Check if a matching task exists in `.plans/pending/NNN-*.md` with status `in-progress` or `review`
   - Directories with no matching active task are orphaned
   - **If orphaned worktrees found, use `AskUserQuestion` tool:**
     - Header: "Worktrees"
     - Question: "Found N orphaned worktree(s) with no matching active task:\n[list directory names]\n\nDelete them?"
     - Options:
       1. "Delete all" — Remove all orphaned worktree directories
       2. "Keep all" — Leave them as-is
   - If "Delete all": `rm -rf .worktrees/[dir]` for each. If `.worktrees/` is now empty, remove it.
   - Report: "Deleted N orphaned worktree(s)" or "No orphaned worktrees"

6. **Display summary**

   ```
   # Cleanup Complete

   - PROGRESS.md rebuilt (X pending, Y elaborated, Z in-progress, W completed)
   - State files: N orphaned deleted / M kept
   - Branches: N stale deleted / M kept
   - Worktrees: N orphaned deleted / M kept
   ```

   Omit lines for categories that had nothing to report (e.g., omit "Worktrees" line if `.worktrees/` didn't exist).

## Edge Cases

- **Not initialized**: Error suggesting `/plan-init`
- **No orphaned resources**: Report "all clean" for each category
- **Not a git repo**: Skip branch cleanup silently
- **state/ directory doesn't exist**: Skip state file cleanup silently
- **worktrees/ directory doesn't exist**: Skip worktree cleanup silently
- **Branch is currently checked out**: Cannot delete current branch — skip with note
- **Worktree has uncommitted changes**: Warn before deleting
