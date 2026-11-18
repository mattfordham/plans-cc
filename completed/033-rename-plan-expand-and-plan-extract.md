# Rename /plan-expand to /plan-unpack and /plan-extract to /plan-mine

**ID:** 033
**Created:** 2026-08-24T00:00
**Type:** refactor
**Status:** completed
**Branch:** refactor/033-rename-plan-expand-and-plan-extract
**Completed:** 2026-08-24T00:00

## What
Rename `/plan-expand` to `/plan-unpack` and `/plan-extract` to `/plan-mine`, freeing the `plan-ex` tab-completion prefix for the frequently-used `/plan-execute`.

**Motivation:** `/plan-execute` is used constantly; `/plan-expand` and `/plan-extract` are used rarely. All three share the `plan-ex` prefix, so tab-completing the common one requires typing `plan-exe` and still disambiguating. Renaming BOTH rare skills is required — renaming only `plan-expand` leaves `plan-extract` blocking the prefix, which would not deliver the win.

**Name rationale:**
- `plan-unpack` — describes decomposing an idea into its constituent tasks; unique `plan-u` prefix.
- `plan-mine` — the skill pulls action items out of unstructured conversational prose. "Mine" is already the verb used for this kind of operation in CLAUDE.md (`/plan-retrospect` "mines completed plan history"). Unique at `plan-mi` (only `plan-merge-reviews` shares `plan-m`).

**Scope:**
- `git mv` both skill directories.
- Update `name:` frontmatter and the `#` heading in each `SKILL.md`.
- Update the 13 external cross-references:
  - `README.md` — 2 (both plan-expand)
  - `CLAUDE.md` — 1 each (All Skills table)
  - `skills/plan-pick/SKILL.md` — 2
  - `skills/plan-help/SKILL.md` — 2
  - `skills/plan-ideas/SKILL.md` — 3
  - `skills/plan-brainstorm/SKILL.md` — 1
  - `skills/plan-guide/SKILL.md` — 1
- Fill two pre-existing documentation gaps found while scoping: `plan-extract`/`plan-mine` is missing from BOTH `README.md`'s command table and `skills/plan-help/SKILL.md`'s command table. Add it while renaming.

## Why
`/plan-execute` is one of the most frequently typed commands in the suite; `/plan-expand` and `/plan-extract` are among the least. All three share the `plan-ex` prefix, so tab-completing the common command requires typing far enough to disambiguate against two rarely-used neighbours. Renaming both rare skills frees `plan-ex` to complete directly to `/plan-execute`.

The win only materializes if BOTH are renamed. Renaming `plan-expand` alone leaves `plan-extract` occupying the prefix, which would deliver none of the benefit while still paying the full cost of a rename.

## How Summary
A pure rename with no behavioral change. Two skill directories are moved with `git mv`, each SKILL.md gets its `name:` frontmatter and `#` heading updated to match, and 13 cross-references across 7 files are rewritten. Two pre-existing documentation gaps (the extract skill missing from both user-facing command tables) are filled at the same time, since the rename already touches those exact tables.

No logic, arguments, or on-disk data formats change. The `## Expanded Into` section written into users' idea files is deliberately left alone.

**Files of note:**
- `skills/plan-expand/SKILL.md` → `skills/plan-unpack/SKILL.md` (frontmatter `name:` + `#` heading)
- `skills/plan-extract/SKILL.md` → `skills/plan-mine/SKILL.md` (frontmatter `name:` + `#` heading)
- `README.md` — 2 expand refs (lines ~162, ~253) + add the missing mine row near `/plan-import` (~line 152)
- `CLAUDE.md` — All Skills table, 1 row each (~lines 420, 439)
- `skills/plan-ideas/SKILL.md` — 3 refs (user-facing `Next:` hints at ~54, ~71, ~77)
- `skills/plan-pick/SKILL.md` — 2 refs (~16 prose contrast, ~179 cross-skill note)
- `skills/plan-help/SKILL.md` — 2 refs (~52 table, ~179 example) + add the missing mine row
- `skills/plan-brainstorm/SKILL.md` — 1 ref (~202, end-of-action marker `Next:` hint)
- `skills/plan-guide/SKILL.md` — 1 ref (~132, suggested next action)

## How
- [x] Step 1: `git mv skills/plan-expand skills/plan-unpack` and `git mv skills/plan-extract skills/plan-mine`. Verify both directories moved and no stray originals remain.
- [x] Step 2: In `skills/plan-unpack/SKILL.md` update `name: plan-expand` → `name: plan-unpack` and the `# plan-expand` heading → `# plan-unpack`. Do the same in `skills/plan-mine/SKILL.md` for `plan-extract` → `plan-mine`. Also update any self-referential `/plan-expand` or `/plan-extract` mentions inside each skill's own body prose.
- [x] Step 3: Rewrite the 11 `plan-expand` cross-references in `README.md` (2), `CLAUDE.md` (1), `skills/plan-ideas/SKILL.md` (3), `skills/plan-pick/SKILL.md` (2), `skills/plan-help/SKILL.md` (2), `skills/plan-brainstorm/SKILL.md` (1), `skills/plan-guide/SKILL.md` (1). Preserve surrounding wording — only the command token changes.
- [x] Step 4: Rewrite the 1 `plan-extract` cross-reference in `CLAUDE.md`'s All Skills table.
- [x] Step 5: Fill the two documentation gaps — add a `/plan-mine` row to `README.md`'s command table (next to `/plan-import`, its structural sibling: import handles structured docs, mine handles messy prose) and to `skills/plan-help/SKILL.md`'s command table. Match each table's existing column style and wording register.
- [x] Step 6: Verify — run `grep -rn "plan-expand\|plan-extract" --exclude-dir=.git .` and confirm zero hits. Confirm `/plan-unpack` and `/plan-mine` each appear in the CLAUDE.md All Skills table, README.md, and plan-help. Confirm `## Expanded Into` is still present and unmodified in `skills/plan-pick/SKILL.md` and `skills/plan-ideas/SKILL.md`.

## Verification
- `grep -rn "plan-expand\|plan-extract" --exclude-dir=.git .` returns zero hits
- `ls skills/ | grep -E "plan-(unpack|mine)"` shows both new directories, and `plan-expand`/`plan-extract` are gone
- `name:` frontmatter in each renamed SKILL.md matches its new directory name (the repo convention)
- Both `/plan-unpack` and `/plan-mine` appear in the CLAUDE.md All Skills table, README.md, and plan-help
- `grep -rn "Expanded Into" skills/` still shows the section intact in plan-pick and plan-ideas (deliberately NOT renamed)

## Impact Scope
2 directories renamed, 9 files edited:
- `skills/plan-expand/SKILL.md` → `skills/plan-unpack/SKILL.md` (renamed + self-refs)
- `skills/plan-extract/SKILL.md` → `skills/plan-mine/SKILL.md` (renamed + self-refs)
- `README.md` (2 rewrites + 1 addition)
- `CLAUDE.md` (2 rewrites)
- `skills/plan-ideas/SKILL.md` (3 rewrites)
- `skills/plan-pick/SKILL.md` (2 rewrites)
- `skills/plan-help/SKILL.md` (2 rewrites + 1 addition)
- `skills/plan-brainstorm/SKILL.md` (1 rewrite)
- `skills/plan-guide/SKILL.md` (1 rewrite)

Explicitly NOT touched: `bin/install.js` (already sweeps all `plan-*`), and the `## Expanded Into` section heading (persisted user data).

## Assumptions

### Initial (from elaboration)
- [high] The rename is purely cosmetic — no skill logic, arguments, or on-disk formats change. **Why:** every reference found is either a directory name, a frontmatter `name:`, a markdown heading, or a `/plan-...` token in prose/tables.
- [high] `bin/install.js` needs no change. **Why:** verified it removes all directories matching `MANAGED_SKILL_PREFIXES` (`plan-`/`des-`) before copying, so orphans are swept automatically on next install.
- [high] `## Expanded Into` stays unchanged. **Why:** it is persisted data in users' `.plans/ideas/` files; renaming it would break `/plan-ideas`' expansion detection for every existing idea file.
- [low] The `/plan-mine` row belongs next to `/plan-import` in README's table. **Why:** they are structural siblings (import = structured docs, mine = messy prose) and plan-extract's own SKILL.md describes itself as complementing import — but exact table placement is a judgment call.

### Discovered during execution
- [high] Reference counts matched elaboration exactly — 11 `plan-expand` cross-refs in the 7 enumerated files, plus 2 self-refs in the skill's own file, and 1 `plan-extract` cross-ref (CLAUDE.md:420, deferred to a later segment). **Why:** a full `grep -rn` before and after the edits found no reference outside the enumerated list, so the approximate line numbers in the plan were accurate and nothing was missed.
- [high] Only the `plan-expand`/`plan-extract` *command token* was renamed inside the two moved skill files — the English verbs "expand"/"extract"/"Expanded"/"Extraction" in prose, commit messages, and end-of-action markers (`🟢 EXPANDED`, `🟢 EXTRACTED`) were left untouched. **Why:** the task is a command rename, not a vocabulary change; those words still describe the action accurately, and the markers are a separate cross-skill contract not in this segment's scope.
- [high] `## Expanded Into` survived the substitution untouched in all 10 occurrences. **Why:** the literal heading never contains the `plan-expand` token, so a token-scoped `sed` could not match it; verified by grep after the edits.
- [high] Placed the new `/plan-mine` row directly after `/plan-import` in BOTH tables (README.md "Task Management", plan-help "All Commands"). **Why:** the two skills are structural siblings — import parses structured markdown, mine reads messy prose — and plan-mine's own SKILL.md describes itself as complementing import; adjacency makes that relationship visible at a glance.
- [low] Wrote the README description as "Extract tasks from a meeting transcript or notes prose after discussion" (matching the CLAUDE.md All Skills row verbatim) and the plan-help description as the shorter "Extract tasks from a meeting transcript or notes after discussion" (matching the skill's own frontmatter `description:` verbatim). **Why:** each table already mirrors a different existing source of wording, so reusing the matching one keeps registers consistent per-table rather than inventing new prose; a reviewer may prefer one wording in both places.
- [low] Used the argument hint `[text \| file]` for both new rows rather than the skill's literal `argument-hint` (`[pasted text | path-to-file]`). **Why:** neighbouring rows use short bracket tokens (`<file>`, `[id]`, `[topic]`), so the verbose hint would be out of register; the pipe is escaped as `\|` because these are markdown table cells.
- [high] The verb "Extract" was kept in both new descriptions even though the command is now `/plan-mine`. **Why:** consistent with the segment-1 rule that only the command token is renamed, never the English vocabulary — "extract" still describes what the skill does.

## Changes
_To be filled during execution_

## Notes

**Decisions already made (do not re-litigate during elaboration):**

1. **The `## Expanded Into` section heading in idea files stays UNCHANGED.** It is persisted data in users' `.plans/ideas/` files, written by `/plan-pick` and read by `/plan-ideas` to detect whether an idea has been expanded. "Expanded" still accurately describes the state. Renaming it would make `/plan-ideas` stop detecting existing idea files as expanded unless the legacy spelling were also read. Only the skill is renamed, not the on-disk section.

2. **No installer change is needed.** `bin/install.js` already removes ALL `plan-*` and `des-*` directories from `~/.claude/skills/` before copying (the `MANAGED_SKILL_PREFIXES` sweep). Orphaned `plan-expand/` and `plan-extract/` directories are therefore removed automatically on the next `npx plans-cc`. This was initially flagged as required work and then verified not to be.

**Open consideration:** `extract` is plain-English and discoverable; `mine` is more figurative. Both skills carry `disable-model-invocation: true`, so discovery is via the skill picker rather than model inference — the cost is low, but it is real if model-invocability is ever enabled for them.
