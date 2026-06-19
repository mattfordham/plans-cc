---
name: des-styleguide
disable-model-invocation: false
argument-hint: "[live page path]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
description: Generate (on demand) a styleguide page from the reviewed design-system/ markdown — every token swatch, global class, and built component rendered as one human-openable page
---

# des-styleguide

Generate — **on demand** — a single human-openable styleguide page that renders the whole design system at once: every token swatch, every named global class, and every built component, all resolving against the live Tailwind layer. This is the human-facing counterpart to what `/des-sync` does silently, and the visual-proof step of the `des-*` family: `/des-author` (markdown) → `/des-sync` (live CSS) → `/des-build` (components) → **`/des-styleguide`** (see it all render).

**The defining principle:** the reviewed markdown in `design-system/` stays the source of truth — this skill only *renders* what was already authored. The styleguide page is a **generated / derived artifact, never hand-edited**: re-running this skill regenerates it from the markdown, exactly the same philosophy as the rest of the family (`/des-author` owns the markdown, `/des-sync` owns the managed CSS blocks, this skill owns the styleguide page). It authors no new system content; if something is missing from the markdown, that is a `/des-author` job, not a styleguide job.

This skill is **opt-in**. A project declares it wants a styleguide via the `styleguide:` config flag (see below). If the flag is absent, this skill — and the styleguide-aware reminders in `/des-sync` and `/des-build` — silently no-op. No page is ever generated unasked.

Run this after `/des-sync` to confirm the synced system renders end-to-end, and again whenever tokens, global classes, or built components change.

## The `styleguide:` opt-in config flag

The opt-in lives in a dedicated **`design-system/config.md`** file (NOT in `tokens.md` front-matter — `tokens.md` has its own structured purpose and no front-matter). `config.md` holds a single fenced `yaml` block with a `styleguide:` key whose value is the path (relative to the project root) of the page to generate:

````markdown
# design-system config

Cross-skill settings for the `des-*` family. Read identically by `/des-author`,
`/des-sync`, `/des-build`, and `/des-styleguide`.

```yaml
styleguide: app/styleguide/page.tsx
```
````

- **Key:** `styleguide`. **Value:** the project-root-relative path to the styleguide page to generate (e.g. `app/styleguide/page.tsx`, `src/app/styleguide/page.tsx`).
- **Presence = opt-in.** If `config.md` is missing, or it exists but has no `styleguide:` key, the project has NOT opted in. Every styleguide-aware behavior across the family no-ops.
- All four `des-*` skills read this flag the same way (from `design-system/config.md`'s yaml block), so the convention is shared and unambiguous.

## Arguments

- `$ARGUMENTS`: Optional. A live page path to generate the styleguide at. If omitted, the target path is taken from the `styleguide:` config flag (see Step 4). An explicit argument overrides the flag's path for this run.

## Steps

1. **Read the design system FIRST (the source of truth)**
   - Before generating ANY page, READ the reviewed markdown:
     - `design-system/tokens.md` — the `@theme` token block (colors, type scale, spacing/radii/shadows).
     - `design-system/global-classes.md` — the named global `@layer components` / `@utility` classes, if present.
     - `design-system/components.md` — the documented recurring elements.
     - `design-system/composition.md` — the grammar of the system.
   - These are the *only* source for what the styleguide renders. Do NOT invent tokens, classes, or components that the markdown does not define.

2. **If `design-system/` is missing → point to `/des-author` and STOP**
   - If `design-system/` does not exist, tell the user to run `/des-author` first, then STOP. Do NOT author or invent any system content here — that is `/des-author`'s job. (Mirrors `/des-sync` and `/des-build`.)

3. **Read the `styleguide:` opt-in flag — if absent, NO-OP silently**
   - Read `design-system/config.md` and parse its yaml block for the `styleguide:` key (see "The `styleguide:` opt-in config flag" above).
   - If `config.md` is missing, or has no `styleguide:` key, the project has **not opted in**: do NOT generate a page unasked. Tell the user how to opt in — create `design-system/config.md` with a `styleguide: <path>` line (e.g. `styleguide: app/styleguide/page.tsx`) — and STOP. This is a clean no-op, not an error.

4. **Locate the target page path**
   - If `$ARGUMENTS` supplied an explicit path, use it (it overrides the flag for this run).
   - Otherwise use the path from the `styleguide:` flag read in Step 3.
   - Resolve the path relative to the project root. Note whether the page already exists (it affects the generation-safety handling in the next step).

5. **Generate the four page sections**
   - The page renders the whole system at once, in four labelled sections, top to bottom. Every section draws *only* from the markdown read in Step 1 — render exactly what the system defines, nothing more. All sample copy must read as **realistic-but-obviously-placeholder dummy content** (e.g. "Heading sample — The quick brown fox", "Lorem ipsum body copy", "Button label", "card.title placeholder"), so the page reads as a reference sheet and is never mistaken for real product copy.

   **(1) Token swatches** — the visual payoff: every `@theme` token from `tokens.md` rendered as a visual sample so you can *see* that the synced tokens resolve.
     - **Colors** — one chip per semantic color token, each labelled with its semantic name AND its hex value (e.g. `brand-primary` / `#1A56DB`). Drive the chip's background from the semantic token utility (`bg-brand-primary`), not a hardcoded hex, so the chip proves the token actually resolves in the live layer.
     - **Type scale** — a ramp: each size in the scale rendered as a line of placeholder text at that size, shown with its actual line-height and weight, labelled with the token name plus its px+rem values (e.g. `text-lg — 18px / 1.125rem`).
     - **Spacing scale** — each spacing step rendered as a sized bar/box whose dimension equals the token, labelled with the token name and its px/rem value.
     - **Radii** — a sample box per radius token, labelled.
     - **Shadows** — a sample card/box per shadow token, labelled.
     - If `tokens.md` defines a token category the page doesn't yet handle, render what it can and note the unrendered category rather than dropping it silently.

   **(2) Global-class examples** — one live instance of each named class from `global-classes.md` (e.g. `.site-header`, `.card`, `.page-shell`), each filled with placeholder content and labelled with the class name, so the structural chrome is shown actually resolving against the live layer. If `global-classes.md` is absent or empty, omit this section and note there are no global classes to show (a valid state — mirrors `/des-sync`).

   **(3) Component gallery** — the "all components in one place" view: one rendered instance of each built component from the consuming project, with realistic dummy props/content, each labelled with its component name.
     - **Discovering built components:** enumerate the project's component files following the project's own conventions (e.g. `components/`, `src/components/`, `app/**/components/` — the same locations `/des-build` writes to). Cross-reference against the components documented in `components.md` to label each as documented and/or built.
     - Import and render each discovered component with placeholder props. If a component cannot be safely instantiated (required props you can't infer, or it can't be statically enumerated), render the ones you can and **note the rest in the section** (and surface them in the coverage panel) rather than failing the whole page.

   **(4) Drift / coverage panel** — an at-a-glance status panel near the top of the page. It only **reports/flags**; it never syncs or builds anything.
     - **Sync status (REUSE the existing sentinel check):** report whether the `@theme` tokens and the global classes are currently applied to the live Tailwind layer, using the **same** `des-sync:theme` / `des-sync:components` sentinel-marker check that `/des-build` Step 2 already performs (markers present AND content matching the markdown source = synced; markers absent or content drifted = unsynced/stale). Do NOT invent a new drift mechanism. If a block shows unsynced/stale, flag it and point the user to `/des-sync`.
     - **Component coverage:** list which components are documented in `components.md` vs. actually built in the project (from the Step-3 discovery), so gaps in both directions (documented-but-not-built, built-but-not-documented) are visible at a glance.

6. **Generation safety (derived-artifact markers)**
   - **Mark the page as derived.** Write the marker `{/* des-styleguide:generated */}` (a JSX/TSX comment, since the target is e.g. `app/styleguide/page.tsx`) as the **very first line** of the generated file's JSX/return output, so the file is unambiguously a derived, regenerable artifact owned by this skill — the same "never hand-edited" philosophy as `/des-sync`'s managed blocks and the rest of the family.
   - **Overwrite rules on regeneration** (mirrors `/des-sync`'s caution around markers it does not own):
     - **Target does not exist** → generate it fresh, marker on top.
     - **Target exists AND carries the `des-styleguide:generated` marker** → it's ours; safe to overwrite in place with the freshly regenerated page.
     - **Target exists but LACKS the marker** → it may be a hand-written page. Do NOT clobber it. Use `AskUserQuestion` to confirm before overwriting — offer the choice between overwriting it with the generated styleguide and aborting (or picking a different path). Never silently destroy a file the skill did not author.
   - **Drift panel reuses the existing sentinel check.** The Step 5 part (4) sync status is computed from the **same** `des-sync:theme` / `des-sync:components` sentinel markers that `/des-build` Step 2 checks — this skill does NOT introduce a new drift-detection mechanism, and it only flags (pointing to `/des-sync`), never syncs.

7. **End-of-action marker**
   - On a successful generation, output as the **final line**: `🟢 GENERATED · styleguide page → Next: /des-build <component>`
   - The early-exit paths do NOT emit that marker (consistent with how `/des-sync` and `/des-build` end their early exits) — they emit their own pointer instead:
     - **`design-system/` missing** (Step 2): end with the instruction to run `/des-author` first.
     - **Not opted in** (Step 3, `styleguide:` flag absent): end with the clean "not opted in" message and how to opt in (add `styleguide: <path>` to `design-system/config.md`).
     - **Unmarked target, user declined overwrite** (Step 6): end by reporting the page was left untouched — no "generated" marker, since nothing was generated.

## Edge Cases

- **`design-system/` missing**: instruct the user to run `/des-author` first, then STOP. Do NOT author any system content here.
- **`styleguide:` flag absent** (`config.md` missing or has no `styleguide:` key): NO-OP silently — tell the user how to opt in (add `styleguide: <path>` to `design-system/config.md`) and STOP. Never generate a page unasked.
- **Target page exists WITHOUT the `des-styleguide:generated` marker**: it may be hand-written — do NOT clobber it. Confirm via `AskUserQuestion` before overwriting (mirrors `/des-sync`'s caution around markers it does not own). If the user declines, leave the file untouched and emit no "generated" marker.
- **Target page exists WITH the marker**: it's ours — safe to overwrite in place with the regenerated page (idempotent).
- **Global blocks not yet synced** (live entry lacks current `des-sync:theme` / `des-sync:components` marker blocks matching the markdown): the drift / coverage panel shows them as **unsynced/stale** and points the user to `/des-sync`. The styleguide only flags — it never syncs. Reuses the same sentinel check `/des-build` performs; no new drift mechanism.
- **`global-classes.md` absent or empty**: omit the global-class section and note there are no global classes to show (valid state — mirrors `/des-sync`). Do not invent classes.
- **A built component can't be enumerated or safely instantiated**: render the components that can be, note the rest in the gallery and surface them in the coverage panel — do not fail the whole page over one uninstantiable component.
