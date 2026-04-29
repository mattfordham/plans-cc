---
name: plan-clarify
disable-model-invocation: false
argument-hint: "<id> [skip]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Find ambiguities in an elaborated task and resolve them interactively
---

# plan-clarify

Scan an elaborated task for ambiguities — vague verbs, TODO/TBD markers, unspecified references, open questions, unresolved issues — and walk the user through resolving each one. Resolutions are written back into the task file in place, so downstream `/plan-execute` runs against a sharper plan.

Complements `/plan-elaborate`: elaborate generates structure, clarify hardens it.

## Arguments

- `$ARGUMENTS`: A task ID, optionally followed by a skip keyword

**Parsing rules:**
- **Skip detection** (first) — set `skip_mode = true` if `$ARGUMENTS` contains any of:
  - Single keywords (per-token, case-insensitive): `skip`, `auto`, `noprompt`, `noinput`
  - Phrases (matched against full argument string, case-insensitive): `skip input`, `no input`, `no prompts`, `just go`, `just do it`
  - Strip skip keywords/phrases from `$ARGUMENTS` before further parsing
- **Task ID** — after removing skip tokens, the remaining token should be a single numeric ID. Zero-pad to 3 digits.
- If nothing remains → no ID (will prompt).

**Examples:**
- `/plan-clarify 1` — clarify task 1, interactive
- `/plan-clarify 1 skip` — clarify task 1, auto-pick first suggestion for every finding
- `/plan-clarify skip` — skip mode, but prompt for ID first

## Steps

1. **Verify initialization**
   - Use Glob or Read to check `.plans/config.json` exists. Do NOT skip this check.
   - If missing: error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments**
   - Detect skip keywords/phrases (see Arguments) → `skip_mode`
   - Strip them from `$ARGUMENTS`
   - If a numeric token remains → zero-pad to 3 digits → `task_id`
   - Otherwise `task_id` is empty

3. **Handle missing ID**
   - If `task_id` is empty, list elaborated / in-progress tasks:
     ```
     Tasks available to clarify:
     #001 - Fix login timeout bug (elaborated)
     #003 - Add dark mode (in-progress)

     Which task ID to clarify?
     ```
   - Parse the user's response as a numeric ID.

4. **Load and validate task**
   - Find the task file: `.plans/pending/NNN-*.md` (Glob)
   - If not found: `Task #NNN not found. Run /plan-list to see available tasks.` — stop.
   - Read the file; parse the `**Status:**` field:
     - `elaborated` → proceed
     - `in-progress` → proceed
     - `pending` → `Task #NNN hasn't been elaborated. Run /plan-elaborate NNN first.` — stop.
     - `review` / `in-review` → proceed (clarifying mid-review is fine)
     - `completed` → `Task #NNN is completed. Run /plan-reopen NNN first if you want to clarify it.` — stop.

5. **Scan for ambiguities (balanced scope)**

   Analyze the task file and build a `findings` list. Each finding: `{ id, location, category, excerpt, suggested_resolutions }`.

   Scan these categories:

   - **Explicit markers** — grep the file for any of these tokens (case-insensitive where sensible): `TODO`, `TBD`, `FIXME`, `???`, `[?]`. Also flag any line in the Why or Verification section that is a trailing `?` (an open question the author left behind). Do NOT flag `?` characters inside Open Questions bullets (those are handled below).
   - **Vague verbs / hedges in How steps** — within the `## How` section only, flag checkbox lines that contain any of: `handle`, `support`, `improve`, `update as needed`, `somehow`, `maybe`, `probably`, `might`, `etc.`, `and so on`, `appropriately`, `properly`. Only flag when the word is a load-bearing verb/adverb — e.g. "handle edge cases" is flagged, but "handler" as part of a filename is not.
   - **Unspecified references in How steps** — flag phrases like `the file`, `this function`, `that module`, `somewhere`, `the component` when they appear without an adjacent concrete path or name (no backticks, no `.ext` extension, no PascalCase identifier within 5 tokens).
   - **Open Questions subsection** — if `### Open Questions` (or `## Open Questions`) exists, treat every bullet as a finding.
   - **Unresolved Issues** — if `## Issues` exists, each unchecked `- [ ]` bullet is a finding.

   Deduplicate overlapping findings (e.g. if a line matches both "vague verb" and "explicit marker", prefer the more specific category).

   For each finding, generate 1–2 `suggested_resolutions` by looking at surrounding context in the task file (adjacent steps, Why, file paths mentioned elsewhere). Keep suggestions short and concrete.

6. **Handle empty findings**
   - If `findings` is empty:
     ```
     No ambiguities found in #NNN: [Title].
     Task looks ready to execute: /plan-execute NNN
     ```
   - Stop.

7. **Present summary**
   Before walking through, show the user the full list so they know what's coming:
   ```
   Found N ambiguities in #NNN: [Title]

   1. [How step 3]  Vague verb — "handle edge cases"
   2. [Why]         Placeholder — "TBD"
   3. [Open Q]      Should tokens expire after 1h or 24h?
   ...
   ```

8. **Resolve each finding via AskUserQuestion**

   Loop over `findings`. For each one:

   - Build an `AskUserQuestion` call with:
     - `question`: a concrete question derived from the finding, e.g. `Step 3 says "handle edge cases" — which edge cases specifically?`
     - `header`: short label (≤12 chars), e.g. `Clarify`, `Open Q`, `Issue`
     - `options` (2–4): the auto-generated `suggested_resolutions` first, followed by:
       - `{ label: "Different — I'll specify", description: "Provide your own answer" }`
       - `{ label: "Skip this one", description: "Leave as-is, revisit later" }`

   - **Skip mode shortcut**: if `skip_mode` is true, auto-select the first suggested resolution without calling `AskUserQuestion`.

   - If the user picks "Different", follow up by asking for their text in plain prose (one more `AskUserQuestion` with a single free-form option, or allow "Other" input).
   - If the user picks "Skip this one", record the finding in `deferred` and move on.
   - Otherwise record the chosen resolution against the finding.

9. **Apply resolutions to task file**

   For every resolved finding, use `Edit` to update the task file in place:

   - **Vague verb / unspecified reference in How step**: replace the excerpt with the clarified text, preserving the checkbox marker and any `👁` tag. E.g. `- [ ] Step 3: handle edge cases` → `- [ ] Step 3: handle empty input and network timeout`.
   - **Explicit marker (TODO/TBD/FIXME/???)**: replace the marker (and any `: TBD`-style suffix) with the resolution text. If the entire line was a placeholder, rewrite the line.
   - **Open Questions bullet**: delete the resolved bullet. If the resolution affects How/Verification, also apply it there (ask the user if unclear where it lands). If `### Open Questions` becomes empty, delete the subsection header too.
   - **Unresolved Issue**: either check the box off and append ` — resolved: [decision]`, or rewrite the bullet to reflect the clarified decision (pick whichever the user's resolution fits).

   Edit in place — do NOT append a Clarifications / audit-log section.

   Preserve all existing checkbox states (`[x]` stays `[x]`), frontmatter fields, and unrelated content.

10. **Validate post-edit**
    - Re-read the updated file and re-run the step 5 scan restricted to resolved findings' categories/excerpts.
    - If any resolved excerpt still matches: warn the user with the specific line, e.g. `Warning: step 3 still contains "handle" — you may want to run /plan-clarify again or edit manually.`
    - Do not fail the skill on post-validation warnings.

11. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Check if `.plans/` is gitignored: `git check-ignore -q .plans/ 2>/dev/null`. If exit code 0 (ignored): skip silently.
    - Read `.plans/config.json` for `git_commits`. If not `true`: skip silently.
    - Check for uncommitted changes: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: clarify #NNN - [title]"
      ```
    - If commit fails (hooks etc.): warn but do not fail the skill.

12. **Display confirmation**
    ```
    Clarified task #NNN: [Title]
    Resolved: X ambiguities
    Deferred: Y (still in task)

    Next: /plan-execute NNN
    ```

    If `Y > 0`, list the deferred items briefly so the user knows what's left:
    ```
    Deferred:
    - [How step 5] "update as needed"
    - [Open Q] What happens on concurrent writes?
    ```

## Edge Cases

- **No arguments at all**: prompt for an ID (step 3).
- **Non-numeric argument after stripping skip tokens**: error: `Usage: /plan-clarify <id> [skip]`.
- **Task not found**: error with `/plan-list` suggestion.
- **Pending task**: direct to `/plan-elaborate`.
- **Completed task**: direct to `/plan-reopen`.
- **No ambiguities**: exit cleanly (step 6).
- **Skip mode with no findings**: same as no findings — still exits cleanly.
- **Skip mode with findings**: auto-pick first suggested resolution for each; deferred count is 0.
- **User aborts mid-walkthrough** (e.g. Esc): apply resolutions collected so far, mark the rest as deferred, still update the file and commit.
- **Suggested resolution is ambiguous itself**: prefer "Different — I'll specify" as the first option in that case, so the user is nudged to author a concrete answer.
- **Edit fails to find the exact excerpt** (e.g. whitespace mismatch): fall back to reading the full file, rewriting in memory, and using `Write` to overwrite. Warn the user that a larger rewrite occurred.
- **Open Questions subsection with non-bullet content** (e.g. prose paragraphs): treat each paragraph as a finding, but cap at the first 10 items to avoid overwhelming prompts.
- **Issue resolution requires code changes**: the user's answer may describe an approach rather than resolving the issue — record it on the Issue bullet but do not auto-check the box; explain in the confirmation that execution is still needed.
- **Worktree tasks**: `.plans/pending/NNN-*.md` lookup is the same regardless of worktree branch — no special handling.
- **Task file has no `## How` section**: skip the vague-verb and unspecified-reference scans; still scan the whole file for explicit markers and Open Questions.
