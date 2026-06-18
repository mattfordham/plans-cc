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
  - No argument: author the full system, refining any existing files in place.
  - `refresh`: re-derive the system from Figma from scratch (still preserving human-added notes where sensible).
  - A scope phrase: focus authoring on that slice (e.g. "tokens", "the marketing pages").

## Steps

1. **Confirm the Figma input source (MCP-first)**
   - Prefer the Figma Dev Mode MCP. Pull from `mcp__figma-dev-mode-mcp-server__*`:
     - `get_variable_defs` — colors and type variables.
     - `get_metadata` + `get_design_context` — structure of frames and layers.
     - `get_screenshot` — full-frame "big picture" captures (desktop **and** mobile of the key frames).
   - If the MCP is not connected, tell the user to connect the Figma Dev Mode MCP, OR to supply exported variable JSON plus full-frame screenshots. Then proceed with whatever input is available — do not block.
   - Always favor full-frame screenshots for the "big picture" that raw token extraction loses. Extraction gives you values; screenshots give you the system.

2. **Create / locate the directory layout**
   - Create or update files under `design-system/`:
     ```
     design-system/
       tokens.md
       components.md
       composition.md
       layout-and-responsive.md
       components/            # per-component detail as the system grows
     ```
   - If `design-system/` already exists, refine in place. If invoked with `refresh`, re-derive from Figma.

3. **Author `tokens.md`**
   - **UNIT CONVENTION block at the very top.** Designers/Figma express sizes in px; Tailwind uses rem. Annotate every size with BOTH, e.g. `space-4 = 1rem (16px)`.
   - **ROOT FONT-SIZE CONTRACT.** Default is 16px. The px↔rem mapping is only valid while this holds — state it explicitly so downstream builds and verification can rely on it.
   - **Colors** → semantic Tailwind token names + literal hex + a ready-to-paste `@theme` block.
   - **Type scale** → family, size (px+rem), line-height, weight, letter-spacing, and any responsive shifts.
   - **Spacing / radii / shadows** → capture the rhythm actually in use; call out the base unit in px+rem.

4. **Author `components.md`**
   - For each recurring element: its variants, its states (hover/focus/disabled/active), and how padding/size scale.
   - This is JUDGMENT, not extraction — infer the *system* behind the instances rather than transcribing one-offs.
   - Individual elements only. How elements combine belongs in `composition.md`, not here.

5. **Author `composition.md` (spend real care)**
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

6. **Author `layout-and-responsive.md` (spend the MOST care)**
   - State an explicit **responsive philosophy**: mobile-first? container max-widths, grid collapse (3→1 vs 3→2), nav behavior, breakpoint values.
   - Compare each desktop frame to its mobile counterpart:
     - For **LINEAR** reflow — state the reflow rules directly.
     - For **NON-LINEAR** reflow (reorder / hide / re-nest / restructure) — DO NOT guess. List each under a `## Needs confirmation` heading with your best interpretation plus the specific ambiguity.

7. **Summarize and STOP for review**
   - After writing all files, summarize what you are confident about vs. the open "Needs confirmation" items across every file.
   - WAIT for the user's review before any components are generated. Do not proceed to building.

8. **End-of-action marker**
   - Output as the final line: `🟢 AUTHORED · design-system/ → Next: /des-build <component>`

## Edge Cases

- **Figma MCP not connected**: instruct the user to connect the Figma Dev Mode MCP or supply exported variable JSON + full-frame screenshots, then proceed with whatever is available.
- **`design-system/` already exists**: refine in place. The `refresh` scope re-derives the system from Figma.
- **Non-linear reflow ambiguity**: it goes under "Needs confirmation" with your best interpretation and the specific open question — never guess it into a concrete rule.
- **Missing mobile (or desktop) frame**: note the gap under "Needs confirmation"; do not invent the responsive behavior.
- **Sparse Figma variables**: capture what exists, infer the base unit/rhythm from screenshots, and flag low-confidence inferences for review.
