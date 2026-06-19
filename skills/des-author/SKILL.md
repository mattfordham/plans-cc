---
name: des-author
disable-model-invocation: false
argument-hint: "[scope or 'refresh']"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
  - mcp__figma-dev-mode-mcp-server__get_design_context
  - mcp__figma-dev-mode-mcp-server__get_metadata
  - mcp__figma-dev-mode-mcp-server__get_variable_defs
  - mcp__figma-dev-mode-mcp-server__get_screenshot
description: Author/refine the reviewed design-system/ markdown (tokens, components, composition, layout) from a connected Figma file — the build-time source of truth
---

# des-author

Author (or refine) the reviewed markdown that lives in `design-system/` by reading a connected Figma file. This is Phase 1 of the `des-*` family.

**The defining principle:** the reviewed markdown in `design-system/` is the build-time source of truth — NOT live Figma. Figma is the *input to authoring* the system, not a runtime dependency. The output of this skill is reviewed markdown, NOT component code. After authoring, STOP and wait for human review before any code is generated (that happens later with `/des-build`).

Run this once per new project, or whenever the design system materially changes.

## Arguments

- `$ARGUMENTS`: Optional. A scope hint (e.g. a section name to focus on) or the keyword `refresh`.
  - No argument: author the full system, refining any existing files in place. This runs the **full interactive experience** — the Step 2 survey plus all five per-area checkpoints (one before each authoring step).
  - `refresh`: re-derive the system from Figma from scratch (still preserving human-added notes where sensible).
  - A scope phrase: focus authoring on that slice (e.g. "tokens", "the marketing pages").
  - **Loop length.** A scope phrase or `refresh` **shortens the upfront loop**: collapse the Step 2 survey and the five per-area checkpoints into a **single quick classify-confirm gate** up front, then author without pausing at every area. Bare no-arg gets the full per-area walk.

## Steps

1. **Confirm the Figma input source (MCP-first)**
   - Prefer the Figma Dev Mode MCP. Pull from `mcp__figma-dev-mode-mcp-server__*`:
     - `get_variable_defs` — colors and type variables.
     - `get_metadata` + `get_design_context` — structure of frames and layers.
     - `get_screenshot` — full-frame "big picture" captures (desktop **and** mobile of the key frames).
   - If the MCP is not connected, tell the user to connect the Figma Dev Mode MCP, OR to supply exported variable JSON plus full-frame screenshots. Then proceed with whatever input is available — do not block.
   - Always favor full-frame screenshots for the "big picture" that raw token extraction loses. Extraction gives you values; screenshots give you the system.

2. **Survey & hypothesize (style-guide vs. page frames)**
   - Before authoring anything, get the lay of the land. Pull big-picture `get_screenshot` captures plus `get_metadata` of the connected Figma file to see every frame at once.
   - Form a broad hypothesis that **classifies the frames into two buckets**: explicit *style-guide* frames (swatches, type ramps, component sheets) vs. actual *page* frames (real screens that use the system).
   - Note explicitly that the design *system* — and **especially composition** — is rarely drawn in one place. It is **inferred across the page frames** (the relationships between real elements on real screens) far more than it is explicitly defined on a style-guide frame. Treat page frames as the primary evidence for the system, with style-guide frames as corroboration.
   - State the broad hypothesis: what kind of system this looks like (density, type voice, color strategy, layout philosophy) and which frames you'll lean on for which areas.
   - Present this classification + broad hypothesis to the user via `AskUserQuestion` for validation or correction BEFORE any authoring begins. Fold the user's answer into how you author every file below.
   - **Loop length.** On a bare no-arg invocation this survey is followed by the full per-area checkpoint walk (a checkpoint before each of Steps 4–8). With a scope phrase or `refresh`, collapse this survey *and* those per-area checkpoints into a single quick classify-confirm gate here, then author the in-scope file(s) without pausing at every area.

3. **Create / locate the directory layout**
   - Create or update files under `design-system/`:
     ```
     design-system/
       tokens.md
       components.md
       composition.md
       global-classes.md      # global @layer components / @utility classes (synced live by /des-sync)
       layout-and-responsive.md
       components/            # per-component detail as the system grows
     ```
   - If `design-system/` already exists, refine in place. If invoked with `refresh`, re-derive from Figma.

4. **Author `tokens.md`**
   - **Checkpoint first.** Restate the slice of the broad hypothesis (Step 2) that bears on tokens — the apparent color strategy, type voice, and base spacing unit — and confirm it (or let the user adjust) via `AskUserQuestion` BEFORE writing the file.
   - **UNIT CONVENTION block at the very top.** Designers/Figma express sizes in px; Tailwind uses rem. Annotate every size with BOTH, e.g. `space-4 = 1rem (16px)`.
   - **ROOT FONT-SIZE CONTRACT.** Default is 16px. The px↔rem mapping is only valid while this holds — state it explicitly so downstream builds and verification can rely on it.
   - **Colors** → semantic Tailwind token names + literal hex + a ready-to-paste `@theme` block.
   - **Type scale** → family, size (px+rem), line-height, weight, letter-spacing, and any responsive shifts.
   - **Spacing / radii / shadows** → capture the rhythm actually in use; call out the base unit in px+rem.

5. **Author `components.md`**
   - **Checkpoint first.** Restate the slice of the broad hypothesis (Step 2) about which recurring elements make up the system and the page frames you'll infer them from, then confirm it (or let the user adjust) via `AskUserQuestion` BEFORE writing the file.
   - For each recurring element: its variants, its states (hover/focus/disabled/active), and how padding/size scale.
   - This is JUDGMENT, not extraction — infer the *system* behind the instances rather than transcribing one-offs.
   - Individual elements only. How elements combine belongs in `composition.md`, not here.

6. **Author `composition.md` (spend real care)**
   - **Checkpoint first.** Restate the slice of the broad hypothesis (Step 2) about the system's grammar — the composition you inferred *across the page frames* and which frames evidence it — and confirm it (or let the user adjust) via `AskUserQuestion` BEFORE writing the file.
   - **Ground each inferred rule in real frames (auto-pick, then ask).** Composition is inferred *across* page frames, so when resolving an inferred rule, (a) **auto-select representative page frames from `get_metadata`** — pick the ones that best evidence the relationship and inspect them (`get_design_context` / `get_screenshot`) to confirm the inference; (b) when your own auto-pick is insufficient or ambiguous, **fall back to asking the user** via `AskUserQuestion` to supply or select specific Figma frame/node references; (c) anything still unresolved after that flows to the `## Needs confirmation` section below — never guess it into a rule.
   - This is the grammar of the system. Every rule must be a CONDITIONAL that resolves to concrete Tailwind classes: "When [element] [relationship] [other], apply [classes]."
   - Anything that can't be resolved to concrete classes moves to a `## Needs confirmation` section — never guess it into a rule.
   - Organize BY RELATIONSHIP TYPE, covering:
     - (a) **Vertical rhythm** — highest priority. Every common adjacency with its base unit.
     - (b) **Nesting & containment** — page max-width / gutter; do NOT re-apply the gutter on nested containers; illegal nestings.
     - (c) **Density regimes** — and which routes use which.
     - (d) **Type composition.**
     - (e) **Surface & elevation strategy** — pick ONE primary separation method.
     - (f) **Interactive / state composition** — flag under "Needs confirmation" if absent from static frames.
     - (g) **Responsive composition deltas** — capture only the delta from the base.

7. **Author `global-classes.md` (be conservative — promote sparingly)**
   - **Checkpoint first.** Restate the slice of the broad hypothesis (Step 2) about which recurring *structural* elements (header, footer, page-shell, card chrome) repeat across page frames, and confirm the promotion candidates (or let the user adjust) via `AskUserQuestion` BEFORE writing the file.
   - Author a global **`@layer components` / `@utility` block** of reusable named classes (e.g. a responsive `.site-header`). This is a deliberate philosophy extension: the system gains *named* global classes alongside inline utilities — but it stays markdown-only here (still "ready-to-paste", still stops for review, generates no code). The block is applied to the live Tailwind layer later by `/des-sync`, not here.
   - **Promotion rule (conservative by design).** Promote ONLY cross-page recurring **structural** elements — header, footer, page-shell, card chrome — to named global classes. One-off adjacencies and vertical-rhythm rules stay INLINE in `composition.md` and are emitted as utilities by `/des-build`. Do not globalize against utility-first: when in doubt, leave it inline.
   - **Flag candidates for human confirmation.** List each class you are proposing to promote with the page frames that evidence its recurrence, and confirm via `AskUserQuestion` rather than promoting silently. Anything the user does not confirm stays inline in `composition.md`.
   - Each class resolves to concrete Tailwind classes / declarations, consistent with the tokens in `tokens.md`. If the system warrants no global classes yet, write the file noting that explicitly (valid state) — `/des-sync` will then sync only the `@theme` block.

8. **Author `layout-and-responsive.md` (spend the MOST care)**
   - **Checkpoint first.** Restate the slice of the broad hypothesis (Step 2) about the layout and responsive philosophy — mobile-first vs. desktop-first, the desktop/mobile frame pairs you'll compare — and confirm it (or let the user adjust) via `AskUserQuestion` BEFORE writing the file.
   - State an explicit **responsive philosophy**: mobile-first? container max-widths, grid collapse (3→1 vs 3→2), nav behavior, breakpoint values.
   - Compare each desktop frame to its mobile counterpart:
     - For **LINEAR** reflow — state the reflow rules directly.
     - For **NON-LINEAR** reflow (reorder / hide / re-nest / restructure) — DO NOT guess. List each under a `## Needs confirmation` heading with your best interpretation plus the specific ambiguity.

9. **Summarize and STOP for review**
   - After writing all files, summarize what you are confident about vs. the open "Needs confirmation" items across every file.
   - WAIT for the user's review before any components are generated. Do not proceed to building.

10. **End-of-action marker**
   - Output as the final line: `🟢 AUTHORED · design-system/ → Next: /des-sync` (then `/des-build <component>` once the global blocks are applied to the live Tailwind layer).

## Edge Cases

- **Figma MCP not connected**: instruct the user to connect the Figma Dev Mode MCP or supply exported variable JSON + full-frame screenshots, then proceed with whatever is available.
- **`design-system/` already exists**: refine in place. The `refresh` scope re-derives the system from Figma.
- **User's Step 2 validation contradicts the hypothesis**: adjust to the user's read and re-survey on that basis — do NOT author any file on a hypothesis the user rejected.
- **Scope phrase or `refresh` invocation**: collapse the Step 2 survey and the five per-area checkpoints into a single quick classify-confirm gate up front, then author without pausing at every area (bare no-arg keeps the full per-area walk).
- **Auto-picked composition frames insufficient**: when auto-selecting representative page frames (Step 6) can't ground an inferred rule, ask the user via `AskUserQuestion` for specific frame/node references; whatever stays unresolved goes to `## Needs confirmation` rather than being guessed.
- **Non-linear reflow ambiguity**: it goes under "Needs confirmation" with your best interpretation and the specific open question — never guess it into a concrete rule.
- **Missing mobile (or desktop) frame**: note the gap under "Needs confirmation"; do not invent the responsive behavior.
- **Sparse Figma variables**: capture what exists, infer the base unit/rhythm from screenshots, and flag low-confidence inferences for review.
- **Global-class promotion uncertain**: be conservative — promote ONLY cross-page recurring *structural* elements (header/footer/page-shell/card chrome) to `global-classes.md`, flag each candidate for human confirmation, and leave one-off adjacencies / vertical rhythm inline in `composition.md`. If the system warrants no global classes yet, say so in `global-classes.md` (a valid state — `/des-sync` then syncs only `@theme`).
