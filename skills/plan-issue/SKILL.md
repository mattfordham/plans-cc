---
name: plan-issue
disable-model-invocation: false
argument-hint: "[id] <description>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
description: Report an issue found during manual testing
---

# plan-issue

Report an issue found during manual testing. Issues are attached to a task and must be resolved before the task can be completed.

## Arguments

- `$ARGUMENTS`: Optional task ID followed by issue description
  - With ID: `1 Login button doesn't respond on mobile Safari`
  - Without ID: `Login button doesn't respond on mobile Safari` (uses in-progress task)

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments**
   Extract task ID and description from `$ARGUMENTS`:
   - If starts with a number followed by space: extract ID and remaining text as description
   - If no leading number: entire argument is the description, no ID provided
   - If empty: error: "Please provide an issue description: `/plan-issue [id] <description>`"

3. **Resolve task ID**

   **If ID provided:**
   - Zero-pad to 3 digits
   - Find task file: `.plans/pending/NNN-*.md`
   - If not found: "Task #NNN not found. Run `/plan-list` to see available tasks."

   **If no ID:**
   - Scan `.plans/pending/*.md` for tasks with `**Status:** in-progress` or `**Status:** review`
   - If exactly one in-progress task: use it
   - If multiple in-progress tasks:
     ```
     Multiple in-progress tasks found:
     - #001 - Fix login timeout
     - #003 - Add dark mode

     Specify which task: `/plan-issue 1 [description]`
     ```
   - If no in-progress tasks:
     ```
     No in-progress task. Specify task ID: `/plan-issue 1 [description]`

     Or start a task first with `/plan-execute`
     ```

4. **Validate task state**
   - Read the task file
   - Check Status field:
     - `in-progress` or `review`: proceed (ideal)
     - `elaborated`: proceed (allow issues on elaborated tasks)
     - `pending`: "Task #NNN hasn't been elaborated. Run `/plan-elaborate NNN` or `/plan-execute NNN` first."
     - `completed`: "Task #NNN is already completed. Capture a new task with `/plan-capture`."

5. **Read task file content**
   - Load the full content of the task file

6. **Find or create Issues section**
   - Look for existing `## Issues` section
   - If exists: append to it
   - If not exists: insert new section
     - Place after `## Changes` if it exists
     - Otherwise place after `## How`

7. **Append issue**
   - Add new unchecked issue: `- [ ] [description]`
   - If creating new section:
     ```markdown
     ## Issues
     - [ ] [description]
     ```
   - If appending to existing section: add line after last issue

8. **Write updated task file**
   - Save changes to the task file

9. **Commit .plans/ changes**
   - Commit via the shared helper (it resolves the project root and skips silently when not in a git repo, when `.plans` is gitignored, when `git_commits` is not `true`, or when nothing changed):
     ```bash
     node ~/.claude/plans-cc/plans-git.js commit "plan: add issue to #NNN"
     ```
   - If `~/.claude/plans-cc/plans-git.js` does not exist: print `Warning: plans-git helper missing — run npx plans-cc to reinstall` and continue.
   - Surface any `Warning:` lines it prints, but never fail the skill.

10. **Display confirmation**
   ```
   Issue added to task #NNN: [description]

   View task: /plan-show NNN
   Resolve issues: /plan-execute NNN
   ```

   End-of-action marker (final line): `🔴 ISSUE LOGGED · Task #NNN`

## Edge Cases

- **No arguments**: Error with usage guidance
- **ID only, no description**: Error: "Please provide an issue description"
- **Task not found**: Error with suggestion to `/plan-list`
- **No in-progress task + no ID**: Error with guidance
- **Multiple in-progress tasks + no ID**: List them and ask for specific ID
- **Task already completed**: Error, suggest `/plan-capture` for new work
- **Pending task**: Require elaboration or execution first
- **Very long description**: Keep full description, no truncation needed
