# plans-cc

Lightweight task management for Claude Code, implemented as a set of skills.

## Overview

plans-cc provides a simple task management system through Claude Code skills. Users install via `npx plans-cc`, which copies skill files to `~/.claude/skills/`. There is no runtime code — skills are purely declarative SKILL.md files that instruct Claude how to manage tasks.

Tasks are stored as markdown files in a `.plans/` directory within your project, making them easy to read, edit, and version control.

## Installation

```bash
npx plans-cc
```

This copies 21 skill files to `~/.claude/skills/`. No dependencies are installed in your project.

**Requirements:** Node.js 16.7.0 or later

## Usage

### Quick Start

In Claude Code, initialize plans in your project directory:

```
/plan-init
```

Then start capturing and working on tasks:

```
/plan-capture Fix the login timeout bug
/plan-elaborate 1
/plan-execute 1
/plan-complete 1
```

### All Commands

| Command | Description |
|---------|-------------|
| `/plan-init` | Bootstrap `.plans/` directory structure |
| `/plan-help` | Show command reference |
| `/plan-context` | Update project context (tech stack, patterns) |
| `/plan-capture [description] [and elaborate\|execute\|go]` | Quick-capture a task (optionally auto-proceed) |
| `/plan-import <file>` | Import tasks from a markdown document |
| `/plan-elaborate <id\|description>` | Research and flesh out a task (auto-captures if given description) |
| `/plan-execute <id\|description> [branch\|worktree]` | Start or continue work (auto-captures/elaborates if needed) |
| `/plan-complete <id>` | Mark task done and archive it |
| `/plan-review <id>` | Review a task's changes — checkout branch and show diff |
| `/plan-reopen <id>` | Reopen a completed task |
| `/plan-status` | Dashboard of all work |
| `/plan-list [filter]` | List tasks with optional filter |
| `/plan-show <id>` | Show detailed overview of a task |
| `/plan-issue [id] <description>` | Report an issue found during testing |
| `/plan-delete <id>` | Remove a task |
| `/plan-combine <id> <id> [id...]` | Merge multiple tasks into one |
| `/plan-audit <id>` | Audit task completeness — verify all affected files |
| `/plan-ideas [id]` | List ideas or show details of a specific idea |
| `/plan-pick <idea-id>` | Pick high-value components from an idea to create tasks |
| `/plan-expand <id>` | Expand an idea into actionable tasks |
| `/plan-brainstorm [topic]` | Explore ideas through guided discussion |

### Task Lifecycle

```
capture → elaborate → execute → complete
   │          │          │         │
pending   elaborated  in-progress  completed
                                   (archived)
```

### Worktree Workflow

Execute tasks in isolated git worktrees for parallel work and cleaner reviews:

```
/plan-execute 3 use worktree    # Execute in isolated worktree
# ... AI works in .worktrees/003-slug/ ...
# ... status set to review, worktree cleaned up ...
/plan-review 3                  # Checkout branch, see diff summary
# ... manually test the changes ...
/plan-complete 3                # Merge branch to main, archive task
```

The worktree lifecycle adds a `review` status between `in-progress` and `completed`:

```
capture → elaborate → execute (worktree) → review → complete
                         │                    │         │
                      in-progress           review   completed
```

### Fast Track

Skip earlier steps automatically with trailing phrases:

```
/plan-capture Fix the login timeout and go           # Capture → elaborate → execute
/plan-capture Add dark mode and elaborate             # Capture → elaborate
/plan-capture Fix crash then execute with branch      # Full pipeline with git branch
/plan-capture Fix crash then go with worktree         # Full pipeline with worktree isolation
/plan-execute Fix the login timeout                   # Auto-capture → elaborate → execute
/plan-execute Fix crash branch                        # Full pipeline with git branch
/plan-execute Fix crash use worktree                  # Full pipeline with worktree isolation
```

### Idea Exploration

Brainstorm and refine ideas before committing to tasks:

```
/plan-brainstorm API redesign   # Start exploring a topic
# ... discuss and explore ...
capture this                    # Save the synthesized discussion
/plan-ideas                     # See all captured ideas
/plan-pick 1                    # Pick best components from idea #1
/plan-expand 1                  # Decompose entire idea into tasks
```

### File Structure

After running `/plan-init`, your project will have:

```
.plans/
  CONTEXT.md      # Project knowledge (tech stack, patterns)
  PROGRESS.md     # Current work status
  HISTORY.md      # Completed work archive
  config.json     # Settings (git_commits, next_id, idea_next_id)
  pending/        # Active task files
    001-fix-auth-bug.md
    002-add-dark-mode.md
  completed/      # Archived task files
  ideas/          # Brainstorm session documents
```

### Filtering Tasks

Use `/plan-list` with filters:

- **By status:** `pending`, `elaborated`, `in-progress`, `review`, `completed`
- **By type:** `bug`, `feature`, `refactor`, `chore`
- **All tasks:** `all` (includes completed)

```
/plan-list bug           # All bug tasks
/plan-list in-progress   # Currently active tasks
/plan-list review        # Tasks ready for review
/plan-list all           # Everything including completed
```

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

Clone the repo and use the dev script to symlink skills:

```bash
git clone https://github.com/mattfordham/plans-cc.git
cd plans-cc
node bin/dev.js
```

This creates symlinks from `~/.claude/skills/plan-*` to your local `skills/` directory. Edits to skill files are immediately available in Claude Code without reinstalling.

### SKILL.md Format

Skills are pure markdown files with YAML frontmatter:

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
