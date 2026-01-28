# plans-cc

Lightweight task management for Claude Code, implemented as a set of skills.

## Overview

plans-cc provides a simple task management system through Claude Code skills. Users install via `npx plans-cc`, which copies skill files to `~/.claude/skills/`. There is no runtime code — skills are purely declarative SKILL.md files that instruct Claude how to manage tasks.

Tasks are stored as markdown files in a `.plans/` directory within your project, making them easy to read, edit, and version control.

## Installation

```bash
npx plans-cc
```

This copies 11 skill files to `~/.claude/skills/`. No dependencies are installed in your project.

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
/plan-start 1
/plan-execute 1
/plan-complete 1
```

### All Commands

| Command | Description |
|---------|-------------|
| `/plan-init` | Bootstrap `.plans/` directory structure |
| `/plan-help` | Show command reference |
| `/plan-context` | Update project context (tech stack, patterns) |
| `/plan-capture [description]` | Quick-capture a new task |
| `/plan-elaborate <id>` | Research and flesh out a task |
| `/plan-start <id>` | Begin working on a task |
| `/plan-execute <id>` | Continue work on active task |
| `/plan-complete <id>` | Mark task done and archive it |
| `/plan-status` | Dashboard of all work |
| `/plan-list [filter]` | List tasks with optional filter |
| `/plan-delete <id>` | Remove a task |

### Task Lifecycle

```
capture → elaborate → start → execute → complete
   │          │         │        │         │
pending   elaborated  in-progress  ...   completed
                                          (archived)
```

### File Structure

After running `/plan-init`, your project will have:

```
.plans/
  CONTEXT.md      # Project knowledge (tech stack, patterns)
  PROGRESS.md     # Current work status
  HISTORY.md      # Completed work archive
  config.json     # Settings (git_commits, next_id)
  pending/        # Active task files
    001-fix-auth-bug.md
    002-add-dark-mode.md
  completed/      # Archived task files
```

### Filtering Tasks

Use `/plan-list` with filters:

- **By status:** `pending`, `elaborated`, `in-progress`, `completed`
- **By type:** `bug`, `feature`, `refactor`, `chore`
- **All tasks:** `all` (includes completed)

```
/plan-list bug           # All bug tasks
/plan-list in-progress   # Currently active tasks
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
    plan-*/SKILL.md     # Skill definitions (11 total)
```

### Development Setup

Clone the repo and use the dev script to symlink skills:

```bash
git clone https://github.com/mattboldt/plans-cc.git
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
   - `/plan-start 1`
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
