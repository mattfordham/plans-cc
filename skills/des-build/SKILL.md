---
name: des-build
disable-model-invocation: false
argument-hint: "<component or section name> [verify]"
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
description: Build a Next.js + Tailwind component by reading design-system/ first; use only its tokens/patterns, and optionally self-verify the render against the Figma frame
---

# des-build

Build a Next.js + Tailwind component (or page section) by reading the reviewed `design-system/` markdown FIRST and using only its tokens and patterns. This is Phase 2 of the `des-*` family, with the Phase 3 self-verify checklist folded in via `verify` mode.

## Arguments

- `$ARGUMENTS`: `<component or section name>` to build, with an optional trailing `verify` keyword.
  - `/des-build Hero` — build the Hero component.
  - `/des-build Hero verify` — build, then run the self-verify checklist against the Figma frame.
  - `/des-build Hero` invoked when `Hero` already exists, with `verify` — verify the existing render without rebuilding.

## Steps

1. **Read the design system FIRST (the defining instruction)**
   - Before writing ANY code, READ:
     - `design-system/tokens.md`
     - `design-system/components.md`
     - `design-system/composition.md`
     - `design-system/layout-and-responsive.md`
     - `design-system/components/<relevant>.md` if it exists.
   - If `design-system/` is missing, tell the user to run `/des-author` first. Do NOT fall back to live Figma extraction — that is the opposite philosophy and a different skill family.

2. **Use ONLY what the system defines**
   - Reference semantic tokens (e.g. `text-brand-primary`), never raw hex or arbitrary px — unless the system explicitly allows an arbitrary value.
   - If the design calls for something not in the system, STOP and propose adding it to the system (escalate the one-off) rather than hardcoding it. The system stays the source of truth.

3. **Gather the per-component input**
   - Use the desktop frame AND the mobile frame; note the structural differences between them.
   - Pull the specific node via MCP when available: `mcp__figma-dev-mode-mcp-server__get_screenshot`, `get_metadata`, `get_design_context`.

4. **Build (Next.js + Tailwind)**
   - Follow the existing project's component/file conventions.
   - Apply the responsive rules from `layout-and-responsive.md`.
   - If desktop↔mobile differ NON-LINEARLY and it is not already resolved in the system, SHOW your interpretation + breakpoint plan BEFORE building — use AskUserQuestion to confirm.
   - If you discover a recurring pattern not yet captured in the system, note it for folding back in.

5. **Close the feedback loop**
   - After building, list which tokens/patterns were used and anything that should be added to the design system.
   - This is the loop that converges the system over time — surface every gap and one-off you hit.

6. **`verify` mode (Phase 3 self-verify)**
   - Run when invoked with `verify` (or optionally right after a build). Compare the build against the Figma frame using the DevTools-style checklist below.
   - **Verify the root font-size matches the contract FIRST** (from `tokens.md`; assume root 16px unless `tokens.md` says otherwise). The px↔rem mapping is only valid while it holds.
   - For each discrepancy, report:
     - the **property**,
     - the Figma **px** value,
     - the rendered **px** value (resolve rem → px at the contract root size),
     - the **fix**.
   - Focus on **type size, line-height, and spacing**.
   - **The "rem trap":** a computed px that is NOT a clean multiple of the base unit is usually a stray arbitrary value — flag it against `composition.md`.
   - IGNORE sub-pixel rounding under 1px.

7. **End-of-action marker**
   - In build mode, final line: `🟢 BUILT · <Component> → Next: /des-build <Component> verify`
   - In verify mode, final line: `🔵 VERIFIED · <Component>`

## Reference: human-side DevTools verify workflow

When a human verifies a render against the Figma frame in browser DevTools:

- **Computed pane vs Styles pane.** The Styles pane shows authored values (often in rem / Tailwind classes); the **Computed** pane shows the resolved px the browser actually painted. Compare the Computed px to the Figma px — that is the apples-to-apples comparison.
- **Root-size check first.** Confirm `:root` / `html` `font-size` is the contract value (16px by default). Every rem→px assumption below depends on it; a wrong root silently scales the whole system.
- **The rem trap.** If a Computed px is not a clean multiple of the base unit, it is usually a stray arbitrary value rather than a token — trace it back to `composition.md`.
- Walk type size → line-height → spacing in that order; ignore sub-pixel differences under 1px.

## Edge Cases

- **`design-system/` missing**: instruct the user to run `/des-author` first. Do NOT extract from live Figma here.
- **Token / value not in the system**: escalate — propose adding it to the system, don't hardcode it.
- **Non-linear desktop↔mobile reflow unresolved**: confirm your interpretation + breakpoint plan (AskUserQuestion) before building.
- **`verify` with no build present**: build the component first, or compare the existing render if one already exists.
- **Recurring pattern discovered mid-build**: build with it, but note it for folding back into `composition.md` / `components.md`.
