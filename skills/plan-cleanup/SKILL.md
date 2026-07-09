---
name: plan-cleanup
disable-model-invocation: true
argument-hint: "[id]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Rebuild state from ground truth, validate task files, and clean up orphaned resources
---

# plan-cleanup

Validate task files and clean up orphaned state files, branches, worktrees, and unexpected directories. Rebuilds PROGRESS.md from ground truth.

## Arguments

- `$ARGUMENTS` (optional): A task ID (e.g., `001`) to focus the health check on a single task. Without an ID, runs a full system sweep with interactive prompts.

## Modes

- **Full mode** (no ID): Run all steps below, including interactive prompts to clean up orphans.
- **Focused mode** (ID provided): Run steps 1, 2 (focused validation only), and 7 (silent system scan — report-only, no prompts). Skip the prompting cleanup steps.

## Valid Statuses

A task's `**Status:**` line must be one of:
`pending`, `elaborated`, `in-progress`, `review`, `in-review`, `completed`

## Expected Directories Under `.plans/`

`pending/`, `completed/`, `backlog/`, `ideas/`, `state/`, `archive/`

Anything else (e.g., `elaborated/`, `in-progress/`) is unexpected and should be flagged.

## Steps

1. **Verify initialization**
   - Use Glob or Read to check if `.plans/config.json` exists.
   - If not, error: "Not initialized. Run `/plan-init` first."

2. **Validate task file(s)**

   **Focused mode (ID provided):**
   - Find the task file: `.plans/pending/NNN-*.md` or `.plans/completed/NNN-*.md`
   - If not found, error: "Task NNN not found."
   - Run all validation checks below on this single file.
   - Report issues. If any are auto-fixable (wrong directory, fixable status typo), use `AskUserQuestion` to confirm before fixing.

   **Full mode (no ID):**
   - Scan all task files in `.plans/pending/*.md` and `.plans/completed/*.md`
   - Run validation checks on each. Collect issues into a list.
   - If issues found, report them grouped by task; use `AskUserQuestion` to confirm batch fixes.

   **Validation checks:**
   - **Status present**: File has a `**Status:**` line. If missing → issue.
   - **Status valid**: Value is one of the valid statuses above. If not → issue (suggest closest match).
   - **Correct directory**:
     - `completed` status → file must be in `.plans/completed/`
     - All other statuses → file must be in `.plans/pending/`
     - If mismatched → issue (fix = move file to correct directory).
   - **Title present**: File has a `# ` heading on first non-frontmatter line. If missing → issue.
   - **Filename format**: Matches `NNN-slug.md` where NNN is 3 digits. If not → issue (report only, do not auto-rename).
   - **Branch reference** (if file has `**Branch:**` line and we're in a git repo): branch exists locally. If not → report-only issue.
   - **Worktree reference** (if file has `**Worktree:**` line): directory exists. If not → report-only issue.

3. **Rebuild PROGRESS.md** *(full mode only)*
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

4. **Clean up orphaned state files** *(full mode only)*
   - Check if `.plans/state/` directory exists. If not, skip to step 5.
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

5. **List stale git branches** *(full mode only)*
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

6. **Reconcile worktrees (registry vs. disk)** *(full mode only)*
   - This step is a **reconciler, not a reaper**: it cross-checks git's worktree registry against the `.worktrees/` directory and reports **both** desync directions. `git worktree prune` only cleans one of them, so a bare `rm -rf` was leaving stale on-disk corpses git never listed.
   - **Gather both sides:**
     - **Registry:** `git worktree list --porcelain` (skip this step's git parts silently if not in a git repo). It emits a `worktree <abs-path>` line per registered worktree — parse those absolute paths and keep the ones under `.worktrees/`.
     - **Disk:** the immediate subdirectories of `.worktrees/` (may be absent).
   - Do **not** early-exit just because `.worktrees/` is missing — git may still list worktrees under a since-deleted `.worktrees/` (the *registered but missing* case below). Only skip the entire step when the repo is not git AND `.worktrees/` does not exist.
   - **Classify each entry into one of two desync kinds:**
     - **On disk but unregistered** — a directory under `.worktrees/` that `git worktree list` does NOT contain. These are the corpses: `git worktree prune` will NOT clean them (git has no record to prune), so they need explicit removal.
     - **Registered but missing** — git lists a worktree whose path no longer exists on disk. `git worktree prune` DOES clean these (it removes the stale administrative record).
   - **Active-task exemption** (applies to *on disk but unregistered* candidates): extract the task ID from the directory name (first 3 digits) and check for a matching task in `.plans/pending/NNN-*.md` with status `in-progress`, `review`, or `in-review`. Such a task owns its worktree — do NOT reap it. (An `in-review` task with a live kept worktree is actively being reviewed *inside* it — it is NOT orphaned and must not be reaped.) A *registered* worktree with a live parent task is likewise left alone; only truly stale records are candidates.
   - **If any desync (of either kind, after the exemption) is found, use `AskUserQuestion` tool:**
     - Header: "Worktrees"
     - Question: "Found worktree desync:\n[list *on disk but unregistered* directories — corpses git doesn't track]\n[list *registered but missing* worktrees — stale records git will prune]\n\nDelete/reconcile them?"
     - Options:
       1. "Delete all" — Reconcile both kinds (remove corpses, prune stale records)
       2. "Keep all" — Leave them as-is
   - **If "Delete all":**
     - For each **on disk but unregistered** directory (git doesn't know it, so `git worktree remove` will fail — remove the directory, then prune):
       ```bash
       git worktree remove ".worktrees/[dir]" 2>/dev/null || rm -rf ".worktrees/[dir]"
       git worktree prune
       ```
       (`git worktree remove` is attempted first for the rare case git actually does track it; it fails for a true corpse, and the `rm -rf` fallback removes the untracked directory. The bare `rm -rf` is justified only here — for a directory git has no registry entry for — never as the primary reap path.)
     - For each **registered but missing** worktree, the record is stale and the path is already gone — `git worktree prune` removes the administrative record:
       ```bash
       git worktree prune
       ```
     - If `.worktrees/` is now empty, remove it.
   - **Always run `git worktree prune` before finishing this step**, even when nothing was reaped and even when the user chose "Keep all". Pruning only removes *stale administrative records* — it never touches a live worktree or an on-disk directory, so it is always safe to run.
   - Report: "Reconciled N worktree(s): X corpses removed, Y stale records pruned" or "Worktrees in sync"

7. **Scan for unexpected directories**
   - List immediate subdirectories of `.plans/` using Glob: `.plans/*/`
   - Any directory not in the expected set (`pending`, `completed`, `backlog`, `ideas`, `state`, `archive`) is unexpected.
   - **Full mode**: If any found, use `AskUserQuestion`:
     - Header: "Unexpected dirs"
     - Question: "Found unexpected directories under .plans/:\n[list]\n\nThese aren't part of the plans system. What would you like to do?"
     - Options:
       1. "Inspect each" — Show contents of each, then decide per-dir
       2. "Keep all" — Leave them
     - If "Inspect each": for each dir, list contents (`ls`), then ask Delete/Keep with AskUserQuestion.
   - **Focused mode**: Report only — "System scan: unexpected directories found: [list]. Run `/plan-cleanup` to address."

7.5. **Check git tracking integrity for `.plans`** *(skip if not in a git repo)*
   - This guards against a known footgun: a stray `.plans` symlink (often self-referential) getting committed, which a later `git checkout` will use to **delete the real `.plans/` working directory** (ELOOP, lost task files).
   - **Detect a tracked `.plans` entry:** `git ls-files | grep -E '^\.plans($|/)'`
     - If anything is returned, this is a problem (the plans system expects `.plans/` to be untracked/local). Warn the user and, with `AskUserQuestion`, offer:
       1. "Untrack it (recommended)" — run `git rm --cached -r .plans` (keeps the working files), then ensure `.gitignore` ignores it (see below).
       2. "Leave it" — do nothing.
   - **Detect the vulnerable ignore form:** check `.gitignore` for a line that is exactly `.plans/` (with trailing slash).
     - If found, warn: "Your `.gitignore` uses `.plans/` (trailing slash), which only matches a directory and lets a stray `.plans` symlink slip through. Recommend changing it to `.plans` (no slash)." Offer to fix it by replacing the `.plans/` line with `.plans`.
     - If `.plans` is not ignored at all (`git check-ignore -q .plans` returns non-zero) and the user is using local task state, suggest adding `.plans` (no slash) to `.gitignore`.
   - Report what was found/fixed, or "Git tracking integrity: OK" if clean.

8. **Silent system scan summary** *(focused mode only)*
   - Briefly count (without prompting) orphaned state files, stale branches, orphaned worktrees, unexpected directories. Also run the step-7.5 detection (tracked `.plans` entry, or trailing-slash `.plans/` ignore form) without prompting.
   - Report counts at the end:
     ```
     System scan: 2 orphaned state files, 1 stale branch, 0 orphaned worktrees, 1 unexpected directory.
     Run `/plan-cleanup` (no ID) to address.
     ```
   - If a tracked `.plans` entry or vulnerable `.plans/` ignore form is detected, always surface it prominently (it risks data loss): "⚠️ `.plans` is tracked in git / ignored with a trailing slash — run `/plan-cleanup` to fix before your next branch checkout."
   - If everything is clean, report: "System scan: clean."

9. **Commit .plans/ changes** *(both modes, if anything changed)*
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
     git commit -m "plan: cleanup tracking files"
     ```
   - If commit fails (e.g. hooks): warn but do not fail the skill

10. **Display summary**

    **Full mode:**
    ```
    # Cleanup Complete

    - Task files validated: X checked, Y issues fixed, Z issues remaining
    - PROGRESS.md rebuilt (X pending, Y elaborated, Z in-progress, W completed)
    - State files: N orphaned deleted / M kept
    - Branches: N stale deleted / M kept
    - Worktrees: N orphaned deleted / M kept
    - Unexpected directories: N deleted / M kept
    ```
    Omit lines for categories that had nothing to report.

    **Focused mode:**
    ```
    # Task NNN Health Check

    - Status: valid (`elaborated`)
    - Location: correct (.plans/pending/)
    - Title: present
    - Filename: NNN-slug.md ✓
    - Branch: feature/NNN-foo exists ✓
    [or issues found and what was fixed]

    System scan: <summary from step 8>
    ```

    End-of-action marker (final line): `🟢 CLEANED UP · N issues resolved`
    (N = total issues fixed across all categories; use `0 issues resolved` if nothing needed fixing)

## Edge Cases

- **Not initialized**: Error suggesting `/plan-init`
- **Task ID not found** (focused mode): Error "Task NNN not found."
- **No orphaned resources** (full mode): Report "all clean" for each category
- **Not a git repo**: Skip branch cleanup silently
- **state/ directory doesn't exist**: Skip state file cleanup silently
- **worktrees/ directory doesn't exist**: Skip worktree cleanup silently
- **Branch is currently checked out**: Cannot delete current branch — skip with note
- **Worktree has uncommitted changes**: Warn before deleting
- **Task in wrong directory** (e.g., `completed` status in pending/): Offer to move via AskUserQuestion before moving.
- **Invalid status value**: Suggest closest valid status; do not auto-fix without confirmation.
