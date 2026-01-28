---
name: plan-help
disable-model-invocation: true
description: Display command reference for all plan-* skills
---

# plan-help

Display the complete command reference. Output the following help text:

---

## Plans — Lightweight Task Management for Claude Code

### Quick Start

```
/plan-init              # Set up .plans/ in current directory
/plan-capture Fix bug   # Capture a task quickly
/plan-elaborate 1       # Research and flesh out task #1
/plan-start 1           # Begin working on task #1
/plan-execute 1         # Continue work on task #1
/plan-complete 1        # Mark task #1 done
```

### All Commands

| Command | Description |
|---------|-------------|
| `/plan-init` | Bootstrap `.plans/` directory structure |
| `/plan-help` | Show this command reference |
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

```
.plans/
  CONTEXT.md      # Project knowledge
  PROGRESS.md     # Current work status
  HISTORY.md      # Completed work archive
  config.json     # Settings
  pending/        # Active task files
    001-fix-auth-bug.md
    002-add-dark-mode.md
  completed/      # Archived task files
```

### Filters for /plan-list

- **Status**: `pending`, `elaborated`, `in-progress`, `completed`
- **Type**: `bug`, `feature`, `refactor`, `chore`
- **All**: `all` (includes completed)

### Common Workflows

**Capture ideas quickly:**
```
/plan-capture Fix the login timeout issue
/plan-capture Add dark mode support
/plan-capture Refactor auth module
```

**Work through your backlog:**
```
/plan-status                    # See what's pending
/plan-elaborate 1               # Research task #1
/plan-start 1                   # Begin work
/plan-execute 1                 # Continue work
/plan-complete 1                # Done!
```

**Check progress:**
```
/plan-status                    # Full dashboard
/plan-list bug                  # All bug tasks
/plan-list in-progress          # What's active
```

---
