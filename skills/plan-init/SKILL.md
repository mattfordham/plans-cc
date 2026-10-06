---
name: plan-init
disable-model-invocation: true
argument-hint: "[branch]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - AskUserQuestion
description: Bootstrap the .plans/ directory for task management
---

# plan-init

Initialize the `.plans/` directory structure for lightweight task management.

## Arguments

- `$ARGUMENTS`: Optional. `branch` — track `.plans/` on a dedicated orphan plans branch (branch mode, per the **Plans storage mode & `plans-git`** contract in CLAUDE.md). On an already-initialized project it converts the existing `.plans/` (see step 1); on a fresh project it pre-selects step 7's option 3. Anything else (or nothing) runs today's flow.

## Steps

1. **Check if already initialized (and guard against nesting)**

   `/plan-init` is the ONE skill EXEMPT from the generic project-root discovery-then-`cd` substitution that every other `plan-*` skill uses (see CLAUDE.md "Project-root discovery"). Every other skill errors when no root is found; `plan-init` must instead be able to *create* a root where none exists. Do NOT "fix" this by making it `cd` to an ancestor root and bail — the nesting guard below is deliberate.

   - **cwd itself already has `.plans/config.json`**:
     - **Without the `branch` argument** → keep today's exact error `Already initialized. Run /plan-status to see current tasks.`, followed by one hint line: `Run /plan-init branch to track plans on a dedicated branch` — but print the hint only when `node ~/.claude/plans-cc/plans-git.js mode` prints `local` (an inline, branch-mode, or non-git project has nothing to convert).
     - **With the `branch` argument** → convert the existing project to branch mode, then STOP (steps 2–13 do not run):
       1. Run `node ~/.claude/plans-cc/plans-git.js mode` and refuse cleanly on anything but `local`:
          - `none` → `Branch mode needs the project root to be a git repository (multi-repo parent roots are not supported).`
          - `branch` → `.plans is already on a plans branch.`
          - `inline` → `.plans is tracked in the code repo. Untrack it first (git rm -r --cached .plans, add the slashless .plans line to .gitignore, commit), then run /plan-init branch again.`
       2. Ask ONE confirmation via `AskUserQuestion` — header `Branch mode`, question "Move `.plans/` onto a dedicated `plans` branch (pushed to `origin` when it exists)? Every file is copied and verified before the backup is removed." Options: **Convert** / **Cancel**. Cancel → stop, nothing changed.
       3. Ensure the outer `.gitignore` ignores `.plans` in the slashless form — leave it alone when it already has a `.plans` (or `/.plans`) line, rewrite a `.plans/` line to `.plans`, otherwise append `.plans` (same newline rules as step 7's Ignore path). Remember whether it changed.
       4. Run `node ~/.claude/plans-cc/plans-git.js migrate` from the project root. Print every line it outputs. It ends with exactly one `OK: …` or `Error: …` line:
          - `Error: …` → surface it verbatim. If it says `backup kept at <path>`, tell the user their original files are intact at that path. Do not retry. Emit `🔴 BRANCH MODE FAILED · .plans/` and stop.
          - `OK: …` → if `.gitignore` changed in sub-step 3, commit it in the code repo (`git add .gitignore && git commit -m "plan: gitignore .plans"`; a failed commit is a warning). Report the `OK:` line, then run step 12 (register) and end with `🟢 CONVERTED · .plans/ → plans branch → Next: /plan-status`.
   - **cwd has a `.plans/` but it is incomplete** (directory exists, missing `config.json` or other files) → offer to repair by creating only the missing files (unchanged behavior).
   - **cwd has NO `.plans/`, but an ANCESTOR does** — discover the nearest ancestor root by ascending parent-by-parent from cwd looking for `.plans/config.json`, stopping at `$HOME`, the filesystem root, and any `.worktrees` segment (same walk as `lib/find-root.js`). Do NOT silently create a nested root. Instead, use `AskUserQuestion`:
     - Header: `Nested plans`
     - Question: name the discovered ancestor root path, e.g. "An existing plans root was found at `<ancestor-path>`. Initialize here anyway?"
     - Option 1 (recommended): **Use existing root at `<ancestor-path>`** — nothing is created. Tell the user they can already run any `/plan-*` skill from here (skills ascend to that root automatically), then STOP.
     - Option 2: **Create nested `.plans/` here** — proceed to step 1.5, but FIRST warn explicitly that: plans will be fragmented; the two roots will not see each other; and (per first-hit-wins) this nested root will SHADOW the ancestor for every skill invoked at or below this directory.
   - **Neither cwd nor any ancestor has `.plans/`** → proceed to step 1.5, then step 2 (create the directory structure) exactly as today.

1.5. **Detect an existing plans branch to join (before any file is created)**

   A second machine cloning a branch-mode project should attach to the plans that already exist, not start a disconnected set. This check runs on every path that is about to create a fresh root (never on the partial-repair path), and BEFORE step 2 writes anything.
   - Skip silently (go to step 2) unless cwd is a git repo (`git rev-parse --git-dir 2>/dev/null`) with an `origin` remote (`git remote get-url origin 2>/dev/null`).
   - Probe: `git ls-remote --exit-code --heads origin plans`. Any non-zero exit — no such branch (2), offline, or auth failure — means skip silently to step 2; never block init on the network.
   - When it succeeds, ask via `AskUserQuestion`:
     - Header: `Join plans`
     - Question: "`origin` already has a `plans` branch — this project's plans from another machine. Join it?"
     - Options:
       1. **Join existing plans (recommended)** — Check out `origin/plans` at `.plans/`; same tasks, same IDs, kept in sync.
       2. **Start separate local plans** — Create a fresh, disconnected `.plans/` here. Proceed to step 2, and do NOT offer step 7's option 3 (the branch name is taken; `init-branch`/`migrate` would refuse).
   - If **Join**:
     - Run `node ~/.claude/plans-cc/plans-git.js join` from cwd. Print every line it outputs.
     - `Error: …` → surface it verbatim and stop with `🔴 JOIN FAILED · origin/plans` (nothing was created).
     - `OK: …` → if the line says ``added `.plans` to .gitignore (commit it)``, commit it in the code repo: `git add .gitignore && git commit -m "plan: gitignore .plans"` (a failed commit is a warning).
     - **Skip steps 2–11** — the files, config, plan-comments setting, and skill notes all came from the branch. Show a short confirmation (`Joined origin/plans at .plans/ — N pending tasks`, counting `.plans/pending/*.md`, plus the `.gitignore` line when it was committed) and suggest `/plan-status`.
     - Run step 12 (register), then end with `🟢 JOINED · .plans/ ← origin/plans → Next: /plan-status`.

2. **Create directory structure**
   ```
   .plans/
     CONTEXT.md
     PROGRESS.md
     HISTORY.md
     config.json
     pending/
     completed/
     backlog/
     ideas/
     state/
   ```

3. **Write CONTEXT.md template**
   ```markdown
   # Project Context

   **Project:** [Project Name]
   **Updated:** [Today's date YYYY-MM-DD]

   ## Overview
   _Brief description of this project_

   ## Tech Stack
   _Languages, frameworks, tools_

   ## Structure
   ```
   project/
     src/           # Source code
     tests/         # Test files
     config/        # Configuration
   ```
   _Run `/plan-context` to auto-generate_

   ## Testing
   - **Framework:** _e.g., Jest, RSpec, pytest_
   - **Location:** _e.g., `tests/`, `spec/`, `__tests__/`_
   - **Run:** _e.g., `npm test`, `bundle exec rspec`_
   - **Conventions:** _e.g., TDD, coverage requirements_

   ## Key Patterns
   _Architecture decisions, conventions_

   ## Notes
   _Anything else relevant_
   ```

4. **Write PROGRESS.md template**
   ```markdown
   # Current Progress

   **Last updated:** [Today's date YYYY-MM-DD]

   ## Active Work
   _No active tasks_

   ## Recently Completed
   _No completed tasks yet_

   ## Stats
   - Pending: 0
   - Elaborated: 0
   - In Progress: 0
   - Completed: 0
   - Backlogged: 0
   ```

5. **Write HISTORY.md template**
   ```markdown
   # Task History

   <!-- Summary column: ONE sentence (`<verb-phrase> — <what changed>`) plus a
        ` → completed/NNN-slug.md` pointer, ≤250 chars. This file is an index —
        the full record lives in .plans/completed/. -->

   | ID | Title | Type | Completed | Summary |
   |----|-------|------|-----------|---------|
   ```

6. **Write config.json**
   ```json
   {
     "git_commits": true,
     "plan_comments": true,
     "next_id": 1,
     "idea_next_id": 1,
     "segment_threshold": 4
   }
   ```
   - Do **not** seed a `models` or `worktree_links` key — those are opt-in, documented in `CLAUDE.md`, and honored only when hand-added. They are never seeded and never offered here.
   - Do **not** write `.plans/SKILL_NOTES.md` in this step. It is an **optional** per-project notes file (`## all` + per-skill `## <skill-name>` sections) that several skills read if present; absent, every skill behaves exactly as today. Unlike `models`/`worktree_links`, it is **offered** in step 9 — pre-filled from detected project signals — and created **only on the user's explicit consent**. Declining writes nothing. It is documented in `CLAUDE.md` (see **Per-project skill notes**).

7. **Configure git tracking for `.plans/`**
   - Skip if not inside a git repo (`git rev-parse --git-dir 2>/dev/null` fails). This also rules out branch mode: a non-git root (e.g. a multi-repo parent) cannot hold a plans branch. If the `branch` argument was given, say so — `Branch mode needs the project root to be a git repository (multi-repo parent roots are not supported); keeping .plans local.` — and continue.
   - Determine `has_remote`: `git remote get-url origin 2>/dev/null` succeeds AND step 1.5 did not find an existing `origin/plans` (the user chose "Start separate local plans"). Option 3 below is offered only when `has_remote` is true — with no remote there is nothing to sync through, so the question stays exactly as today.
   - If `.plans` is already gitignored (`git check-ignore -q .plans 2>/dev/null` returns 0):
     - `has_remote` false → skip, as today.
     - `has_remote` true → ask with two options: **Keep ignored (recommended)** (do nothing) and option 3 below.
   - If the `branch` argument was given and `has_remote` is true → take option 3 without asking. (With no remote, still ask — and note that branch mode needs an `origin` remote for remote access.)
   - Otherwise, ask the user via `AskUserQuestion`:
     - Question: "How should `.plans/` be tracked in git?"
     - Header: "Git tracking"
     - Options:
       1. **Ignore (recommended)** — Adds `.plans` to `.gitignore`. Task state stays local; avoids conflicts when switching branches or using worktrees.
       2. **Check in** — Leaves `.plans/` tracked. Useful for sharing task state across a team, but expect noise on branch switches.
       3. **Track on a dedicated plans branch (for remote access)** — *only when `has_remote`.* Moves `.plans/` onto an orphan `plans` branch pushed to `origin`, so other machines can join it and plan commits never touch code branches.
   - If **Ignore**:
     - Ensure `.gitignore` exists; create it if missing.
     - If it exists and does not end with a newline, append a newline first.
     - Append `.plans` (no trailing slash) followed by a newline. **Do not use the trailing-slash form `.plans/`** — that pattern matches only directories, so a stray `.plans` symlink could slip past the ignore rule, get committed, and then clobber the real `.plans/` directory on a later `git checkout` (causing an ELOOP / lost task files). The slashless `.plans` ignores a directory, file, or symlink of that name.
     - Remember for step 11 that `.gitignore` should be staged alongside the init commit.
   - If **Check in**: do nothing.
   - If **Track on a dedicated plans branch** (branch mode, per the **Plans storage mode & `plans-git`** contract in CLAUDE.md):
     - First do everything the **Ignore** path does, but only append `.plans` when `.gitignore` has no `.plans` / `/.plans` line yet (rewrite a `.plans/` line to `.plans`). Code branches must ignore `.plans` in branch mode exactly as in local mode. Remember for step 11 whether `.gitignore` changed.
     - Then run `node ~/.claude/plans-cc/plans-git.js migrate` from the project root on the files steps 2–6 just created — fresh and existing projects share one loss-proof path. Print every line it outputs.
     - `OK: …` → branch mode is on. Remember the `OK:` line for step 10.
     - `Error: …` that mentions `backup kept at <path>` → surface it verbatim, tell the user their files are intact at that path, and STOP (do not run steps 8–13 against a half-migrated `.plans/`). End with `🔴 BRANCH MODE FAILED · .plans/`.
     - Any other `Error: …` (refused before anything moved — `.plans/` is untouched) → surface it, say `Keeping .plans local (ignored).`, and continue as the **Ignore** path.

8. **Ask about plan references in code comments**
   - Ask the user via `AskUserQuestion`:
     - Question: "May executors write code comments referencing plan/task numbers (e.g. `// Task #012 Step 3`)?"
     - Header: "Plan comments"
     - Options (place the recommended tag contextually):
       1. **Allow plan references** — Executors may mention task/step numbers in code comments. Recommend this if the user chose **Check in** at step 7 (plan files live in the repo, so the references resolve).
       2. **No plan references** — Executors never write comments referencing the plan, task number, title, or step numbers. Recommend this if the user chose **Ignore** or **Track on a dedicated plans branch** at step 7 (in branch mode the plans live on a separate orphan branch, never alongside the code), `.plans` was already gitignored, or this is not a git repo (plan files won't be in the repo, so such references are meaningless to readers).
   - If **No plan references**: edit `.plans/config.json`, setting `"plan_comments": false` (the step-6 template default stays `true`).
   - If **Allow plan references**: do nothing (the template already wrote `true`).

9. **Offer to seed `.plans/SKILL_NOTES.md` (opt-in — never forced)**

   `.plans/SKILL_NOTES.md` is the optional per-project notes file several skills read at their Step 1.5 (see CLAUDE.md **Per-project skill notes**). Most projects never gain it because nobody knows to hand-author it, so offer a pre-filled one here. It is **opt-in**: the file is written only on the user's explicit consent, and declining writes **nothing**, so behavior stays byte-identical to a project that never had the file. This step is the single source of truth for the detection + offer; `/plan-context` reuses it for already-initialized projects.

   a. **Read first.** If `.plans/SKILL_NOTES.md` already exists (e.g. this is the partial-initialization repair path from step 1), do **not** prompt and do **not** touch it. Note `Skill notes: .plans/SKILL_NOTES.md already present — left as-is` for step 10 and move on.

   b. **Detect project signals** (read-only, from the project root). This mirrors the dev-server detection in `skills/plan-execute/SKILL.md` step 11.5a so the seeded note is exactly what that step reads back:
      - **Package manager** — from the lockfile: `pnpm-lock.yaml` → `pnpm`, `yarn.lock` → `yarn`, `bun.lockb` → `bun`, `package-lock.json` → `npm`. With a `package.json` but no lockfile, assume `npm`. With no `package.json` at all, there is no package-manager signal.
      - **Dev script** — `package.json` `scripts.dev` exists (just its presence; do not copy its body).
      - **Port convention** — grep `AGENTS.md` and `CLAUDE.md` at the project root for a `PORT=<base + task number>` pattern (e.g. `PORT=<4000 + task number> yarn dev`) and take its numeric base.
      - **Design system** — a `design-system/` directory exists at the project root.

   c. **No signals → skip silently.** If none of the four signals was detected, there is nothing to pre-fill: do not prompt, do not write a file, and print nothing about skill notes in step 10.

   d. **Build the proposed file body** in the documented `## all` + per-skill format — only lines backed by a detected signal, never guesses:
      - Under `## all`:
        - A package-manager bullet when a package manager was detected: `- Package manager: <pm> (use <pm> for installs and scripts, never another package manager)`.
        - A dev-server bullet **only when a `dev` script exists**, in the exact shape plan-execute reads: `- Dev server: PORT=<BASE + task number> <pm> dev`, where `BASE` is the base from the port convention if one was found, else `3000` (plan-execute's default). For npm the command is `npm run dev`. No dev script → omit this bullet (a package-manager bullet may still stand alone).
      - Only when `design-system/` exists, append a `## des-build` section holding a **commented placeholder** — an HTML comment, not a bullet — e.g. `<!-- - Review pages live under app/(preview)/ — set this to your project's review-page location -->`. The review-page location cannot be detected, so a concrete path would be a guess; and reading skills count bullets as notes, so a comment keeps their `applied <n> note(s)` line honest (the placeholder is not a note until the user uncomments it).
      - If `## all` would be empty (e.g. only `design-system/` was detected), omit the `## all` heading and propose just the `## des-build` section.

      Worked example — `pnpm-lock.yaml`, a `dev` script, `PORT=<4000 + task number> pnpm dev` in `AGENTS.md`, and a `design-system/` directory:

      ```markdown
      ## all
      - Package manager: pnpm (use pnpm for installs and scripts, never another package manager)
      - Dev server: PORT=<4000 + task number> pnpm dev

      ## des-build
      <!-- - Review pages live under app/(preview)/ — set this to your project's review-page location -->
      ```

   e. **Offer, don't force.** Show the proposed body in a fenced `markdown` block, then ask via `AskUserQuestion`:
      - Question: "Create `.plans/SKILL_NOTES.md` with these pre-filled notes? Skills read it to follow project conventions (package manager, dev-server port)."
      - Header: "Skill notes"
      - Options:
        1. **Skip (recommended)** — Write nothing (today's behavior). You can create `.plans/SKILL_NOTES.md` by hand any time.
        2. **Accept** — Write the proposed file as shown.
        3. **Edit** — Adjust the notes before writing.
      - **Skip** → write nothing. No stub, no empty file.
      - **Accept** → write `.plans/SKILL_NOTES.md` with the proposed body exactly as shown.
      - **Edit** → take the user's adjustments (free text via "Other", or ask a follow-up asking what to change), apply them to the proposal, re-show the revised body in a fenced block, then write it. If the edits leave the file with no content (no bullets and no sections), write **nothing** and treat it as Skip.
      - Remember for step 10 which outcome applied, and on write the number of bullets (notes) in the file — HTML-comment placeholders are not counted.
      - This step **never** touches `config.json` and never records the decline anywhere (no `skill_notes_declined`-style key — that would be a phantom config key; see CLAUDE.md **Model selection**). Absence of the file is the complete record of a decline.

10. **Display confirmation**
   Show:
   - Confirmation that `.plans/` was created
   - List of files created
   - Whichever applies: "Added `.plans/` to `.gitignore`", "Tracking `.plans/` in git", or — in branch mode — "Tracking `.plans/` on the `plans` branch (…)" carrying the push state from step 7's `OK:` line (`pushed to origin/plans` or `not pushed`; when not pushed, add that the next plan commit retries the push)
   - Whichever applies: "Plan references in code comments: allowed" or "Plan references in code comments: disabled"
   - Whichever applies from step 9: "Created `.plans/SKILL_NOTES.md` (N notes)", "Skill notes: skipped (create `.plans/SKILL_NOTES.md` any time — see CLAUDE.md)", or "Skill notes: `.plans/SKILL_NOTES.md` already present — left as-is". Omit the line entirely when step 9 skipped silently because no signals were detected.
   - Suggest next steps:
     - `/plan-context` to set up project context
     - `/plan-capture <description>` to capture your first task
     - `/plan-help` to see all commands

11. **Commit changes**
   - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
   - If not a git repo: skip silently
   - Read `.plans/config.json` for `git_commits` setting
   - If `git_commits` is not `true`: skip silently (branch mode always has it `true` — `migrate` sets it)
   - **Outer `.gitignore`** — if step 7 modified it (Ignore or plans-branch path), commit it in the code repo first, on its own, so the next commit cannot sweep it up:
     ```bash
     git add .gitignore
     git commit -m "plan: gitignore .plans"
     ```
   - **`.plans/` itself** — commit via the shared helper, which does the right thing per storage mode: nothing when `.plans` is gitignored (local), `git add .plans/` + commit when it is tracked (inline — today's check-in behavior), and a commit on the plans branch in branch mode (picking up the step 8 `plan_comments` edit and any step 9 `SKILL_NOTES.md` written after `migrate`'s own commit). It skips silently when nothing changed:
     ```bash
     node ~/.claude/plans-cc/plans-git.js commit "plan: initialize .plans/"
     ```
   - If `~/.claude/plans-cc/plans-git.js` does not exist: print `Warning: plans-git helper missing — run npx plans-cc to reinstall` and continue.
   - Surface any `Warning:` lines it prints. If a commit fails (e.g. hooks): warn but do not fail the skill

12. **Register project (best-effort telemetry)**
    - Run via Bash, best-effort and silent: `node ~/.claude/plans-cc/plan-touch.js "$PWD" 2>/dev/null || true`
    - This registers the project in the system-wide plans registry for the desktop dashboard.
    - Ignore any error and do NOT surface output to the user. Never let this break the skill.

13. **End-of-action marker**
    - Output as the final line: `🟢 INITIALIZED · .plans/ ready → Next: /plan-capture`

## Edge Cases

- **Already initialized**: If `.plans/config.json` exists in cwd, show error with suggestion to use `/plan-status` (plus the `/plan-init branch` hint in local mode)
- **`/plan-init branch` on an initialized project**: one confirmation, then `migrate` — every file is copied back and checked (file count + sha1) before the `.plans.bak-<ts>` backup is deleted; on any failure the backup stays and its path is printed. Refused for non-git roots, inline (tracked) `.plans`, and projects already in branch mode
- **Second machine** (step 1.5): an `origin/plans` branch is detected before any file is created and **Join** is recommended; an offline or failed probe skips silently to a normal init
- **Branch mode without a git repo or remote**: a non-git root (multi-repo parent) never sees option 3 and the `branch` argument is refused with a message; a repo with no `origin` sees today's two options unchanged
- **Partial initialization**: If `.plans/` exists but is missing files, offer to repair by creating missing files only
- **Nested under an existing root**: If cwd has no `.plans/` but an ancestor does, ask before creating a nested root (see step 1) — the recommended path is to use the existing ancestor root, since all skills discover it automatically
- **SKILL_NOTES offer** (step 9): never written without explicit consent — **Skip** (the recommended default) and an Edit that empties the proposal both write nothing, byte-identical to today. Already present (e.g. on the repair path) → no prompt, file untouched. No detectable signals (no lockfile/`package.json`, no `dev` script, no port convention, no `design-system/`) → no prompt, no file, no confirmation line. The decline is never recorded in `config.json`.
- **Not in a project directory**: Proceed anyway (user knows best where to put their plans)
