# YOLO Mode and External-Content Ingestion for /plan-execute

**ID:** 007
**Created:** 2026-05-11T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-05-11T19:50
**Branch:** feature/007-yolo-mode-and-external-content-ingestion

## What

Add two related capabilities to `/plan-execute`:

**1. External-content ingestion pre-step.** Detect when `$ARGUMENTS` is external input rather than a user-authored task description, and normalize it into a clean title + structured description before handing off to plan-capture.

Sources to detect:
- **Trello URL** → use `mcp__trello__get_card` to pull description, image attachments, comments, checklist items
- **GitHub issue / Linear URL** → `WebFetch` the page and extract title + body
- **Long pasted text** (>5 lines, looks like an email/ticket dump) → preserve as structured description with a derived title

For the first cut, inline Trello + WebFetch detection directly (no adapter framework). Adapters can be extracted later when a second concrete source is added.

**2. `yolo` keyword for autonomous execution.** New keyword parsed alongside the existing `branch` / `worktree` keywords. YOLO mode implies:
- `worktree_mode = true` (forces worktree — reuses existing defer logic)
- Skip-mode elaboration (no prompts during auto-elaborate)
- No observation pauses during execution (defer all to review)
- No testing/feedback loop pause — status goes directly to `review` on completion
- Executor sub-agent is instructed to make assumptions and proceed rather than block on ambiguity

**3. Confidence tracking via `## Assumptions` section.** Both plan-elaborate (in skip mode) and the plan-executor sub-agent (in yolo mode) append items, each tagged with confidence:
```
- [high] chose X because Y
- [low] assumed the API returns Z — needs verification
```

Two subsections so writes don't collide:
```
## Assumptions

### Initial (from elaboration)
- [high] ...
- [low] ...

### Discovered during execution
- [low] ...
```

Low-confidence heuristics for the executor prompt:
- Picked between 2+ plausible implementations
- Guessed at field/API shape that wasn't documented in the task
- Made a UX call the source ticket didn't specify
- Made a scope call (full fix vs. workaround)
- Used a library/pattern not already present in the project

**4. `/plan-review` surfaces low-confidence assumptions** at the top of the review summary in a `⚠ Low-confidence assumptions to verify:` block, before the diff summary. Filter via regex on `- [low]` lines in the Assumptions section.

**5. Failure modes — YOLO bails to interactive when:**
- Trello fetch fails (auth, private board, deleted card)
- Card has no description
- Elaboration research sub-agent can't find relevant code in the project

In all bail cases, print a clear message and switch to non-autonomous flow — never execute on a bad plan silently.

## Why

Closes a real workflow gap: when an external ticket (Trello card, GitHub issue, pasted email) arrives, you currently have to manually paraphrase it before `/plan-capture`, then drive every elaboration prompt, every observation pause, and the testing/feedback loop interactively. For high-confidence tickets where you trust the system to take its best shot and flag the questionable bits for review, that's friction without payoff.

YOLO mode + external-content ingestion compresses the path from "ticket in hand" to "branch ready for review" into a single command. The `## Assumptions` layer is what makes this safe to use casually — instead of hiding judgment calls inside opaque code, the executor surfaces them at the top of the review, so the reviewer knows exactly where to look first.

## How

- [x] Step 1: Add `yolo` keyword parsing to `skills/plan-execute/SKILL.md` step 2 (after worktree detection, before branch). Patterns: `yolo`, `yolo mode`, `autonomous`. Setting `yolo_mode = true` implies `worktree_mode = true` and `branch_mode = true`. Update the Arguments section table and examples. Strip from `$ARGUMENTS` before further parsing.

- [x] Step 2: Add new pre-step (call it 2.5 or insert before step 3) in `skills/plan-execute/SKILL.md` for external-content normalization. Detection logic:
  - Trello URL regex (`https?://trello\.com/c/[a-zA-Z0-9]+`) → call `mcp__trello__get_card`, extract `name` as title and assemble description from `desc` + checklist items + non-trivial comments. Add `mcp__trello__get_card` to allowed-tools.
  - GitHub issue regex (`github\.com/[^/]+/[^/]+/issues/\d+`) → `WebFetch` and extract title + body.
  - Linear URL regex (`linear\.app/`) → `WebFetch` and extract title + body.
  - Otherwise, if `$ARGUMENTS` is >5 lines AND contains no step-filter/branch/worktree/yolo keywords → treat as pasted-text dump. Use first non-empty line (truncated) as title, full text as description.
  - On any match, replace `capture_description` with a normalized string: `**Source:** [type] [url-or-marker]\n\n**Title:** [title]\n\n[description]`. Set a `source_kind` flag for downstream logging.
  - On Trello fetch failure / empty description / WebFetch failure: if `yolo_mode` was set, print bail message (`YOLO bailing to interactive: [reason]. Run /plan-capture manually.`), unset `yolo_mode`, and either prompt user or stop. If `yolo_mode` was not set, just print warning and pass the raw `$ARGUMENTS` to plan-capture as today.

- [x] Step 3: Update `skills/plan-capture/SKILL.md` step 6 (task file template) to include a new `## Assumptions` section with `### Initial (from elaboration)` and `### Discovered during execution` subsections, each placeholder `_To be filled..._`. Insert after Impact Scope and before Changes.

- [x] Step 4: Update `skills/plan-elaborate/SKILL.md` step 14 to write into `## Assumptions > Initial (from elaboration)` when in skip mode. Capture decisions made by auto-selecting first options (open questions, approach choices, validation adjustments) and tag each `- [high]` if it matched a clear codebase pattern in research, or `- [low]` if the research had open questions or surfaced ambiguity. Document the tagging heuristics inline in step 14.

- [x] Step 5: Update `skills/plan-execute/SKILL.md` step 11.c (executor prompt template) to append an `## Assumptions to Track` block with the low-confidence heuristics list. Instruct executor to write entries to `## Assumptions > Discovered during execution` in the task file before returning. Update executor response parsing in step 11.b.3 to read back any newly-written assumptions for state-file logging.

- [x] Step 6: Wire `yolo_mode` through `skills/plan-execute/SKILL.md`:
  - Step 7c (branch question): auto-accept suggested branch (same as `branch_mode`)
  - Step 11.b.6 (observation pause): treat `yolo_mode` identically to `worktree_mode` — defer all observations
  - Step 11.d / 11.e (worktree finish): `yolo_mode` follows the same `review` status path as `worktree_mode`
  - Step 11.e completion summary: when `yolo_mode`, include a footer line `YOLO assumptions logged — see /plan-review NNN for low-confidence items.`
  - Skip step 14 (testing/feedback loop) entirely when `yolo_mode` (same as worktree behavior today)

- [x] Step 7: Update `skills/plan-review/SKILL.md` step that builds the review summary to read the task file's `## Assumptions` section, filter for `- [low]` lines via regex, and inject a `⚠ Low-confidence assumptions to verify:` block at the top of the summary (before diff stats and completed steps). If there are zero low-confidence items, omit the block entirely. Show high-confidence items only if explicitly requested (don't clutter the top of review).

- [x] Step 8: Add bail-out edge cases to `skills/plan-execute/SKILL.md` Edge Cases section:
  - Trello fetch fails → message + fall back to interactive
  - Empty Trello description → message + prompt for manual description
  - Research sub-agent reports zero relevant files in yolo mode → bail to interactive, prompt for guidance
  - `yolo` without external content (just `/plan-execute "Fix bug" yolo`) → still valid; just runs the autonomous flow on user-authored text
  - `yolo` with task ID (`/plan-execute 5 yolo`) → still valid; skips external-content step entirely and runs autonomous execution on existing task

- [x] Step 9: Update `CLAUDE.md` to mention `yolo` keyword in the Shortcuts section. Update `skills/plan-help/SKILL.md` if it lists keywords. Manual test: full lifecycle from a real Trello URL → confirm worktree created, branch named, status reaches `review`, low-confidence items appear in `/plan-review` output.

## Verification

- Running `/plan-execute https://trello.com/c/<id> yolo` fetches the card, captures, elaborates, creates a worktree + branch, executes all segments without prompting, lands in `review` status, and prints a summary referencing assumptions.
- Running `/plan-execute "Some normal task" yolo` triggers autonomous flow without external-content fetch.
- Running `/plan-execute 5 yolo` runs autonomous execution on existing task #5.
- Running `/plan-review NNN` on a yolo-completed task shows the `⚠ Low-confidence assumptions to verify:` block above the diff summary (when low-confidence items exist).
- When Trello returns no description: skill prints bail message and switches to interactive — no execution happens on empty input.
- When research finds zero relevant files in yolo mode: skill bails to interactive elaboration — no autonomous execution.
- Non-yolo flows (`/plan-execute 5`, `/plan-execute 5 worktree`, `/plan-execute "desc"`) behave exactly as today — no regressions in the keyword-parsing block.

## Impact Scope

### Files to Modify
- [ ] `skills/plan-execute/SKILL.md` — yolo keyword parsing, external-content pre-step, executor prompt additions, yolo flag wiring through steps 7c / 11.b.6 / 11.d / 11.e, edge cases
- [ ] `skills/plan-capture/SKILL.md` — add `## Assumptions` section (with two subsections) to task file template in step 6
- [ ] `skills/plan-elaborate/SKILL.md` — write Initial assumptions during skip-mode elaboration in step 14, document tagging heuristics
- [ ] `skills/plan-review/SKILL.md` — filter `- [low]` lines from Assumptions, inject `⚠` block at top of review summary
- [ ] `CLAUDE.md` — mention `yolo` keyword in Shortcuts section
- [ ] `skills/plan-help/SKILL.md` — list `yolo` keyword if keywords are enumerated there

### Related Files (may need updates)
- `agents/plan-executor.md` — if assumption-tagging instructions are better placed in the agent definition than the per-segment prompt
- `skills/plan-init/SKILL.md` — if it generates a starter task or context file that should mention yolo
- Existing pending tasks under `.plans/pending/` — won't have the new `## Assumptions` section; plan-review's regex filter should gracefully no-op when the section is absent

### Endpoints/UI Affected
- Dashboard (`bin/dashboard.js` if it surfaces task sections) — would show the new Assumptions section if it renders the full task file; verify nothing breaks if section is missing on older tasks
- `/plan-review` output — gains the `⚠` block at the top when low-confidence items exist

## Assumptions

### Initial (from elaboration)
- [high] Inline Trello + WebFetch detection rather than building an adapter framework. **Why:** Only one concrete source at the start (Trello); the second-source-extraction refactor is cheap and YAGNI applies.
- [high] `yolo_mode` reuses `worktree_mode`'s defer-observations + skip-testing-loop + status→review logic rather than duplicating it. **Why:** That code path already exists and is tested; YOLO is fundamentally "worktree mode + auto-elaborate + assumption-tagging."
- [high] Assumptions section is loose Markdown with `- [high]` / `- [low]` prefixes (regex-filterable), not YAML. **Why:** Consistent with How checkboxes and other task-file sections; trivial to read and write.
- [high] Two subsections in Assumptions (`### Initial` and `### Discovered during execution`) so plan-elaborate and plan-executor don't collide on writes. **Why:** Clear ownership; reviewers can see what came from research vs. what surfaced during the actual build.
- [low] `mcp__trello__get_card` is available and the user has Trello MCP authenticated. **Why:** The user mentioned Trello as the motivating use case and confirmed the workflow, but auth state isn't verified in the codebase. **Verify during execution:** add a graceful auth-failure bail message.
- [low] WebFetch on a GitHub/Linear issue URL returns enough HTML to parse a title + body cleanly. **Why:** WebFetch behavior on auth-walled or JS-rendered pages varies; Linear in particular is a SPA. **Verify during execution:** test against a real Linear URL; if it fails, document the limitation.
- [low] Pasted-text detection threshold of ">5 lines" is the right boundary. **Why:** Picked first-option default from research's open question; might need tuning based on real use. **Verify during execution:** flag for adjustment after manual testing.
- [low] Adding `## Assumptions` to plan-capture's template won't break older tasks that lack the section. **Why:** plan-review's regex should no-op gracefully on missing sections, but this needs explicit testing during step 9.

### Discovered during execution
_To be filled during execution_

## Changes

### Segment 1 (steps 1-3)
- `skills/plan-execute/SKILL.md`: added yolo keyword parsing in Arguments rules + step 2 (between worktree and branch detection); added step 2.5 "Normalize external content" with Trello / GitHub-issue / Linear / pasted-text detectors and yolo-bail behavior; added `mcp__trello__get_card` to allowed-tools.
- `skills/plan-capture/SKILL.md`: added `## Assumptions` section to task-file template (between Impact Scope and Changes) with `### Initial (from elaboration)` and `### Discovered during execution` subsections.

### Segment 2 (steps 4-6)
- `skills/plan-elaborate/SKILL.md`: step 14 now writes auto-picks to `## Assumptions > Initial (from elaboration)` with `[high]/[low]` tags when in skip mode; tagging heuristics documented inline.
- `skills/plan-execute/SKILL.md`: appended `## Assumptions to Track` block to executor prompt template (step 11.c); extended step 11.b.3 to diff and log Discovered bullets to state file; wired `yolo_mode` explicitly at step 7c (branch auto-accept), 11.b.6 (observation deferral), 11.d/11.e (worktree-finish gate, completion summary footer "YOLO assumptions logged — see /plan-review NNN for low-confidence items.", and step 12-14 skip).

### Segment 3 (steps 7-9)
- `skills/plan-review/SKILL.md`: review summary now reads task's `## Assumptions` section, filters `^- \[low\]` lines, and renders `⚠ Low-confidence assumptions to verify:` block above the `# Review: Task #NNN` heading; gracefully no-ops when section absent or no matches; high-confidence items not shown by default.
- `skills/plan-execute/SKILL.md`: added 5 bail-out Edge Cases (Trello fetch fails, empty Trello description, zero relevant files in yolo mode, yolo with no external content, yolo with task ID).
- `CLAUDE.md`: yolo keyword mentioned in Shortcuts section.
- `skills/plan-help/SKILL.md`: Fast track examples updated to include yolo; small "Keywords on `/plan-execute`" note added.

## Notes

User confirmed `yolo` as the keyword. Workflow goal: paste a Trello URL, get a worktree-isolated branch ready for review, with low-confidence assumptions flagged so the reviewer knows where to look first.

Research findings stored in conversation context (skip-mode elaboration, 2026-05-11). Key architectural decision: YOLO is "worktree mode + auto-elaborate + assumption-tagging" — no new execution path, just additional flag wiring and prompt enrichment.
