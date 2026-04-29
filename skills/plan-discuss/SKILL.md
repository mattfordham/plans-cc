---
name: plan-discuss
disable-model-invocation: false
argument-hint: "<id> [topic]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
description: Free-form discussion about an elaborated task; apply agreed changes to the plan on request
---

# plan-discuss

Have an open, turn-by-turn conversation about an already-elaborated task. Unlike `/plan-clarify` (a scripted scan for ambiguities) or `/plan-elaborate` (which generates structure from scratch), this skill is for thinking out loud with the user about an existing plan — questioning approach, weighing trade-offs, surfacing missing cases — and capturing any agreed changes back into the task file on explicit user signal.

The file is only edited when the user signals "update the plan" (or equivalent). Conversation alone does not modify the task.

## Arguments

- `$ARGUMENTS`: A task ID (required), optionally followed by an opening topic/question.

**Parsing rules:**
- **Task ID** — first whitespace-separated token, must be numeric. Zero-pad to 3 digits.
- **Opening topic** — everything after the ID is the opening topic/question. Optional.
- If no numeric token is present at the start → no ID (will prompt).

**Examples:**
- `/plan-discuss 1` — open a discussion on task 1, let the user lead
- `/plan-discuss 1 should we split step 3?` — open with a specific question
- `/plan-discuss 3 what am I missing in verification` — topic-led opening

## Steps

1. **Verify initialization**
   - Use Glob or Read to check `.plans/config.json` exists. Do NOT skip this check.
   - If missing: error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments**
   - Extract leading numeric token → `task_id` (zero-padded to 3 digits).
   - Remaining text → `opening_topic` (may be empty).

3. **Handle missing ID**
   - If `task_id` is empty, list tasks in statuses `elaborated`, `in-progress`, `review`, `in-review`:
     ```
     Tasks available to discuss:
     #001 - Fix login timeout bug (elaborated)
     #003 - Add dark mode (in-progress)

     Which task ID would you like to discuss?
     ```
   - Parse the user's response as a numeric ID.

4. **Load and validate task**
   - Find the task file: `.plans/pending/NNN-*.md` (Glob).
   - If not found: `Task #NNN not found. Run /plan-list to see available tasks.` — stop.
   - Read the file; parse the `**Status:**` field:
     - `elaborated` → proceed
     - `in-progress` → proceed
     - `review` / `in-review` → proceed (discussing mid-review is fine)
     - `pending` → `Task #NNN hasn't been elaborated. Run /plan-elaborate NNN first.` — stop.
     - `completed` → `Task #NNN is completed. Run /plan-reopen NNN first if you want to discuss it.` — stop.

5. **Open the discussion**
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
   - Stay grounded in the task file: when relevant, quote the specific step, Why bullet, or Verification line you're discussing.
   - Offer substance: point out trade-offs, missing cases, alternative orderings, assumptions worth challenging. Don't just agree.
   - **Do NOT edit the task file during discussion.** Proposals stay in chat until the user signals an update.
   - Periodically (every 4–6 exchanges) note any threads that feel unresolved — this helps the user decide when to wrap.

7. **Detect update signals**

   Recognize any of these as an instruction to apply something to the task file (case-insensitive, partial-match phrases):
   - "update the plan", "update the task", "update step N"
   - "apply that", "apply it", "apply this"
   - "write it in", "write that in", "capture this", "add it to the task"
   - "amend step N", "edit step N", "change step N"
   - "put that in", "save that to the plan"

   On signal:
   1. **Draft the diff in chat first.** Show the old content and the new content side by side (quote the exact existing line(s), then show the proposed replacement). Do not call `Edit` yet.
   2. **Wait for explicit confirmation.** Prefer `AskUserQuestion` with options like "Apply", "Revise", "Discard" rather than waiting for a free-text reply. Accept "yes", "apply", "go ahead", "do it", "looks good" if the user replies in prose. Ambiguous or partial acknowledgment ("maybe", "sort of") → ask for clarification before applying.
   3. **Apply the edit.** Use `Edit` with the exact existing text as `old_string`. Preserve:
      - Checkbox states (`[x]` stays `[x]`, `[ ]` stays `[ ]`) on unchanged steps.
      - Frontmatter fields.
      - Unrelated content in other sections.
      - Any `👁` review tags or step annotations.
   4. **Confirm briefly** in chat: `Updated step 4.` or `Added Verification bullet.` Then return to discussion.
   5. Track the applied edit in an in-memory `applied_edits` list for the final summary.

8. **Detect exit signals**

   Recognize these as end-of-discussion (case-insensitive, partial-match):
   - "done", "that's enough", "exit", "wrap up", "wrap it up"
   - "thanks that's all", "let's stop", "end discussion"

   On signal, proceed to step 9.

9. **Summarize and commit**
   - Print a brief recap:
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
     Omit any section that is empty.
   - Commit `.plans/` changes:
     - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`. If not a git repo: skip silently.
     - Check if `.plans/` is gitignored: `git check-ignore -q .plans/ 2>/dev/null`. If exit code 0 (ignored): skip silently.
     - Read `.plans/config.json` for `git_commits`. If not `true`: skip silently.
     - Check for uncommitted changes: `git status --porcelain .plans/`. If none: skip silently.
     - Commit:
       ```bash
       git add .plans/
       git commit -m "plan: discuss #NNN - [title]"
       ```
     - If commit fails (hooks etc.): warn but do not fail the skill.

10. **Display confirmation**
    ```
    Discussion closed for #NNN: [Title]
    Applied X edit(s).

    Next: /plan-execute NNN
    ```
    If no edits were applied, say `No changes applied.` instead of `Applied X edit(s).`

## Edge Cases

- **No arguments at all**: prompt for an ID (step 3).
- **Non-numeric leading token**: error: `Usage: /plan-discuss <id> [topic]`.
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
