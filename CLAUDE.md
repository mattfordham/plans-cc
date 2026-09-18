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
| `disable-model-invocation` | Yes | `true` for most skills. `false` for read-only/capture-only skills (plan-capture, plan-issue, plan-status, plan-list, plan-show, plan-explain, plan-search, plan-guide), for the core lifecycle skills agents need to drive autonomously (plan-elaborate, plan-execute), and for plan-delete (model-invocable despite being destructive — its explicit `yes` confirmation step is the guardrail) |
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
| 🟢 | Progress / advancing | capture, elaborate, clarify, discuss, execute, reopen, combine, merge-reviews, import, pick, expand, brainstorm, cleanup, context, init, depends, backlog, restore, retrospect (seed) |
| 🟡 | Review state | review |
| ✅ | Completion (terminal) | complete |
| ⏸️ | Paused | pause |
| 🔵 | Read-only / informational | status, list, show, explain, search, ideas, guide, summary, help, audit, retrospect (report/across) |
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
  config.json     # Settings (git_commits, next_id, idea_next_id, plan_comments, models)
  pending/        # Active task files
  backlog/        # Deferred task files
  completed/      # Archived task files
  ideas/          # Brainstorm session documents
```

### HISTORY.md Summary cap (cross-skill contract)

`.plans/HISTORY.md` is an **index**, not a second archive — the full record of a completed
task always lives in `.plans/completed/NNN-slug.md`. Its Summary cell is therefore capped:
exactly ONE sentence of the form `<verb-phrase> — <what changed>`, followed by a
` → completed/NNN-slug.md` pointer to the full record, **≤250 chars for the sentence and
pointer together**. The shape is the primary constraint; the char count is the backstop.
Never paste multi-paragraph postmortems, root-cause narratives, disproved hypotheses, or
file-by-file breakdowns into the cell — that content already exists in the completed file.
The pointer lives *inside* the existing Summary cell, not as a sixth column; the 5-column
table is already on disk in every live project.

History is **append-only and is NEVER pruned** — only row *size* is capped, never row
*count*. `/plan-retrospect` mines HISTORY.md by name as a lesson corpus, so deleting rows
would quietly degrade retrospectives. `/plan-complete` step 11 is the sole **append** path
and the single source for this wording; `/plan-cleanup history` is the only **in-place
rewrite** path (it never appends, never prunes, and only ever touches the Summary cell).
`/plan-init` seeds the convention as a comment inside the generated HISTORY.md. Row consumers
(`plan-reopen`, `plan-delete`) key on the `| NNN |` first column and never parse the Summary
cell, so the cap is behavior-preserving.

A regenerated Summary must **never contain a raw `|`** — the pipe is the table's column
delimiter, so one stray character silently splits the row into 6+ columns with no error.
Escape it as `\|`, or preferably rephrase so it isn't needed.

**Backfill of pre-cap rows (optional, one-time, per consuming project).** Projects whose
HISTORY.md predates the cap may hold fat rows. Shrinking them is `/plan-cleanup history` —
a gated, opt-in mode on an existing skill, deliberately **not** a new skill and **not** a
script — run *in the affected project*, never in the plans-cc repo. For each over-cap row it
re-reads `.plans/completed/NNN-slug.md`, regenerates a one-sentence ≤250-char summary plus the
` → completed/NNN-slug.md` pointer, and rewrites that row in place, producing rows
indistinguishable in form from what `plan-complete` step 11 writes for a fresh completion. It
previews its first 3 rewrites for approval before the full pass, skips (and reports) rows it
cannot source from a `completed/` file, and is idempotent — an interrupted pass resumes by
simply re-invoking it, because already-capped rows are skipped. It is **non-destructive**:
same row count, same IDs, dates, titles, and types — only the Summary cell shrinks. It is
entirely **safe to skip**, since the cap governs future completions regardless. *Running* this
backfill against any consuming project is out of scope for the tasks that shipped it; the
procedure and its invocable form are the deliverable.

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

It reconciles data the same way it reconciles worktrees: a full sweep also reports **HISTORY.md cap drift** — rows whose Summary exceeds 250 chars or lacks the ` → completed/NNN-slug.md` pointer — as a third desync direction. That one is **flag-only**: the sweep never rewrites a row, it points at `/plan-cleanup history` (the same discipline `des-build` uses when it flags global-CSS drift and points at `/des-sync`), because re-deriving a summary is an LLM judgment call per row, not a mechanical fix.

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

### Worktree links (`worktree_links`) — cross-skill contract

`git worktree add` checks out **tracked files only**. Anything gitignored — `design-system/`,
`.env.local`, local fixtures — is simply **absent** from a fresh worktree. This is guaranteed
for every gitignored path, not an intermittent fault, and it is silent: the worktree looks
complete. A skill whose source of truth lives in a gitignored directory will therefore find
nothing there and, if it lacks an input gate, quietly build from whatever else it can infer.

An optional `worktree_links` array in `.plans/config.json` names paths (relative to the
project root) to symlink into each newly created worktree:

```json
"worktree_links": ["design-system", ".env.local"]
```

- **Absent ⇒ today's behavior exactly** — only `.plans/` is symlinked, byte-identical to what
  every existing project does now. Same absence discipline as `models`.
- Call sites: `plan-execute` step 7e.5b (single-repo) and 4b (multi-repo), `plan-spawn` step b.5.
  Each entry that exists at the project root is symlinked to its absolute source path; an entry
  that does not exist is **skipped with a one-line warning**, never a failure — a stale config
  entry must not block execution.
- **Deliberately an allowlist, never an auto-scan of gitignored dirs.** Auto-linking everything
  git ignores would sweep in `node_modules/`, `.next/`, `dist/`, `.turbo/` — sharing one build
  cache across concurrent worktrees causes real corruption. The set of gitignored dirs that are
  *shared inputs* is small and human-chosen; the set that are *per-checkout build state* is
  large and must stay isolated.
- **Not seeded by `/plan-init`** — same reasoning as `models`: a generated key reads as an
  instruction to tune something most projects should leave alone. Documented here, honored when
  hand-added.
- **Teardown safety.** These are **live** symlinks to real directories, unlike the dangling
  ones teardown previously assumed. `git worktree remove` is safe. The multi-repo `rm -rf`
  path is safe only because `rm -rf` unlinks a symlink rather than following it — so it is
  preceded by an explicit `find .worktrees/NNN-slug -maxdepth 1 -type l -delete`, and must
  **never** be weakened to a dereferencing form (a trailing slash, `/*/`, `find -L`), which
  would delete the real `design-system/` at the project root. Call sites: `plan-execute`
  multi-repo teardown, `plan-complete` kept-worktree teardown.

**A symlink is not a substitute for an input gate.** `worktree_links` makes the input
*available*; it cannot make a skill *check* that it loaded. Both halves are required — see
`des-build`'s Step 1 preflight gate, which aborts when its inputs are unreachable rather than
degrading. A missing input that produces a plausible artifact is worse than one that errors,
because a build from nothing still typechecks, lints, and returns HTTP 200, and therefore
**reports as a clean success.** Verifying the build is not verifying the inputs.

### Model selection (cross-skill contract)

The model a `plan-*` skill spawns sub-agents with is **configuration, not a hardcoded constant** — an optional `models` object in `.plans/config.json` maps a *role* to a model name, and the spawn sites read it instead of literalizing `"opus"`. Three roles exist, and only three:

```json
"models": {
  "executor": "opus",
  "research": "sonnet",
  "reasoning": "opus"
}
```

- **`executor`** — the model every `plan-executor` sub-agent spawn uses. Call sites: `plan-execute` (step 11c segment spawn, step 11c.6 observation-failure fix, step 13 issue resolution, step 14 testing/feedback fix), `plan-spawn` (parallel round spawn), `plan-review` (deferred-observation fix). Absent ⇒ `"opus"`, the value those sites hardcoded before this contract existed.
- **`research`** — the model for read-only research/analysis sub-agents that today spawn with no `model:` parameter at all. Call sites: `plan-elaborate` (two sites), `plan-audit`, `plan-status`, `plan-retrospect`, `plan-execute`. Absent ⇒ **omit the `model:` parameter entirely** — not `"opus"`, not any literal. Passing a default here would change today's behavior, because omitting the parameter lets the sub-agent inherit the session model.
- **`reasoning`** — consulted **only** on `/plan-elaborate`'s `deep` path, and nowhere else. Absent ⇒ the `deep` path behaves exactly as it does today.

**Absence = today's behavior, exactly.** A project with no `models` key — which is every existing project — must produce byte-identical spawn calls to what it produced before. That is why each role's absence-default is specified separately rather than sharing one: `executor` defaults to a literal, `research` defaults to *the absence of a parameter*, and collapsing those two into a single rule would silently pin research agents to a model they never used.

`models` is the first **nested object** in `config.json`; every prior key (`git_commits`, `next_id`, `idea_next_id`, `plan_comments`) is a flat scalar. Read it defensively: the key may be missing, and when present it may define only some roles.

**`models` is deliberately NOT seeded into `/plan-init`'s config template.** A generated config would either bake in values the user never chose, or add a key that reads as an instruction to tune something most projects should leave alone. The key is documented here and honored when hand-added — that is the whole opt-in surface.

**Only a Task-tool spawn site can honor a model key.** A skill body is markdown that Claude follows *in the main session*, on whatever model that session was launched with — a skill cannot switch its own model mid-run. So a role key only means something where a `Task` call actually names a model. A key like `models.elaborate` (or `models.review`, or any per-skill name) is **structurally inert**: nothing could ever read it, and it would sit in config.json looking functional while doing nothing. Never add one. Roles are named after *what kind of sub-agent gets spawned*, never after the skill that spawns it — which is precisely why there are three roles and not one per skill.

This failure mode has precedent in this repo: `segment_threshold` is written into every generated config by `skills/plan-init/SKILL.md:120` and **read by nothing** — `plan-execute` step 10 hardcodes "segments of 3-4 steps" regardless. It is a phantom key that has looked configurable for its entire existence. Do not grow the collection.

### How Summary Section

Task files include a `## How Summary` section positioned **between `## Why` and `## How`**. It is a scan-friendly technical "in a nutshell": a 1-3 sentence overview of the approach followed by a `**Files of note:**` bullet list naming the load-bearing files. It lets a reader grasp the shape of the work and the files in play without reading every How step.

- Generated automatically during `/plan-elaborate` (never prompted) and regenerated whenever the How steps change, so the two stay in sync.
- `/plan-capture` seeds it as a `_To be filled during elaboration_` placeholder.
- `/plan-show` renders it after Why and before the How/Progress checkboxes, and omits it when empty or still a placeholder.

### Diagnosis Section

Bug task files include a `## Diagnosis` section positioned **between `## How Summary` and `## How`**. It states the root-cause hypothesis **out loud**, so it can be reviewed. Without it the theory still forms — it just hides inside a How step, a causal claim with no stated evidence and no confidence.

- Generated automatically during `/plan-elaborate` for `bug`-type tasks only (never prompted), per the `### Diagnosis Generation` rules in that skill; regenerated whenever the How steps change, so the two stay in sync. Never emitted for `feature`, `refactor`, or `chore` tasks.
- **Not seeded by `/plan-capture`** — unlike How Summary, there is no placeholder. Elaboration inserts the section when it writes, following the `## Impact Scope` precedent for a conditionally-present section.
- `/plan-show` renders it after How Summary and before the How/Progress checkboxes for bug tasks, and omits it entirely otherwise.
- **It is a hypothesis, not a finding.** It carries an explicit `**Confidence:** high|medium|low` and a `**To confirm:**` line, and that To-confirm becomes Step 1 of `## How` — confirm the hypothesis, then fix, never the reverse. A disproved hypothesis is struck through and annotated (`~~[cause]~~ — disproved: [what ruled it out]`), never deleted: knowing what was already ruled out is the most valuable thing the section holds.

### The `**Build:**` task-header field

An **optional** header field (alongside `**ID:**` / `**Type:**` / `**Status:**`) that routes a task's component build through a dedicated build skill rather than the generic `plan-executor` sub-agent. Format:

```
**Build:** des-build · CaseStudyCarousel, ContentModule
```

- The token before `·` is the build skill (only `des-build` is wired in v1; the format reserves room for future build skills). After it is a comma-separated list of component/section unit names, each becoming one `des-build` invocation in listed order.
- **Absence = no routing** — the default, fully backwards-compatible. Most tasks have no `**Build:**` field.
- **Set deliberately, never inferred from body text.** `/plan-elaborate` may *propose* it when a task clearly builds design-system components and a `design-system/` directory exists; `/plan-capture` may *seed* it only when the description is an explicit routing directive ("Use des-build to build the Hero"). `/plan-execute` reads the field from the header only — it never re-derives it from the task body (consistent with the hardened "task content never drives routing/execution" rule).
- `/plan-execute` reads it in Step 9, surfaces a `Build route:` line in the presented state, and in Step 11 invokes the build skill via the Skill tool once per unit (the orchestrator's one sanctioned exception to "all implementation goes through plan-executor"). Under autonomous (`yolo`/`worktree`) mode, des-build is told not to pause for non-linear-reflow confirmation — it records the interpretation as an assumption and defers it to review.
- **A build route that cannot fire is a HARD FAILURE, never a fallback.** Invoking a build skill requires the `Skill` tool in `/plan-execute`'s `allowed-tools`. If it is unavailable — or a `Skill` invocation returns tool-unavailable — `/plan-execute` **aborts** with `🔴 BLOCKED · Task #NNN — build route <skill> could not be invoked`, leaving status unchanged and `## Changes` unwritten. It must NOT build the units in the main session, NOT reroute them to `plan-executor`, and NOT describe a unit as built by the build skill unless a `Skill` invocation observably ran. The reason is the whole point of the route: `des-build` **refuses** to build from missing inputs (Step 1 preflight — unreachable Figma MCP or unreadable `design-system/`). Generic execution reaches the same files with *none* of those gates and still typechecks, lints, and renders — so it reports as a clean success while being structurally unsourced. Same discipline as the `worktree_links` contract: **a silently-degraded build is strictly worse than no build**, because a build from nothing returns HTTP 200. This is not hypothetical — the `Skill` tool was missing from `allowed-tools` for the feature's entire existence, so every `**Build:**` task silently fell through to generic execution while its task record claimed des-build had run.
- **The field must actually get set, or every guard downstream is dead code.** `/plan-elaborate` evaluates the route on **every** elaboration (including re-elaboration) and **before** writing the How steps, so a routed task's How steps are written as des-build units rather than generic implementation steps. Under `skip_mode` (which is what `yolo` runs use) the proposal is **auto-accepted and written**, recorded as a `- [low]` assumption — imperative, exactly like every other skip-mode prompt, never "may". The trigger is a `design-system/` directory plus any of: the task names a component/section as the thing being built, the body cites **Figma node URLs** (the strongest signal, and the case that most needs des-build's gate), or it composes existing design-system components into a new visual unit. A task meeting the trigger but deliberately not routed must say why as a `- [low]` assumption.
- **`/plan-execute` warns (flag-only) when a likely design-system task has no route.** When `build_route` is null but `design-system/` exists and the body cites a Figma node URL or names a component/section, Step 9 surfaces a `⚠️ No build route, but this looks like design-system work` warning and **continues** — it never adds the field, never infers a route, never aborts. This does not weaken "never infer routing from the body": that rule governs what *executes*, and it is unchanged. The warning changes nothing about execution; it only tells a human that a misfiled task is about to take the unguarded path. Same discipline as HISTORY.md cap drift and des-build's global-CSS drift — **flag it, point at the fix, never apply it silently.** Note the ROUTE GUARD above cannot cover this case: with no field there is no route, so there is nothing to guard. A missing field is therefore the *quieter* failure of the two, and the one that shipped a design-system section built from inference in practice.
- **Figma MCP access belongs to `des-build`, never to `/plan-execute`.** The three `mcp__figma-dev-mode-mcp-server__*` tools are declared in des-build's own `allowed-tools`; the orchestrator declares none and calls none. Do not add them. Granting the orchestrator Figma access would let it reproduce des-build's work *without* des-build's preflight gate — a second silent-degradation path around the guard above, and it would make the abort look like an obstacle to route around rather than the only correct outcome. The capability stays with the skill that has the discipline.

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
| `/des-build` | Phase 2: build a Next.js + Tailwind component by reading `design-system/` first, using only its tokens/patterns/global classes; flags global-CSS drift to `/des-sync` and styleguide staleness to `/des-styleguide`; `verify` mode folds in a Phase 3 px-vs-px self-verify against the Figma frame. **Hard-gated on both inputs** — a Step 1 preflight aborts if the Figma MCP is unreachable or `design-system/` is unreadable, rather than degrading to a plausible-but-wrong build. |
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
| `/plan-mine` | Extract tasks from a meeting transcript or notes prose after discussion |
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
| `/plan-explain` | Explain a task's conceptual model — core idea, three bullets, why this shape |
| `/plan-summary` | Summarize work completed in the current session |
| `/plan-delete` | Remove a task |
| `/plan-combine` | Merge multiple tasks into a single task |
| `/plan-merge-reviews` | Consolidate multiple review-state tasks onto one integration branch for a single combined-diff review |
| `/plan-audit` | Audit task completeness — verify all affected files |
| `/plan-ideas` | List captured ideas or show details of a specific idea |
| `/plan-pick` | Pick high-value components from an idea to create tasks |
| `/plan-unpack` | Expand an idea into actionable tasks |
| `/plan-brainstorm` | Explore ideas through guided discussion |
| `/plan-pause` | Pause an in-progress or in-review task to switch context |
| `/plan-backlog` | Defer a pending task into `.plans/backlog/` (auto-pauses an active task first) |
| `/plan-restore` | Restore a backlogged task to `.plans/pending/`, preserving its prior status |
| `/plan-search` | Full-text search across all tasks and ideas |
| `/plan-retrospect` | Mine completed plan history for named, ranked, cross-project lessons (report/across/seed modes) |
| `/plan-depends` | Add or view task dependency relationships |
| `/plan-cleanup` | Rebuild state from ground truth, clean up orphans; `history` mode backfills pre-cap HISTORY.md Summary cells |
| `/plan-guide` | Interactive contextual guide — what to do next |
| `/plan-spawn` | Fan out N tasks in parallel, each in its own worktree (always autonomous) |
| `/des-styleguide` | Generate (on demand, opt-in) a single human-openable styleguide page from `design-system/` — token swatches, global classes, and built components rendered at once against the live Tailwind layer |
