---
name: plan-status
disable-model-invocation: false
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Agent
description: Show dashboard of all tasks and current progress
---

# plan-status

Display a compact dashboard showing the current state of all tasks.

The dashboard must be the **final message of the turn**. All scanning, parsing, and cache-refresh work is delegated to a subagent so its tool calls don't clutter the user's transcript.

## Steps

1. **Verify initialization**
   - Use Read or Glob to check `.plans/config.json`.
   - If it does not exist: print `Not initialized. Run `/plan-init` to get started.` and stop. Do not spawn a subagent.

2. **Announce once, then delegate gathering**
   - Print a single short line like `Gathering status…` before the tool call (this is the only pre-dashboard text the user should see).
   - Spawn ONE Agent (`subagent_type: general-purpose`) with the prompt below. Do NOT run `git`, `Glob`, `Read`, or any other gathering tool yourself — the subagent does all of it.

   **Subagent prompt (use verbatim, adjusted for context):**

   > You are gathering data for a `/plan-status` dashboard. Do all of the following and return ONLY a compact structured report (under ~150 lines, no raw file contents).
   >
   > 1. Run `git branch --show-current` in the project root. If it fails, note "not a git repo."
   > 2. Find sub-repos: `find . -maxdepth 2 -name .git -type d` excluding `./.git`. For each, run `git -C <dir> branch --show-current`.
   > 3. Glob `.plans/pending/*.md` and `.plans/completed/*.md`.
   > 4. For each pending task file, parse: id (first 3 digits of filename), title (first `# ` line), type (`**Type:**` line), status (`**Status:**` line), checkbox progress (count `- [ ]` and `- [x]` lines in the How section → `completed/total`), blocked-by (if `**Blocked by:**` exists, list blocker ids and mark `blocked=true` if any blocker id is NOT present in `.plans/completed/`).
   > 5. Count files in `.plans/completed/`.
   > 6. Refresh `.plans/PROGRESS.md` silently: update the Stats section with accurate counts (pending, elaborated, in-progress, review, in-review, completed) and set "Last updated" to today's date. Preserve all other content.
   > 7. Return a report in this exact shape:
   >
   > ```
   > BRANCH: <branch or NONE>
   > SUBREPOS: <name→branch · name→branch or NONE>
   > COUNTS: pending=<n> elaborated=<n> in-progress=<n> review=<n> in-review=<n> completed=<n>
   > TASKS (sorted: in-progress, in-review, review, elaborated, pending):
   > <id>|<status>|<type>|<completed>/<total>|<blocked:true|false>|<title>
   > <id>|<status>|<type>|<completed>/<total>|<blocked:true|false>|<title>
   > ...
   > ```
   >
   > No extra prose, no markdown headers, no file dumps.

3. **Render the dashboard** (this is the final message of the turn)

   Format the subagent's report into this exact layout:

   ```
   # Plans Status

   Branch: feature/login-fix
   Sub-repos: app → feature/login-fix · api → main

   2 pending · 1 ready · 1 in progress · 1 ready for review · 0 in review · 3 completed

   ▶ 003 Fix login timeout [bug] 3/5
   ★ 004 Add search feature [feature] 4/4
   ◉ 005 Refactor auth [refactor] 6/6
   ○ 002 Add dark mode [feature] 0/4
   · 001 Update docs [chore]

   Legend: ▶ In Progress  ★ Ready for Review  ◉ In Review  ○ Ready  · Pending  ⊘ Blocked

   ## Quick Actions
   [Contextual suggestions — see below]
   ```

   **Branch display rules:**
   - `Branch:` — omit if BRANCH is NONE.
   - `Sub-repos:` — omit if SUBREPOS is NONE. Format: `name → branch` separated by ` · `.
   - Blank line between branch info and the summary counts line.

   **Summary counts line** uses the COUNTS values: `<pending> pending · <elaborated> ready · <in-progress> in progress · <review> ready for review · <in-review> in review · <completed> completed`.

   **One line per task** using these glyphs:
   - `▶` in-progress
   - `◉` in-review
   - `★` review
   - `○` elaborated
   - `·` pending (no progress fraction shown)
   - `⊘` blocked (overrides the status glyph when blocked=true)

   Task line format: `<glyph> <id> <title> [<type>] <completed>/<total>` — omit the `X/Y` for pending-status tasks.

   **DO NOT use:** tables, columns, separators, labels like `ID:` / `Task:` / `Progress:`, or multi-line task entries.

4. **Quick Actions** (contextual, based on which statuses appear in COUNTS)
   - No tasks at all: `Get started: /plan-capture <description> to add your first task`
   - Only pending: `Next: /plan-elaborate <id> to research a task before starting`
   - Elaborated exist: `Ready to work: /plan-execute <id> to start an elaborated task`
   - In-progress exist: `Continue: /plan-execute <id> to continue working` and `Done? /plan-complete <id> to mark complete`
   - Review exist: `Ready for review: /plan-review <id> to review changes`
   - In-review exist: `Resume review: /plan-review <id> to continue reviewing`

   Include every suggestion that applies.

## Edge Cases

- **Not initialized**: short-circuit at step 1. Do not spawn subagent.
- **No tasks**: render the header, zero-count summary, no task lines, and the "Get started" Quick Action.
- **Subagent returns malformed data**: print a brief error and suggest rerunning; do not fabricate task rows.
- **Main agent must NOT** run `git`, Glob the `.plans/` tree, Read task files, or Edit PROGRESS.md itself. All of that belongs to the subagent so the transcript stays clean.
