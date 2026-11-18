# Add /plan-explain skill: a read-only conceptual-model view of a task

**ID:** 034
**Created:** 2026-09-01T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-09-02T00:00
**Branch:** feature/034-add-plan-explain-skill

## What
Add /plan-explain skill: a read-only, one-shot conceptual-model view of a task — core idea in one line, three bullets of conceptual model, and why this shape over the obvious alternative. Sits one rung above How Summary on the Why → How Summary → How altitude ladder. Works on active and completed tasks.

## Why
The skill library has no comprehension-oriented view. `/plan-show` dumps every field (complete, but the opposite of three bullets); `## How Summary` gives technical shape — files and approach — but not a mental model; `/plan-discuss` can produce an explanation but is interactive, open-ended, and built to *change* the plan rather than teach it. The highest-value case is a completed task read cold weeks later, when the reasoning behind a design has evaporated and only the diff remains. `/plan-explain` adds the missing top rung: *how to think about this*, above *what the approach is*, above *what the steps are*.

## How Summary
Add one new declarative skill directory, `skills/plan-explain/SKILL.md`, modelled closely on `plan-show` (its nearest sibling: read-only, single-ID, same three-directory task resolution). The skill parses a task file and synthesizes three fixed output blocks — a one-line core idea, three conceptual-model bullets, and a "why this shape, not the obvious alternative" contrast — rather than printing raw fields. Because `bin/install.js` globs `skills/` by the `plan-`/`des-` prefix (`bin/install.js:141`) and `package.json` ships `skills` wholesale, no installer or packaging change is needed; the remaining work is registering the command in the three human-facing reference tables.

**Files of note:**
- `skills/plan-explain/SKILL.md` — the new skill (the entire behavior; created by this task)
- `skills/plan-show/SKILL.md` — the structural template: frontmatter shape, ID resolution across pending/backlog/completed, sparse-file handling, `🔵` marker
- `skills/plan-help/SKILL.md` — command-reference table (~line 45) and examples block (~line 123)
- `CLAUDE.md` — the "All Skills" table and the end-of-action-marker emoji table
- `README.md` — the "Viewing and Tracking" table (~line 130), alongside `/plan-show`

## How
- [x] Step 1: Create `skills/plan-explain/SKILL.md` with frontmatter — `name: plan-explain`, `disable-model-invocation: false` (read-only, matching plan-capture/status/list/show/search/guide per the CLAUDE.md frontmatter table), `argument-hint: "<id>"`, `allowed-tools: [Read, Glob]`, and a description for the skill picker.
- [x] Step 2: Write the skill's Steps section — project-root discovery (copy the contract verbatim from `plan-show` step 1), flexible ID parsing zero-padded to 3 digits, and resolution across `.plans/pending/NNN-*.md`, `.plans/backlog/NNN-*.md`, and `.plans/completed/NNN-*.md`, reusing plan-show's exact search set so backlogged and completed tasks stay findable.
- [x] Step 3: Specify the synthesis output contract — the three fixed blocks (one-line core idea; exactly three conceptual-model bullets naming load-bearing pieces and their relationships; a "why this shape, not the obvious alternative" contrast) — with explicit instructions to *generate insight from* Why/How Summary/How/Changes rather than reprint them, and a rule that the third block is omitted rather than fabricated when the source material states no rejected alternative.
- [x] Step 4: Add edge-case handling — no ID argument (list tasks and prompt, per plan-show step 3), task not found, and un-elaborated pending tasks (too little material to synthesize: say so and point at `/plan-elaborate NNN` rather than inventing a model). End with the read-only marker `🔵 EXPLAINED · Task #NNN` (no `→ Next:` tail, per the read-only convention).
- [x] Step 5: Register the command in the three reference surfaces — `skills/plan-help/SKILL.md` (command table + examples block), `README.md` "Viewing and Tracking" table next to `/plan-show`, and `CLAUDE.md` (the "All Skills" table plus the `🔵` row of the end-of-action-marker emoji table).
- [ ] 👁 Step 6: Verify by running `node bin/dev.js` to reinstall skills, then invoke `/plan-explain 034` and a completed task (e.g. `/plan-explain 033`) to confirm resolution across both directories and that the output reads as a conceptual model rather than a field dump.

## Verification
- `/plan-explain 033` (a completed task) resolves from `.plans/completed/` and prints the three blocks.
- `/plan-explain 034` resolves from `.plans/pending/` and prints the three blocks.
- Output is synthesis, not a field dump — it does not simply reprint the Why and How Summary text verbatim.
- The final line is exactly `🔵 EXPLAINED · Task #NNN` with no `→ Next:` tail.
- `/plan-help` lists `/plan-explain`, and the skill appears in `~/.claude/skills/` after `node bin/dev.js`.

## Impact Scope

### Files to Modify
- [x] `skills/plan-explain/SKILL.md` — new file; the whole skill definition
- [x] `skills/plan-help/SKILL.md` — add command-table row and an example line
- [x] `README.md` — add a row to the "Viewing and Tracking" table
- [x] `CLAUDE.md` — add a row to the "All Skills" table and to the `🔵` emoji-table row

### Related Files (may need updates)
- `skills/plan-show/SKILL.md` — read-only; the structural template being mirrored (no edit expected)
- `bin/install.js` — no edit expected; globs `skills/` by prefix at line 141

### Endpoints/UI Affected
- `/plan-explain <id>` — new user-invocable slash command
- `/plan-help` output — one additional row

## Assumptions

### Initial (from elaboration)
- [high] Model the new skill on `plan-show` rather than inventing a structure. **Why:** it is the nearest sibling (read-only, single-ID, same task-resolution needs) and the CLAUDE.md conventions for frontmatter, ID resolution, sparse-file handling, and the `🔵` marker are all already instantiated there.
- [high] No change to `bin/install.js` or `package.json`. **Why:** the installer globs `skills/` by the `plan-`/`des-` prefix (`bin/install.js:141`) and `package.json` `files` ships the `skills` directory wholesale, so a new prefixed directory is picked up automatically.
- [high] `disable-model-invocation: false`. **Why:** the CLAUDE.md frontmatter table explicitly lists read-only skills (plan-status, plan-list, plan-show, plan-search, plan-guide) as `false`, and this skill is strictly read-only.
- [low] Output is exactly three fixed blocks, with the third (the "why this shape" contrast) omitted rather than fabricated when no rejected alternative is recorded. **Why:** the user's request specified "top three bullet points" and a conceptual-model framing, but the exact block structure was a judgment call; omitting rather than inventing follows the sparse-section discipline plan-show already uses.
- [low] Scope covers active and completed tasks only — not arbitrary repo concepts. **Why:** the request named tasks specifically; explaining arbitrary code would be a materially larger and differently-shaped skill.

### Discovered during execution
- [low] Named the two rendered headings `## The model` (block 2) and `## Why this shape` (block 3), with block 1 emitted as a bare bold line under the `# Task #NNN: [Title]` header rather than under its own heading. **Why:** the task specified the three blocks' *content* but not their labels; a bare bold one-liner keeps the core idea visually distinct from the two structured sections and avoids a heading longer than the content it introduces. A reviewer may prefer explicit `## Core idea` / `## Why this shape, not the obvious alternative` headings.
- [low] Added a step 7, "Guard against field-printing" — an explicit pre-emit checklist (verbatim Why/How Summary sentences, bullets that are reworded How steps, bullets that are filenames, a block-1 line that describes what the task does rather than how to think about it). **Why:** the segment brief stressed synthesis-over-field-printing as the core risk, and a prose warning alone is weak; `plan-retrospect`'s "Output Contract (anti-generic)" sets the precedent for a hard drop-rule list in this repo. It does add a step beyond the four the plan enumerated.
- [low] Added an "Elaborated but thin task" edge case (produce blocks 1-2, omit 3, never pad) beyond the three edge cases the plan named. **Why:** the un-elaborated and fully-elaborated cases leave a real gap — a task elaborated in skip mode has How steps but little Assumptions material — and the plan's own omit-rather-than-fabricate rule extends to it naturally.
- [high] Copied plan-show's step 1 (project-root discovery) and step 2 (flexible ID parsing + the three-directory search set) verbatim, and reused its `🔵` no-tail marker step wording. **Why:** the plan called for verbatim reuse, and CLAUDE.md's Project-root discovery contract requires the identical error text `Not initialized. Run /plan-init first.` across every skill.
- [high] Included a table mapping each task-file section to *what to mine it for*, rather than a flat list of sections to read. **Why:** the sections a task file contains are already documented in plan-show; the value plan-explain adds is telling the invoking Claude what each section is *evidence of*, which is what keeps step 5 from degrading into a read-and-reprint.
- [high] Called out that a completed task's `## Changes` and `### Discovered during execution` assumptions should be preferred over the plan's predictions where the two disagree. **Why:** the segment brief named the cold-read of a completed task as the highest-value case, and on a completed task the lived record is strictly better evidence than the forecast.
- [high] Bug tasks' struck-through disproved `## Diagnosis` hypotheses are explicitly flagged as prime block-3 material. **Why:** CLAUDE.md's Diagnosis Section contract states that knowing what was ruled out is "the most valuable thing the section holds" — which is exactly block 3's question, so wiring the two together was a direct pattern-match.
- [high] Placed the `/plan-explain` row directly after `/plan-show` in all three tables (CLAUDE.md All Skills, plan-help All Commands, README Viewing and Tracking) rather than at the end of each. **Why:** the two are siblings — same argument shape, same read-only contract, differing only in altitude — so adjacency is what makes the distinction legible at a glance.
- [low] Used a single shared description, "Explain a task's conceptual model — core idea, three bullets, why this shape," in the two narrow tables (CLAUDE.md, plan-help) and a longer sentence-style one in README's Viewing and Tracking table. **Why:** the README table's neighbouring cells are full descriptive sentences while the other two are terse fragments; matching each table's register mattered more than literal consistency of wording across files.
- [low] Worded the plan-guide elaborated-task line as "Want the shape of it in three bullets? `/plan-explain 2`". **Why:** it mirrors the existing sibling lines' question-then-command form ("Want isolation?", "Want to talk through it first?") and names the concrete output rather than the abstraction, which reads as a more specific offer than "want the conceptual model?".
- [low] Added the plan-guide tip with the trigger condition "user has completed tasks" (unqualified), placed immediately after the existing completed-tasks summary tip. **Why:** the cold-read-weeks-later case is the skill's highest-value use, and guide picks only one tip, so a broad condition low in the list surfaces it without displacing the more urgent state-driven tips above it.
- [high] Did not touch `bin/install.js`, `bin/dev.js`, or `package.json`. **Why:** confirmed by segment 1 and by the task's own elaboration assumption — both installers glob `skills/` by prefix and package.json ships the directory wholesale.

## Changes

**Segment 1 (steps 1-4)** — created `skills/plan-explain/SKILL.md` (new, 8 numbered steps + Arguments + Edge Cases):
- Frontmatter: `name: plan-explain`, `disable-model-invocation: false`, `argument-hint: "<id>"`, `allowed-tools: [Read, Glob]`, picker description.
- Steps 1-4 of the skill mirror `plan-show` verbatim: project-root discovery (identical `Not initialized. Run /plan-init first.` error text), flexible ID parsing zero-padded to 3 digits, three-directory search (`pending`/`backlog`/`completed`), and the not-found message.
- Step 5 introduces a section→"what to mine it for" table rather than a section list — the structural lever that keeps the skill from degrading into a second `/plan-show`. Flags a completed task's `## Changes` and `### Discovered during execution` assumptions as better evidence than the plan's predictions.
- Step 6 defines the three-block output contract: bare bold one-line core idea, `## The model` (exactly three relational bullets), `## Why this shape` (omitted entirely when no rejected alternative is recorded).
- Step 7 adds a pre-emit field-printing guard — five "any hit means rewrite" checks, modelled on `plan-retrospect`'s Output Contract (anti-generic) drop-rules.
- Step 8 emits `🔵 EXPLAINED · Task #NNN` with no `→ Next:` tail.

**Segment 2 (step 5)** — registered `/plan-explain` across the reference surfaces (8 edits, 4 files):
- `CLAUDE.md:70` — added `plan-explain` to the `disable-model-invocation: false` read-only list.
- `CLAUDE.md:138` — added `explain` to the 🔵 read-only row of the end-of-action-marker emoji table.
- `CLAUDE.md:432` — new "All Skills" row, placed directly after `/plan-show`.
- `skills/plan-help/SKILL.md:46` — new All Commands row after `/plan-show <id>`; `:125` — example line in the "Check progress" block.
- `README.md:131` — new "Viewing and Tracking" row after `/plan-show <id>`; `:266` — example line in the "Track and triage" block.
- `skills/plan-guide/SKILL.md:111` — sibling suggestion line in the ready-to-execute block; `:153` — a Tips entry triggered when the user has completed tasks (the cold-read case).
- Table-integrity verified: column counts unchanged across all four affected tables; no inserted row required a pipe escape.
- No changes to `bin/install.js`, `bin/dev.js`, or `package.json` — both installers glob `skills/` by prefix and `package.json` ships `skills` wholesale.

## Notes
_Additional context_
