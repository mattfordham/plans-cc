---
name: plan-capture
disable-model-invocation: false
argument-hint: "[description] [--base <branch>] [discuss | elaborate | and execute|go]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - AskUserQuestion
  - WebFetch
  - WebSearch
description: Quick-capture a new task (optionally elaborate and/or execute)
---

# plan-capture

Quickly capture a task idea with minimal friction. The goal is fast capture — elaboration comes later. Optionally chain into elaboration and/or execution automatically with trailing phrases.

## Arguments

- `$ARGUMENTS`: Optional task description, optionally followed by an auto-proceed phrase (e.g., "Fix login timeout bug", "Fix login bug and elaborate", "Fix login bug and go with branch", "Add dark mode discuss", "Add dark mode discuss and go"). May also carry an explicit `--base <branch>` flag anywhere (e.g. "Fix badge count --base feature/notification-badges and go") to set the task's `**Base:**` field — see step 2.

  The trailing `discuss` keyword front-loads a short, options-first clarifying conversation about the freshly-captured idea before any plan is committed, then chains into elaboration. It implies `elaborate` (like `execute` implies `elaborate`) and composes with the execute/go/branch/worktree phrases.

  **The chain stops where the trailing phrase says it stops — no further.** The parsed flags (`auto_elaborate`, `auto_execute`) are the *only* thing that authorizes advancing to the next lifecycle step. Execution is gated SOLELY on `auto_execute=true`, which requires an explicit trailing `execute`/`go` phrase. Nothing the user wrote *inside the task description* — including naming a build skill, a tool, or a file (e.g. "Use des-build for this", "implement with X") — is ever an execute trigger. Task content describes *what to build later*; it never authorizes building *now*. When the chain reaches its stopping point, STOP and surface the `Next:` hint; do not begin implementation work.

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments for description and auto-proceed intent**

   **First, extract an explicit `--base` flag** (before the trailing-phrase match below, so a flag placed at the end never hides a trailing phrase):
   - Look for the token `--base` followed by a branch name (`--base feature/x`), or the single token `--base=feature/x`, anywhere in `$ARGUMENTS`. The flag is the literal `--base` only — case-sensitive, no synonyms, no bare `base` keyword.
   - If found: store the branch name as `capture_base` and strip the flag and its value from `$ARGUMENTS`. Validate it with `git check-ref-format --branch <name>`; if invalid (or `--base` has no value), error: `--base needs a valid branch name (got: "<value>").` and stop without capturing.
   - Do NOT check that the branch exists — `/plan-execute` creates a missing base locally per the **Resolve target branch** contract in `CLAUDE.md`.
   - If not found: `capture_base = null` (the default — no `**Base:**` field is written).
   - **This flag is the ONLY way capture sets `**Base:**`.** Never infer a base from the description ("this belongs on the badges feature", "part of feature/x"), from the current checkout, or from other tasks. A description that merely mentions a branch is just description text.
   - When invoked by `/plan-execute` or `/plan-elaborate` auto-capture, the caller has already extracted the flag and passes `capture_base` in; use that value.

   Then check the remaining `$ARGUMENTS` for trailing auto-proceed phrases. Match against the **end** of the argument string only (case-insensitive). Order matters — check longest patterns first to avoid partial matches:

   | Pattern (at end of `$ARGUMENTS`) | Result |
   |---|---|
   | `discuss (and\|then\|&) go (with\|on) worktree` | `discuss_mode=true, auto_elaborate=true, auto_execute=true, auto_worktree=true` |
   | `discuss (and\|then\|&) execute (with\|on) worktree` | `discuss_mode=true, auto_elaborate=true, auto_execute=true, auto_worktree=true` |
   | `discuss (and\|then\|&) go (with\|on) branch` | `discuss_mode=true, auto_elaborate=true, auto_execute=true, auto_branch=true` |
   | `discuss (and\|then\|&) execute (with\|on) branch` | `discuss_mode=true, auto_elaborate=true, auto_execute=true, auto_branch=true` |
   | `discuss (and\|then\|&) (execute\|go)` | `discuss_mode=true, auto_elaborate=true, auto_execute=true` |
   | `discuss (with\|on)? worktree` | `discuss_mode=true, auto_elaborate=true, auto_worktree=true` |
   | `discuss (with\|on)? branch` | `discuss_mode=true, auto_elaborate=true, auto_branch=true` |
   | `(and\|then\|&)? discuss` | `discuss_mode=true, auto_elaborate=true` |
   | `(and\|then\|&) go (with\|on) worktree` | `auto_elaborate=true, auto_execute=true, auto_worktree=true` |
   | `(and\|then\|&) execute (with\|on) worktree` | `auto_elaborate=true, auto_execute=true, auto_worktree=true` |
   | `(and\|then\|&) go (with\|on) branch` | `auto_elaborate=true, auto_execute=true, auto_branch=true` |
   | `(and\|then\|&) execute (with\|on) branch` | `auto_elaborate=true, auto_execute=true, auto_branch=true` |
   | `(and\|then\|&) (execute\|go)` | `auto_elaborate=true, auto_execute=true` |
   | `(and\|then\|&)? elaborate` | `auto_elaborate=true` |

   - Strip the matched phrase from the end; the remainder is the task description
   - If no phrase matched: `discuss_mode=false, auto_elaborate=false, auto_execute=false, auto_branch=false, auto_worktree=false` — original behavior
   - If description is empty after stripping (or no `$ARGUMENTS` at all), ask: "What task do you want to capture?"
   - **Important:** Phrases only match at the END of arguments — "Fix the elaborate system" does NOT trigger auto-elaborate because "elaborate" is mid-sentence, not the final word. The trailing `elaborate` and `discuss` keywords stand alone (no `and/then/&` connector required); the `execute`/`go` phrases still need a connector to avoid swallowing descriptions that end in those words.
   - **`discuss` implies elaborate**: a trailing `discuss` always sets `auto_elaborate=true` (the conversation is a front-loaded gate that then chains into elaboration), exactly as `execute`/`go` imply elaborate. Because the `discuss …` rows are listed first, they take priority over the plain `execute`/`go`/`elaborate` rows — e.g. "Add dark mode discuss and go" matches the `discuss (and\|then\|&) (execute\|go)` row, not the bare `(and\|then\|&) (execute\|go)` row.

3. **Read config and generate ID**
   - **Branch mode only** — per the **Allocate ID (branch mode)** rule in CLAUDE.md: run `node ~/.claude/plans-cc/plans-git.js mode`; if it prints `branch`, run `node ~/.claude/plans-cc/plans-git.js sync` first so `next_id` reflects every other machine's captures. Print any `Renumbered #A → #B` lines verbatim and surface `Warning:` lines; never fail on them. Remember `branch_mode_plans` (true/false) for step 7.5. Any other mode: skip this bullet entirely.
   - Read `.plans/config.json`
   - Get `next_id` value
   - Format as a string zero-padded to at least 3 digits (e.g., 1 → "001", 1000 → "1000" — pad, never truncate)

4. **Generate filename**
   - Slugify the description:
     - Lowercase
     - Replace spaces with hyphens
     - Remove special characters (keep alphanumeric and hyphens)
     - Truncate to max 40 characters (at word boundary if possible)
   - Format: `NNN-slug.md` (e.g., `001-fix-login-timeout-bug.md`)

5. **Infer task type**
   Analyze description for keywords:
   - **bug**: "fix", "bug", "broken", "error", "issue", "crash", "fail"
   - **feature**: "add", "new", "implement", "create", "support"
   - **refactor**: "refactor", "clean", "reorganize", "restructure", "improve"
   - **chore**: "update", "upgrade", "config", "setup", "docs", "test"

   Default to "feature" if no keywords match.

6. **Write task file**
   Create `.plans/pending/NNN-slug.md`:
   ```markdown
   # [Title - capitalized description]

   **ID:** [NNN]
   **Created:** [YYYY-MM-DDTHH:MM]
   **Type:** [inferred type]
   **Status:** pending

   <!-- Optional, OMITTED by default. Only add when the description is an explicit
        build-skill routing directive (see the "Seeding the **Build:** field" edge case):
        **Build:** des-build · Component1, Component2
        Absence = no build-skill routing (the default). -->

   <!-- Optional, OMITTED by default. Written ONLY when `capture_base` is set by an
        explicit `--base <branch>` flag (step 2) — never inferred. When present, the task
        branches FROM, rebases ONTO, and merges INTO this branch instead of the repo
        default — see the "Resolve target branch" and "The **Base:** task-header field"
        contracts in CLAUDE.md. Place it directly under **Status:** (after **Blocked by:**
        when that field is present):
        **Base:** [capture_base]
        Absence = the repo default branch (today's behavior, byte-for-byte). -->

   ## What
   [Original description]

   ## Why
   _To be filled during elaboration_

   ## How Summary
   _To be filled during elaboration_

   ## How
   _To be filled during elaboration_

   ## Verification
   _To be filled during elaboration_

   ## Impact Scope
   _To be filled during elaboration (if 3+ files affected)_

   ## Assumptions

   ### Initial (from elaboration)
   _To be filled during elaboration_

   ### Discovered during execution
   _To be filled during execution_

   ## Changes
   _To be filled during execution_

   ## Notes
   _Additional context_
   ```

7. **Update config.json**
   - Increment `next_id`
   - Write updated config

7.5. **Claim the ID (branch mode only)**
   - Only when `branch_mode_plans` is true (step 3). In every other mode, skip — step 10 commits exactly as before.
   - Per the **Allocate ID (branch mode)** rule in CLAUDE.md, commit and push synchronously right away, so the ID is claimed on the remote before another machine can mint it:
     ```bash
     node ~/.claude/plans-cc/plans-git.js commit --sync-push "plan: capture #NNN - [title]"
     ```
   - This sits inside steps 1–8 on purpose: `/plan-execute` and `/plan-elaborate` auto-capture run only those steps, and must still claim the ID.
   - If `~/.claude/plans-cc/plans-git.js` does not exist: print `Warning: plans-git helper missing — run npx plans-cc to reinstall` and continue. Surface any `Warning:` lines; never fail the skill.

8. **Update PROGRESS.md stats**
   - Count pending tasks in `.plans/pending/`
   - Update the Stats section

9. **Register project (best-effort telemetry)**
   - Run via Bash, best-effort and silent: `node ~/.claude/plans-cc/plan-touch.js "$PWD" 2>/dev/null || true`
   - This registers the project in the system-wide plans registry for the desktop dashboard.
   - Ignore any error and do NOT surface output to the user. Never let this break the skill.

10. **Commit .plans/ changes**
   - If `auto_elaborate` or `auto_execute` is true: skip this step (the chained skill will commit)
   - In branch mode the task was already committed and pushed at step 7.5; this commit only picks up the step-8 PROGRESS.md change (or skips silently when there is none).
   - Commit via the shared helper (it resolves the project root and skips silently when not in a git repo, when `.plans` is gitignored, when `git_commits` is not `true`, or when nothing changed):
     ```bash
     node ~/.claude/plans-cc/plans-git.js commit "plan: capture #NNN - [title]"
     ```
   - If `~/.claude/plans-cc/plans-git.js` does not exist: print `Warning: plans-git helper missing — run npx plans-cc to reinstall` and continue.
   - Surface any `Warning:` lines it prints, but never fail the skill.

11. **Display confirmation**

   **If `auto_elaborate` is true** (about to chain into elaboration):
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   File: .plans/pending/NNN-slug.md
   ```
   Do NOT show "Next:" recommendation — elaboration is about to happen automatically.

   **If `auto_elaborate` is false:**

   **If type is `bug`:**
   ```
   Captured task #NNN: [Title]
   Type: bug | Status: pending
   File: .plans/pending/NNN-slug.md

   Recommendation: Bug fixes benefit significantly from elaboration first.
   It helps identify root cause vs symptoms and prevents fix-revert cycles.

   Next: /plan-elaborate NNN (recommended for bugs)
   ```
   End-of-action marker (final line): `🟢 CAPTURED · Task #NNN → Next: /plan-elaborate NNN`

   **For all other types:**
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   File: .plans/pending/NNN-slug.md

   Next: /plan-elaborate NNN to flesh it out
   ```
   End-of-action marker (final line): `🟢 CAPTURED · Task #NNN → Next: /plan-elaborate NNN`

   When `auto_elaborate` is true, do NOT emit a capture marker — the downstream gate/elaborate/execute skill emits the final marker for the chain.

11.5. **Clarifying discussion gate** (only if `discuss_mode` is true)

    This is the front-loaded, options-first conversation. It runs INLINE in this
    session (NOT a spawned sub-agent — a sub-agent cannot hold a live turn-by-turn
    with the user) and is **EPHEMERAL**: it writes NOTHING to the task file. The
    agreed direction is carried in-context only, into the auto-elaborate step below.

    > **Canonical clarifying-gate spec** (embedded verbatim; the identical block
    > also lives in `plan-execute`'s chain — keep the two copies in sync):
    >
    > 1. **Scope guard** — the gate runs ONLY after a fresh auto-capture (v1). It is
    >    never offered for an existing task id; those are discussed with the standalone
    >    `/plan-discuss <id>`. (In this skill we always just auto-captured, so the guard
    >    is satisfied.)
    > 2. **Open with a compact pending-idea header** — there is no Why/How/Verification
    >    to quote yet (the task is freshly captured), so show only Title + What:
    >    ```
    >    Let's talk through #NNN before we plan it: [Title]
    >
    >    What: [the What / original description]
    >
    >    Here's what I think you're solving for — does that match? I'll float a couple
    >    of rough directions; push back on any of them. Say "go" (or "done" / "proceed")
    >    when you're ready and I'll fold what we settled into the plan.
    >    ```
    > 3. **Converse open-endedly** — reuse `plan-discuss` **step 6** (turn-by-turn;
    >    lead with options, not agreement; use `AskUserQuestion` for multiple-choice
    >    trade-offs and yes/no decisions; state a recommendation when you have one;
    >    don't just agree — surface trade-offs, missing cases, and alternative
    >    directions). Stay grounded in the raw idea. **Do NOT edit the task file.**
    > 4. **Detect exit signals** — reuse `plan-discuss` **step 8**, extended with the
    >    front-load exit words: "go", "proceed", "done", "that's enough", "let's plan
    >    it", "wrap up". On any exit signal, stop conversing and proceed.
    > 5. **Carry the agreed direction forward in-context** — summarize, for your own
    >    use only (do not write it anywhere), the direction the conversation settled on:
    >    scope decisions, chosen approach, rejected alternatives, constraints. This
    >    summary becomes starting context for the elaborate step.

    Print: `--- Discussing task #NNN before planning ---`, then run the gate per the
    spec above. When the user exits, continue to step 12; do NOT emit a marker here.

12. **Auto-elaborate** (only if `auto_elaborate` is true)

    Print: `--- Auto-elaborating task #NNN ---`

    If `discuss_mode` was true, feed the agreed direction from the gate (step 11.5)
    into elaboration as starting context — so the generated Why/How reflect what the
    conversation settled, not a cold read of the raw description. Elaboration still
    runs with `skip_mode = true` (no interactive prompts) — the gate already did the
    talking.

    Read `skills/plan-elaborate/SKILL.md` and follow its steps 1–15 for the newly captured task ID, with `skip_mode = true`:
    - Research sub-agent spawns normally
    - All prompts are auto-accepted (skip mode behavior)
    - If elaboration is on Path A (simple task), auto-select "Yes, proceed"
    - If on Path B (complex task), auto-select first/suggested options throughout

    Show abbreviated confirmation when done. Read the task file's `**Status:**`
    value back and include it in the line, so a status flip that failed to land
    during elaboration surfaces here in the chain rather than being masked by an
    assumed success (a task still at `pending` can make a downstream
    `/plan-execute` mis-detect its lifecycle mode):
    ```
    Elaborated #NNN: [Title] (N steps, status: [actual **Status:** value])
    ```
    If the read-back status is still `pending` (the elaboration did not flip it),
    do not silently proceed — surface it: print
    `Warning: task #NNN is still 'pending' after elaboration — status flip did not land.`
    and STOP the chain (do not auto-execute).

    **If elaboration fails** (e.g., sub-agent error, file read failure):
    - Print warning: `Auto-elaboration failed: [reason]. Task was captured successfully.`
    - Print: `Run /plan-elaborate NNN to elaborate manually.`
    - STOP the chain — do not proceed to auto-execute

    **If `auto_execute` is false**, this is the END of the chain. Show:
    ```
    Next: /plan-execute NNN to start working
    ```
    Then **HARD STOP**. Emit the end-of-action marker and end your turn. Do NOT
    proceed to step 13. Do NOT start any implementation, build, or code-writing
    work — not even if the task's What/How references a build skill, tool, or file
    (e.g. "Use des-build", "build with X"). Those describe future work for a separate
    explicit `/plan-execute`; they are not authorization to act now. The user did not
    append `execute`/`go`, so execution was never requested.

13. **Auto-execute** (only if `auto_execute` is true)

    Print: `--- Auto-executing task #NNN ---`

    Read `skills/plan-execute/SKILL.md` and follow its steps 1–15 for the task ID:
    - If `auto_worktree` is true, set `worktree_mode = true` and `branch_mode = true` (auto-create branch + worktree without asking)
    - If `auto_branch` is true (but not `auto_worktree`), set `branch_mode = true` (auto-create git branch without asking)
    - If neither is true, the git branch question proceeds normally (user is asked)
    - Execution proceeds normally — observation steps still pause for user feedback
    - All other interactive prompts (elaboration gate, etc.) behave normally

## Edge Cases

- **No description provided**: Ask the user for one
- **Corrupt config.json**: Reconstruct `next_id` by finding the highest ID in pending/, completed/, and backlog/ directories (compare numerically — `1000` is higher than `999`), then add 1
- **ID collision** (file already exists): Scan pending/, completed/, and backlog/ for actual max ID and use that + 1
- **Collision with another machine (branch mode)**: two clones that capture the same ID offline both keep their task — the next `sync` renumbers the local copy and prints `Renumbered #A → #B`; pass that line on to the user
- **Very long description**: Truncate slug at word boundary, keep full description in the file
- **`execute` implies `elaborate`**: Auto-execute always runs auto-elaborate first
- **`discuss` implies `elaborate`**: A trailing `discuss` always runs the clarifying gate and then auto-elaborate — the conversation front-loads the chain, it is never a standalone destination
- **`with branch` / `with worktree` only recognized after a go/execute phrase** (or directly after `discuss`): "Fix bug with branch" alone does NOT trigger branch mode, but "Fix bug discuss with branch" does (the gate runs, then elaborate, then execute with a branch)
- **Phrases only match at END**: "Fix the elaborate system" has no trailing phrase — "elaborate" is mid-sentence, not the final word, so it's part of the description. Likewise "Refactor the discuss skill" does NOT trigger the gate — "discuss" is mid-sentence
- **Trailing `elaborate` needs no connector**: "Fix login bug elaborate" triggers auto-elaborate on its own — unlike `execute`/`go`, the `elaborate` keyword does not require a preceding `and/then/&`
- **Trailing `discuss` needs no connector**: "Add dark mode discuss" triggers the clarifying gate on its own — like `elaborate`, the `discuss` keyword does not require a preceding `and/then/&`. To also execute, append a connector + go/execute ("Add dark mode discuss and go")
- **Elaboration failure stops the chain**: Task is still captured successfully, but auto-execute is skipped
- **Task content is NEVER an execute trigger**: Only an explicit trailing `execute`/`go` phrase sets `auto_execute=true`. Text inside the task description that names a build skill, tool, command, or file ("Use des-build for this", "implement with the X helper", "run the migration") describes *what to do during a later execute* — it does not authorize execution now. `discuss` and `elaborate` chains end at the elaborated task with a `Next: /plan-execute NNN` hint, and you must hard-stop there. Reading task content as license to build is the single most important failure to avoid.
- **Seeding the `**Build:**` field (the one narrow exception, and ONLY a field — never an execute trigger)**: If the description is an explicit routing directive that names a build skill (e.g. begins "Use des-build to build the Hero…"), you MAY seed a `**Build:**` field in the task header so a later `/plan-execute` routes that build through the real skill (format: `**Build:** des-build · Hero`, listing the component/section unit(s)). This is the sole sanctioned place task body text influences the field, and it happens **only at capture time, deliberately** — `/plan-execute` later reads the field, never re-derives it from the body. Seeding the field does NOT change the execution gate one bit: the task is still only captured (the hard-stop rule above stands), and an explicit trailing `execute`/`go` is still required to build. When in doubt, omit the field — its absence simply means no routing.
- **`--base <branch>` is the only way capture sets `**Base:**`**: `/plan-capture Fix badge count --base feature/notification-badges` writes `**Base:** feature/notification-badges` under `**Status:**` and captures "Fix badge count". The flag can sit anywhere and composes with every trailing phrase (`… --base feature/x and go with worktree`). Without the flag, no `**Base:**` is written — even if the description names a branch ("Fix the badge count on feature/notification-badges" captures that text verbatim and sets nothing). Never infer a base. Unlike the `**Build:**` seeding exception above, there is no body-text path to this field at all.
- **`--base` with an invalid or missing branch name**: Error and capture nothing (`--base needs a valid branch name`). Never fall back to capturing without the base — the user asked for one.
- **No trailing phrase**: Fully backwards-compatible with original behavior
