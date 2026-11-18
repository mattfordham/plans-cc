# Project Context

**Project:** plans-cc
**Updated:** 2026-10-05

## Overview
Lightweight task management for Claude Code, implemented as a set of skills. Users install via `npx plans-cc`, which copies skills to `~/.claude/skills/` and a small Node runtime (dashboard, project registry, `.plans/` commit/sync helper `plans-git.js`) to `~/.claude/plans-cc/`. Skills are declarative SKILL.md files that call the runtime by path.

## Tech Stack
- Node.js (>=16.7.0), CommonJS
- One runtime dependency (`blessed`, dashboard only). `lib/` and `plans-git.js` use no dependencies.
- `node:test` for the runtime. Skills are tested manually.

## Structure
```
plans-cc/
  bin/          # install.js, dev.js, dashboard.js, plan-touch.js, plans-git.js
  lib/          # find-root, registry, plans-git, parse-tasks, render-progress, render-dashboard
  test/         # *.test.js (node:test), incl. branch-mode.integration.test.js
  skills/       # 40 skills: plan-* (36) and des-* (4)
  agents/       # plan-executor.md sub-agent
  .plans/       # Task management data (gitignored as `.plans`, slashless)
  CLAUDE.md     # Cross-skill contracts
  README.md
```

## Testing
- **Framework:** `node:test` (built in)
- **Location:** `test/*.test.js`
- **Run:** `npm test`, or `node --test test/<file>.test.js` for one file. The plans-git and integration tests drive real git in temp repos.
- **Skills:** test manually through the task lifecycle in a scratch project (`node bin/dev.js` symlinks skills into `~/.claude`).

## Key Patterns
- Skills are pure markdown (SKILL.md) with YAML frontmatter
- Installer copies files; dev script symlinks for live editing
- Task lifecycle: capture → elaborate → execute → (review) → complete
- Task IDs: 3-digit zero-padded (001, 002, etc.)
- Task files: `NNN-slug.md` in `pending/` or `completed/`

## Notes
- Most skills are user-invoked only (`disable-model-invocation: true`). See CLAUDE.md for the exceptions.
- Scratch git work in tests or by hand must use `git -C <abs path>`, so a failed `cd` can't leak commits into this repo.
