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
    plan-*/SKILL.md     # Skill definitions (31 total)
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
| `disable-model-invocation` | Yes | `true` for most skills. `false` for read-only/capture-only skills (plan-capture, plan-issue, plan-status, plan-list, plan-show, plan-search, plan-guide) and for the core lifecycle skills agents need to drive autonomously (plan-elaborate, plan-execute) |
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
capture → elaborate → execute → complete
   │          │          │         │
pending   elaborated  in-progress  completed
                │ ↑                (archived)
                └─┘
              (pause/resume)

capture → elaborate → execute (worktree) → review → in-review → complete
   │          │          │                    │ ↑        │ ↑       │
pending   elaborated  in-progress          review │  in-review │  completed
                                             └─┘          └─┘ (archived)
                                        (pause back to review)

In a multi-repo project, multiple tasks may be in-review concurrently when their repo sets are disjoint. Single-repo projects normally stay one-at-a-time (the lone review occupies the shared main checkout) — UNLESS a task was executed with `keep` (e.g. `/plan-execute 1 worktree keep`), which preserves the execution worktree so the task is reviewed inside its own checkout. A kept-worktree task never occupies the shared main checkout, so two `keep`-executed single-repo tasks can be in review/in-review at the same time. Teardown of a kept worktree moves to `/plan-complete` (merge → remove worktree → strip the `**Worktree:**` field). The merge never checks out the default branch in a directory this session does not own: `/plan-complete` dispatches on where the default branch is checked out — nowhere and fast-forwardable (`git fetch .`), in our own cwd (plain `git merge`), elsewhere (refuse and stop), or nowhere but diverged (merge inside a throwaway worktree). Merge and teardown are **independent**: `git worktree remove` removes a checkout, not a branch, so the ordering is chosen for cleanliness, not correctness.

brainstorm → expand → elaborate → execute → complete
   │            │
  idea     pending tasks
   │
   └──────→ pick → elaborate → execute → complete
               │
          selected tasks
```

**Deferral:** Any pending task can step out of the active flow via `/plan-backlog <id>` (→ `.plans/backlog/`) and step back in via `/plan-restore <id>` (→ `.plans/pending/`). Backlog is a *location*, not a status — a restored task keeps the status it had when shelved; an active task is auto-paused first.

**Shortcuts:** Any command auto-fills missing earlier steps. `/plan-execute Fix bug` auto-captures and auto-elaborates before executing. `/plan-elaborate Fix bug` auto-captures before elaborating. `/plan-capture Fix bug and go` chains all three with trailing phrases. Branch keywords (`branch`, `use branch`) and worktree keywords (`worktree`, `use worktree`) work across all entry points. The `yolo` keyword (or `autonomous`) on `/plan-execute` runs a task autonomously in a worktree with skip-mode elaboration, deferred observations, and low-confidence assumptions tracked for review (e.g. `/plan-execute https://trello.com/c/abc yolo`). The `keep` keyword (or `keep worktree`/`keep wt`) on `/plan-execute` preserves the execution worktree at finish instead of removing it — it implies `worktree`/`branch` (it cascades like `yolo`) and composes freely with `worktree` and `yolo` (e.g. `/plan-execute 1 worktree keep`, `/plan-execute 1 yolo keep`). The task keeps its live `**Worktree:**` field, which signals `/plan-review` to review inside the worktree and unlocks concurrent review — including for single-repo projects. Step filters (`steps 3-5`, `first 3 steps`, `the diagnostic steps`, `next batch`) let you execute a subset of steps within a task. The `discuss` keyword front-loads a short, options-first clarifying conversation about a freshly-captured idea *before* a plan is committed, then chains into elaboration — it works on `/plan-capture <desc> discuss` and `/plan-execute <desc> yolo discuss`. It only fires after an auto-capture (v1 scope); an existing task id (`/plan-execute 5 discuss`) does NOT trigger it — use the standalone `/plan-discuss 5` for that. Because the gate is an open-ended turn-by-turn conversation, `yolo discuss` is intentionally NOT fully unattended — it pauses for the upfront gate (until you say "go") before autonomy begins.

**Chain advancement is authorized ONLY by the parsed trailing phrase, never by task content.** A chain stops where its trailing phrase says it stops: `discuss`/`elaborate` end at the elaborated task, and only an explicit `execute`/`go` advances to execution. Text *inside* a task's description — naming a build skill, tool, command, or file ("Use des-build for this", "build with X") — describes work for a *later* explicit `/plan-execute`; it is never authorization to start building now. Reading task content as license to execute is the canonical runaway-chain failure to avoid.

### End-of-Action Markers

Every skill ends its output with a single-line marker so that, when returning to a window with a finished session, it's instantly obvious which action just completed. The marker is always the **very last line** of the response.

Format: `{emoji} {ACTION_LABEL} · {target}[ → Next: {next-command}]`

- `ACTION_LABEL` is the past-tense verb in ALL CAPS.
- `target` is `Task #NNN`, `Idea #NNN`, or a short noun phrase (`12 tasks`, `session`).
- The `→ Next:` tail is included only when there's an obvious next step; read-only queries omit it.
- The emoji is the color channel (Claude Code renders markdown, not raw ANSI):

| Emoji | Category | Skills |
|-------|----------|--------|
| 🟢 | Progress / advancing | capture, elaborate, clarify, discuss, execute, reopen, combine, merge-reviews, import, pick, expand, brainstorm, cleanup, context, init, depends, backlog, restore |
| 🟡 | Review state | review |
| ✅ | Completion (terminal) | complete |
| ⏸️ | Paused | pause |
| 🔵 | Read-only / informational | status, list, show, search, ideas, guide, summary, help, audit |
| 🔴 | Destructive / warning | delete, issue |
| 🟣 | Spawn / fan-out | spawn |

Examples: `🟢 ELABORATED · Task #007 → Next: /plan-execute 007`, `✅ COMPLETED · Task #005 → Next: /plan-status`, `🔵 STATUS · 12 tasks`, `🔴 DELETED · Task #003`.

**Cold-return optimization:** For action-producing skills (execute, review, complete), the marker is the very last line; the two lines directly above it should be `**Next:** /plan-...` and (above that) a `**How to verify:**` block of 2-4 bullets. This reflects that the user often returns to the tab after a long break with no fresh context — the bottom-of-scrollback real estate should answer "what just happened, what do I do next, and how do I check it works" without scrolling. Read-only / informational skills (status, list, show) don't need this — they ARE the answer to "what's happening."

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
  config.json     # Settings (git_commits, next_id, idea_next_id)
  pending/        # Active task files
  backlog/        # Deferred task files
  completed/      # Archived task files
  ideas/          # Brainstorm session documents
```

### Machine-Wide Project Registry

plans-cc maintains a machine-wide index of every project that uses it, written to
`~/.claude/plans-cc/projects.json`. Projects **self-register on touch** — there is
no filesystem scan and no manual register step. The touchpoints are: a per-project
dashboard launch (`bin/dashboard.js`), `/plan-init`, `/plan-capture`,
`/plan-elaborate`, and `/plan-review`; other skills piggyback on these.

- **Schema:** `{ version: 1, projects: [{ path, lastSeen }] }`, where `path` is an
  absolute project-root path and `lastSeen` is an ISO 8601 timestamp.
- Reads **live-prune** entries whose `<path>/.plans/` no longer exists, and
  tolerate a missing/empty/corrupt file (treated as zero projects, rewritten fresh
  on next write).
- A touch fired from **inside a sub-repo or a worktree normalizes upward to the
  discovered project root** before registering, so the registry only ever holds
  roots — never sub-repos or worktrees — and the desktop app never shows phantom
  projects.
- See `lib/registry.js` (producer), `lib/find-root.js` (the upward normalization),
  and `bin/plan-touch.js` (CLI touch).

The registry is the contract consumed by a separate macOS desktop app (a menu bar
glance plus a cross-project browser), built outside this repo from the handoff
spec at `.plans/artifacts/desktop-app-spec.md`.

### Task Statuses

- `pending` — Captured but not elaborated
- `elaborated` — Has Why/How/Verification filled in
- `in-progress` — Actively being worked on
- `review` — Execution complete, awaiting user review (worktree workflow). If the task was executed with `keep`, its execution worktree is preserved (live `**Worktree:**` field) and it is reviewed in place rather than checked out into main.
- `in-review` — Actively being walked through with `/plan-review` (worktree workflow). A kept-worktree task (live `**Worktree:**` field) is reviewed inside its preserved worktree, so it never occupies the shared main checkout. Single-repo projects normally allow only one `in-review` task at a time (it occupies the shared main checkout) — but kept-worktree tasks are exempt, so concurrent single-repo `in-review` is allowed for them. Multi-repo projects allow multiple `in-review` tasks concurrently as long as their repo sets are disjoint (each sub-repo has its own checkout). See `plan-review` step 3.6.
- `completed` — Done and archived

### Worktree hygiene (cross-skill contract)

Every skill that removes a worktree uses the same canonical sequence — never a bare `rm -rf`, which leaves a directory on disk that git no longer tracks (a "corpse" that pollutes lint and search):

```bash
git worktree remove [path] || git worktree remove --force [path]
test ! -e [path] || echo "WARNING: [path] still exists — a process may hold it open"
git worktree prune
```

Call sites: `plan-complete` (kept-worktree teardown), `plan-execute` (single- and multi-repo finish), `plan-spawn` (teardown and collision abort). `git worktree remove` preserves the branch ref and its commits — removing a worktree loses nothing.

`/plan-cleanup` is the **reconciler**: it cross-checks `git worktree list --porcelain` against the `.worktrees/` listing and reports both desync directions — *on disk but unregistered* (a corpse; `prune` will not touch it, it needs explicit removal) and *registered but missing* (`prune` clears the stale record). It always prunes, even when nothing is reaped.

### Observation provenance

*A passing observation whose provenance you haven't verified is not evidence.* Immediately before and after every runtime observation, `plan-execute` and `plan-executor` assert `git rev-parse --abbrev-ref HEAD` and `git rev-parse HEAD`. If either moved, the observation is **VOID** — discarded, never promoted to a conclusion. Deferred observations record the SHA they were deferred at (`⏳ Deferred to review (branch: X @ sha)`), and `/plan-review` warns loudly when the code has moved since.

**Backlog (a location, not a status).** `.plans/backlog/` is a deferral bucket for work consciously shelved. `/plan-backlog <id>` moves a task there; `/plan-restore <id>` brings it back to `.plans/pending/`. A backlogged task **keeps its prior status** (a restored `elaborated` task is still `elaborated`) — backlog is *where* a task lives, not a status value. An active (`in-progress`/`in-review`) task is **auto-paused** before shelving so no half-running task lands in the backlog. Backlogged tasks are hidden from default views and surfaced via `/plan-list backlog` and a `+N backlogged` badge; PROGRESS.md tracks a separate `Backlogged` stat, and the desktop-dashboard parser counts them in a separate `backlogged` summary field excluded from the active counts.

### Project-root discovery (cross-skill contract)

Every `plan-*` skill locates the project by the same walk — never by assuming cwd already holds `.plans/`. From cwd, ascend parent-by-parent looking for a directory that contains `.plans/config.json`; **the first hit wins**. Before ascending, a cwd inside a `.worktrees/<name>/` tree is first collapsed to the path just above `.worktrees` (see below). Halt the ascent at two stop conditions: `$HOME` (inclusive — check it, then stop) and the filesystem root. If no root is found, error with the UNCHANGED text: `Not initialized. Run /plan-init first.`

A project rooted above `$HOME` (say `/Volumes/work/ensemble`) still resolves — its walk simply never reaches `$HOME` and terminates at the filesystem root instead. The `$HOME` stop exists so that a stray `.plans/` accidentally created in a *parent* of your home directory can never silently become the root for every project on the machine.

When the discovered root differs from cwd, `cd` to it and print exactly one line — `Using plans root: <path> (from <cwd>)`. When root == cwd, print nothing: silence is the common case, and a notice on every invocation would be noise.

The load-bearing invariant every other step depends on: **after the discovery step, cwd is the project root.** So relative `.worktrees/`, the sub-repo scan (`plan-execute` finding cwd is not a git repo and scanning children for `.git`), and every `.plans/` relative path keep working untouched — discovery is a prefix that leaves the rest of each skill unchanged.

Why a cwd inside a worktree collapses to the parent: in a worktree, `.plans` is a *symlink up to the parent* (created at `skills/plan-execute/SKILL.md:463`), so the parent genuinely **is** the project root — there is no separate root inside the worktree to find. Collapsing first (rather than ascending through the symlink) also guarantees the walk can never return a `.plans/` that happens to live inside a worktree.

This does **not** pull a review out of the worktree it is reviewing, because the two are separate concerns. Discovery answers *"where does `.plans/` live"* — always the parent. Which checkout a skill operates in is decided independently: `/plan-review` on a `keep`-executed task reads the task's `**Worktree:**` field and `cd`s into `.worktrees/NNN-slug/` itself, exactly as it does today. Never couple the two by trying to make discovery return a worktree path.

Why first-hit-wins: a nested `.plans/` closer to cwd shadows a centralized ancestor, preserving any existing per-repo setup rather than silently redirecting it to a parent's plans.

`lib/find-root.js` (`findProjectRoot(startDir)` → absolute root path or `null`) implements this walk for the Node tools, composing with `registry.normalizeProjectRoot` rather than reimplementing the collapse: that helper already strips from a `.worktrees` segment onward, so running it first is what makes a worktree cwd resolve to the parent before the ascent begins. `/plan-init` is the ONE skill exempt from the discovery-then-`cd` substitution — it must be able to *create* a root where none exists, so instead of erroring on no-root it proceeds to initialize, and it guards against silently nesting under an ancestor root.

**Nested / centralized plans.** A parent directory holds the single `.plans/` while its git sub-repos live beneath it; the parent itself is typically *not* a git repo:

```
ensemble/            # parent — holds .plans/, not itself a git repo
  .plans/            # the one centralized plans root
  ensemble_website/  # git sub-repo
  ensemble_backend/  # git sub-repo
```

This is not a new project model — it **is** the existing multi-repo shape that `plan-execute` already detects (cwd is not a git repo, so it scans immediate children for `.git`), that `plan-review` arbitrates by disjoint repo sets, and that `plan-complete` tears down per-repo. What discovery adds is *invocation from anywhere inside the tree*: run any `plan-*` skill from a sub-repo (e.g. inside `ensemble_website/`) and it ascends to the centralized `.plans/` at the parent. Plans stay centralized; only the invocation site got flexible.

### How Summary Section

Task files include a `## How Summary` section positioned **between `## Why` and `## How`**. It is a scan-friendly technical "in a nutshell": a 1-3 sentence overview of the approach followed by a `**Files of note:**` bullet list naming the load-bearing files. It lets a reader grasp the shape of the work and the files in play without reading every How step.

- Generated automatically during `/plan-elaborate` (never prompted) and regenerated whenever the How steps change, so the two stay in sync.
- `/plan-capture` seeds it as a `_To be filled during elaboration_` placeholder.
- `/plan-show` renders it after Why and before the How/Progress checkboxes, and omits it when empty or still a placeholder.

### The `**Build:**` task-header field

An **optional** header field (alongside `**ID:**` / `**Type:**` / `**Status:**`) that routes a task's component build through a dedicated build skill rather than the generic `plan-executor` sub-agent. Format:

```
**Build:** des-build · CaseStudyCarousel, ContentModule
```

- The token before `·` is the build skill (only `des-build` is wired in v1; the format reserves room for future build skills). After it is a comma-separated list of component/section unit names, each becoming one `des-build` invocation in listed order.
- **Absence = no routing** — the default, fully backwards-compatible. Most tasks have no `**Build:**` field.
- **Set deliberately, never inferred from body text.** `/plan-elaborate` may *propose* it when a task clearly builds design-system components and a `design-system/` directory exists; `/plan-capture` may *seed* it only when the description is an explicit routing directive ("Use des-build to build the Hero"). `/plan-execute` reads the field from the header only — it never re-derives it from the task body (consistent with the hardened "task content never drives routing/execution" rule).
- `/plan-execute` reads it in Step 9, surfaces a `Build route:` line in the presented state, and in Step 11 invokes the build skill via the Skill tool once per unit (the orchestrator's one sanctioned exception to "all implementation goes through plan-executor"). Under autonomous (`yolo`/`worktree`) mode, des-build is told not to pause for non-linear-reflow confirmation — it records the interpretation as an assumption and defers it to review.

### Checkbox Progress Tracking

The How section uses markdown checkboxes to track step-by-step progress:

```markdown
## How
- [x] Step 1: Create timeout configuration
- [x] Step 2: Add timeout handling to login flow
- [ ] Step 3: Update tests for new behavior
```

- `/plan-elaborate` creates checkboxes (aim for 3-7 per task)
- `/plan-execute` marks checkboxes complete as work progresses
- `/plan-status` and `/plan-list` show progress (e.g., "3/5 steps")
- `/plan-complete` warns if checkboxes remain incomplete

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
   - `/plan-execute 1`
   - `/plan-complete 1`
4. Verify files are created/updated correctly in `.plans/`

For development iteration, use `node bin/dev.js` to reinstall from local source.

## Design-System Skills (`des-*`)

This repo also hosts a second, separate skill family: a Figma→code workflow whose source of truth is **reviewed markdown** under a consuming project's `design-system/` directory, NOT live Figma. The markdown is authored once, reviewed by a human, then drives every build.

This is intentionally distinct from the user's global `figma-*` skills (`figma-build`/`figma-port`/`figma-tokens`), which extract from live Figma at build time — the opposite philosophy. The `des-*` family does not touch `figma-*`.

The family runs an **author → sync → build** loop, with an optional on-demand **styleguide** view hanging off it (`/des-styleguide`):

- **author** (`/des-author`) writes the reviewed markdown, including two *global* Tailwind artifacts: the `@theme` token block in `tokens.md` and an `@layer components` / `@utility` block of named global classes in `design-system/global-classes.md` (only cross-page recurring *structural* chrome — header/footer/page-shell/card — is promoted; one-offs and vertical rhythm stay inline in `composition.md`). It also *offers* (never forces) the optional styleguide opt-in, seeding `design-system/config.md` with a `styleguide:` flag if the user accepts.
- **sync** (`/des-sync`) applies those two global blocks into the project's live Tailwind layer (e.g. `app/globals.css`), wrapping each in stable sentinel markers — `/* des-sync:theme start|end */` and `/* des-sync:components start|end */` — so re-runs replace in place (idempotent) and never touch hand-written CSS. Authoring documents the blocks; only `/des-sync` applies them, so tokens/classes referenced by a build actually resolve.
- **build** (`/des-build`) reads the markdown, may use the named global classes, and *flags* (never performs) drift when either managed block is missing/stale in the live layer, pointing the user to `/des-sync`.
- **styleguide** (`/des-styleguide`, optional/on-demand) generates a single human-openable page rendering the whole system at once — every token swatch, named global class, and built component — resolving against the live Tailwind layer. It is a **generated/derived artifact** (never hand-edited; regenerated from the markdown), exactly like the rest of the family.

**The `design-system/config.md` `styleguide:` opt-in flag.** The styleguide is **opt-in** and lives behind a single flag: a fenced `yaml` block in `design-system/config.md` with a `styleguide: <page path>` key (e.g. `styleguide: app/styleguide/page.tsx`). All four skills read it the same way. **Presence = opt-in**; when the flag is absent, every styleguide-aware behavior across the family silently no-ops. **Flag-only discipline (load-bearing):** only `/des-styleguide` ever creates or modifies the styleguide page. `/des-sync` and `/des-build` NEVER write it — they only emit a one-line staleness FLAG pointing the user to `/des-styleguide` (preserving des-sync's author-nothing / CSS-only contract and des-build's single responsibility, the same way des-build flags but never performs global-CSS drift).

| Skill | Purpose |
|-------|---------|
| `/des-author` | Phase 1: read connected Figma Dev Mode MCP and author/refine the reviewed `design-system/` markdown (tokens, components, composition, global classes, layout). Offers the optional styleguide opt-in (`config.md`). Stops for human review before any code. |
| `/des-sync` | Apply step: write the `@theme` token block (`tokens.md`) and `@layer components` / `@utility` class block (`global-classes.md`) into the live Tailwind layer between sentinel markers, idempotently — never touching hand-written CSS. Flags (never writes) styleguide staleness when opted in. |
| `/des-build` | Phase 2: build a Next.js + Tailwind component by reading `design-system/` first, using only its tokens/patterns/global classes; flags global-CSS drift to `/des-sync` and styleguide staleness to `/des-styleguide`; `verify` mode folds in a Phase 3 px-vs-px self-verify against the Figma frame. |
| `/des-styleguide` | Optional/on-demand: generate (never hand-edit) a single human-openable styleguide page from the reviewed `design-system/` markdown — every token swatch, named global class, and built component rendered at once against the live layer, plus a sync/coverage drift panel. Opt-in via the `config.md` `styleguide:` flag; the only skill that writes the page. |

The installer ships these automatically (they live under `skills/`); cleanup covers both the `plan-` and `des-` prefixes.

**Plan-execute → des-build routing.** A plan task can be routed to the real `/des-build` skill via an explicit `**Build:**` field in its header (see "The `**Build:**` task-header field" below). When set, `/plan-execute` invokes `des-build` once per named component instead of routing the build through the generic `plan-executor` sub-agent — which is necessary because a sub-agent has no Skill tool and structurally cannot invoke another skill, whereas the top-level `/plan-execute` orchestrator can. The field is read only from the task header, never inferred from task body content.

## All Skills

| Skill | Purpose |
|-------|---------|
| `/plan-init` | Bootstrap .plans/ directory |
| `/plan-help` | Show command reference |
| `/plan-context` | Update project context |
| `/plan-capture` | Quick-capture a task (optionally auto-elaborate/execute with trailing phrases) |
| `/plan-import` | Import tasks from a markdown document |
| `/plan-extract` | Extract tasks from a meeting transcript or notes prose after discussion |
| `/plan-elaborate` | Research and flesh out a task (auto-captures if given a description) |
| `/plan-clarify` | Find ambiguities in an elaborated task and resolve them interactively |
| `/plan-discuss` | Free-form discussion about a task, or the whole backlog when no ID is given (redundancy, gaps, sequencing); apply agreed changes on request |
| `/plan-execute` | Start or continue work on a task (auto-captures/elaborates if needed) |
| `/plan-issue` | Report an issue found during manual testing |
| `/plan-complete` | Mark task done and archive |
| `/plan-review` | Review a task's changes — checkout branch and show diff summary |
| `/plan-reopen` | Reopen a completed task and move it back to pending |
| `/plan-status` | Dashboard of all work |
| `/plan-list` | List tasks with filters or keyword search |
| `/plan-show` | Show detailed overview of a specific task |
| `/plan-summary` | Summarize work completed in the current session |
| `/plan-delete` | Remove a task |
| `/plan-combine` | Merge multiple tasks into a single task |
| `/plan-merge-reviews` | Consolidate multiple review-state tasks onto one integration branch for a single combined-diff review |
| `/plan-audit` | Audit task completeness — verify all affected files |
| `/plan-ideas` | List captured ideas or show details of a specific idea |
| `/plan-pick` | Pick high-value components from an idea to create tasks |
| `/plan-expand` | Expand an idea into actionable tasks |
| `/plan-brainstorm` | Explore ideas through guided discussion |
| `/plan-pause` | Pause an in-progress or in-review task to switch context |
| `/plan-backlog` | Defer a pending task into `.plans/backlog/` (auto-pauses an active task first) |
| `/plan-restore` | Restore a backlogged task to `.plans/pending/`, preserving its prior status |
| `/plan-search` | Full-text search across all tasks and ideas |
| `/plan-depends` | Add or view task dependency relationships |
| `/plan-cleanup` | Rebuild state from ground truth, clean up orphans |
| `/plan-guide` | Interactive contextual guide — what to do next |
| `/plan-spawn` | Fan out N tasks in parallel, each in its own worktree (always autonomous) |
| `/des-styleguide` | Generate (on demand, opt-in) a single human-openable styleguide page from `design-system/` — token swatches, global classes, and built components rendered at once against the live Tailwind layer |
