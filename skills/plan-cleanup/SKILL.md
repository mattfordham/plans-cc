---
name: plan-cleanup
disable-model-invocation: true
argument-hint: "[id | history]"
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

- `$ARGUMENTS` (optional): a **mode selector** (first token, optional).
  - The token `history` selects **history mode** — the opt-in HISTORY.md Summary backfill.
  - A numeric token (e.g. `001`, `7`) selects **focused mode** on that task ID.
  - Empty selects **full mode** — the full system sweep with interactive prompts.
  - When the first token is neither `history` nor a task ID, treat the mode as `full` (the default).
  - `history` does NOT compose with a task ID: `/plan-cleanup history 007` is not supported — the backfill is a repo-wide pass.

## Modes

- **Full mode** (no arguments): Run all steps below, including interactive prompts to clean up orphans, and the flag-only HISTORY.md cap check (step 3.5).
- **Focused mode** (ID provided): Run steps 1, 2 (focused validation only), 7, and 7.6 (silent system scan — report-only, no prompts; summarized by step 8). Skip the prompting cleanup steps and step 3.5.
- **History mode** (`history`): Run step 1 (root discovery) and step 3.6 (the HISTORY.md backfill) **ONLY** — then close out through the two mode-agnostic steps every mode ends with, step 9 (commit) and step 10 (summary). It does NOT validate task files, rebuild PROGRESS.md, reap orphaned state files, touch branches or worktrees, or scan for unexpected directories. It is a narrow, opt-in data-hygiene pass over `.plans/HISTORY.md` and nothing else.

## Valid Statuses

A task's `**Status:**` line must be one of:
`pending`, `elaborated`, `in-progress`, `review`, `in-review`, `completed`

## Expected Directories Under `.plans/`

`pending/`, `completed/`, `backlog/`, `ideas/`, `state/`, `archive/`

Anything else (e.g., `elaborated/`, `in-progress/`) is unexpected and should be flagged.

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

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
     - Rebuilding to exactly the last 5 also corrects/backfills an over-long "Recently Completed" list, making `/plan-cleanup` the on-demand shrink path for a file that already bloated past 5.
   - Rewrite PROGRESS.md with ground-truth data
   - Report what changed: "Rebuilt PROGRESS.md: X pending, Y elaborated, Z in-progress, W completed"

3.5. **Check HISTORY.md Summary cap (flag only — never rewrite)** *(full mode only)*
   - `.plans/HISTORY.md` is an **index**, not a second archive: each Summary cell is capped at exactly ONE sentence of the form `<verb-phrase> — <what changed>` followed by a ` → completed/NNN-slug.md` pointer, ≤250 chars for sentence and pointer together (the contract lives in `CLAUDE.md` under **HISTORY.md Summary cap** and is written by `plan-complete` step 11). Projects whose history predates the cap still carry fat rows.
   - If `.plans/HISTORY.md` does not exist, skip this step silently.
   - **Parse data rows**: a data row is a line matching `^\| [0-9]{3} \|` — a 3-digit zero-padded ID in the first column. Skip the table header row, the `|---|` separator row, any `<!-- ... -->` HTML comment, and any blank or prose line. Split each data row on `|` into its 5 columns (`ID | Title | Type | Completed | Summary`) and measure the trimmed 5th column.
     ```bash
     grep -cE '^\| [0-9]{3} \|' .plans/HISTORY.md
     ```
   - **Count drift** — a row is over cap if *either* holds:
     - its Summary cell exceeds **250 chars**, or
     - its Summary cell lacks the ` → completed/NNN-slug.md` pointer (a short pre-cap row can be conformant on length yet still miss the pointer, so length alone under-detects the contract's two-part shape).
   - If no data rows exist, or no row drifts, emit nothing.
   - If any row drifts, **FLAG it** — one line, no writes:
     ```
     N HISTORY.md row(s) exceed the 250-char Summary cap. Run `/plan-cleanup history` to backfill.
     ```
   - This step **NEVER rewrites a row — it only detects and points at `/plan-cleanup history`**, the same flag-only discipline `des-build` uses for global-CSS drift (it flags and points at `/des-sync`, and never syncs itself). The reason is that re-summarizing a row is an LLM judgment call per row — read `completed/NNN-slug.md`, compose a new sentence — not a mechanical fix like the neighbouring truncate-to-5 in step 3. A judgment call at that volume must never run unattended inside a default sweep.
   - **Why this is not the shape `plan-complete` step 12 forbids:** that step carries a standing warning against adding a "detect >5 then backfill" branch for PROGRESS.md, and this step is superficially that shape. The two legitimately differ — truncating "Recently Completed" to 5 is a deterministic trim that is free to run everywhere, so it is folded unconditionally into every completion and needs no gate; re-deriving a Summary from a completed file is neither deterministic nor free, so it must be gated behind an explicit invocation. Do not "fix" this branch away by analogy to step 12.

3.6. **Backfill HISTORY.md Summary cells** *(history mode only)*
   - This is the invocable form of the backfill procedure documented in `CLAUDE.md`. It is **non-destructive by construction**: same row count, same IDs, dates, titles, and types — only the Summary cell shrinks. The source of truth (`.plans/completed/*.md`) is **never modified**, so the worst case is a poor *summary*, never lost data.
   - **Never prune rows.** History is append-only; row *size* is capped, never row *count*. `/plan-retrospect` mines HISTORY.md by name as a lesson corpus, so deleting rows would quietly degrade retrospectives.
   - If `.plans/HISTORY.md` does not exist, report "No HISTORY.md — nothing to backfill." and stop.

   **(a) Parse rows, preserving everything but the Summary.**
   - Parse data rows exactly as step 3.5 does (`^\| [0-9]{3} \|`; skip header, separator, HTML comments, blank lines).
   - Split each into its 5 columns. The `ID`, `Title`, `Type`, and `Completed` columns are copied through **byte-for-byte** — only the 5th column is ever rewritten. Never reorder rows, never reformat the table.

   **(b) Select rows to rewrite (this is what makes the pass idempotent).**
   - Select a row if its Summary exceeds 250 chars **OR** lacks the ` → completed/NNN-slug.md` pointer.
   - A row that is already conformant on both counts is **SKIPPED** — untouched, counted as already-conformant. That skip is the whole idempotence story: a second run over a backfilled file is a near-no-op.

   **(c) Regenerate the Summary from the completed file.**
   - For each selected row, read `.plans/completed/NNN-slug.md` and compose a replacement Summary matching `plan-complete` step 11's template exactly — a backfilled row and a freshly-completed row must be indistinguishable in form:
     ```
     [<verb-phrase> — <what changed>.] → completed/NNN-slug.md
     ```
   - Exactly ONE sentence, then the pointer. The shape is the primary constraint; ≤250 chars for sentence and pointer together is the backstop.
   - **Never** carry over multi-paragraph postmortems, root-cause narratives, disproved hypotheses, bolded caveats, or file-by-file breakdowns — that content already lives in the completed file, which is precisely what the pointer is for.

   **(d) Rewrite each row in place.**
   - Replace only the Summary cell of that row; leave every other line of the file untouched.
   - **Never emit a raw `|` inside a regenerated Summary.** A pipe is the table's column delimiter, so a single stray one silently splits the row into 6+ columns and corrupts the table — with no error, and no other skill checking for it. If the source completed file contains a pipe (a file path in a list, a shell one-liner, an "A | B" alternation), either **escape it as `\|`** or, preferably, **rephrase the sentence so it isn't needed**. This backfill is the first bulk writer of Summary cells, so it is the step that has to enforce the rule — `CLAUDE.md`'s **HISTORY.md Summary cap** contract states it, but `plan-complete` step 11 writes one row at a time and does not.

   **(e) Skip — never guess — the rows the pass cannot source.**
   The pass rewrites only what it can derive from ground truth. Three kinds of row are left **untouched**, and the first two are reported at the end:
   - **No completed file.** The row's `.plans/completed/NNN-slug.md` does not exist. ID gaps are real (this repo has no `005`), and a task file can be deleted or renamed after its row was written. There is no source to re-derive from, so fabricating a sentence would violate the "source of truth is never touched" invariant and put invented prose into the `/plan-retrospect` corpus. Leave the row byte-for-byte as-is and report:
     ```
     Skipped 2 row(s) with no completed/ file: #005, #013
     ```
   - **Malformed row.** The line matched `^\| [0-9]{3} \|` but does not split into exactly 5 columns (a pre-existing stray `|`, a truncated row, a hand-edited line). Do not attempt to repair the shape — rewriting a row whose columns cannot be identified risks moving data between columns. Leave it untouched and report it by ID:
     ```
     Skipped 1 malformed row (not 5 columns): #009
     ```
   - **Already conformant.** ≤250 chars **and** carries the ` → completed/NNN-slug.md` pointer. Silently skipped — no line of output per row — and counted toward the already-conformant total in the summary. This is the common case on a second run and must stay quiet, or a re-run over a backfilled file would print hundreds of no-op lines.

   **Scope: `.plans/archive/` is explicitly out of scope.**
   - The backfill reads `.plans/HISTORY.md` and `.plans/completed/*.md` and nothing else. `archive/` appears in this skill only as a name in the expected-directories allowlist; nothing in `skills/`, `lib/`, or `bin/` ever writes to it. Sweeping it would be building for a phantom — do not add it "for completeness."

   **Worked example** — a fat pre-cap row:
   ```
   | 012 | Session Timeout Handling | bug | 2026-07-14 | **Root cause:** the refresh token was being read from a stale cookie jar, so sessions silently expired at 30m instead of 24h. We first suspected the load balancer's sticky-session config (disproved — see the timing table below), then the Redis TTL (also disproved). Files touched: `lib/session.ts`, `lib/cookies.ts`, `middleware.ts`, `test/session.test.ts`. Note that the fix does NOT address the separate SSO path, which still... |
   ```
   becomes:
   ```
   | 012 | Session Timeout Handling | bug | 2026-07-14 | Fixed silent session expiry at 30m — refresh token now read from the live cookie jar in the session middleware. → completed/012-session-timeout-handling.md |
   ```
   ID, Title, Type, and Completed are byte-identical; only the Summary shrank.

   **Safety gate — preview the first 3 rewrites before committing to the pass.**
   - Regenerate the **first 3** selected rows (in ID order) WITHOUT writing anything, and present them so the user can judge summary quality — old length → new text + new length:
     ```
     #007  1,412 chars → "Added worktree teardown to completion — merge, remove, strip the Worktree field. → completed/007-worktree-teardown.md" (121 chars)
     #012  9,020 chars → "Fixed silent session expiry at 30m — refresh token now read from the live cookie jar. → completed/012-session-timeout-handling.md" (133 chars)
     #018    684 chars → "Capped HISTORY.md summaries at one sentence — plan-complete step 11 and the init template. → completed/018-cap-history-summaries.md" (135 chars)
     ```
   - Then use `AskUserQuestion`:
     - Header: "Backfill"
     - Question: "N HISTORY.md row(s) are over cap. Here are the first 3 rewrites. Proceed with the full pass?"
     - Options:
       1. "Backfill all" — Rewrite all N selected rows
       2. "Cancel" — Write nothing and stop
   - If "Cancel": abort with **zero writes** — not even the previewed 3. Report "Backfill cancelled — no rows changed."
   - This matches the repo's confirm-before-write idiom (this skill's own Delete-all/Keep-all gates, `plan-delete`'s explicit `yes`, `plan-import`'s preview-table-then-confirm).

   **Running the pass.**
   - On approval, process the selected rows in **ID order** and report progress in prose as you go, e.g. `Backfilled 50/552 rows…`. No fixed chunk size is mandated — how many rows fit in a pass depends on how fat the rows are; progress reporting plus the idempotent skip is what makes the pass safe, not a particular batch number.

   **Resumability is the idempotent skip itself — do NOT invent a checkpoint/state file.**
   - An interrupted or context-exhausted pass is continued simply by re-invoking `/plan-cleanup history`: rows already rewritten are conformant, so selection skips them and the pass picks up exactly where it stopped.
   - A `.plans/state/history-backfill.json` would be actively **harmful**: step 4 of this very skill reaps orphaned files in `.plans/state/`, so cleanup would eat its own checkpoint. There is no chunking/resumable-pass precedent in this repo to mirror, and inventing one here would be over-engineering on top of a mechanism that is already resumable for free.

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
     - **Registry:** `git worktree list --porcelain` (skip this step's git parts silently if not in a git repo). It emits a `worktree <abs-path>` line per registered worktree. Parse each by stripping the literal `worktree ` prefix (the first 9 characters, i.e. `sed 's/^worktree //'`) and keeping the **entire** remainder as the absolute path — the path may contain spaces, so never split on whitespace or take a single field (`cut -d' ' -f2` truncates a path like `/Users/me/My Work/repo` at the first space). Keep the ones under `.worktrees/`.
     - **Disk:** the immediate subdirectories of `.worktrees/` (may be absent).
   - Do **not** early-exit just because `.worktrees/` is missing — git may still list worktrees under a since-deleted `.worktrees/` (the *registered but missing* case below). Only skip the entire step when the repo is not git AND `.worktrees/` does not exist.
   - **Classify each entry into one of two desync kinds:**
     - **On disk but unregistered** — a directory under `.worktrees/` that `git worktree list` does NOT contain. These are the corpses: `git worktree prune` will NOT clean them (git has no record to prune), so they need explicit removal.
     - **Registered but missing** — git lists a worktree whose path no longer exists on disk. `git worktree prune` DOES clean these (it removes the stale administrative record).
   - **Never touch the `.plans` worktree (branch mode).** Drop any registry entry whose path is the realpath of `<root>/.plans`, or whose `branch refs/heads/<b>` line names the configured plans branch (`node ~/.claude/plans-cc/plans-git.js is-plans-branch <b>` prints `yes`). The `.worktrees/` filter above already excludes it, so this is defense in depth: the `.plans` worktree holds the project's plan state and must never be classified, offered for reaping, or removed. The unconditional `git worktree prune` below is still safe, because a present `.plans` worktree is never stale. Its health is step 7.6's job.
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
   - **Branch mode allowances** (only when `node ~/.claude/plans-cc/plans-git.js mode` prints `branch`, or `.plans/.git` is a file, which is the broken-worktree case step 7.6 explains): `.git-lock/` is the helper's commit lock and is expected. So is the `.plans/.git` *file*, which is the worktree's pointer back to the code repo. Never list either as unexpected, and never offer to delete them.
     - **Stale lock (flag only):** if `.plans/.git-lock` is older than 60s (`find .plans/.git-lock -maxdepth 0 -mmin +1` prints it), report `Stale commit lock: .plans/.git-lock is older than 60s — the next plans-git commit breaks it automatically` (60s matches the helper's own lock-breaking timeout). Never delete it here, because a slow commit may still hold it.
     - Outside branch mode, `.git-lock` gets no special treatment and is flagged like any other unexpected directory, so local/inline output is unchanged.
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
   - **Branch mode does not false-flag here.** In branch mode `.plans` is a nested git worktree on the plans branch, and the outer `git ls-files` never lists a nested worktree's files, so the tracked-entry check above returns nothing for a healthy setup. Keep the trailing-slash warning in every mode.
   - **Branch mode: an unignored `.plans` is an error, not a suggestion** (per the *`.plans` stays ignored, slashless, on code branches* invariant in `CLAUDE.md` → **Plans storage mode**). The ignore is what keeps `git add -A` in the code checkout from sweeping the worktree in. When `plans-git.js mode` prints `branch` and `git check-ignore -q .plans` fails, report `ERROR: .plans is not ignored by the code repo` and, with `AskUserQuestion`, offer:
     1. "Add to .git/info/exclude (recommended)": append a `.plans` line to the file `git rev-parse --git-path info/exclude` names. This is local to this clone and works on every code branch, including old ones whose `.gitignore` lacks the line.
     2. "Leave it": do nothing.
     Step 7.6 runs the same `check-ignore` test. When the fix was offered here, step 7.6 does not ask a second time.
   - Report what was found/fixed, or "Git tracking integrity: OK" if clean.

7.6. **Branch-mode health check** *(full and focused mode; branch mode only)*
   - Run `node ~/.claude/plans-cc/plans-git.js mode`. The step runs when it prints `branch`, **or** when `.plans/.git` is a *file* (`test -f .plans/.git`). That second case is a broken branch-mode worktree. Once git's admin record for `.plans` is gone, `git -C .plans rev-parse` fails and mode detection falls through to `local`/`inline`, so gating on the mode alone would hide the exact problem check (a) exists to find. In that case run only check (a). Otherwise skip this step **silently**: no output and no summary line, so local/inline/none output stays byte-identical (a local or inline `.plans/` never has a `.git` file). If the helper is missing, skip silently here too (step 9 already prints the missing-helper warning).
   - Read the plans branch and remote from `.plans/config.json` `sync` (`branch`, default `plans`; `remote`, default `origin`; read each field defensively). Below, `<b>` is the branch and `<r>` the remote.
   - Run each check and collect the problems. **All of them are flag-only:** report the problem and a pointer to the fix, and change nothing. The two exceptions are the one-line prompted fixes marked below. **Never** run `git rebase --abort`, `git stash pop`/`drop`, `git worktree remove`, or `prune` against `.plans` from this step. Each of those can lose plan state that hasn't been pushed, so resolving them is the user's call.

     | # | Check | Command | Problem → fix pointer |
     |---|-------|---------|-----------------------|
     | a | Worktree registered and present | `git worktree list --porcelain` has a `worktree <realpath of .plans>` line, and `.plans/.git` exists | **Unregistered:** `.plans/.git` is a file but no registry entry matches. `bootstrap` can NOT fix this: mode reads `local`/`inline` here, so it refuses. First try `git worktree repair .plans` (fixes a moved repo, where the admin dir still exists). If that errors (the admin dir under `.git/worktrees/` was deleted or pruned), re-attach by hand, keeping uncommitted plan edits: `mv .plans .plans.bak && rm .plans.bak/.git && git worktree add .plans <b> && cp -R .plans.bak/. .plans/`, check `git -C .plans status`, then delete `.plans.bak` (if the local `<b>` branch is gone, use `git worktree add --track -b <b> .plans <r>/<b>`). **Missing:** registered but `.plans` gone → `node ~/.claude/plans-cc/plans-git.js bootstrap` (prunes the stale record, then joins `<r>/<b>`). With no `.plans/config.json`, root discovery fails before cleanup runs, so in practice this case is handled by the bootstrap hook, not here |
     | b | On the plans branch | `git -C .plans symbolic-ref -q HEAD` prints `refs/heads/<b>` | Fails → **detached HEAD**. Prints another branch → **wrong branch**. Either way: `git -C .plans switch <b>` once any rebase in progress is settled (check c) |
     | c | No stuck rebase | `d=$(git -C .plans rev-parse --git-dir)`, then test `$d/rebase-merge` and `$d/rebase-apply` | Either exists → **stuck rebase** from an aborted `sync`: resolve it inside `.plans` (`git -C .plans status`, then `rebase --continue` or `rebase --abort`) |
     | d | No leftover autostash | `$d/rebase-merge/autostash` (a stuck rebase still holding the autostash), or a `git -C .plans stash list --format='%gd %gs'` entry whose subject is `autostash` and whose base commit is on the plans branch (`git -C .plans merge-base --is-ancestor <entry>^1 refs/heads/<b>`) | Uncommitted plan edits are parked in a stash: `git -C .plans stash list`, then `stash pop` it by hand. The ancestry test matters because `.plans` is a worktree of the code repo and shares its `refs/stash`, so a code-side `autostash` entry must not be flagged. `sync` uses `pull --rebase --autostash`, and when re-applying the stash conflicts, git saves it with exactly that reflog subject |
     | e | Upstream set | `git -C .plans rev-parse -q --verify '<b>@{u}'` (name the branch: a bare `@{u}` fails on a detached HEAD and would double-report check b) | Unset → **no upstream** (commits stay local and are never pushed): `git -C .plans branch -u <r>/<b>` once `<r>/<b>` exists, else `git -C .plans push -u <r> <b>` |
     | f | Merge driver set | `git config --get merge.ours.driver` prints `true` (repo-wide config, shared by the `.plans` worktree) | Missing → `PROGRESS.md`/`config.json` conflicts aren't auto-resolved on sync. **Prompted fix**: `AskUserQuestion` "Set `merge.ours.driver`?" → run `git config merge.ours.driver true` / "Leave it" |
     | g | `.plans` ignored by the code repo | `git check-ignore -q .plans` at the root | Not ignored → **Prompted fix** (same as step 7.5; skip it if 7.5 already asked): append `.plans` to `$(git rev-parse --git-path info/exclude)` / "Leave it" |
     | h | `git_commits: true` | `.plans/config.json` | Anything else → plan changes are never committed, so they never sync: set `"git_commits": true` in `.plans/config.json` (flag only; the helper never flips it either) |

   - **Focused mode** runs every check but never prompts. The prompted fixes become pointers (`run /plan-cleanup to fix`).
   - **Report:** when nothing was found, print one line, `Branch mode: healthy (<b> ↔ <r>/<b>)`. Otherwise print `Branch mode: N problem(s)`, then one bullet per problem with its fix pointer, and say which prompted fixes were applied.

8. **Silent system scan summary** *(focused mode only)*
   - Briefly count (without prompting) orphaned state files, stale branches, orphaned worktrees, unexpected directories. Also run the step-7.5 detection (tracked `.plans` entry, or trailing-slash `.plans/` ignore form) and the step-7.6 branch-mode checks without prompting.
   - In branch mode, always surface the step-7.6 problems that block syncing, since each can strand plan changes on this machine:
     - "⚠️ `.plans` is mid-rebase (stuck sync). Resolve it in `.plans` before the next plan command."
     - "⚠️ `.plans` is on a detached HEAD. Run `git -C .plans switch <b>`."
     - "⚠️ The `.plans` worktree isn't registered with git. Run `/plan-cleanup` for the re-attach steps (`git worktree repair .plans` first)."
     - "⚠️ `.plans` is not ignored by the code repo. Run `/plan-cleanup` to fix."
   - Report any other step-7.6 problems (no upstream, leftover autostash, missing merge driver, `git_commits` not `true`, stale lock) as one line, `Branch mode: N problem(s): run /plan-cleanup for details`. Print nothing about branch mode when step 7.6 was skipped or found nothing.
   - Report counts at the end:
     ```
     System scan: 2 orphaned state files, 1 stale branch, 0 orphaned worktrees, 1 unexpected directory.
     Run `/plan-cleanup` (no ID) to address.
     ```
   - If a tracked `.plans` entry or vulnerable `.plans/` ignore form is detected, always surface it prominently (it risks data loss): "⚠️ `.plans` is tracked in git / ignored with a trailing slash — run `/plan-cleanup` to fix before your next branch checkout."
   - If everything is clean, report: "System scan: clean."

9. **Commit .plans/ changes** *(all modes, if anything changed)*
   - Commit via the shared helper (it resolves the project root and skips silently when not in a git repo, when `.plans` is gitignored, when `git_commits` is not `true`, or when nothing changed):
     ```bash
     node ~/.claude/plans-cc/plans-git.js commit "plan: cleanup tracking files"
     ```
   - If `~/.claude/plans-cc/plans-git.js` does not exist: print `Warning: plans-git helper missing — run npx plans-cc to reinstall` and continue.
   - Surface any `Warning:` lines it prints, but never fail the skill.

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
    - HISTORY.md: N row(s) over cap — run `/plan-cleanup history`
    - Branch mode: healthy (plans ↔ origin/plans)
    ```
    Omit lines for categories that had nothing to report. The HISTORY.md line follows that same discipline — it appears **only** when step 3.5 actually detected drift, and is absent when HISTORY.md is missing, has no data rows, or is fully conformant. It is a pointer, not a result: full mode never rewrote anything.

    The Branch mode line appears **only** when step 7.6 ran, so it is absent in local, inline, and none mode. It names the configured branch and remote (`<b> ↔ <r>/<b>`). When problems were found it becomes `Branch mode: N problem(s)`, followed by one indented bullet per problem with its fix pointer (e.g. `  - detached HEAD — git -C .plans switch plans`) and a note of any prompted fix that was applied. Each applied prompted fix counts toward `N issues resolved`. Flagged-only problems don't.

    **History mode:**
    ```
    # HISTORY.md Backfill Complete

    - Rewritten: N row(s)
    - Already conformant: M row(s) (skipped)
    - Skipped 2 row(s) with no completed/ file: #005, #013
    - Skipped 1 malformed row (not 5 columns): #009
    ```
    Omit the skip lines when nothing was skipped for that reason. If the user cancelled at the preview gate, report "Backfill cancelled — no rows changed." instead of the block above. If every row was already conformant, report "HISTORY.md: all N row(s) already conformant — nothing to backfill."

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

    End-of-action marker (final line):
    - **Full mode and focused mode**: `🟢 CLEANED UP · N issues resolved`
      (N = total issues fixed across all categories; use `0 issues resolved` if nothing needed fixing)
    - **History mode**: `🟢 BACKFILLED · N HISTORY rows → Next: /plan-status`
      (N = rows actually rewritten; use `0 HISTORY rows` when the pass was a no-op or the user cancelled)

    Backfilled rows do **NOT** count toward `N issues resolved`. The two markers are separate on purpose: the sweep's count is a count of *sweep* fixes, and folding a backfill into it would render as `552 issues resolved`, which badly misreads a single data-hygiene pass as hundreds of distinct problems.

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
- **HISTORY.md doesn't exist**: Full mode skips step 3.5 silently. History mode reports "No HISTORY.md — nothing to backfill." and stops.
- **No rows over cap**: Full mode emits nothing (no "HISTORY.md: OK" line). History mode reports "all N row(s) already conformant — nothing to backfill."
- **Row with no matching `completed/NNN-slug.md`** (history mode): Leave the row untouched — never invent a summary — and report the skipped IDs.
- **Malformed HISTORY.md row** (history mode): A line that matches the ID pattern but doesn't split into 5 columns is left untouched and reported; do not attempt to repair its shape.
- **User declines the 3-row preview** (history mode): Abort with **zero writes** — not even the previewed 3 rows. Report "Backfill cancelled — no rows changed."
- **Backfill pass interrupted** (history mode): No cleanup needed and no checkpoint to reconcile — re-run `/plan-cleanup history` and it resumes, because already-rewritten rows are conformant and get skipped.
- **Branch mode, healthy**: Steps 6, 7, and 7.5 offer nothing for the `.plans` worktree (it isn't reaped, untracked, or listed as unexpected, and neither is `.git-lock`), and step 7.6 prints `Branch mode: healthy (<b> ↔ <r>/<b>)`.
- **Branch mode, stuck rebase or leftover autostash**: Flag it with the manual fix. Never run `rebase --abort`, `stash pop`, or `stash drop` automatically, because the stash or the rebase may hold the only copy of unpushed plan edits.
- **Branch mode, stale `.git-lock`** (older than 60s): Flag only. Never delete it, because a slow commit may still hold it, and the next `plans-git.js commit` breaks an abandoned lock anyway.
- **`.plans/.git` file with no registered worktree**: Mode detection reports `local`/`inline` here, not `branch`, so step 7.6 keys on the file instead. Point at `git worktree repair .plans`, then the manual re-attach in check (a). Do NOT point at `bootstrap`, which refuses a non-empty non-branch `.plans`. Never delete `.plans/.git` and never `git worktree prune` with the aim of repairing it.
- **Local / inline / none mode**: Step 7.6 is skipped silently and no Branch mode line appears. Output is identical to before branch mode existed.
- **`/plan-cleanup history 007`**: History mode does not compose with a task ID in v1. Explain that the backfill is a repo-wide pass and run `/plan-cleanup history` instead — do not silently ignore the ID and do not fall through to focused mode on `007`.
