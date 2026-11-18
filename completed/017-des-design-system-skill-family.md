# Add a des-* Design-System Skill Family (Figma → Code)

**ID:** 017
**Created:** 2026-06-17T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-06-18T09:35
**Branch:** feature/017-des-design-system-skill-family

## What
Add a des-* design-system skill family (Figma → Code, markdown-as-source-of-truth): des-author (Phase 1 authoring of design-system/ markdown from connected Figma Dev Mode MCP) and des-build (Phase 2 build reading design-system/ first, with folded-in Phase 3 self-verify). Distinct from the global figma-* extraction skills. Full installer/packaging integration in bin/install.js and bin/dev.js.

## Why
Adds value by giving the user a markdown-as-source-of-truth Figma→code workflow that lives in-repo, reviewed once at the cheapest point (the design-system doc) rather than re-derived from pixels per component. This is a deliberately distinct approach from the user's existing global `figma-*` skills, which extract from live Figma at build time. Hosting it in plans-cc turns the repo into the user's general "convenient repo" for skills, not just plan-* task management.

## How Summary
Two new model-invocable skills under `skills/`, each a single `SKILL.md`, mirroring the repo's existing skill conventions: `des-author` (Phase 1) reads the connected Figma Dev Mode MCP and authors/refines reviewed markdown under a project's `design-system/` directory (tokens, components, composition, layout-and-responsive), stopping for human review before any code; `des-build` (Phase 2) builds a Next.js + Tailwind component by reading `design-system/` first and using only tokens/patterns defined there, with Phase 3 DevTools self-verify folded in as a `verify` mode. The installer already copies/symlinks every directory under `skills/`, so the only wiring needed is broadening the **cleanup** prefix in `bin/install.js` and `bin/dev.js` (currently `plan-` only) so stale `des-*` skills don't orphan on reinstall. `package.json` already ships `skills/`, so no packaging change is needed.

**Files of note:**
- `skills/des-author/SKILL.md` — new Phase 1 authoring skill (MCP-first → design-system/ markdown)
- `skills/des-build/SKILL.md` — new Phase 2 build + folded-in Phase 3 self-verify skill
- `bin/install.js` — broaden cleanup filter (line 6 / line 90) to a managed-prefix set so `des-*` is cleaned on reinstall
- `bin/dev.js` — same managed-prefix broadening (line 6 / line 55) for `node bin/dev.js`
- `CLAUDE.md` — document the new `des-*` family as distinct from global `figma-*`
- `skills/plan-show/SKILL.md` — reference for exact frontmatter/format to mirror (not modified)

## How
- [x] Step 1: Author `skills/des-author/SKILL.md` (Phase 1). Frontmatter: `name: des-author`, `disable-model-invocation: false`, `argument-hint: "[scope or 'refresh']"`, `allowed-tools` = Read/Write/Edit/Glob/Grep/AskUserQuestion + `mcp__figma-dev-mode-mcp-server__{get_design_context,get_metadata,get_variable_defs,get_screenshot}`, and a one-line `description`. Body: MCP-first inputs; writes/updates `design-system/{tokens.md,components.md,composition.md,layout-and-responsive.md}` + `components/`; per-file authoring rules faithful to the pasted Phase 1 prompt (tokens unit-convention + root-size contract + @theme block; components = judgment not extraction; composition = conditional rules resolving to concrete Tailwind classes, organized by relationship type, "Needs confirmation" bucket; layout = explicit responsive philosophy, linear vs non-linear reflow with non-linear under "## Needs confirmation"); closing behavior = summarize confidence vs open questions and STOP for review before any code. End-of-action marker on the final line.
- [x] Step 2: Author `skills/des-build/SKILL.md` (Phase 2 + folded-in Phase 3). Frontmatter: `name: des-build`, `disable-model-invocation: false`, `argument-hint: "<component or section name> [verify]"`, `allowed-tools` = Read/Write/Edit/Glob/Grep/AskUserQuestion + `mcp__figma-dev-mode-mcp-server__{get_design_context,get_metadata,get_screenshot}`, one-line `description`. Body: defining first instruction = read `design-system/` before any code (and if missing, tell user to run `/des-author` — no live-extraction fallback); use ONLY defined tokens/patterns, escalate one-offs; per-component MCP node input; Next.js + Tailwind following project conventions; non-linear reflow → show interpretation + breakpoint plan before building; after building list tokens used + suggested additions (the feedback loop); `verify` mode runs the px-vs-px self-verify checklist (root-size contract first, type/line-height/spacing, rem-trap flag, ignore <1px). End-of-action marker on the final line.
- [x] Step 3: Broaden the cleanup prefix in `bin/install.js`. Introduce `const MANAGED_SKILL_PREFIXES = ["plan-", "des-"];` near line 6 and change the cleanup filter at line 90 from `d.startsWith(SKILLS_PREFIX)` to `MANAGED_SKILL_PREFIXES.some((p) => d.startsWith(p))`. Generalize the "Removed N existing plan-* skill(s)" log wording (line 96) to "managed skill(s)". Leave the copy loop (lines 100–115) unchanged — it already installs every directory.
- [x] Step 4: Apply the identical managed-prefix broadening in `bin/dev.js` (line 6 + the `existing` filter at line 55) so `node bin/dev.js` symlinks the new skills and cleans up stale `des-*` symlinks the same way. Symlink loop (lines 70–75) is unchanged.
- [x] Step 5: Document the new family in `CLAUDE.md` — add a short "Design-System Skills (`des-*`)" subsection noting it is a separate family with the markdown-as-source-of-truth philosophy, distinct from the global `figma-*` extraction skills, listing `/des-author` and `/des-build`. Keep it brief (the file is already large). Note: `package.json` `files` already includes `"skills"`, so no packaging edit is needed — confirm only.
- [x] 👁 Step 6: Verify install/dev wiring and end-to-end behavior. Run `node bin/dev.js`; confirm `des-author` + `des-build` appear in the symlinked list and resolve to repo symlinks, with no `plan-*` loss. Test cleanup: temporarily remove a `des-*` dir, rerun `node bin/dev.js`, confirm the stale symlink is removed, then restore. Run `node bin/install.js` and confirm both new skills copy/log and prior `des-*` copies are cleaned. Confirm global `~/.claude/skills/figma-{build,port,tokens}` are untouched. (Full `/des-author` → `/des-build` end-to-end exercise requires a real Next.js + Tailwind project with Figma Dev Mode MCP connected — observe there.)

## Verification
- `node bin/dev.js` lists `des-author` and `des-build` among symlinked skills; `~/.claude/skills/des-author` and `des-build` are symlinks back into the repo; no `plan-*` skills lost.
- Cleanup correctness: removing a `des-*` dir and rerunning `node bin/dev.js` removes the stale `~/.claude/skills/des-*` entry (proves the broadened prefix works); restoring + rerunning re-creates it.
- `node bin/install.js` copies both new skills, logs them, and the broadened cleanup removes prior `des-*` copies without touching unrelated skills.
- Both `SKILL.md` files have valid YAML frontmatter (delimited by `---`, `name` matches directory, `description` present, `disable-model-invocation: false`), mirroring `skills/plan-show/SKILL.md`.
- No regression to the global `figma-*` skills (installer prefix set is `plan-`/`des-` only, never `figma-`).
- End-to-end (manual, in a real Next.js + Tailwind project with Figma Dev Mode MCP): `/des-author` produces the four `design-system/*.md` files with a "Needs confirmation" summary and stops for review; `/des-build <Component>` reads `design-system/` first, builds with only defined tokens, escalates one-offs, lists tokens used + suggested additions; `/des-build <Component> verify` reports px-vs-px discrepancies with fixes.

## Impact Scope

### Files to Modify
- [x] `skills/des-author/SKILL.md` — new file: Phase 1 authoring skill
- [x] `skills/des-build/SKILL.md` — new file: Phase 2 build + folded-in Phase 3 self-verify skill
- [x] `bin/install.js` — broaden cleanup prefix to a managed-prefix set including `des-`
- [x] `bin/dev.js` — same managed-prefix broadening for the dev symlink path
- [x] `CLAUDE.md` — document the `des-*` family as distinct from global `figma-*`

### Related Files (may need updates)
- `package.json` — `files` array already includes `"skills"`; confirm only, no edit expected
- `skills/plan-show/SKILL.md` — frontmatter/format reference to mirror (not modified)

### Endpoints/UI Affected
- New slash commands `/des-author` and `/des-build` available in Claude Code after install
- A consuming project's `design-system/` directory (authored by `/des-author`, consumed by `/des-build`) — created in the target project, not in this repo

## Assumptions

### Initial (from elaboration)
- [high] Naming prefix is `des-*` (`des-author`, `des-build`). **Why:** Locked directly with the user via AskUserQuestion during planning.
- [high] Two skills only — Author + Build, with Phase 3 (DevTools review) folded into `des-build` as a `verify` mode rather than a third skill. **Why:** Locked with the user; the pasted doc itself frames Phase 3 as a manual workflow + optional self-verify prompt, not a standalone skill.
- [high] Both skills are model-invocable (`disable-model-invocation: false`). **Why:** Locked with the user; matches the existing global `figma-*` skills.
- [high] New, distinct family — leave the global `figma-*` extraction skills untouched. **Why:** Locked with the user; the `figma-*` skills live outside this repo and implement the opposite (live-extraction) philosophy.
- [high] Phase 1 input is MCP-first via `mcp__figma-dev-mode-mcp-server__*`, screenshots/JSON as supplement. **Why:** Locked with the user; matches the MCP the existing figma skills already use.
- [high] Installer needs only a cleanup-prefix broadening (not a copy-loop change), and `package.json` needs no edit. **Why:** Verified directly — both `bin/install.js` and `bin/dev.js` copy/symlink every directory under `skills/` and filter only on cleanup (line 90 / line 55); `package.json` `files` already lists `"skills"`.
- [low] Use a `MANAGED_SKILL_PREFIXES` array as the broadening mechanism (vs. dropping the prefix filter entirely or matching a regex). **Why:** Keeps cleanup scoped to skills this package manages (won't delete unrelated user skills), a low-risk judgement call the source description didn't specify.
- [low] Add a `des-*` subsection to `CLAUDE.md`. **Why:** UX/docs decision not in the source description; keeps the repo's own instructions honest now that it hosts a non-`plan-*` family.

### Discovered during execution
- [low] Structured both skill bodies as `H1 + intro + ## Arguments + ## Steps + ## Edge Cases`, mirroring `plan-show`. For des-build I also added a non-standard `## Reference: human-side DevTools verify workflow` section to hold the human DevTools notes the spec explicitly asked to include "as reference notes in this skill." **Why:** the house style has no dedicated slot for reference material; a clearly-labeled top-level section after Steps keeps it discoverable without polluting the numbered build instructions.
- [low] Collapsed the multi-faceted spec into a small number of numbered Steps (8 for des-author, 7 for des-build incl. verify as one step) with nested sub-bullets carrying the detailed rules, rather than one Step per rule. **Why:** plan-show's house style favors ~5-9 bold-named Steps with sub-bullets; one-Step-per-rule would have produced 20+ flat steps and lost the phase structure.
- [high] In des-author, kept "summarize confident vs. Needs-confirmation, then STOP and wait for review" as its own explicit Step (7) rather than a trailing note. **Why:** the "stop before generating code / wait for human review" behavior is the load-bearing safety property of the whole markdown-as-source-of-truth philosophy, so it warranted step-level prominence.
- [low] In des-build, documented three `verify`-mode invocation shapes under `## Arguments` (build-only, build+verify, verify-existing). **Why:** the spec's edge case "`verify` with no build present" implies these distinct modes; surfacing them in Arguments makes the trailing-keyword contract explicit.
- [high] Kept the existing `SKILLS_PREFIX = "plan-"` const in both `bin/install.js` and `bin/dev.js` and added `MANAGED_SKILL_PREFIXES = ["plan-", "des-"]` adjacent to it, rather than repurposing/removing `SKILLS_PREFIX`. **Why:** the segment spec dictated keeping `SKILLS_PREFIX` for clarity; only the cleanup filter and log wording were changed, leaving room for other code that may reference the single-prefix const.
- [low] Placed the new `## Design-System Skills (des-*)` subsection immediately before the `## All Skills` heading (after the Testing section's dev-iteration note), and used a two-row mini-table mirroring the `## All Skills` table format. **Why:** the spec asked for placement ahead of the plan-* command table as conceptual documentation; reusing the table format keeps the file visually consistent.

## Changes
- Created `skills/des-author/SKILL.md` — Phase 1 authoring skill (MCP-first inputs; authors `design-system/{tokens,components,composition,layout-and-responsive}.md` + `components/`; per-file authoring rules; stops for human review before any code; marker `🟢 AUTHORED · design-system/`).
- Created `skills/des-build/SKILL.md` — Phase 2 build skill reading `design-system/` first, tokens-only with escalation, non-linear-reflow confirmation gate, post-build feedback loop, and folded-in Phase 3 `verify` mode (px-vs-px self-verify, root-size-first, rem-trap flag); markers `🟢 BUILT` / `🔵 VERIFIED`.
- `bin/install.js` — added `const MANAGED_SKILL_PREFIXES = ["plan-", "des-"];`; cleanup filter now `MANAGED_SKILL_PREFIXES.some((p) => d.startsWith(p))`; log wording → "managed skill(s)". Agents cleanup + copy loop untouched. `node --check` passes.
- `bin/dev.js` — identical managed-prefix broadening (const + filter + log). Agents cleanup + symlink loop untouched. `node --check` passes.
- `CLAUDE.md` — added `## Design-System Skills (des-*)` subsection before `## All Skills`, distinguishing the family from the global `figma-*` extraction skills with a two-row command table.
- Confirmed `package.json` `files` already includes `"skills"` — no packaging edit needed.

## Notes
Source material: plan file at ~/.claude/plans/i-m-going-to-paste-wiggly-hammock.md captures the full design and the user's locked decisions. The pasted source markdown (the three-phase Figma→Code design-system system) is the authoritative spec for the skill *bodies* — Step 1 and Step 2 should transcribe its rules faithfully into skill instructions.
