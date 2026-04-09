---
name: plan-guide
disable-model-invocation: false
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
description: Interactive contextual guide — suggests next actions based on current state
---

# plan-guide

Read the current state of `.plans/` and provide contextual guidance on what to do next. Unlike `/plan-help` (a static reference card), this skill analyzes your actual tasks and suggests specific actions.

## Steps

1. **Check initialization**
   - Use Glob or Read to check if `.plans/config.json` exists.
   - **If NOT initialized**, provide setup guidance instead of erroring:
     ```
     # Getting Started with Plans

     You haven't set up task management in this project yet.

     **Step 1:** Run `/plan-init` to create a `.plans/` directory
     **Step 2:** Run `/plan-context` to describe your project (helps with elaboration quality)
     **Step 3:** Start capturing tasks:
       - `/plan-capture Fix the login bug` — capture a specific task
       - `/plan-brainstorm API redesign` — explore ideas through discussion
       - `/plan-import tasks.md` — import tasks from a document

     For the full command reference, run `/plan-help`.
     ```
     **STOP here if not initialized.**

2. **Scan current state**
   - Count files in `.plans/pending/` grouped by status:
     - `pending` (captured but not elaborated)
     - `elaborated` (ready to execute)
     - `in-progress` (actively being worked on)
     - `review` (execution complete, awaiting review)
   - Count files in `.plans/completed/`
   - Check if `.plans/ideas/` has any files
   - Check if `.plans/CONTEXT.md` exists and has been customized (not just the auto-generated template — look for an Overview section with actual content)
   - For in-progress tasks: parse checkbox progress (completed/total steps)
   - For tasks with `**Blocked by:**` fields: note which are blocked

3. **Build contextual guidance**

   Display a header and then the relevant advice sections. Only include sections that apply to the current state.

   ```
   # Plans Guide
   ```

   **Section: Context check** (show if CONTEXT.md is missing or only has auto-generated content)
   ```
   ## Project Context

   Your CONTEXT.md hasn't been customized yet. Running `/plan-context` will auto-detect
   your tech stack and project structure — this significantly improves elaboration quality.
   ```

   **Section: In-progress tasks** (show if any tasks are in-progress)
   ```
   ## In Progress

   ▶ #003 Fix login timeout [bug] — 3/5 steps complete
   ▶ #007 Add search feature [feature] — 1/6 steps complete

   Continue working: `/plan-execute 3`
   Need to switch? `/plan-pause 3` saves your progress
   Finished? `/plan-complete 3`
   ```

   **Section: Review tasks** (show if any tasks are in review status)
   ```
   ## Ready for Review

   ★ #004 Add dark mode [feature] — 4/4 steps complete

   Review changes: `/plan-review 4`
   ```

   **Section: Blocked tasks** (show if any tasks have unresolved Blocked by fields)
   ```
   ## Blocked

   ⊘ #006 Deploy auth service [chore] — blocked by #003
     Resolve blocker first, or clear with: `/plan-depends 6 clear`
   ```

   **Section: Ready to execute** (show if elaborated tasks exist and no in-progress tasks, or if there are idle elaborated tasks)
   ```
   ## Ready to Execute

   ○ #002 Add dark mode [feature] — 0/4 steps
   ○ #005 Refactor auth module [refactor] — 0/3 steps

   Start working: `/plan-execute 2`
   Want isolation? `/plan-execute 2 use worktree`
   ```

   **Section: Needs elaboration** (show if pending tasks exist)
   ```
   ## Needs Elaboration

   · #001 Update docs [chore]
   · #008 Fix mobile layout [bug]

   Research and plan: `/plan-elaborate 1`
   Or skip straight to work: `/plan-execute 1` (auto-elaborates)
   ```

   **Section: Ideas** (show if ideas/ has files and no tasks have been derived from them)
   ```
   ## Ideas Waiting

   You have N idea(s) that haven't been turned into tasks yet.

   Browse ideas: `/plan-ideas`
   Pick the best parts: `/plan-pick 1`
   Full decomposition: `/plan-expand 1`
   ```

   **Section: All caught up** (show if no pending/elaborated/in-progress/review tasks)
   ```
   ## All Caught Up

   N tasks completed. Nice work!

   What's next?
   - `/plan-capture <description>` — add a new task
   - `/plan-brainstorm <topic>` — explore new ideas
   - `/plan-summary` — review what you've accomplished this session
   ```

   **Section: Tips** (always show one relevant tip based on state)
   Choose one tip that's most relevant:
   - If user has 5+ pending tasks: "Tip: Use `/plan-list` to filter by type (bug, feature, refactor, chore)"
   - If user has completed tasks but never used summary: "Tip: `/plan-summary` gives you a recap of work done this session"
   - If user has multiple in-progress tasks: "Tip: `/plan-pause` lets you switch between tasks without losing progress"
   - If user has ideas and tasks: "Tip: `/plan-search <keyword>` finds tasks and ideas by content"
   - Default: "Tip: `/plan-help` shows the full command reference"

## Edge Cases

- **Not initialized**: Provide setup guidance (step 1) — do NOT error
- **No tasks at all**: Show "All Caught Up" section with getting-started suggestions
- **Only completed tasks**: Show "All Caught Up" with completion count
- **Malformed task files**: Skip them silently, work with what's readable
- **ideas/ directory doesn't exist**: Skip ideas section
- **No git repo**: Omit any git-related tips
