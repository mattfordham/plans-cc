# Add /des-styleguide skill to the des-* design-system family

**ID:** 020
**Created:** 2026-06-19T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-06-19T00:00
**Branch:** feature/020-add-des-styleguide-skill

## What
Add /des-styleguide skill to the des-* design-system family that generates a styleguide page on demand from design-system/ markdown.

## Why
Closes the visual-proof gap in the des-* loop. Today `/des-sync` applies tokens/classes into the live Tailwind layer invisibly and `/des-build` renders one component at a time against a Figma frame — nothing renders the *whole* system as a single human-openable artifact. A styleguide page is the human-facing counterpart to what `/des-sync` does silently: a page that shows every token swatch, every named global class, and every built component all resolving correctly. It's the fastest way for a human to confirm the synced system actually works end-to-end.

## How Summary
Add a fourth `des-*` skill, `/des-styleguide`, that **generates a styleguide page on demand** from the reviewed `design-system/` markdown (the page is a derived artifact, never hand-edited — same philosophy as the rest of the family). The project opts in via a `styleguide:` config flag declared in `design-system/`; if absent, every styleguide-aware behavior no-ops silently. The generated page has four sections: token swatches, global-class examples, a component gallery, and a drift/coverage panel. To preserve each existing skill's single responsibility, `/des-sync` and `/des-build` **only flag** that the styleguide may be stale and point to `/des-styleguide` — they never write the page themselves. Drift detection reuses the existing `des-sync:theme`/`des-sync:components` sentinel-marker check `/des-build` already performs; the generated page carries its own `des-styleguide:generated` marker so it's unambiguously derived and won't be clobbered if hand-edited.

**Files of note:**
- `skills/des-styleguide/SKILL.md` — NEW: the fourth skill; generates/regenerates the styleguide page from `design-system/` markdown.
- `skills/des-author/SKILL.md` — teach it to seed/read the `styleguide:` opt-in config flag in `design-system/`.
- `skills/des-sync/SKILL.md` — after CSS apply, flag (never write) that the styleguide may be stale → `/des-styleguide`.
- `skills/des-build/SKILL.md` — after building a new component, flag that it's not yet in the styleguide → `/des-styleguide`.
- `CLAUDE.md` — add the `/des-styleguide` row to the des-* table and the "All Skills" list; document the opt-in flag and the flag-only discipline.

## How
- [x] Step 1: Decide and document the opt-in mechanism — a `styleguide: <path>` config flag (e.g. `app/styleguide/page.tsx`) declared in `design-system/` (front-matter in `tokens.md` or a small `design-system/config.md`). Settle the exact location and write the convention down so all four skills read it the same way.
- [x] Step 2: Write `skills/des-styleguide/SKILL.md` — frontmatter (`name: des-styleguide`, `disable-model-invocation: false`, `argument-hint`, `allowed-tools: Read/Write/Edit/Glob/Grep/AskUserQuestion`, description) modeled on the existing des-* skills.
- [x] Step 3: In the SKILL.md, define the on-demand generation flow: read `design-system/` markdown (tokens, global-classes, components, composition) as the source of truth; if `design-system/` is missing → point to `/des-author` and STOP; if the `styleguide:` flag is absent → no-op and tell the user how to opt in.
- [x] Step 4: Specify the four page sections it generates with realistic-but-obvious dummy content: (1) token swatches (color chips, type ramp, spacing/radii/shadow samples from the `@theme` block), (2) global-class examples (one live instance of each named class from `global-classes.md`), (3) component gallery (one instance of each built component), (4) drift/coverage panel (tokens/classes synced? components documented-vs-built?).
- [x] Step 5: Specify generation safety — wrap the generated page with a `{/* des-styleguide:generated */}` marker at the top so it's unambiguously derived; refuse to clobber a page lacking that marker without confirming (AskUserQuestion), mirroring `/des-sync`'s corrupted/partial-marker handling. Reuse the existing `des-sync:theme`/`des-sync:components` sentinel check for the drift panel rather than inventing a new mechanism. End with the `🟢` end-of-action marker.
- [x] Step 6: Edit `skills/des-author/SKILL.md` to seed/read the `styleguide:` opt-in flag during authoring (offer it, don't force it), consistent with the rest of the family keeping its source of truth in `design-system/`.
- [x] Step 7: Edit `skills/des-sync/SKILL.md` — after the CSS apply/report step, if the `styleguide:` flag is set, append a one-line reminder that the styleguide may now be stale → run `/des-styleguide`. Do NOT touch the page (preserves des-sync's author-nothing / CSS-only contract).
- [x] Step 8: Edit `skills/des-build/SKILL.md` — after building a new component, if the `styleguide:` flag is set, flag that the new component is not yet in the styleguide → run `/des-styleguide` (flag-only, same discipline as its existing drift check).
- [x] Step 9: Update `CLAUDE.md` — add the `/des-styleguide` row to the des-* design-system table and the "All Skills" list, document the opt-in flag, the flag-only (no silent writes) discipline, and add `🟢` to the end-of-action marker table if needed. (Installer needs no change — it already globs `skills/`.)

## Verification
- Manually walk the loop end-to-end in a test project with a `design-system/` and the `styleguide:` flag set: `/des-author` (seeds flag) → `/des-sync` (flags styleguide stale) → `/des-styleguide` (generates page with all four sections) → `/des-build NewComponent` (flags component not yet in styleguide) → `/des-styleguide` (regenerates, component now present).
- Confirm `/des-styleguide` no-ops cleanly when the `styleguide:` flag is absent, and points to `/des-author` when `design-system/` is missing.
- Confirm `/des-sync` and `/des-build` only *flag* the styleguide and never write/modify the page file.
- Confirm a hand-edited page lacking the `des-styleguide:generated` marker triggers a confirmation prompt rather than being silently overwritten.
- Confirm `npx plans-cc` / `node bin/dev.js` installs `des-styleguide` (installer globs `skills/`, no code change needed) and `CLAUDE.md` lists it in both tables.

## Impact Scope

### Files to Modify
- [ ] `skills/des-styleguide/SKILL.md` — NEW skill definition (generation flow, four sections, safety markers).
- [ ] `skills/des-author/SKILL.md` — seed/read the `styleguide:` opt-in flag.
- [ ] `skills/des-sync/SKILL.md` — flag-only staleness reminder after CSS apply.
- [ ] `skills/des-build/SKILL.md` — flag-only "component not in styleguide" notice after build.
- [ ] `CLAUDE.md` — des-* table + All Skills list + opt-in/flag-only documentation.

### Related Files (may need updates)
- `bin/install.js` / `bin/dev.js` — verify only (globs `skills/`, expected to need no change).

### Endpoints/UI Affected
- New skill surface `/des-styleguide` in the skill picker.
- The generated styleguide page (e.g. `app/styleguide/page.tsx`) in a *consuming* project — not in this repo.

## Assumptions

### Initial (from elaboration)
- [high] Implement as a dedicated fourth `/des-styleguide` skill rather than auto-writing from des-sync/des-build or folding into des-build. **Why:** User explicitly chose this in the pre-capture design conversation; it preserves des-sync's author-nothing/CSS-only contract and des-build's single Figma-node responsibility — consistent with how the family is already factored.
- [high] Page contains all four sections: token swatches, global-class examples, component gallery, and drift/coverage panel. **Why:** User explicitly selected all four in the design conversation.
- [high] Opt-in via a `styleguide:` config flag declared in `design-system/`; skills no-op silently when absent. **Why:** User explicitly chose the config-flag mechanism; keeps the source of truth in `design-system/` like the rest of the family.
- [low] Exact location of the flag (front-matter in `tokens.md` vs. a new `design-system/config.md`) is left to Step 1. **Why:** Neither location is yet established in the repo; the existing des-author file structure doesn't define a config file, so this is a fresh convention to settle during execution.
- [low] Generated page uses a `des-styleguide:generated` marker and refuses to clobber an unmarked page without confirming. **Why:** Mirrors des-sync's partial/corrupted-marker safety instinct, but the specific marker name and confirm-flow are a design choice not dictated by the source description.
- [high] Installer needs no code change (it globs `skills/`). **Why:** CLAUDE.md documents that the installer globs `skills/` and that the family already ships via that glob; only verification is required.

## Changes

### Files changed
- `skills/des-styleguide/SKILL.md` (NEW) — frontmatter + generation-flow skeleton; documents the `design-system/config.md` `styleguide:` flag convention (segment 1). Four page sections + generation safety markers + edge cases (segment 2).
- `skills/des-author/SKILL.md` — new Step 9 offering the styleguide opt-in (writes `design-system/config.md` on accept); `config.md` listed in directory layout; declined-opt-in edge case (segment 3).
- `skills/des-sync/SKILL.md` — flag-only styleguide-staleness reminder after the report step (gated on a managed-block change + flag presence); matching edge case; marker untouched (segment 3).
- `skills/des-build/SKILL.md` — flag-only "component not yet in styleguide" flag in the close-the-loop step; matching edge case; marker untouched (segment 3).
- `CLAUDE.md` — `/des-styleguide` row in both the des-* table and All Skills table; family narrative extended with the opt-in `config.md` flag + flag-only discipline (segment 3).

### Discovered during execution
- [low] Put the `styleguide:` opt-in flag in a dedicated `design-system/config.md` (a fenced `yaml` block with a `styleguide: <path>` key) rather than in `tokens.md` front-matter. **Why:** `tokens.md` has a structured single purpose per des-author (UNIT CONVENTION block at the very top, ROOT FONT-SIZE CONTRACT, `@theme` block) and no existing front-matter; overloading it with cross-skill config would blur that responsibility. A dedicated `config.md` is a discoverable, shared home all four skills can read identically, matching the family's "everything lives in `design-system/` markdown" philosophy. This is the elaboration's stated low-confidence assumption and the des-author layout confirmed it as the more natural choice.
- [low] Chose end-of-action marker `🟢 GENERATED · styleguide page → Next: /des-build <component>`. **Why:** family uses 🟢 for advancing actions; `GENERATED` is the natural past-tense label for an on-demand generation step. The exact `target`/`Next:` wording is a small design call not dictated by the task; modeled on des-sync/des-build markers.
- [high] Frontmatter mirrors des-sync/des-build: `disable-model-invocation: false`, `allowed-tools: Read/Write/Edit/Glob/Grep/AskUserQuestion` (no Figma MCP tools — this skill reads markdown, not live Figma). **Why:** direct pattern-match against the two non-Figma-authoring des-* skills; the task spec calls for exactly this.
- [high] Steps 5 (four sections) and 6 (safety markers) are left as clearly-flagged HTML-comment placeholders for segment 2, per the segment scope. **Why:** segment scope formally assigns the four-section detail and generated-page safety-marker spec to segment 2; this segment owns frontmatter + flag convention + generation-flow skeleton.
- [low] Component gallery discovers built components by enumerating the project's component files following the project's own conventions (e.g. `components/`, `src/components/`, `app/**/components/` — the same locations `/des-build` writes to), then cross-referencing against `components.md` to label documented vs. built. **Why:** this repo has no consuming project to pattern-match against, so the discovery heuristic is a judgement call. Anchored it to the conventional Next.js component locations and to `/des-build`'s own output locations for internal consistency; the skill is instructed to degrade gracefully (render what it can, note the rest in the gallery + coverage panel) rather than fail if a component can't be enumerated or safely instantiated.
- [low] The `des-styleguide:generated` marker is written as the very first line of the generated file's JSX/return output as a `{/* ... */}` TSX comment. **Why:** target is a `.tsx` page (e.g. `app/styleguide/page.tsx`), so a JSX comment is the natural in-file marker; placing it first makes the derived-artifact status unmissable. Mirrors des-sync's sentinel-marker discipline (own your artifact, refuse to clobber what you don't own).
- [high] Drift/coverage panel reuses des-build Step 2's exact `des-sync:theme` / `des-sync:components` sentinel-marker check rather than a new mechanism, and only flags (never syncs). **Why:** task spec mandates reuse; keeps a single source of truth for drift detection across the family and preserves the flag-only discipline.
- [low] The SKILL.md document's literal last line is an Edge Cases bullet, not the `🟢 GENERATED` marker. **Why:** the marker is the skill's runtime *output* contract (specified in Step 7), exactly as des-sync/des-build structure it — Steps spec the final-output marker, then Edge Cases close the document. The marker being "the very last line" refers to the skill's emitted output, not the SKILL.md file.
- [high] Wired the styleguide opt-in into des-author as a new Step 9 (renumbering the old Summarize/marker steps to 10/11) using its existing `AskUserQuestion` checkpoint style, rather than folding it into an existing authoring step. **Why:** the opt-in is a distinct decision orthogonal to authoring any single markdown file (it concerns a derived view, not system content), so it reads cleanest as its own gate placed after all files are authored but before the summarize/stop step.
- [high] des-author's Step 9 reads the flag first and skips re-prompting if `config.md` already declares `styleguide:`. **Why:** des-author refines in place on re-runs; re-asking an already-answered opt-in every refresh would be noise. Reading-then-offering matches the family's idempotent-by-design posture.
- [low] Chose the exact des-sync reminder line `Styleguide may now be stale — run /des-styleguide to regenerate it.` and gated it on "a sync that changed a managed block" (not every run). **Why:** the wording is a small design call; gating on actual change avoids nagging when a re-sync was a no-op. Modeled tone on des-build's existing flag wording.
- [low] des-build emits the styleguide flag inside Step 6 (Close the feedback loop) rather than as a new step. **Why:** Step 6 already surfaces post-build gaps/follow-ups, so the "not yet in the styleguide" flag is a natural member of that list; keeps des-build's step count and structure stable.
- [low] In CLAUDE.md, described the styleguide as "an optional on-demand view hanging off" the author→sync→build loop rather than a fourth loop stage. **Why:** the task explicitly notes styleguide is on-demand/opt-in, not a mandatory loop stage; calling it a loop stage would misrepresent it. Added all des-* skills' styleguide-awareness to the existing des-* table and a single `/des-styleguide` row to the All Skills table (the other des-* skills are documented in their dedicated section, not the All Skills table, so only the new one was added there to match the new dedicated-section coverage).

## Notes
The flag-only discipline is the load-bearing design decision: the felt experience is "the system tells me when the styleguide drifted," but no skill ever silently mutates a shared page out from under the user. This keeps each existing skill's single responsibility intact while still closing the loop.
