# Add des-sync Skill To Apply tokens.md @theme Block To Live Tailwind Layer

**ID:** 019
**Created:** 2026-06-19T00:00
**Type:** feature
**Status:** completed
**Branch:** feature/019-add-des-sync-skill-apply-theme-tokens
**Completed:** 2026-06-19T11:30

## What
Add a third `des-*` skill, `/des-sync`, that idempotently applies the global Tailwind artifacts from `design-system/` into the consuming project's live Tailwind layer (e.g. `app/globals.css`). This closes the gap where `des-author` only *documents* "ready-to-paste" global CSS in markdown and nothing ever applies it globally, so semantic tokens/classes referenced by `des-build` would silently no-op.

Scope spans **all three** des-* skills:

1. **des-author** — in addition to the `@theme` token block, author a global **`@layer components` / `@utility` block** of reusable helper/component classes (e.g. a responsive `.site-header`) where the system warrants it. This is a deliberate philosophy extension: the system gains *named* global classes alongside inline utilities, not just tokens. Authoring stays markdown-only (still "ready-to-paste", still stops for review).
2. **des-sync** (new) — sync BOTH global blocks from the markdown into the live Tailwind layer: the `@theme` token block AND the `@layer components` / `@utility` class block. Idempotent (re-runnable; updates in place rather than duplicating).
3. **des-build** — flag when global updates are needed (either block in the markdown is missing/stale in the live layer) and direct the user to `/des-sync`; do not sync itself. des-build may now also *use* the named global classes (e.g. `class="site-header"`) where appropriate, not only inline utilities.

User decision (2026-06-19): chose "Add global component/helper layer" over token-only — so reusable global classes like a responsive header ARE in scope, and des-author must author them for des-sync to have something to sync.

## Why
The des-* family has a dead end: des-author documents "ready-to-paste" global CSS in markdown, but nothing applies it to the live Tailwind layer, so semantic tokens (and, with this change, named global classes) that des-build emits silently no-op. Adding des-sync as the apply step closes the loop — author (markdown) → sync (live CSS) → build (uses it) → flag drift → re-sync — making the system actually drive rendered output rather than just describing it. Authoring named global classes (e.g. a responsive `.site-header`) on top of tokens gives the system reusable structural chrome without abandoning utility-first for one-off styling.

## How Summary
Add a new `skills/des-sync/SKILL.md` that reads the two global-CSS source artifacts under `design-system/` (`tokens.md`'s `@theme` block and a new `global-classes.md`'s `@layer components` / `@utility` block) and writes them into the project's live Tailwind entry (e.g. `app/globals.css`) between stable sentinel comment markers, so re-runs replace in place and never duplicate. Extend des-author to also author `global-classes.md`, promoting only cross-page recurring *structural* elements to named classes (everything else stays inline in composition.md). Extend des-build to detect when either managed block is missing/stale in the live file and direct the user to `/des-sync` (build flags, never syncs). Update CLAUDE.md to document the new skill and the author→sync→build loop. The installer and dev script need no change — both enumerate `skills/` dynamically and already manage the `des-` prefix.

**Files of note:**
- `skills/des-sync/SKILL.md` — NEW skill: read the two source blocks, write/replace them in the live Tailwind file between sentinel markers, idempotently.
- `skills/des-author/SKILL.md` — add a step to author `design-system/global-classes.md` (structural-recurrence promotion rule); update the layout list and end-of-action marker / next-step pointer.
- `skills/des-build/SKILL.md` — add a drift check (managed blocks present & current in live CSS?) that flags and points to `/des-sync`; allow use of named global classes.
- `CLAUDE.md` — add des-sync to the des-* table, document the author→sync→build loop and `global-classes.md` artifact.

## How
- [x] Step 1: Write `skills/des-sync/SKILL.md` — frontmatter (`name: des-sync`, `disable-model-invocation: false` to match the family, `argument-hint`, `allowed-tools`: Read/Write/Edit/Glob/Grep/AskUserQuestion), then steps: (a) read `design-system/tokens.md` `@theme` block + `design-system/global-classes.md` `@layer components`/`@utility` block; if `design-system/` missing → tell user to run `/des-author`; (b) locate the project's live Tailwind entry (search for `@import "tailwindcss"` / `@theme` / `globals.css`, ask via AskUserQuestion if ambiguous); (c) write each block between sentinel markers `/* des-sync:theme start|end */` and `/* des-sync:components start|end */`, replacing existing marker content in place (idempotent) and appending if markers absent, never touching hand-written CSS; (d) report what was synced/changed; (e) end-of-action marker `🟢 SYNCED · design-system → live Tailwind`.
- [x] Step 2: Edit `skills/des-author/SKILL.md` — add `global-classes.md` to the Step 3 directory layout; add a new authoring step (after components.md/composition.md) that authors the `@layer components` / `@utility` block into `global-classes.md`, applying the promotion principle: promote ONLY cross-page recurring **structural** elements (header/footer/page-shell/card chrome) to named classes; one-off adjacencies and vertical rhythm stay inline in composition.md; flag candidates for human confirmation. Keep it markdown-only (still stops for review, generates no code). Update the Step 9 end-of-action marker / next-step to point at `/des-sync` then `/des-build`.
- [x] Step 3: Edit `skills/des-build/SKILL.md` — add a drift-check step (in or right after Step 1 "read the design system first"): check whether the live Tailwind file contains current `des-sync:theme` and `des-sync:components` marker blocks matching the markdown sources; if missing/stale, FLAG it and tell the user to run `/des-sync` (des-build never syncs). Update Step 2 to allow referencing named global classes from `global-classes.md` (e.g. `class="site-header"`) alongside semantic tokens. Add an edge case for the drift flag.
- [x] Step 4: Edit `CLAUDE.md` — add a `/des-sync` row to the des-* table; update the family description to document the author→sync→build loop and the `global-classes.md` artifact + sentinel-marker contract. (Skill-count mentions, if any, are in the general "All Skills" table which lists plan-* only — confirm no des count needs bumping.)
- [x] Step 5: Manually validate the loop end-to-end in a scratch Next.js + Tailwind v4 project: `/des-author` produces tokens.md + global-classes.md; `/des-sync` writes both marked blocks into globals.css; re-running `/des-sync` replaces in place (no duplication); `/des-build` flags drift when a block is edited out, and stops flagging after a re-sync.

## Verification
- `skills/des-sync/SKILL.md` exists with valid frontmatter (name matches dir, family-consistent fields) and documents the marker-based idempotent sync of both blocks.
- des-author authors `design-system/global-classes.md` and the directory layout + next-step pointer reflect the new artifact and `/des-sync` step.
- des-build flags (never performs) missing/stale global blocks and points to `/des-sync`, and permits named global classes.
- CLAUDE.md documents des-sync and the author→sync→build loop.
- Manual end-to-end check: sync is idempotent (re-run does not duplicate blocks) and des-build's drift flag toggles correctly before/after a sync.
- Confirmed during research: installer (`bin/install.js`) and `bin/dev.js` enumerate `skills/` dynamically and already manage the `des-` prefix — no change needed; plan-cleanup does not enumerate skills — no change needed.

## Impact Scope

### Files to Modify
- [x] `skills/des-sync/SKILL.md` — NEW: the sync skill (read two blocks → write between sentinel markers, idempotent).
- [x] `skills/des-author/SKILL.md` — author `global-classes.md`; promotion rule; updated layout + next-step marker.
- [x] `skills/des-build/SKILL.md` — drift flag pointing to /des-sync; allow named global classes.
- [x] `CLAUDE.md` — des-* table row + author→sync→build loop documentation.

### Related Files (verified — NO change needed)
- `bin/install.js` — enumerates `skills/` dynamically, manages `des-` prefix; new dir ships automatically.
- `bin/dev.js` — same dynamic enumeration; symlinks new dir automatically.
- `skills/plan-cleanup/SKILL.md` — rebuilds `.plans/` state only; does not enumerate skills.

### Artifacts Affected (in consuming projects, not this repo)
- `design-system/global-classes.md` — NEW source artifact authored by des-author.
- `design-system/tokens.md` — unchanged shape; its `@theme` block becomes a sync source.
- live Tailwind entry (e.g. `app/globals.css`) — gains sentinel-marked managed blocks.

## Assumptions

### Initial (from elaboration)
_Interactive elaboration — design decisions captured in Notes, not auto-assumed._

### Discovered during execution
- [high] Inserted the new `global-classes.md` authoring step as des-author Step 7 (between composition.md and layout-and-responsive.md) and renumbered subsequent steps (old 7→8, 8→9, 9→10). **Why:** the task said "after components.md/composition.md"; placing it before layout keeps the per-area authoring order coherent (individual elements → composition grammar → promoted structural classes → layout/responsive).
- [high] Updated des-author's "four per-area checkpoints" / "Steps 4–7" references to "five" / "Steps 4–8". **Why:** adding a fifth authoring step (each with a checkpoint) makes the prior counts stale; leaving them would contradict the steps.
- [low] Used `argument-hint: "[live Tailwind entry path]"` for des-sync (an optional explicit path override). **Why:** the task said "ask via AskUserQuestion if ambiguous" but didn't specify the arg; an optional path lets the user skip discovery while keeping bare-invocation auto-locate. Could also have been no-arg only.
- [low] Added a "partial/corrupted markers" edge case to des-sync (a lone start or end marker → flag rather than rewrite in place). **Why:** the idempotent in-place replace assumes well-formed marker pairs; a half-marker could otherwise risk eating hand-written CSS. Not specified by the task but follows directly from the "never touch hand-written CSS" rule.
- [high] des-build drift check is a build-time non-blocking flag (build proceeds, drift surfaced prominently). **Why:** task says des-build "never syncs" and only flags/points to /des-sync; blocking the build was not requested and would be heavier than "flag."

## Changes
- Created `skills/des-sync/SKILL.md` — new third des-* skill. Frontmatter matches the family (`name: des-sync`, `disable-model-invocation: false`, `allowed-tools`: Read/Write/Edit/Glob/Grep/AskUserQuestion, optional `argument-hint`). Steps: read the `@theme` block from `tokens.md` + the `@layer components`/`@utility` block from `global-classes.md` (missing `design-system/` → run /des-author and STOP; missing global-classes → sync only `@theme`); locate the live Tailwind entry (search `@import "tailwindcss"`/`@theme`/`globals.css`, AskUserQuestion if ambiguous); write each block between sentinel markers `/* des-sync:theme start|end */` and `/* des-sync:components start|end */`, replacing in place if present (idempotent) / appending if absent, never touching hand-written CSS; report created-vs-updated per block; marker `🟢 SYNCED · design-system → live Tailwind → Next: /des-build <component>`. Edge cases cover missing dir, empty global-classes, ambiguous entry, present/absent markers, hand-written CSS, and partial/corrupted markers.
- Edited `skills/des-author/SKILL.md` — added `global-classes.md` to the directory-layout list (Step 3); added new Step 7 "Author `global-classes.md`" with checkpoint, the conservative structural-promotion rule (only cross-page recurring header/footer/page-shell/card chrome; one-offs/vertical rhythm stay inline in composition.md), human-confirmation flagging, and explicit "no global classes yet" valid state; renumbered old Steps 7→8/8→9/9→10; updated the end-of-action next-step to `🟢 AUTHORED · design-system/ → Next: /des-sync` (then /des-build); updated "four per-area checkpoints / Steps 4–7" → "five / Steps 4–8" in the Arguments, Step 2, and Edge Cases; added a global-class-promotion edge case.
- Edited `skills/des-build/SKILL.md` — added `global-classes.md` to the Step 1 read list; added new Step 2 "Check for global-CSS drift (flag only — never sync)" that inspects the live Tailwind entry for current `des-sync:theme`/`des-sync:components` marker blocks vs. the markdown sources, FLAGS missing/stale blocks and points to /des-sync (build proceeds, never syncs); updated the "use only what the system defines" step (now Step 3) to prefer named global classes from `global-classes.md` (e.g. `class="site-header"`) alongside inline token utilities; renumbered old Steps 3–7 → 4–8; added a drift edge case.
- Edited `CLAUDE.md` — added an author→sync→build loop description paragraph to the des-* section; added a `/des-sync` row to the des-* table; updated the `/des-author` and `/des-build` table rows to mention global classes / drift flag; documented the `global-classes.md` artifact and the sentinel-marker contract. Confirmed the "All Skills" table lists only plan-* skills, so no des count bump needed.

## Notes
Context from discussion:
- `des-author` Step 4 authors a "ready-to-paste" `@theme` block as markdown text inside `tokens.md` but never installs it into real project config. This is partly intentional — des-author's defining principle is "stop after authoring markdown, generate no code."
- `des-build` references semantic tokens (e.g. `text-brand-primary`) but assumes they already resolve in the live Tailwind config — nothing guarantees the `@theme` block was applied.
- Tailwind v4 uses `@theme` in CSS (e.g. globals.css), not necessarily tailwind.config.js — sync target should account for v4 conventions.
- User decision: implement as a dedicated third skill `/des-sync` (not folded into des-build). des-build should additionally *flag* needed global updates and direct the user to des-sync, but not perform the sync itself.

Global-class scope decision (2026-06-19):
- Current state: des-author authors NO global component/helper classes — only the `@theme` token block is a global artifact. "Responsive header" etc. currently live as conditional RULES in composition.md / layout-and-responsive.md, emitted as inline utilities by des-build. There is no `.site-header` class anywhere today.
- User chose to ADD a global component/helper layer: des-author must now author an `@layer components` / `@utility` block of reusable classes, des-sync must sync it alongside `@theme`, and des-build may use those named classes. This is a philosophy shift toward semantic global classes coexisting with utility-first.
- Design implication for des-sync: treat it as applying N labeled blocks from the markdown (not a single hardcoded `@theme`), so block types compose cleanly. Sync must be idempotent — re-running updates blocks in place, marked with stable delimiters/markers, rather than appending duplicates.
Design decisions RESOLVED during elaboration (2026-06-19):
- **Source artifact:** new dedicated `design-system/global-classes.md` holds the `@layer components` / `@utility` block (keeps tokens.md token-focused; des-sync reads two single-purpose files).
- **Sync mechanism:** sentinel comment markers — `/* des-sync:theme start|end */` and `/* des-sync:components start|end */` — wrap each managed block in the live Tailwind file. Re-runs replace between markers in place (idempotent); hand-written CSS is never touched. Append the marked block if markers are absent.
- **Promotion rule:** des-author promotes ONLY cross-page recurring **structural** elements (header, footer, page-shell, card chrome) to named global classes; one-off adjacencies and vertical-rhythm rules stay inline in composition.md. des-author flags candidates for human confirmation — conservative to avoid over-globalizing against utility-first.

Housekeeping touchpoints (REVISED after research):
- Update CLAUDE.md: add des-sync row to the des-* table; document the author→sync→build loop, the `global-classes.md` artifact, and the sentinel-marker contract.
- bin/install.js / bin/dev.js: NO change needed — both enumerate `skills/` dynamically and already manage the `des-` prefix, so `skills/des-sync/` ships automatically.
- plan-cleanup: NO change needed — it rebuilds `.plans/` state and does not enumerate skills.
