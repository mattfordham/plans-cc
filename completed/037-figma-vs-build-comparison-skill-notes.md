# Add a real Figma-vs-build comparison to the plan/des skills, plus per-project skill notes

**ID:** 037
**Created:** 2026-09-23T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-09-24T12:30
**Branch:** feature/037-figma-vs-build-comparison-skill-notes

## What

You're working on my Claude Code skills library (`~/.claude/skills/`, plus `~/.claude/agents/plan-executor.md`). Two changes are needed. Read the skills named below before editing, and match their existing style: numbered steps, bold guard rules, an Edge Cases section and end-of-action markers.

### Background: the problem

I build UI sections with `/plan-execute`. Tasks that build a component send it to the `des-build` skill (plan-execute's "build-skill route"), usually as `/des-build <X> verify`. The tasks run in a kept git worktree and end at status `review`. Then I run `/plan-review`.

Almost every time, I have to ask by hand during review to "compare Figma to the build and tweak". The `verify` step doesn't catch the differences. For example, in one project's PostIndex task the step ran `/des-build PostIndex verify`, and the very next commit was a large fix: a 12-col filter bar, a content-sized search field, the wrong tab type style, card geometry, pagination and more.

What's actually going wrong:

1. **des-build's `verify` never opens a browser.** Its `allowed-tools` are Read/Write/Edit/Glob/Grep/AskUserQuestion plus three Figma Dev Mode tools (`get_design_context`, `get_metadata`, `get_screenshot`). There's no Playwright. Step 8 says to compare "Figma px" with "rendered px", but nothing can measure rendered px, so the model reads its own Tailwind classes and assumes the values. It's reviewing its own code, not the page.
2. **The page doesn't exist yet when verify runs.** In a typical task, des-build builds and verifies the component in an early step. The page it gets rendered on (a throwaway `src/app/(frontend)/review/<slug>/page.tsx` with inline sample data) is created later, by the plan-executor sub-agent. That step only checks that the page loads. No dev server is running in the worktree during execution.
3. **`/plan-review` compares nothing visually.** It starts the dev server and gives the URL. The first real side-by-side of Figma and the build is always done by the human.

### Change 1: a real visual comparison before review

Add a **visual comparison stage** that runs automatically. It should run after all How steps are done and before the task goes to `review`, whenever a task used the des-build route (or otherwise names Figma frames and a review page).

**Where it lives**

- **`des-build`**: extend `verify` mode to take an optional URL: `/des-build <X> verify <url>`. Add the Playwright MCP tools it needs to `allowed-tools`, at least `mcp__playwright__browser_navigate`, `browser_resize`, `browser_take_screenshot`, `browser_evaluate`, `browser_snapshot` and `browser_wait_for`. With a URL, it does the measured comparison below. Without one, it keeps today's behaviour but **must say plainly** in its output that this was a code-only check with no page render, not a visual verification. Don't let a code-only check report itself as verified.
- **`plan-execute`** (the orchestrator, which can use Playwright and the Skill tool; the plan-executor sub-agent can't call skills): after the last How step, and once the review page exists, run the comparison stage. Don't run verify during the build-unit step anymore, or make it code-only there. The real verify happens once the page exists.
- **`plan-review`**: if the task's `## Changes` has a comparison table, show it at the top of the review, next to the URL.

**The comparison stage**

1. **Start the dev server** in the worktree on its own port. Many projects use `PORT=<base + task number> yarn dev`; check the project's AGENTS.md/CLAUDE.md for the convention and don't hardcode it. Wait until `/review/<slug>` returns 200. Stop the server afterwards unless the task keeps its worktree open for review.
2. **For each Figma frame the task names** (desktop, mobile, and variants such as grid/list or open/closed states):
   - Take the Figma screenshot (`get_screenshot`) and read the node's properties (`get_design_context`).
   - Resize the Playwright viewport to that frame's width, set up the same state (click toggles, open menus, type into search and so on), then take a screenshot.
3. **Measure the page, not the code.** Use `browser_evaluate` to read `getComputedStyle` and `getBoundingClientRect` for the key elements: headings and body text (font-size, line-height, letter-spacing, weight), containers and grids (widths, column count, gaps, padding) and repeated items (card size, spacing). Compare them to the Figma values. Check `html` font-size against the design system first.
4. **Judge the two screenshots side by side** for structure: missing or extra elements, wrong order or alignment, different content in a slot, wrong glyphs or icons. **Don't use an automatic pixel-diff score.** Font rendering and sample content make it noisy.
5. **Fix, then check again, at most 2 times.** Turn each difference into a specific fix (property, Figma value, rendered value, file) and send it to the plan-executor sub-agent, or back to des-build. Then measure again.
6. **Record the results** in the task's `## Changes` as a table: element · property · Figma · rendered · status (fixed / still differs / accepted as an assumption). Fixed and still-differing items should both appear. Screenshots are for comparing only. **Never save them into the repo** (plan-executor already has this rule).

**Guard rules (write these into the skills as bold rules)**

- If the Figma MCP or Playwright MCP isn't available, **say so loudly** in the output and in `## Changes` ("Visual comparison NOT run: <reason>"). Never skip quietly, and never report it as passed.
- If the dev server won't start or the review page doesn't return 200, report that as a failed stage. Don't fall back to comparing code.
- Differences under 1px from sub-pixel rounding don't count.
- When running unattended (yolo/worktree mode), don't stop to ask. Fix what's clear and list the rest in the table.

### Change 2: per-project skill notes (`.plans/SKILL_NOTES.md`)

This gives each project a place to adjust skill behaviour, without editing the global skills.

- Optional file: `.plans/SKILL_NOTES.md`, with one `## <skill-name>` section per skill (e.g. `## plan-review`, `## des-build`, `## plan-elaborate`), plus an optional `## all` section for every skill.
- Each plan-* and des-* skill that does real work (at least plan-execute, plan-review, plan-elaborate, plan-clarify, plan-complete, des-build, des-author) must, **right after finding the project root**, read the file if it exists. It applies `## all` plus its own section. It then prints one line: `Skill notes: applied <n> note(s) from .plans/SKILL_NOTES.md` (or nothing if the file is missing).
- **The plan-executor sub-agent doesn't see memory or skill notes** unless they're passed to it. When plan-execute or plan-review start the sub-agent, add a `## Project Skill Notes` block to its prompt containing the `## plan-executor` and `## all` sections. Put it right after the shortened CONTEXT.md block they already pass.
- Priority order: the task file's own instructions > SKILL_NOTES > the skill's defaults. A note can add steps or change defaults. It can't turn off a hard-failure rule (e.g. des-build's rule to stop if Figma or the design system can't be reached).
- Update `plan-init` to mention the file (don't create an empty one). Update `plan-help` and the shared plan CLAUDE.md, if there is one, to document it.

### Acceptance criteria

- Running `/plan-execute` on a des-build task in a kept worktree produces a `## Changes` comparison table with measured rendered values from the browser, or a clear "NOT run: <reason>" line. It never reports a code-only check as verified.
- `/des-build X verify` with no URL says clearly that it was a code-only check.
- A project with `.plans/SKILL_NOTES.md` shows the "Skill notes: applied…" line in each skill listed above, and plan-executor prompts include the `## Project Skill Notes` block.
- A project without the file behaves exactly as before.
- Nothing is saved into the target project's repo apart from the table in the task file.

_(Meta-note for whoever executes this: the instruction "Show me a summary of the planned edits to each file before making them" is a directive for the execution session, not part of the task's own scope.)_

## Why

Design-system build tasks (`**Build:** des-build`) routinely reach `review` with unnoticed
fidelity gaps, because nothing in the pipeline ever measures the *rendered* page against
Figma — `des-build verify` inspects its own Tailwind classes with no browser, and the review
page it would render on doesn't even exist yet at that point. Adding a real, measured visual
comparison stage (start the dev server, read `getComputedStyle`/`getBoundingClientRect`,
diff against Figma, fix, record a table) catches those gaps before a human ever opens the
review, turning the repeated manual "compare Figma and tweak" round-trip into an automatic
one. The companion `.plans/SKILL_NOTES.md` mechanism lets individual projects tune skill
behaviour (ports, extra checks, defaults) without forking the global skills — and, crucially,
passes those notes through to the plan-executor sub-agent, which today is blind to them.

## How Summary

Two independent changes to the global skills library (`~/.claude/skills/` + `~/.claude/agents/plan-executor.md`).
**Change 1** extends `des-build verify` to accept an optional URL (adding Playwright MCP tools
to its `allowed-tools`) that does a *measured* browser comparison, and makes the no-URL path
declare itself a code-only check that is never "verified"; adds a new **visual-comparison
stage** to `plan-execute` that runs after the last How step once the review page exists
(the review page is created by a plan-executor How step first), starting a per-task-port dev
server, measuring the page, fixing ≤2×, and writing a comparison table into the task's
`## Changes`; and teaches `plan-review` to surface that table at the top of the review.
**Change 2** adds an optional per-project `.plans/SKILL_NOTES.md` (with `## <skill>` sections
plus `## all`) that each real-work skill reads right after project-root discovery and applies,
printing a one-line applied-notes message, and that `plan-execute`/`plan-review` forward to the
plan-executor sub-agent as a `## Project Skill Notes` prompt block. Both changes are documented
in the shared `CLAUDE.md` following the `worktree_links`/`models` opt-in contract template; both
are absent-⇒-today's-behaviour backwards compatible.

**Files of note:**
- `skills/des-build/SKILL.md` — add Playwright tools + optional-URL verify; rewrite Step 8 into URL-measured vs code-only modes; fix the Step 9 verify marker so no-URL never says "VERIFIED"; add SKILL_NOTES read at Step 1.
- `skills/plan-execute/SKILL.md` — add Playwright tools; add the new visual-comparison stage before the worktree-finish steps (11d/11e); ensure a plan-executor How step creates the review page; inject `## Project Skill Notes` after the CONTEXT.md block (line ~835); add SKILL_NOTES read after root discovery (Step 1).
- `skills/plan-review/SKILL.md` — prepend the `## Changes` comparison table via the 9.a/9.b prepend pattern; inject `## Project Skill Notes` into the fix-spawn prompt; add SKILL_NOTES read after root discovery.
- `agents/plan-executor.md` — honor the injected `## Project Skill Notes` block; the review-page-creation + no-screenshots-in-repo rules live here.
- `skills/plan-elaborate/SKILL.md`, `plan-clarify/SKILL.md`, `plan-complete/SKILL.md`, `des-author/SKILL.md` — add the SKILL_NOTES read after root discovery (Step 1 anchor for the des-* pair).
- `skills/plan-init/SKILL.md` — *mention* SKILL_NOTES.md (never create it), mirroring the `models`/`worktree_links` "not seeded" precedent.
- `skills/plan-help/SKILL.md` — add SKILL_NOTES.md to the File Structure block.
- `CLAUDE.md` — new `### Per-project skill notes` cross-skill contract section; update the des-build table row + `## Design-System Skills` to describe the rendered comparison.

## How

- [x] Step 1: **Read all target skills first & confirm anchors.** Read (do not yet edit) `skills/des-build/SKILL.md`, `skills/plan-execute/SKILL.md`, `skills/plan-review/SKILL.md`, `agents/plan-executor.md`, `skills/plan-init/SKILL.md`, `skills/plan-help/SKILL.md`, `skills/plan-elaborate/SKILL.md`, `skills/plan-clarify/SKILL.md`, `skills/plan-complete/SKILL.md`, `skills/des-author/SKILL.md`, and `CLAUDE.md`. Confirm the two research-verified facts before touching anything: (a) **no review page is created anywhere today** — so Change 1 must introduce it; (b) **des-build and des-author have no project-root discovery** — so their SKILL_NOTES anchor is Step 1, not an "after root discovery" line. Match each file's existing style (numbered steps, bold guard rules, Edge Cases, end-of-action markers).
- [x] Step 2: **Change 1 — des-build.** In `skills/des-build/SKILL.md`: add the Playwright MCP tools to `allowed-tools` (`mcp__playwright__browser_navigate`, `browser_resize`, `browser_take_screenshot`, `browser_evaluate`, `browser_snapshot`, `browser_wait_for`); extend `verify` argument parsing to accept an optional trailing URL (`/des-build <X> verify <url>`); rewrite Step 8 into two modes — **with URL:** navigate, resize per Figma frame, set up state, measure via `browser_evaluate` (`getComputedStyle`/`getBoundingClientRect`), compare to Figma values, no pixel-diff score; **without URL:** keep today's code-derived checklist but **add a bold guard rule** that it MUST report itself as a *code-only check, no page render* and never as "verified". Fix the Step 9 marker so the no-URL path emits a `🔵 CODE-ONLY CHECK` (or equivalent) rather than `🔵 VERIFIED`. Add the guard rules from the task's What (Figma/Playwright unavailable → say so loudly, never "passed"; dev-server/200 failure = failed stage, no code fallback; <1px rounding ignored; unattended = don't ask, list in table).
- [x] Step 3: **Change 1 — plan-execute (the stage).** In `skills/plan-execute/SKILL.md`: add the Playwright MCP tools to `allowed-tools`; ensure a **plan-executor How step creates the throwaway review page** (`src/app/(frontend)/review/<slug>/page.tsx` with inline sample data — path taken from project convention) as part of normal execution; add a new **visual-comparison stage** inserted **before the worktree-finish steps (11d/11e)**, gated on `build_route` being set (or the task otherwise naming Figma frames + a review page). The stage: start the dev server on a per-task port (`base + task number`, base read from project AGENTS.md/CLAUDE.md — never hardcoded), wait for `/review/<slug>` = 200, for each named Figma frame take the Figma screenshot + `get_design_context` and measure the resized Playwright viewport, compare (check `html` font-size vs design system first), judge screenshots for structure, fix ≤2× via the plan-executor sub-agent (or re-invoke des-build), record a `## Changes` table (element · property · Figma · rendered · status), stop the server unless the worktree is kept. Stop running `verify` code-only during the build-unit step. Write all the guard rules as bold rules. **Never save screenshots into the repo.**
- [x] Step 4: **Change 1 — plan-review.** In `skills/plan-review/SKILL.md`: add a pre-render step mirroring the existing 9.a low-confidence-assumptions pattern that reads the task file's `## Changes` section, extracts the comparison table if present, and prepends it at the top of the review summary (9.b) next to the URL.
- [x] Step 5: **Change 2 — the SKILL_NOTES read (per skill).** Add, right after project-root discovery (Step 1), a bullet to `plan-execute`, `plan-review`, `plan-elaborate`, `plan-clarify`, `plan-complete` that reads `.plans/SKILL_NOTES.md` if it exists, applies the `## all` section plus its own `## <skill-name>` section, and prints exactly `Skill notes: applied <n> note(s) from .plans/SKILL_NOTES.md` (or nothing if the file is missing/empty). For `des-build` and `des-author` (no root discovery), anchor the same read at their Step 1, reading `.plans/SKILL_NOTES.md` relative to the resolved project root when reachable, skipping silently otherwise. Follow the defensive optional-read + silent-default discipline used for `models`/`plan_comments`.
- [x] Step 6: **Change 2 — forward notes to plan-executor.** In `skills/plan-execute/SKILL.md`, inject a `## Project Skill Notes` block (containing the `## plan-executor` + `## all` sections from SKILL_NOTES) into the plan-executor segment prompt **immediately after the `## Project Context` / CONTEXT.md block** (line ~835). In `skills/plan-review/SKILL.md`, add the same `## Project Skill Notes` block to the deferred-observation fix-spawn prompt. In `agents/plan-executor.md`, add a short instruction to honor an injected `## Project Skill Notes` block if present. Establish the priority order in the contract: task file instructions > SKILL_NOTES > skill defaults, and note a SKILL_NOTES entry can add steps/change defaults but **cannot** turn off a hard-failure rule (e.g. des-build's Figma/design-system preflight abort).
- [x] Step 7: **Change 2 — docs.** In `skills/plan-init/SKILL.md`, add a one-line *mention* of the optional `.plans/SKILL_NOTES.md` (do NOT create it, do NOT add a config key — mirror the `models`/`worktree_links` "not seeded" precedent). In `skills/plan-help/SKILL.md`, add a SKILL_NOTES.md line to the File Structure block. In `CLAUDE.md`, add a new `### Per-project skill notes (.plans/SKILL_NOTES.md) — cross-skill contract` section modeled on the `worktree_links`/`models` sections (opt-in, absent = no-op, not seeded by plan-init, call sites enumerated, priority order stated); and update the des-build table row (`verify` line) plus `## Design-System Skills` to describe the rendered visual-comparison stage.
- [x] 👁 Step 8: **Manual verification.** Since these skills are declarative and can't be unit-tested, verify by inspection + a dry run: confirm each edited file still parses (valid YAML frontmatter, consistent step numbering), then in a scratch project confirm a project with `.plans/SKILL_NOTES.md` shows the applied-notes line and a project without it behaves identically to before. Confirm `/des-build X verify` with no URL now clearly says "code-only check".

## Verification

- **Change 1 (des-build):** `/des-build X verify` with no URL clearly reports a *code-only check, no page render* and never emits a "VERIFIED" marker; `/des-build X verify <url>` path documents the measured browser comparison. Playwright MCP tools appear in des-build's `allowed-tools`.
- **Change 1 (plan-execute):** A des-build-routed task in a kept worktree runs the visual-comparison stage after the last How step and produces a `## Changes` comparison table with **measured rendered values** (element · property · Figma · rendered · status), OR a clear `Visual comparison NOT run: <reason>` line — never reporting a code-only check as verified. The review page is created before the stage runs; the dev server uses a per-task port from project convention; no screenshots are written into the repo.
- **Change 1 (plan-review):** When a task's `## Changes` contains a comparison table, `/plan-review` shows it at the top of the review next to the URL.
- **Change 2:** A project WITH `.plans/SKILL_NOTES.md` shows the `Skill notes: applied <n> note(s)...` line in every listed skill (plan-execute, plan-review, plan-elaborate, plan-clarify, plan-complete, des-build, des-author), and plan-executor prompts include the `## Project Skill Notes` block. A project WITHOUT the file behaves exactly as before (no line printed, no behavioural change).
- **General:** Each edited skill preserves its existing style (numbered steps, bold guard rules, Edge Cases section, end-of-action marker) and valid frontmatter. Nothing is saved into any target project's repo apart from the comparison table in the task file.

## Impact Scope

### Files to Modify
- [ ] `skills/des-build/SKILL.md` — Playwright tools in allowed-tools; optional-URL verify parsing; Step 8 dual-mode rewrite; Step 9 no-URL marker fix; SKILL_NOTES read at Step 1; guard rules.
- [ ] `skills/plan-execute/SKILL.md` — Playwright tools; review-page creation via plan-executor step; new visual-comparison stage before 11d/11e; stop code-only verify at build-unit step; `## Project Skill Notes` injection after line ~835; SKILL_NOTES read after Step 1.
- [ ] `skills/plan-review/SKILL.md` — prepend `## Changes` comparison table (9.a/9.b pattern); `## Project Skill Notes` in fix-spawn prompt; SKILL_NOTES read after Step 1.
- [ ] `agents/plan-executor.md` — honor injected `## Project Skill Notes` block; (existing screenshot-hygiene + dev-server rules referenced, not changed).
- [ ] `skills/plan-elaborate/SKILL.md` — SKILL_NOTES read after Step 1 root discovery.
- [ ] `skills/plan-clarify/SKILL.md` — SKILL_NOTES read after Step 1 root discovery.
- [ ] `skills/plan-complete/SKILL.md` — SKILL_NOTES read after Step 1 root discovery.
- [ ] `skills/des-author/SKILL.md` — SKILL_NOTES read at Step 1 (no root discovery).
- [ ] `skills/plan-init/SKILL.md` — one-line mention of `.plans/SKILL_NOTES.md` (not created).
- [ ] `skills/plan-help/SKILL.md` — SKILL_NOTES.md line in File Structure block.
- [ ] `CLAUDE.md` — new `### Per-project skill notes` cross-skill contract section; des-build table row + `## Design-System Skills` update for the visual-comparison stage.

### Related Files (may need updates)
- `skills/plan-spawn/SKILL.md` — also spawns plan-executor with an abbreviated CONTEXT.md block (Step 3/7); for full consistency the `## Project Skill Notes` injection *could* be added here too, but it is **out of the task's explicit scope** (the brief names only plan-execute and plan-review). Flag, don't silently expand.
- `bin/install.js` — copies `skills/` and `agents/`; no change needed (new content is inside existing files), but confirm no new files were introduced that need packaging.

### Endpoints/UI Affected
- None (no runtime code; skills are declarative markdown). The only user-visible surface is skill output text and the `## Changes` table format in task files.

<!-- NOTE on ~/.claude vs repo: the skills are installed to ~/.claude/skills/ (symlinks in dev
     point back to this repo's skills/). Edit the repo's skills/ and agents/ source files (the
     symlink targets); do not edit the ~/.claude copies directly. -->


## Assumptions

### Initial (from elaboration)
- [low] The throwaway **review page is created by a plan-executor How step** (not by des-build), because research confirmed no review-page creation exists anywhere today and plan-executor already builds pages. **Why:** the brief says "the page is created later by the plan-executor sub-agent" but grep found no such instruction — so it must be *introduced*, and plan-executor is the natural owner.
- [low] The orchestrated **visual-comparison stage lives in plan-execute, not duplicated into des-build**; des-build gains only the reusable URL-measured `verify` mode. **Why:** only the plan-execute orchestrator can hold both Playwright and the Skill tool; duplicating a full comparison implementation into des-build risks two divergent code paths (research Approach Warning). The brief asks for both, so des-build keeps URL mode as a capability while plan-execute owns the automatic stage.
- [low] For **des-build and des-author (which have NO project-root discovery)**, the SKILL_NOTES read is anchored at their **Step 1** and reads `.plans/SKILL_NOTES.md` relative to the resolved project root when reachable, skipping silently otherwise. **Why:** research confirmed neither des-* skill does root discovery or touches `.plans/` except in worktree_links documentation; the brief's "right after finding the project root" has no anchor there.
- [low] **plan-review does not currently pass a CONTEXT.md block** to its fix-spawn prompt, so the `## Project Skill Notes` block is added as a **standalone block** in that prompt rather than requiring a full CONTEXT.md block first. **Why:** research showed plan-review's fix spawn (Step 7/201) builds its prompt inline with no CONTEXT.md; adding a full CONTEXT.md block is beyond the brief's scope, which only asks for the skill-notes block.
- [low] The **per-task dev-server port is `base + task number`**, with the base read from the project's AGENTS.md/CLAUDE.md convention and never hardcoded. **Why:** the brief states "many projects use `PORT=<base + task number> yarn dev`; check the project's AGENTS.md/CLAUDE.md and don't hardcode it."
- [low] The **no-URL des-build verify marker** becomes a distinct `🔵 CODE-ONLY CHECK` (or equivalent) instead of `🔵 VERIFIED`. **Why:** the brief demands a code-only check never report itself as verified; reusing the VERIFIED marker would violate that. Exact wording to be finalized during execution to match the skill's marker conventions.
- [low] **plan-spawn is flagged as out-of-scope** for the `## Project Skill Notes` injection even though it also spawns plan-executor. **Why:** the brief explicitly names only plan-execute and plan-review; silently expanding scope to plan-spawn would exceed the task. Recorded as a Related File to flag, not edit.
- [low] Edits target the **repo source files** (`skills/`, `agents/`) which are the symlink targets of the installed `~/.claude/skills/` copies, not the installed copies directly. **Why:** dev uses `bin/dev.js` symlinks; editing installed copies would be lost on reinstall.
- [high] This task is a **feature** with **11 files to modify**, so an `## Impact Scope` section is warranted and was generated. **Why:** research identified concrete file:line anchors for all eleven; the 3+-file threshold is clearly met.

### Discovered during execution
- [low] plan-execute's visual-comparison stage performs the measured Figma comparison by **re-invoking des-build with the URL (`verify <url>`) via the Skill tool**, rather than calling the Figma MCP directly. **Why:** the `CLAUDE.md` "Figma MCP access belongs to des-build, never to /plan-execute" contract forbids granting the orchestrator Figma tools; des-build already owns both the Figma tools and the measured-comparison procedure (its new Step 8a). Only Playwright + Skill were added to plan-execute's allowed-tools — no Figma tools.
- [low] The new visual-comparison stage was placed as **Step 11c.5** (immediately after the 11c segment loop, before 11d "After all segments complete"). **Why:** the segment says "before the worktree-finish steps (11d/11e)"; 11c.5 is the clean anchor that runs after all segments yet before both the non-worktree summary (11d) and worktree finish (11e).
- [low] des-build's no-URL verify marker is `🔵 CODE-ONLY CHECK · <Component> → Next: /des-build <Component> verify <url>` (a `→ Next:` tail was added to point at the real measured path). **Why:** the file's marker convention includes a `→ Next:` tail when there is an obvious next step; re-running with a URL is exactly that obvious next step, and it reinforces that a code-only check is not the end state.
- [low] The build-unit route in Step 11 now **never appends `verify`** (previously it appended ` verify` when Verification asked for a self-verify pass). **Why:** at build time no page/dev-server exists, so any `verify` there could only be the code-only check, which must never be reported as verification; the real measured verify moved to 11c.5. Kept a carve-out sentence allowing an explicit code-only checklist at build time, clearly labelled as not-a-verification.
- [low] Review-page creation is documented as a **conditional section in the 11c segment-prompt template** (gated on build_route or the task naming Figma frames + review page), with the exact directory taken from project convention rather than hardcoded. **Why:** research confirmed no review-page creation exists today; plan-executor is the natural owner and the segment template is where its instructions live. The `src/app/(frontend)/review/<slug>/page.tsx` path is given as the common convention, not a mandate.
- [low] The SKILL_NOTES read is added as a new **sub-step 1.5** (`1.5. **Apply per-project skill notes**`) in each plan-* skill, immediately after Step 1's root discovery, rather than renumbering every subsequent step. **Why:** the codebase already uses decimal sub-steps for post-Step-1 insertions (plan-review's own 3.5/3.6, and plan-execute's 11c.5 added in Segment 1); a `1.5` keeps the diff minimal and every downstream step-number reference intact.
- [low] plan-review's comparison-table prepend is added as a parallel **pre-render sub-step 9.a.2** (mirroring the existing 9.a assumptions collector) and rendered by 9.b as a `## Visual comparison (Figma vs rendered)` block placed immediately after the Branch/Type metadata (before `## Summary`). **Why:** "next to the URL" in the brief maps to the top-of-summary metadata region; 9.a/9.b is the established pre-render→render pattern in this exact file, so mirroring it keeps conventions and keeps the block backwards-compatibly omittable.
- [low] The `## Visual comparison` prepend also surfaces a `Visual comparison NOT run: <reason>` line verbatim when no table is present, not just tables. **Why:** the brief and plan-execute Step 11c.5 both write that not-run line into `## Changes`; hiding it at review would defeat the "never report as passed" guard, so the reviewer must see it.
- [low] plan-executor's skill-notes instruction is added as **step 0** of `<execution_flow>` (before "Read and understand the steps"). **Why:** the notes must be honored across the whole segment, so they belong ahead of step 1; a step 0 avoids renumbering the existing flow while signaling "apply this first."
- [low] The `Skill notes: applied <n> note(s)...` count is specified as "applicable bullets across `## all` + the skill's own section." **Why:** the brief says "applied <n> note(s)" without defining <n>; counting applied bullets is the natural, inspectable interpretation and keeps the one-line output honest about what actually took effect.
- [low] (Step 7 docs) The `.plans/SKILL_NOTES.md` mention in `plan-init` was placed as a bullet directly under the config.json step (step 6) alongside a matching "do not seed `models`/`worktree_links`" bullet, rather than in the directory-structure block (step 2). **Why:** SKILL_NOTES is deliberately NOT created by init (like `models`/`worktree_links`), so grouping it with the other opt-in "not seeded" keys communicates that intent; the step-2 structure block lists only files init actually creates.
- [low] (Step 7 docs) The new `### Per-project skill notes` CLAUDE.md section was placed immediately after `### The **Build:** task-header field` and before `### Checkbox Progress Tracking`. **Why:** it sits with the other cross-skill contracts (worktree_links/models/Build) and the placement is "logically near the other cross-skill contracts" per the segment brief.
- [low] (Step 7 docs) The section enumerates 7 reading skills plus the plan-executor **forwarding** path, matching the brief's "7 skills that read it ... plus the plan-executor forwarding via plan-execute/plan-review." des-styleguide/des-sync are NOT listed as readers. **Why:** only the 7 named skills gained a SKILL_NOTES sub-step 1.5 in Segments 1-2; plan-executor receives notes by injection, not by reading the file, so it is described as a forwarding target rather than an eighth reader.
- [low] (Review) The 11c.5 dev-server port now **defaults to base `3000` + task number** instead of skipping the stage when no convention is documented. Lookup order: `.plans/SKILL_NOTES.md` → project `AGENTS.md`/`CLAUDE.md` → default. **Why:** during review the user wanted verify to run by default, and a missing port convention was the most likely reason the stage would silently never run. The per-task offset still prevents worktree collisions.

## Changes
Replaced des-build's self-graded `verify` with a measured Figma-vs-rendered comparison and added optional per-project skill notes.

- `skills/des-build/SKILL.md`: added the Playwright tools. `verify <url>` measures the live page (Step 8a). Bare `verify` is a code-only check that ends with `🔵 CODE-ONLY CHECK`, never VERIFIED.
- `skills/plan-execute/SKILL.md`: added Playwright and Skill to allowed-tools. The segment prompt now creates a review page. New Step 11c.5 visual-comparison stage: starts the dev server on a per-task port (SKILL_NOTES → AGENTS.md/CLAUDE.md → default base 3000), re-invokes des-build with the URL, fixes up to 2×, and writes the comparison table to `## Changes`. The build step no longer appends `verify`.
- `skills/plan-review/SKILL.md`: 9.a.2 puts the comparison table (or the NOT-run line) at the top of the review.
- Added `.plans/SKILL_NOTES.md` read at sub-step 1.5 in plan-execute, plan-review, plan-elaborate, plan-clarify, plan-complete, des-build and des-author. The `## Project Skill Notes` block is passed into plan-executor prompts, and `agents/plan-executor.md` has a new step 0 to honor it.
- Docs: new SKILL_NOTES contract in CLAUDE.md. plan-init and plan-help mention the file.
- Follow-up captured as #038: offer to create SKILL_NOTES during /plan-init.

## Notes
_Additional context_
