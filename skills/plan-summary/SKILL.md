---
name: plan-summary
disable-model-invocation: false
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
description: Summarize work completed in the current session
---

# plan-summary

Show a concise summary of what was accomplished in this conversation. Designed as a quick post-execution review — "what just happened?"

## Sources of Truth

Draw from these sources, in priority order:

1. **Your conversation context** — You know what tools you called, what files you created/edited, what commands you ran, what tasks you worked on. This is the primary source.
2. **Git working state** — Run `git diff --stat` and `git log --oneline -10` to see concrete file changes and any commits made during this session.
3. **Task state** — If `.plans/` exists, check for any tasks that were worked on (in-progress, recently completed).

## Steps

1. **Reflect on session activity**
   Review your conversation context and identify:
   - What tasks or goals were worked on
   - What files were created, modified, or deleted
   - What key decisions were made
   - Any issues encountered and how they were resolved

2. **Check git state**
   ```bash
   git diff --stat
   git diff --cached --stat
   git log --oneline -10
   ```
   Use this to ground your summary in actual file changes. Don't list every file — group by area/purpose.

3. **Check task state** (if .plans/ exists)
   - Glob for `.plans/pending/*.md` and `.plans/completed/*.md`
   - Note any tasks that moved status during this session

4. **Display summary**

   Output EXACTLY this format:

   ```
   # Session Summary

   ## What Was Done
   - [High-level accomplishment — what, not how]
   - [Another accomplishment if applicable]

   ## Changes
   area/
     ├── file.ext — what changed and why
     ├── file.ext — what changed and why
     └── file.ext — what changed and why
   another-area/
     └── file.ext — what changed and why

   ## Decisions
   - [Any non-obvious choices made and why — omit section if none]

   ## Status
   [One line: what state things are in now — e.g., "All tests passing, ready for review" or "Task #003 complete, branch merged"]
   ```

   **Formatting rules:**
   - **What Was Done**: 1-4 bullet points max. Outcome-focused, not play-by-play.
   - **Changes**: Tree-style grouping by directory. Only include files that actually changed. Annotate each with a brief "what and why", not just the filename.
   - **Decisions**: Only include if there were meaningful choices (e.g., "Used X instead of Y because Z"). Omit the section entirely if nothing notable.
   - **Status**: Single line. Where things stand right now.

## Edge Cases

- **Nothing was done yet**: "No work completed in this session yet."
- **Only discussion, no code changes**: Summarize what was discussed/decided, note no files were changed.
- **Multiple tasks worked on**: Group changes under each task.
- **Work in progress (uncommitted)**: Note that changes are uncommitted in the Status line.
- **Session was just planning/elaboration**: Summarize what was planned, not just "elaborated a task".
