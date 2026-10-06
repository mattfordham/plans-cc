---
name: des-build
disable-model-invocation: false
argument-hint: "<component or section name> [verify [url]]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__figma-dev-mode-mcp-server__get_design_context
  - mcp__figma-dev-mode-mcp-server__get_metadata
  - mcp__figma-dev-mode-mcp-server__get_screenshot
  - mcp__playwright__browser_navigate
  - mcp__playwright__browser_resize
  - mcp__playwright__browser_take_screenshot
  - mcp__playwright__browser_evaluate
  - mcp__playwright__browser_snapshot
  - mcp__playwright__browser_wait_for
description: Build a Next.js + Tailwind component by reading design-system/ first; use only its tokens/patterns, and optionally self-verify the render against the Figma frame. Requires BOTH a reachable Figma Dev Mode MCP and a readable design-system/ — aborts rather than degrading if either is missing. With `verify <url>`, measures the live rendered page against Figma via Playwright; with `verify` alone it is a code-only check that is NEVER reported as verified.
---

# des-build

Build a Next.js + Tailwind component (or page section) by reading the reviewed `design-system/` markdown FIRST and using only its tokens and patterns. This is Phase 2 of the `des-*` family, with the Phase 3 self-verify checklist folded in via `verify` mode.

**Two required inputs, no degraded mode.** This skill needs both a reachable Figma Dev Mode MCP connection *and* a readable `design-system/` directory. If either is missing it **aborts** — it never falls back to the other, and never to the task description. The reason is that a build from missing inputs still compiles, lints, and renders, so it reports as a clean success while being structurally wrong. Step 1 is the gate that prevents this.

## Arguments

- `$ARGUMENTS`: `<component or section name>` to build, with an optional trailing `verify` keyword and an optional trailing URL after `verify`.
  - `/des-build Hero` — build the Hero component.
  - `/des-build Hero verify` — build, then run the **code-only** self-verify checklist against the Figma frame (no page render — see Step 8). This path never reports itself as "verified".
  - `/des-build Hero verify http://localhost:3007/review/hero` — build (or reuse the existing render), then run the **measured** browser comparison against the live page at that URL (see Step 8, with-URL mode). This is the only path that measures the *rendered* page.
  - `/des-build Hero` invoked when `Hero` already exists, with `verify [url]` — verify the existing render without rebuilding.

**Parsing the `verify` argument:** after the component name, if the next token is `verify`, set `verify_mode = true`. If a token follows `verify` and looks like a URL (starts with `http://` or `https://`), set `verify_url` to it; otherwise `verify_url` is null. `verify` with a URL → the measured browser comparison (Step 8, with-URL mode). `verify` with no URL → the code-only checklist (Step 8, no-URL mode).

## Steps

1. **PREFLIGHT GATE — prove both inputs are reachable, or ABORT (run before anything else)**

   `des-build` has exactly two sources of truth: the reviewed `design-system/` markdown and the live Figma node. Neither is optional and neither substitutes for the other. A run that cannot reach both produces a *plausible-looking component that is structurally wrong* — and, because it still typechecks, lints, and returns HTTP 200, it reports as a clean success. That failure mode is the reason this gate exists: **verification of the build is not verification of the inputs.**

   Both checks below must produce **observed evidence** — an actual tool result in this transcript. A recollection, an assumption, or a claim that a file was read is NOT evidence. If you cannot point to the tool call that produced the evidence, the check FAILED.

   a. **Figma MCP reachability (hard requirement, no fallback).**
      - Probe the connection with `mcp__figma-dev-mode-mcp-server__get_metadata` for the target node.
      - If it returns unauthorized, unavailable, not-connected, or any error: **ABORT immediately.** Do not build. Do not fall back to the markdown alone. Do not fall back to the task description. Emit:
        ```
        🔴 BLOCKED · <Component> — Figma MCP unreachable
        Reason: <the exact error returned>
        The Figma node is a required input; the design-system markdown is a summary, not a substitute.
        Fix: reconnect Figma Dev Mode MCP, then rerun /des-build <Component>.
        ```
      - This abort is **unconditional and holds in autonomous contexts too.** Under `/plan-execute` yolo/worktree mode, ABORT rather than deferring to review — an unverifiable build is worse than no build, because it looks finished. The Step 6 autonomous exception covers *ambiguous reflow*, never *missing inputs*.

   b. **`design-system/` readability (hard requirement).**
      - Confirm the directory resolves from the current working directory and that the core files actually return content. `design-system/` is commonly **gitignored**, which means a `git worktree` checkout **will not contain it** — this is guaranteed for every gitignored-directory worktree, not a fluke. See the `worktree_links` contract in the plans-cc CLAUDE.md: the project root's `.plans/config.json` should list `design-system` so `/plan-execute` symlinks it into the worktree.
      - If the directory is missing or the reads return nothing: **ABORT.** Emit:
        ```
        🔴 BLOCKED · <Component> — design-system/ not readable from <cwd>
        If this is a git worktree: design-system/ is likely gitignored and was never
        copied across. Add "design-system" to worktree_links in .plans/config.json,
        or symlink it: ln -s <project-root>/design-system <worktree>/design-system
        If the project has no design system yet: run /des-author first.
        ```
      - Do NOT proceed on partial reads. Do NOT reconstruct the design from the task description, the component name, or general knowledge of what such a component usually looks like. **Building a generic component is the failure this gate prevents** — not an acceptable degraded mode.

   c. **Record the evidence in your output.** Before Step 2, state what you actually observed:
      ```
      Preflight: Figma node <id> reachable ✓ (get_metadata returned <n> nodes)
                 design-system/ read from <absolute path> ✓ (tokens.md <n>L,
                 components.md <n>L, composition.md <n>L, layout-and-responsive.md <n>L)
      ```
      Cite real line counts and a real absolute path from real tool results. **Never cite a file you did not observably read** — a fabricated source citation is what lets a structurally-wrong build pass as sourced, and it is the single most damaging thing this skill can do.

   d. **Apply per-project skill notes** (see **Per-project skill notes** in the plans-cc `CLAUDE.md`). `des-build` has no project-root discovery of its own, so anchor this read here at Step 1: if a `.plans/` directory is reachable from the current working directory (walk up to the nearest ancestor holding `.plans/config.json`), read `.plans/SKILL_NOTES.md` when it exists and apply the `## all` section plus this skill's own `## des-build` section. **If `.plans/` is unreachable, or the file is missing or empty, do nothing and print nothing** — skip silently (today's behavior, byte-identical). Optional-read + silent-default discipline, exactly like `models` / `worktree_links`.
      - **Priority order: the task file's / caller's own instructions > SKILL_NOTES > this skill's defaults.** A note may add steps or change a default; it **can never turn off** the preflight gate above (a. and b.) or any hard-failure rule — an unreachable Figma MCP or unreadable `design-system/` still ABORTS regardless of any note.
      - When notes were applied, print exactly one line: `Skill notes: applied <n> note(s) from .plans/SKILL_NOTES.md`. Print nothing otherwise.

2. **Read the design system (the defining instruction)**
   - Before writing ANY code, READ:
     - `design-system/tokens.md`
     - `design-system/components.md`
     - `design-system/composition.md`
     - `design-system/layout-and-responsive.md`
     - `design-system/global-classes.md` if it exists (the named global classes).
     - `design-system/components/<relevant>.md` if it exists.
   - Step 1b already proved these resolve; this step is the substantive read. If any read that succeeded at preflight now returns nothing, treat it as a preflight failure and ABORT rather than continuing with partial inputs.
   - Do NOT fall back to live-Figma *extraction* as the source of truth — the markdown is authoritative for tokens and patterns. Figma is the node-level geometry reference (Step 5), not a replacement for the reviewed system.

3. **Check for global-CSS drift (flag only — never sync)**
   - The global blocks (`@theme` tokens, `@layer components` / `@utility` classes) must be *applied* to the live Tailwind layer by `/des-sync` for the semantic tokens and named classes this build emits to actually resolve.
   - Locate the live Tailwind entry (e.g. `app/globals.css`) and check whether it contains current managed blocks between the sentinel markers `/* des-sync:theme start|end */` and `/* des-sync:components start|end */` that match the markdown sources (`tokens.md`'s `@theme` block and `global-classes.md`'s class block).
   - If either managed block is **missing or stale** (markers absent, or content drifted from the markdown source), **FLAG it** and tell the user to run `/des-sync` before relying on the build. `des-build` NEVER syncs itself — it only flags and points to `/des-sync`.
   - Proceed with the build regardless, but surface the drift flag prominently so the user knows the render may rely on unsynced tokens/classes.

4. **Use ONLY what the system defines**
   - Reference semantic tokens (e.g. `text-brand-primary`), never raw hex or arbitrary px — unless the system explicitly allows an arbitrary value.
   - Prefer the **named global classes** from `global-classes.md` for the structural chrome they cover (e.g. `class="site-header"`) alongside inline semantic-token utilities — use the global class where the system defines one, and inline utilities for everything else. These named classes resolve only once `/des-sync` has applied them to the live layer (see the Step 3 drift check).
   - If the design calls for something not in the system, STOP and propose adding it to the system (escalate the one-off) rather than hardcoding it. The system stays the source of truth.

5. **Gather the per-component input**
   - Use the desktop frame AND the mobile frame; note the structural differences between them.
   - Pull the specific node via MCP: `mcp__figma-dev-mode-mcp-server__get_screenshot`, `get_metadata`, `get_design_context`. This is **not** conditional — Step 1a already established the connection is live. If a node fetch fails here, ABORT as in Step 1a rather than building from the markdown alone.
   - The markdown spec is a **summary, not the design**: a components.md zone table names the parts but rarely carries the column split, the exact measure, the group arrangement, or the per-breakpoint reordering. Those come from the node. Never treat a correctly-read spec as sufficient on its own.

6. **Build (Next.js + Tailwind)**
   - Follow the existing project's component/file conventions.
   - Apply the responsive rules from `layout-and-responsive.md`.
   - If desktop↔mobile differ NON-LINEARLY and it is not already resolved in the system, SHOW your interpretation + breakpoint plan BEFORE building — use AskUserQuestion to confirm. **Autonomous exception:** when the invocation prompt signals a non-interactive/autonomous context (e.g. driven by `/plan-execute` under yolo/worktree mode), do NOT pause — pick the most faithful interpretation, record it as a noted assumption in your output, and continue building so the choice surfaces at review instead of blocking.
   - If you discover a recurring pattern not yet captured in the system, note it for folding back in.

7. **Close the feedback loop**
   - After building, list which tokens/patterns were used and anything that should be added to the design system.
   - This is the loop that converges the system over time — surface every gap and one-off you hit.
   - **Styleguide staleness flag (flag only — never build the page).** Read `design-system/config.md`; if it declares a `styleguide:` flag, the project has opted into a styleguide page. After a build, **FLAG** that the newly built component is not yet reflected in the styleguide and tell the user to run `/des-styleguide` to regenerate it. `des-build` NEVER creates or modifies the styleguide page itself — same flag-only discipline as the Step 3 global-CSS drift check (which flags but never syncs). If `config.md` is absent or has no `styleguide:` key, emit nothing.

8. **`verify` mode — two modes, chosen by whether a URL was given**

   `verify` runs when invoked with `verify` (or optionally right after a build). Which mode runs is decided by `verify_url` (parsed in Arguments):

   - **`verify_url` is set → WITH-URL mode: a *measured* browser comparison.** This is the only mode that reads the *rendered* page.
   - **`verify_url` is null → NO-URL mode: a *code-only* check.** It inspects the emitted Tailwind classes/tokens, never a page. **It MUST report itself as a code-only check and MUST NEVER report "verified".**

   Both modes still **verify the root font-size against the contract FIRST** (from `tokens.md`; assume root 16px unless `tokens.md` says otherwise). The px↔rem mapping is only valid while it holds. In WITH-URL mode read the real `html` font-size from the page (Step 8a); in NO-URL mode take it from `tokens.md` and say so.

   **8a. WITH-URL mode (`/des-build <X> verify <url>`) — measure the rendered page.**
   - Use the Playwright MCP tools. For each Figma frame the component targets (desktop, mobile, and any variant states — grid/list, open/closed, etc.):
     1. `mcp__playwright__browser_navigate` to `<url>`, then `mcp__playwright__browser_wait_for` until the page/content is present.
     2. `mcp__playwright__browser_resize` to that frame's width (from the Figma frame).
     3. Set up the same state the Figma variant shows (click toggles, open menus, type into search, etc.).
     4. Take the Figma screenshot (`mcp__figma-dev-mode-mcp-server__get_screenshot`) and read the node's properties (`get_design_context`). Take the page screenshot (`mcp__playwright__browser_take_screenshot`) / snapshot (`mcp__playwright__browser_snapshot`).
     5. **Measure the page, not the code.** Use `mcp__playwright__browser_evaluate` to read `getComputedStyle` and `getBoundingClientRect` for the key elements — headings/body text (font-size, line-height, letter-spacing, weight), containers/grids (widths, column count, gaps, padding), repeated items (card size, spacing). Check the `html` font-size against the design system first.
     6. Compare the measured px to the Figma px. For each discrepancy report the **property**, the Figma **px**, the rendered **px**, and the **fix**.
     7. **Judge the two screenshots side by side** for *structure*: missing/extra elements, wrong order or alignment, different content in a slot, wrong glyphs or icons. **Do NOT compute an automatic pixel-diff score** — font rendering and sample content make it noisy.
   - **This mode is the real verification.** Its marker is `🔵 VERIFIED` (Step 9).

   **8b. NO-URL mode (`/des-build <X> verify`) — code-only checklist (NEVER "verified").**
   - Run today's code-derived DevTools-style checklist: for each discrepancy report the **property**, the Figma **px**, the rendered **px** (resolve rem → px at the contract root size *as authored in the classes*, since no page is rendered), and the **fix**. Focus on **type size, line-height, and spacing**.
   - **The "rem trap":** a computed px that is NOT a clean multiple of the base unit is usually a stray arbitrary value — flag it against `composition.md`.
   - **GUARD — a code-only check is NOT a visual verification.** With no URL nothing renders a page, so these px values are *read out of the emitted classes*, not measured from the browser. **You MUST state plainly, at the top of the output, `Code-only check — no page render. Values read from emitted classes, not measured. This is NOT a visual verification.`** and **you MUST NOT emit a `🔵 VERIFIED` marker** — use the `🔵 CODE-ONLY CHECK` marker (Step 9). To actually verify the render, re-run with a URL: `/des-build <X> verify <url>`.

   **Guard rules (both modes):**
   - **If the Figma MCP OR the Playwright MCP is unavailable, say so LOUDLY and NEVER report "passed".** In WITH-URL mode a missing Playwright MCP means the page cannot be measured — abort the measured comparison, print the unavailability plainly, and do NOT silently fall back to the code-only checklist and call it verified. In either mode a missing Figma MCP means there is nothing to compare against — same discipline as the Step 1 preflight.
   - **If the dev server won't respond or the review page does not return 200, that is a FAILED stage — report it and STOP; do NOT fall back to comparing code.** A code comparison dressed up as a page comparison is exactly the silent degradation this skill exists to prevent.
   - **Differences under 1px attributable to sub-pixel rounding do NOT count** — ignore them.
   - **When running unattended (invoked by `/plan-execute` under yolo/worktree mode), do NOT stop to ask.** Fix what is clearly wrong and list every remaining difference in the comparison table so it surfaces at review.

9. **End-of-action marker**
   - In build mode, final line: `🟢 BUILT · <Component> → Next: /des-build <Component> verify <url>`
   - In verify **WITH-URL** mode (measured browser comparison), final line: `🔵 VERIFIED · <Component>`
   - In verify **NO-URL** mode (code-only check), final line: `🔵 CODE-ONLY CHECK · <Component> → Next: /des-build <Component> verify <url>` — never `🔵 VERIFIED` (a code-only check is not a verification).
   - **When an orchestrator invokes this skill** (e.g. `/plan-execute` routing a `**Build:**` task), the marker above — `🟢 BUILT`, `🔵 VERIFIED`, or `🔵 CODE-ONLY CHECK`, including its `→ Next:` tail — signals only that this component's build or verify finished. It is NOT a task terminal: the caller still owns the task-level commit, status, and summary, and must continue its own finish handling (`/plan-execute` Step 11.5). For a standalone `/des-build`, the marker is unchanged.

## Reference: human-side DevTools verify workflow

When a human verifies a render against the Figma frame in browser DevTools:

- **Computed pane vs Styles pane.** The Styles pane shows authored values (often in rem / Tailwind classes); the **Computed** pane shows the resolved px the browser actually painted. Compare the Computed px to the Figma px — that is the apples-to-apples comparison.
- **Root-size check first.** Confirm `:root` / `html` `font-size` is the contract value (16px by default). Every rem→px assumption below depends on it; a wrong root silently scales the whole system.
- **The rem trap.** If a Computed px is not a clean multiple of the base unit, it is usually a stray arbitrary value rather than a token — trace it back to `composition.md`.
- Walk type size → line-height → spacing in that order; ignore sub-pixel differences under 1px.

## Edge Cases

- **Figma MCP unauthorized / unreachable**: **ABORT at Step 1a.** Never build from the markdown alone, never build from the task description, and never defer the problem to review. Emit the `🔴 BLOCKED` message naming the exact error. This holds under autonomous (`yolo`/worktree) execution too — the autonomous exception in Step 6 covers ambiguous *reflow*, never missing *inputs*.
- **`design-system/` missing or unreadable**: **ABORT at Step 1b.** Two distinct causes, and the message must distinguish them: (a) *in a git worktree* — `design-system/` is gitignored and was never carried across, so add `design-system` to `worktree_links` in `.plans/config.json` (or symlink it manually); (b) *no design system exists yet* — run `/des-author` first. Do NOT extract from live Figma here, and do NOT build a generic component from the name.
- **Both inputs missing**: the worst case and the one that reports as success — the build compiles, lints, renders HTTP 200, and is structurally wrong. A green typecheck verifies the *code*, never the *fidelity*. ABORT.
- **Tempted to cite a file you did not observably read**: never. A fabricated source citation (e.g. claiming `components.md § Footer` was read when the directory was absent) converts a silent failure into a *reported success* and is the single most damaging output of this skill. If preflight evidence is not in the transcript, the check failed.
- **Global blocks missing/stale in the live Tailwind layer**: the live entry lacks current `des-sync:theme` / `des-sync:components` marker blocks matching the markdown — FLAG it and tell the user to run `/des-sync`. `des-build` never syncs; it builds and surfaces the drift.
- **Token / value not in the system**: escalate — propose adding it to the system, don't hardcode it.
- **Non-linear desktop↔mobile reflow unresolved**: confirm your interpretation + breakpoint plan (AskUserQuestion) before building. In an autonomous/non-interactive context (signalled by the invocation prompt, e.g. when `/plan-execute` invokes this under yolo/worktree mode), do NOT pause — choose the most faithful interpretation, record it as a noted assumption, and continue so it surfaces at review.
- **`verify` with no build present**: build the component first, or compare the existing render if one already exists.
- **`verify` with no URL**: this is a **code-only check**, not a visual verification. It reads px out of the emitted classes (no page is rendered), MUST say so plainly at the top of its output, and MUST end with the `🔵 CODE-ONLY CHECK` marker — never `🔵 VERIFIED`. To measure the real render, re-run with a URL.
- **`verify <url>` but Playwright MCP unavailable**: the page cannot be measured. Say so LOUDLY, do NOT report "passed", and do NOT silently fall back to the code-only checklist and call it verified. Reconnect Playwright MCP, then rerun.
- **`verify <url>` but dev server / review page does not return 200**: FAILED stage — report it and STOP. Do NOT fall back to comparing code; a code comparison presented as a page comparison is the silent degradation this skill prevents.
- **Sub-pixel rounding under 1px**: ignore — not a real discrepancy.
- **Unattended verify (invoked by `/plan-execute` under yolo/worktree)**: do NOT stop to ask; fix what is clearly wrong and list the rest in the comparison table so it surfaces at review.
- **Recurring pattern discovered mid-build**: build with it, but note it for folding back into `composition.md` / `components.md`.
- **`styleguide:` flag set in `design-system/config.md`**: after a build, FLAG that the new component is not yet reflected in the styleguide and point the user to `/des-styleguide`. `des-build` only flags; it NEVER creates or edits the styleguide page (same flag-only discipline as the Step 3 drift check). If `config.md` is absent or has no `styleguide:` key, emit nothing.
