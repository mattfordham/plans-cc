---
name: plan-init
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
description: Bootstrap the .plans/ directory for task management
---

# plan-init

Initialize the `.plans/` directory structure for lightweight task management.

## Steps

1. **Check if already initialized**
   - Look for `.plans/` directory in current working directory
   - If exists and has `config.json`, error: "Already initialized. Run `/plan-status` to see current tasks."
   - If `.plans/` exists but is incomplete (missing files), offer to repair

2. **Create directory structure**
   ```
   .plans/
     CONTEXT.md
     PROGRESS.md
     HISTORY.md
     config.json
     pending/
     completed/
     ideas/
     state/
   ```

3. **Write CONTEXT.md template**
   ```markdown
   # Project Context

   **Project:** [Project Name]
   **Updated:** [Today's date YYYY-MM-DD]

   ## Overview
   _Brief description of this project_

   ## Tech Stack
   _Languages, frameworks, tools_

   ## Structure
   ```
   project/
     src/           # Source code
     tests/         # Test files
     config/        # Configuration
   ```
   _Run `/plan-context` to auto-generate_

   ## Testing
   - **Framework:** _e.g., Jest, RSpec, pytest_
   - **Location:** _e.g., `tests/`, `spec/`, `__tests__/`_
   - **Run:** _e.g., `npm test`, `bundle exec rspec`_
   - **Conventions:** _e.g., TDD, coverage requirements_

   ## Key Patterns
   _Architecture decisions, conventions_

   ## Notes
   _Anything else relevant_
   ```

4. **Write PROGRESS.md template**
   ```markdown
   # Current Progress

   **Last updated:** [Today's date YYYY-MM-DD]

   ## Active Work
   _No active tasks_

   ## Recently Completed
   _No completed tasks yet_

   ## Stats
   - Pending: 0
   - Elaborated: 0
   - In Progress: 0
   - Completed: 0
   ```

5. **Write HISTORY.md template**
   ```markdown
   # Task History

   | ID | Title | Type | Completed | Summary |
   |----|-------|------|-----------|---------|
   ```

6. **Write config.json**
   ```json
   {
     "git_commits": true,
     "next_id": 1,
     "idea_next_id": 1,
     "segment_threshold": 4
   }
   ```

7. **Display confirmation**
   Show:
   - Confirmation that `.plans/` was created
   - List of files created
   - Suggest next steps:
     - `/plan-context` to set up project context
     - `/plan-capture <description>` to capture your first task
     - `/plan-help` to see all commands

8. **Commit .plans/ changes**
   - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
   - If not a git repo: skip silently
   - Read `.plans/config.json` for `git_commits` setting
   - If `git_commits` is not `true`: skip silently
   - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
   - If no changes: skip silently
   - Commit:
     ```bash
     git add .plans/
     git commit -m "plan: initialize .plans/"
     ```
   - If commit fails (e.g. hooks): warn but do not fail the skill

## Edge Cases

- **Already initialized**: If `.plans/config.json` exists, show error with suggestion to use `/plan-status`
- **Partial initialization**: If `.plans/` exists but is missing files, offer to repair by creating missing files only
- **Not in a project directory**: Proceed anyway (user knows best where to put their plans)
