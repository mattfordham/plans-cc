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
/plan-execute 1         # Start or continue work on task #1
/plan-complete 1        # Mark task #1 done
```

### All Commands

| Command | Description |
|---------|-------------|
| `/plan-init` | Bootstrap `.plans/` directory structure |
| `/plan-help` | Show this command reference |
| `/plan-context` | Update project context (tech stack, patterns) |
| `/plan-capture [description] [and elaborate\|execute\|go]` | Quick-capture a new task (optionally auto-proceed) |
| `/plan-import <file>` | Import tasks from a markdown document |
| `/plan-elaborate <id\|description>` | Research and flesh out a task (auto-captures if given description) |
| `/plan-discuss <id> [topic]` | Free-form discussion about an elaborated task; apply changes on request |
| `/plan-execute <id\|description>` | Start or continue work (auto-captures/elaborates if needed) |
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
| `/plan-summary` | Summarize work completed in the current session |
| `/plan-pause <id>` | Pause an in-progress task to switch context |
| `/plan-search <query>` | Full-text search across all tasks and ideas |
| `/plan-cleanup` | Rebuild state from ground truth, clean up orphans |
| `/plan-depends <id> [blocked by <id>\|clear\|show]` | Add or view task dependencies |
| `/plan-guide` | Interactive contextual guide — what to do next |

### Task Lifecycle

```
capture → elaborate → execute → complete
   │          │          │         │
pending   elaborated  in-progress  completed
                                   (archived)

With worktrees:
capture → elaborate → execute (worktree) → review → complete
                         │                    │         │
                      in-progress           review   completed
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
  ideas/          # Brainstorm session documents
```

### Filters for /plan-list

- **Status**: `pending`, `elaborated`, `in-progress`, `review`, `completed`
- **Type**: `bug`, `feature`, `refactor`, `chore`
- **All**: `all` (includes completed)
- **Search**: any non-keyword text is treated as a search query (e.g., `/plan-list auth`)

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
/plan-execute 1                 # Start or continue work
/plan-complete 1                # Done!
```

**Check progress:**
```
/plan-status                    # Full dashboard
/plan-summary                   # What was done this session
/plan-list bug                  # All bug tasks
/plan-list in-progress          # What's active
/plan-show 1                    # Deep dive on task #1
```

**Fast track (skip earlier steps automatically):**
```
/plan-capture Fix the login timeout and go         # Capture → elaborate → execute
/plan-capture Add dark mode and elaborate           # Capture → elaborate
/plan-capture Fix crash then execute with branch    # Full pipeline with git branch
/plan-capture Fix crash then go with worktree       # Full pipeline with worktree isolation
/plan-elaborate Fix the login timeout               # Auto-capture → elaborate
/plan-execute Fix the login timeout                 # Auto-capture → elaborate → execute
/plan-execute Fix crash branch                      # Full pipeline with git branch
/plan-execute Fix crash use worktree                # Full pipeline with worktree isolation
```

**Switch between tasks:**
```
/plan-execute 1                 # Start task #1
/plan-pause 1                   # Pause to switch context
/plan-execute 2                 # Work on task #2
/plan-execute 1                 # Resume task #1 where you left off
```

**Search and dependencies:**
```
/plan-list auth                 # Find tasks mentioning "auth"
/plan-search timeout            # Full-text search across tasks and ideas
/plan-depends 3 blocked by 1    # Mark task #3 as blocked by task #1
/plan-depends 3                 # Show dependency status for task #3
```

**Worktree workflow (parallel task execution):**
```
/plan-execute 3 use worktree              # Execute in isolated worktree
# ... AI works in .worktrees/003-slug/ ...
# ... status set to review, worktree cleaned up ...
/plan-review 3                            # Checkout branch, see diff summary
# ... manually test the changes ...
/plan-complete 3                          # Merge branch to main, archive task
```

**Explore ideas:**
```
/plan-brainstorm API redesign   # Start exploring a topic
# ... discuss and explore ...
capture this                    # Save the synthesized discussion
/plan-ideas                     # See all captured ideas
/plan-ideas 1                   # View details of idea #1
/plan-pick 1                    # Pick best components from idea #1
/plan-expand 1                  # Decompose entire idea into tasks
```

---
