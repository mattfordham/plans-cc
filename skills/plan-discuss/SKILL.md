---
name: plan-discuss
disable-model-invocation: false
argument-hint: "[id] [topic]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
description: Free-form discussion about a task, or the whole backlog when no ID is given; apply agreed changes on request
---

# plan-discuss

Have an open, turn-by-turn conversation about your plans. This skill runs in one of two modes:

- **Task mode** (an ID is given) — think out loud about a single already-elaborated task: questioning approach, weighing trade-offs, surfacing missing cases, and capturing agreed changes back into that task file.
- **Backlog mode** (no ID given) — discuss the backlog as a whole: redundancy and overlap between tasks, gaps, sequencing/prioritization, scope creep, whether tasks should be combined or split. Loads project context, history, and all active tasks so the conversation is grounded in the full picture.

Unlike `/plan-clarify` (a scripted scan for ambiguities in one task), `/plan-elaborate` (generates structure from scratch), or `/plan-status` / `/plan-guide` (read-only one-shot dashboards), this skill is a turn-by-turn conversation that can apply agreed changes back to task files.

Files are only edited when the user signals "update the plan" (or equivalent). Conversation alone does not modify any task.

## Arguments

- `$ARGUMENTS`: An optional task ID, optionally followed by an opening topic/question. With no ID, runs in backlog mode.

**Parsing rules:**
- **Mode** — if the first whitespace-separated token is numeric → **task mode** (that token is the task ID, zero-padded to 3 digits). Otherwise → **backlog mode**.
- **Opening topic** —
  - Task mode: everything after the ID.
  - Backlog mode: the entire argument string.
  - Optional in both modes.

**Examples:**
- `/plan-discuss 1` — task mode: discuss task 1, let the user lead
- `/plan-discuss 1 should we split step 3?` — task mode, opened with a specific question
- `/plan-discuss 3 what am I missing in verification` — task mode, topic-led
- `/plan-discuss` — backlog mode: discuss the backlog as a whole
- `/plan-discuss is there redundancy in our pending plans?` — backlog mode, topic-led
- `/plan-discuss what should I work on next?` — backlog mode, topic-led

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments and pick mode**
   - If the leading whitespace-separated token is numeric → **task mode**: that token is `task_id` (zero-padded to 3 digits); remaining text → `opening_topic` (may be empty). Continue at step 4.
   - Otherwise → **backlog mode**: the entire argument string → `opening_topic` (may be empty). Continue at step 3b.

3b. **Backlog mode: load the backlog and open**
   - Gather the full picture (use Glob / Read; keep it to what you need):
     - Read `.plans/CONTEXT.md` if it exists (project overview, tech stack).
     - Read `.plans/HISTORY.md` if it exists (skim — completed work informs redundancy/overlap judgments).
     - Glob `.plans/pending/*.md` and read each active task. For each parse: id, title, type, status, a one-line gist of Why, step count + checkbox progress, and any `**Blocked by:**` field. Include statuses `pending`, `elaborated`, `in-progress`, `review`, `in-review`.
     - Optionally glance at `.plans/completed/*.md` titles to spot "already done" overlaps, but do not read them all in full.
   - If there are **no active tasks**, say so and suggest `/plan-capture` or `/plan-brainstorm`, then stop (no discussion to have).
   - Display a compact backlog header:
     ```
     Discussing the backlog — N active task(s)

     · #001 Update docs [chore] (pending)
     ○ #002 Add dark mode [feature] (elaborated, 0/4)
     ▶ #003 Fix login timeout [bug] (in-progress, 3/5)
     ★ #004 Add search [feature] (review, 4/4)

     Ask anything about the backlog — redundancy, overlap, gaps, sequencing, what to work
     on next, whether to combine or split tasks. To change a specific task, name it and say
     "update #N" (or "apply that to #N"). Say "done" to wrap up.
     ```
   - If `opening_topic` is non-empty, respond to it directly as the first turn (grounded in the loaded tasks). Otherwise invite the user's opening question.
   - Then converse per step 6, applying the backlog-mode notes there. Skip step 4.

4. **Task mode: load and validate task**
   - Find the task file: `.plans/pending/NNN-*.md` (Glob).
   - If not found: `Task #NNN not found. Run /plan-list to see available tasks.` — stop.
   - Read the file; parse the `**Status:**` field:
     - `elaborated` → proceed
     - `in-progress` → proceed
     - `review` / `in-review` → proceed (discussing mid-review is fine)
     - `pending` → `Task #NNN hasn't been elaborated. Run /plan-elaborate NNN first.` — stop.
     - `completed` → `Task #NNN is completed. Run /plan-reopen NNN first if you want to discuss it.` — stop.

5. **Task mode: open the discussion**
   - Display a compact header:
     ```
     Discussing #NNN: [Title]  (status: elaborated)

     Why: [one-line summary of Why section]
     How: N steps
     Verification: present / missing

     Ask anything, challenge any step, or propose alternatives. When you want a change
     written into the task, say "update the plan" (or "apply that", "write it in", etc.).
     Say "done" to wrap up.
     ```
   - If `opening_topic` is non-empty, respond to it directly as the first turn.
   - Otherwise invite the user's opening question.

6. **Converse turn by turn**
   - Respond in plain prose for substantive discussion (analysis, trade-offs, proposals).
   - **When you need to ask the user a question, prefer the interactive `AskUserQuestion` UI over plain-text prompts.** This applies to:
     - Multiple-choice trade-offs ("Should we A, B, or C?")
     - Yes/no decisions on a specific proposal
     - Picking among alternative orderings, scopes, or approaches
     - Confirming whether to apply a drafted edit (step 7)
   - Use plain prose (no `AskUserQuestion`) when the question is genuinely open-ended ("what are you most worried about here?") and a fixed set of options would constrain the user unhelpfully.
   - **If you have a strong recommendation among the options, say so explicitly.** Mark it in the question text (e.g., "Which approach? (I'd recommend B — simpler and avoids the migration)") and/or label the recommended option clearly. Don't present options as if they're equally weighted when they aren't — the user benefits from your judgment, not just a menu.
   - Stay grounded in the loaded files: when relevant, quote the specific step, Why bullet, or Verification line you're discussing (task mode), or the specific task ids/titles you're comparing (backlog mode).
   - Offer substance: point out trade-offs, missing cases, alternative orderings, assumptions worth challenging. Don't just agree.
   - **Backlog mode** — focus on cross-task analysis: redundancy/overlap (tasks that do the same thing or have overlapping scope), gaps (work implied by context/history but not captured), sequencing and dependencies (what unblocks what; what to do next and why), scope creep, and candidates to combine (`/plan-combine`) or split. When you identify a concrete restructuring, name the exact task ids and what you'd do. Cite specifics rather than generalities.
   - **Do NOT edit any task file during discussion.** Proposals stay in chat until the user signals an update.
   - Periodically (every 4–6 exchanges) note any threads that feel unresolved — this helps the user decide when to wrap.

7. **Detect update signals**

   Recognize any of these as an instruction to apply something to the task file (case-insensitive, partial-match phrases):
   - "update the plan", "update the task", "update step N"
   - "apply that", "apply it", "apply this"
   - "write it in", "write that in", "capture this", "add it to the task"
   - "amend step N", "edit step N", "change step N"
   - "put that in", "save that to the plan"

   **Backlog mode note:** an update signal must name a specific task (e.g. "update #3", "apply that to #5"). Determine the target id, then apply the same draft-confirm-edit flow below to that task's file (read it fresh if you only loaded a gist earlier). A bare "update the plan" with no task named → ask which task. For structural changes that span tasks — merging two tasks or splitting one — do NOT hand-edit files; instead point the user to the dedicated skill (`/plan-combine <ids>` to merge, `/plan-elaborate` or a fresh `/plan-capture` to split out new work) and let them run it.

   On signal:
   1. **Draft the diff in chat first.** Show the old content and the new content side by side (quote the exact existing line(s), then show the proposed replacement). Do not call `Edit` yet.
   2. **Wait for explicit confirmation.** Prefer `AskUserQuestion` with options like "Apply", "Revise", "Discard" rather than waiting for a free-text reply. Accept "yes", "apply", "go ahead", "do it", "looks good" if the user replies in prose. Ambiguous or partial acknowledgment ("maybe", "sort of") → ask for clarification before applying.
   3. **Apply the edit.** Use `Edit` with the exact existing text as `old_string`. Preserve:
      - Checkbox states (`[x]` stays `[x]`, `[ ]` stays `[ ]`) on unchanged steps.
      - Frontmatter fields.
      - Unrelated content in other sections.
      - Any `👁` review tags or step annotations.
   4. **Confirm briefly** in chat: `Updated step 4.` (task mode) or `Updated #3: rewrote step 2.` (backlog mode). Then return to discussion.
   5. Track the applied edit in an in-memory `applied_edits` list (record the task id it touched) for the final summary and commit.

8. **Detect exit signals**

   Recognize these as end-of-discussion (case-insensitive, partial-match):
   - "done", "that's enough", "exit", "wrap up", "wrap it up"
   - "thanks that's all", "let's stop", "end discussion"

   On signal, proceed to step 9.

9. **Summarize and commit**
   - Print a brief recap. **Task mode:**
     ```
     Discussion summary for #NNN: [Title]

     Applied:
     - Step 4 rewritten to mention timeouts
     - Added Verification bullet for empty-input case

     Discussed but not applied:
     - Alternative ordering for steps 2/3
     - Whether to split step 5

     Follow-ups you mentioned:
     - Confirm rate-limit policy with backend team
     ```
   - **Backlog mode:** title the recap `Backlog discussion summary` and, under Applied, prefix each item with the task it touched (e.g. `- #003: rewrote step 2`). Use the other sections for cross-task observations — redundancy/overlap spotted, suggested merges or splits (with the skill to run), sequencing recommendations, and follow-ups.
   - Omit any section that is empty.
   - Commit `.plans/` changes:
     - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`. If not a git repo: skip silently.
     - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`. If exit code 0 (ignored): skip silently.
     - Read `.plans/config.json` for `git_commits`. If not `true`: skip silently.
     - Check for uncommitted changes: `git status --porcelain .plans/`. If none: skip silently.
     - Commit:
       ```bash
       git add .plans/
       git commit -m "<message>"
       ```
       Message — task mode: `plan: discuss #NNN - [title]`. Backlog mode: `plan: backlog discussion` (append `- updated #N, #M` if specific tasks were edited).
     - If commit fails (hooks etc.): warn but do not fail the skill.

10. **Display confirmation**
    - **Task mode:**
      ```
      Discussion closed for #NNN: [Title]
      Applied X edit(s).

      Next: /plan-execute NNN
      ```
      If no edits were applied, say `No changes applied.` instead of `Applied X edit(s).`
      End-of-action marker (final line): `🟢 DISCUSSED · Task #NNN → Next: /plan-execute NNN`
    - **Backlog mode:**
      ```
      Backlog discussion closed.
      Applied X edit(s) across the backlog.

      Next: /plan-status
      ```
      If no edits were applied, say `No changes applied.` instead. Pick the `Next:` suggestion that best fits the conversation — `/plan-status` by default, or a more specific one if it emerged (e.g. `/plan-combine 3 5` if you recommended a merge, `/plan-execute N` if a clear next task surfaced).
      End-of-action marker (final line): `🟢 DISCUSSED · Backlog → Next: /plan-status` (swap in the chosen Next command if different).

## Edge Cases

- **No arguments at all**: backlog mode (step 3b) — do NOT prompt for an ID or error.
- **Non-numeric leading token**: backlog mode, treating the whole string as the opening topic (e.g. `/plan-discuss is there redundancy?`).
- **Backlog mode with no active tasks**: say there's nothing to discuss yet and suggest `/plan-capture` or `/plan-brainstorm`; stop.
- **Backlog mode, user wants to merge/split tasks**: don't hand-edit — point to `/plan-combine <ids>` (merge) or `/plan-capture` + `/plan-elaborate` (split), then let the user run it.
- **Task not found**: error with `/plan-list` suggestion.
- **Pending task**: direct to `/plan-elaborate`.
- **Completed task**: direct to `/plan-reopen`.
- **User signals update but the change is ambiguous** (e.g. "update the plan" with no concrete proposal on the table): offer to summarize the recent thread into a concrete proposed edit, then wait for confirmation.
- **User signals update for something outside the current task file** (e.g. "add this to task #5"): decline — this skill only edits the loaded task. Suggest `/plan-discuss 5` separately.
- **Edit fails to match exact text** (whitespace / invisible char mismatch): fall back to reading the full file, rewriting the section in memory, and using `Write` to overwrite. Warn the user that a larger rewrite occurred so they can sanity-check the diff.
- **User wants to add a new step**: allowed. Insert at the requested position (or end of How by default); preserve checkbox states on unchanged steps; renumber only if steps were explicitly numbered in prose.
- **User wants to remove a step**: allowed. Confirm in chat first (show which step and its checkbox state). If the step was already `[x]`, double-check before removing — that work is presumably done.
- **User wants to reorder steps**: allowed. Preserve each step's checkbox state through the reorder.
- **Task is in `review` / `in-review`**: discussion is allowed. Warn the user that applying edits to a reviewed task means the branch / worktree's committed state may drift from the task file — they may want `/plan-reopen` or to adjust manually afterward.
- **User ends without applying anything**: still run the commit block (no-op if nothing changed); confirmation says `No changes applied.`
- **Long-running conversation**: no artificial cap. Periodically note unresolved threads (step 6) so the user can decide when to wrap.
- **Worktree tasks**: `.plans/pending/NNN-*.md` lookup is the same regardless of worktree branch — no special handling.
