# plans-cc

Lightweight task management for Claude Code, implemented as a set of skills.

## What This Is

plans-cc provides a simple task management system through Claude Code skills. Users install via `npx plans-cc`, which copies skill files to `~/.claude/skills/`. There is no runtime code — skills are purely declarative SKILL.md files that instruct Claude how to manage tasks.

## Project Structure

```
plans-cc/
  package.json          # npm package config
  bin/
    install.js          # Installer (copies skills to ~/.claude/skills/)
    dev.js              # Development helper
  skills/
    plan-*/SKILL.md     # Skill definitions (11 total)
  .claude/
    settings.local.json # Local Claude settings
```

## Skill Development

### SKILL.md Format

Skills are pure markdown files with YAML frontmatter:

```markdown
---
name: plan-example
disable-model-invocation: true
argument-hint: "<id>"           # Optional - shown in skill picker
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
description: Short description for skill picker
---

# plan-example

Longer explanation of what this skill does.

## Arguments

- `$ARGUMENTS`: Description of expected arguments

## Steps

1. **Step name**
   - Detailed instructions
   - Code examples if needed

## Edge Cases

- Handle error conditions
- Provide helpful error messages
```

### Frontmatter Fields

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Skill name (must match directory name) |
| `description` | Yes | Short description for skill picker |
| `disable-model-invocation` | Yes | Always `true` — skills are user-invoked only |
| `allowed-tools` | No | Tools the skill can use |
| `argument-hint` | No | Shows in skill picker (e.g., `"<id>"`, `"[description]"`) |

### Common Allowed Tools

- `Read`, `Write`, `Edit` — File operations
- `Bash` — Shell commands
- `Glob` — File pattern matching
- `Grep` — Content search

## Key Conventions

### Naming

- All skills use `plan-*` prefix
- Directory name matches the `name` field in frontmatter

### Task Lifecycle

```
capture → elaborate → start → execute → complete
   │          │         │        │         │
pending   elaborated  in-progress  ...   completed
                                          (archived)
```

### Task IDs

- 3-digit zero-padded format: `001`, `002`, etc.
- Stored in `config.json` as `next_id` (integer)
- Filenames: `NNN-slug.md` (e.g., `001-fix-login-bug.md`)

### File Structure Created by Skills

```
.plans/
  CONTEXT.md      # Project knowledge
  PROGRESS.md     # Current work status
  HISTORY.md      # Completed work archive
  config.json     # Settings (git_commits, next_id)
  pending/        # Active task files
  completed/      # Archived task files
```

### Task Statuses

- `pending` — Captured but not elaborated
- `elaborated` — Has Why/How/Verification filled in
- `in-progress` — Actively being worked on
- `completed` — Done and archived

### Task Types

Inferred from description keywords:
- `bug` — fix, bug, broken, error, issue, crash, fail
- `feature` — add, new, implement, create, support
- `refactor` — refactor, clean, reorganize, restructure, improve
- `chore` — update, upgrade, config, setup, docs, test

## Testing

Skills are declarative, not executable code. No automated tests — test manually:

1. Run `npx plans-cc` to install skills
2. In a test directory, run `/plan-init`
3. Walk through full lifecycle:
   - `/plan-capture Test task`
   - `/plan-elaborate 1`
   - `/plan-start 1`
   - `/plan-execute 1`
   - `/plan-complete 1`
4. Verify files are created/updated correctly in `.plans/`

For development iteration, use `node bin/dev.js` to reinstall from local source.

## All Skills

| Skill | Purpose |
|-------|---------|
| `/plan-init` | Bootstrap .plans/ directory |
| `/plan-help` | Show command reference |
| `/plan-context` | Update project context |
| `/plan-capture` | Quick-capture a task |
| `/plan-elaborate` | Research and flesh out a task |
| `/plan-start` | Begin working on a task |
| `/plan-execute` | Continue work on active task |
| `/plan-complete` | Mark task done and archive |
| `/plan-status` | Dashboard of all work |
| `/plan-list` | List tasks with filters |
| `/plan-delete` | Remove a task |
