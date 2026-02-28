# plans-cc

Lightweight task management for Claude Code, implemented as a set of skills.

## Overview

plans-cc provides a simple task management system through Claude Code skills. Users install via `npx plans-cc`, which copies skill files to `~/.claude/skills/`. There is no runtime code — skills are purely declarative SKILL.md files that instruct Claude how to manage tasks.

Tasks are stored as markdown files in a `.plans/` directory within your project, making them easy to read, edit, and version control alongside your code.

## Installation

```bash
npx plans-cc
```

This copies 21 skill files to `~/.claude/skills/`. No dependencies are installed in your project.

**Requirements:** Node.js 16.7.0 or later, [Claude Code](https://docs.anthropic.com/en/docs/claude-code)

## Getting Started

### 1. Initialize your project

Open Claude Code in your project directory and run:

```
/plan-init
```

This creates a `.plans/` directory with tracking files and templates.

### 2. Set up project context

```
/plan-context
```

Claude scans your codebase and populates `.plans/CONTEXT.md` with your tech stack, project structure, testing setup, and key patterns. This context helps Claude make better decisions during elaboration and execution.

### 3. Capture a task

```
/plan-capture Fix the login timeout bug
```

This creates a task file at `.plans/pending/001-fix-login-timeout-bug.md` with a unique ID, inferred type (bug/feature/refactor/chore), and placeholder sections for elaboration.

### 4. Elaborate the task

```
/plan-elaborate 1
```

Claude researches your codebase, identifies affected files, and fills in the **Why**, **How** (with step-by-step checkboxes), and **Verification** sections. This is where the plan gets fleshed out — root cause analysis for bugs, architecture decisions for features, and concrete implementation steps.

### 5. Execute the task

```
/plan-execute 1
```

Claude works through the implementation steps, checking off each one as it goes. It spawns focused sub-agents for each segment of work, follows TDD practices when a test suite is detected, and pauses at observation steps for your manual verification.

### 6. Complete the task

```
/plan-complete 1
```

Claude checks for incomplete steps and unresolved issues, cleans up debug artifacts, merges the branch (if one was created), and archives the task to `.plans/completed/`.

### Shortcut: Do it all at once

You can skip the step-by-step approach entirely:

```
/plan-execute Fix the login timeout bug
```

This auto-captures, auto-elaborates, and starts executing — all in one command. Add `branch` or `use worktree` for git isolation:

```
/plan-execute Fix the login timeout bug branch
/plan-execute Fix the login timeout bug use worktree
```

## Commands

### Core Workflow

| Command | Description |
|---------|-------------|
| `/plan-init` | Bootstrap `.plans/` directory and set up project context |
| `/plan-capture [description]` | Quick-capture a task idea with minimal friction |
| `/plan-elaborate <id>` | Research the codebase and flesh out a task with implementation steps |
| `/plan-execute <id>` | Start or continue working on a task — Claude implements the steps |
| `/plan-complete <id>` | Mark a task done, clean up, merge branch, and archive |

### Git Integration

| Command | Description |
|---------|-------------|
| `/plan-execute <id> branch` | Execute with a dedicated git branch |
| `/plan-execute <id> use worktree` | Execute in an isolated git worktree |
| `/plan-review <id>` | Checkout a task's branch and display a diff summary for manual testing |

**Branch mode** creates a feature branch (e.g., `fix/001-login-timeout`) and works on it. When you complete the task, Claude offers to merge it back.

**Worktree mode** goes further — it creates an isolated copy of your repo in `.worktrees/`, executes there, then cleans up the worktree and sets the task to `review` status. This lets you keep working on your main checkout while Claude works in isolation, and you can run multiple tasks in parallel.

### Viewing and Tracking

| Command | Description |
|---------|-------------|
| `/plan-status` | Compact dashboard showing all tasks with progress indicators |
| `/plan-list [filter]` | Filterable task list (by status, type, or `all`) |
| `/plan-show <id>` | Detailed view of a single task — progress bar, steps, verification criteria |
| `/plan-help` | Full command reference with examples |

### Task Management

| Command | Description |
|---------|-------------|
| `/plan-reopen <id>` | Move a completed task back to pending (keeps completed steps) |
| `/plan-delete <id>` | Permanently remove a task |
| `/plan-combine <id> <id> [...]` | Merge related tasks into a single task |
| `/plan-issue [id] <description>` | Attach a bug report to a task found during manual testing |
| `/plan-audit <id>` | Verify all affected files are accounted for in the task plan |
| `/plan-import <file>` | Bulk-import tasks from a markdown document |

### Idea Exploration

| Command | Description |
|---------|-------------|
| `/plan-brainstorm [topic]` | Open-ended discussion to explore an idea before committing to tasks |
| `/plan-ideas [id]` | List all captured ideas, or show details of a specific one |
| `/plan-pick <idea-id>` | Select the most valuable components from an idea and create tasks |
| `/plan-expand <idea-id>` | Decompose an entire idea into a full set of actionable tasks |

## Task Lifecycle

Every task moves through a series of statuses:

```
capture → elaborate → execute → complete
   │          │          │         │
pending   elaborated  in-progress  completed
                                   (archived)
```

- **pending** — Captured but not yet researched. Has a description but no implementation plan.
- **elaborated** — Claude has researched the codebase and created step-by-step implementation checkboxes, verification criteria, and impact analysis.
- **in-progress** — Actively being worked on. Steps are checked off as they're completed.
- **completed** — All work is done. Task file is archived to `.plans/completed/`.

### Worktree Lifecycle

When using worktree mode, a `review` status is added between execution and completion:

```
capture → elaborate → execute (worktree) → review → complete
```

- **review** — Execution is finished, the worktree has been cleaned up, and the branch is ready for manual testing. Run `/plan-review` to checkout the branch and see what changed.

## Common Workflows

### Standard: one task at a time

```
/plan-capture Fix the login timeout bug    # Capture
/plan-elaborate 1                          # Research and plan
/plan-execute 1                            # Implement
/plan-complete 1                           # Archive
```

### Fast track: capture and go

```
/plan-capture Fix login timeout and go                # Capture + elaborate + execute
/plan-capture Add dark mode and elaborate              # Capture + elaborate only
/plan-capture Fix crash then execute with branch       # Full pipeline with git branch
/plan-capture Fix crash then go with worktree          # Full pipeline with worktree
```

### Skip capture entirely

```
/plan-execute Fix the login timeout                    # Auto-capture + elaborate + execute
/plan-execute Fix crash branch                         # Same, with git branch
/plan-execute Fix crash use worktree                   # Same, with worktree isolation
```

### Parallel tasks with worktrees

```
/plan-execute 3 use worktree              # Task 3 runs in isolated worktree
# ... Claude works, finishes, cleans up worktree ...
/plan-execute 5 use worktree              # Task 5 runs in another worktree
# ... meanwhile, review task 3 ...
/plan-review 3                            # Checkout task 3's branch, see changes
# ... test manually ...
/plan-complete 3                          # Merge and archive
```

### Explore before committing

```
/plan-brainstorm API redesign             # Discuss the idea freely
# ... back and forth with Claude ...
capture this                              # Save the discussion as an idea
/plan-ideas                               # See all captured ideas
/plan-pick 1                              # Cherry-pick the best parts into tasks
/plan-expand 1                            # Or decompose the whole idea into tasks
```

### Track and triage

```
/plan-status                              # Dashboard with progress indicators
/plan-list bug                            # All bug tasks
/plan-list in-progress                    # What's currently active
/plan-list review                         # What's ready for review
/plan-show 3                              # Deep dive on a specific task
/plan-audit 3                             # Verify nothing was missed
```

### Report issues during testing

```
/plan-execute 1                           # Execute task
# ... Claude finishes, you test manually ...
/plan-issue 1 Login button unresponsive on mobile Safari
# ... Claude captures the issue and fixes it ...
/plan-complete 1                          # Complete (blocks if unresolved issues remain)
```

## File Structure

After running `/plan-init`, your project will have:

```
.plans/
  CONTEXT.md      # Project knowledge (tech stack, patterns, conventions)
  PROGRESS.md     # Current work status and stats
  HISTORY.md      # Completed work archive
  config.json     # Settings (git_commits, next_id, idea_next_id)
  pending/        # Active task files
    001-fix-auth-bug.md
    002-add-dark-mode.md
  completed/      # Archived task files
  ideas/          # Brainstorm session documents
```

Task files are plain markdown with metadata at the top and sections for What, Why, How (with checkboxes), Verification, Impact Scope, Changes, and Notes. You can read and edit them directly — they're designed to be human-readable.

## Filtering

`/plan-list` accepts filters to narrow results:

**By status:**
- `pending` — not yet elaborated
- `elaborated` — planned but not started
- `in-progress` — actively being worked on
- `review` — execution complete, awaiting manual review
- `completed` — archived

**By type:**
- `bug`, `feature`, `refactor`, `chore`

**Special:**
- `all` — includes completed tasks (excluded by default)

## Development

### Project Structure

```
plans-cc/
  package.json          # npm package config
  bin/
    install.js          # Installer (copies skills to ~/.claude/skills/)
    dev.js              # Development helper (symlinks instead of copies)
  skills/
    plan-*/SKILL.md     # Skill definitions (21 total)
  agents/
    plan-executor.md    # Sub-agent for task execution
```

### Development Setup

Clone the repo and use the dev script to symlink skills for live editing:

```bash
git clone https://github.com/mattfordham/plans-cc.git
cd plans-cc
node bin/dev.js
```

This creates symlinks from `~/.claude/skills/plan-*` to your local `skills/` directory. Edits to skill files are immediately available in Claude Code without reinstalling.

### How Skills Work

Skills are pure markdown files with YAML frontmatter. They contain no executable code — they're instructions that Claude follows when a user invokes the command. Each skill defines:

- **Frontmatter** — name, description, allowed tools, argument hints
- **Steps** — detailed instructions Claude follows in order
- **Edge cases** — how to handle errors and unusual situations

```markdown
---
name: plan-example
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
description: Short description for skill picker
---

# plan-example

Instructions for Claude on how to execute this skill.
```

### Testing

Skills are declarative, not executable code. Test manually:

1. Run `node bin/dev.js` to symlink skills
2. In a test directory, run `/plan-init`
3. Walk through the full lifecycle:
   - `/plan-capture Test task`
   - `/plan-elaborate 1`
   - `/plan-execute 1`
   - `/plan-complete 1`
4. Verify files in `.plans/` are created and updated correctly

### Publishing

```bash
npm publish
```

Users install with `npx plans-cc` which runs `bin/install.js`.

## License

MIT
