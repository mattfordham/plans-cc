---
name: plan-extract
disable-model-invocation: true
argument-hint: "[pasted text | path-to-file]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Extract tasks from a meeting transcript or notes after discussion and confirmation
---

# plan-extract

Turn unstructured prose — a meeting summary, transcript, or notes dump — into tasks. Unlike `/plan-import` (which parses a structured markdown file by headers/lists), this skill reads conversational prose, **semantically** pulls out the action items buried in it, **discusses ambiguities with you first**, then proposes a confirm-to-create task list.

Complements `/plan-import`: import handles structured documents; extract handles messy prose.

## Arguments

- `$ARGUMENTS`: Either inline pasted text (the transcript/summary itself) or a path to a `.md`/`.txt` file containing it.

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Resolve input source**
   - If `$ARGUMENTS` looks like a path to an existing file (ends in `.md` or `.txt`, no embedded newlines, and the file exists), Read it. Set `source_label` = the filename.
   - Otherwise treat the full `$ARGUMENTS` string as the inline text. Set `source_label` = "pasted text".
   - If `$ARGUMENTS` is empty, ask: "Paste the transcript/summary, or give me a file path."

3. **Semantic extraction (not structural)**
   Read the prose and identify *action items*. Look for:
   - **Commitments**: "X will…", "I'll take…", "we need to…", "let's…", "action item:", "follow up on…", "TODO"
   - **Decisions implying work**: "we agreed to migrate…", "we're going with…"
   - **Problems raised**: bugs reported, blockers, things described as broken or slow

   For each item, capture:
   - **Title**: concise imperative phrasing of the action
   - **Context**: the supporting quote or surrounding sentence(s) from the source
   - **Type**: infer from keywords:
     - `bug`: "fix", "bug", "broken", "error", "issue", "crash", "fail"
     - `feature`: "add", "new", "implement", "create", "support"
     - `refactor`: "refactor", "clean", "reorganize", "restructure", "improve"
     - `chore`: "update", "upgrade", "config", "setup", "docs", "test"
     - Default to "feature" if no keywords match
   - **Owner / deadline**: any named person or date mentioned alongside the item (note it; do not invent one)

4. **Discuss first** (the differentiator)
   Before proposing tasks, surface ambiguities and resolve them with the user. Use `AskUserQuestion` (pattern borrowed from `/plan-clarify`) for items that are:
   - **Vague** — unclear scope or deliverable ("look into the caching thing")
   - **Possibly already tracked** — Glob `.plans/pending/` and `.plans/completed/`; if a candidate looks like an existing task, ask whether to skip it
   - **Uncertain status** — was this actually agreed/assigned, or just floated in passing?
   - **Mergeable / splittable** — two items that are really one task, or one item that's really several

   Fold the answers back into the candidate list (drop, merge, split, sharpen titles). If nothing is ambiguous, skip this round and go straight to the proposal.

5. **Present proposal**
   ```
   ## Extraction Proposal

   **Source:** [source_label]
   **Found:** [N] action items

   | # | Title | Type | Owner | Preview |
   |---|-------|------|-------|---------|
   | 1 | [title] | [type] | [owner or —] | [first 50 chars of context]... |
   | 2 | [title] | [type] | [owner or —] | [first 50 chars of context]... |
   ...

   ### Task Details

   #### 1. [Title] ([type])
   [Context / supporting quote]

   #### 2. [Title] ([type])
   [Context / supporting quote]

   ...

   ---
   **Options:**
   - Reply "yes" or "all" to create all tasks
   - Reply with numbers to create specific tasks (e.g., "1,3,5")
   - Reply "no" or "cancel" to abort
   ```

6. **Wait for user confirmation**
   - Accept: "yes", "y", "all", "ok", "confirm"
   - Partial: comma-separated numbers like "1,3" or "1, 2, 4"
   - Reject: "no", "n", "cancel", "abort"

7. **Create approved tasks**
   For each approved task:
   - Read current `next_id` from `.plans/config.json`
   - Generate slug from title (lowercase, hyphens, max 40 chars at a word boundary)
   - Create task file at `.plans/pending/NNN-slug.md`:
     ```markdown
     # [Title]

     **ID:** [NNN]
     **Created:** [YYYY-MM-DDTHH:MM]
     **Type:** [type]
     **Status:** pending
     **Source:** Extracted from [source_label]

     ## What
     [Context from the source — the supporting quote and any owner/deadline]

     ## Why
     _To be filled during elaboration_

     ## How
     _To be filled during elaboration_

     ## Verification
     _To be filled during elaboration_

     ## Changes
     _To be filled during execution_

     ## Notes
     _Extracted from [source_label]_
     ```
   - Increment `next_id` in config.json after each task

8. **Update PROGRESS.md**
   - Count pending tasks in `.plans/pending/`
   - Update the Stats section
   - Add a note about the extraction in the activity section

9. **Commit .plans/ changes**
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
     git commit -m "plan: extract [N] tasks from [source_label]"
     ```
   - If commit fails (e.g. hooks): warn but do not fail the skill

10. **Display summary**
   ```
   ## Extraction Complete

   Created [N] tasks from [source_label]:

   | ID | Title | Type | Status |
   |----|-------|------|--------|
   | #001 | [title] | [type] | pending |
   | #002 | [title] | [type] | pending |
   ...

   **Next steps:**
   - `/plan-elaborate [first-id]` to flesh out the first task
   - `/plan-list` to see all pending tasks
   - `/plan-status` for full dashboard
   ```

   End-of-action marker (final line): `🟢 EXTRACTED · N tasks → Next: /plan-status`

## Edge Cases

- **No action items found**: Report "No clear action items found in the source." and offer to create a single catch-all task with the full content as the description.
- **No arguments**: Ask the user to paste text or give a file path.
- **File not found** (only when input was parsed as a path): Error: "File not found: [path]. Paste the text directly, or check the path."
- **Empty input**: Error: "Nothing to extract — the input is empty."
- **Duplicate of existing task**: Note it in the proposal: "[title] (note: similar to existing #NNN)" and raise it during the discussion round.
- **Very long context**: Truncate preview in the proposal table; keep full context in the task file.
- **Not initialized**: Error: "Not initialized. Run `/plan-init` first."
- **User cancels**: Confirm: "Extraction cancelled. No tasks created."
- **Partial selection with invalid numbers**: Ignore invalid numbers, create valid ones, note which were skipped.
