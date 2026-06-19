---
name: des-sync
disable-model-invocation: false
argument-hint: "[live Tailwind entry path]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - AskUserQuestion
description: Apply the global Tailwind blocks from design-system/ (the @theme token block and the @layer components / @utility class block) into the project's live Tailwind layer, idempotently between sentinel markers
---

# des-sync

Apply the **global** Tailwind artifacts authored in `design-system/` into the consuming project's live Tailwind layer (e.g. `app/globals.css`). This is the apply step that closes the `des-*` loop: `/des-author` (markdown) → **`/des-sync`** (live CSS) → `/des-build` (uses it).

**The defining principle:** the reviewed markdown in `design-system/` stays the source of truth — this skill only *applies* what was already authored and reviewed. It writes two managed blocks into the live Tailwind file between stable sentinel comment markers, replacing them in place on every re-run so the sync is **idempotent** (never duplicates) and **never touches hand-written CSS**. It authors nothing new; if a block is missing from the markdown, that is a `/des-author` job, not a sync job.

Run this after authoring/refining the design system, and again whenever the `@theme` token block or the global classes change.

## Arguments

- `$ARGUMENTS`: Optional. The path to the live Tailwind entry file (e.g. `app/globals.css`). If omitted, this skill locates it (see Step 2) and asks only when ambiguous.

## Steps

1. **Read the two global blocks from `design-system/` (the source of truth)**
   - Read the **`@theme` token block** from `design-system/tokens.md`.
   - Read the **`@layer components` / `@utility` class block** from `design-system/global-classes.md`.
   - If `design-system/` is missing, tell the user to run `/des-author` first and STOP. Do NOT author or invent either block here — that is `/des-author`'s job.
   - If `design-system/` exists but `global-classes.md` is absent or has no class block, sync only the `@theme` block and note that there are no global classes to sync (it is valid for a system to define tokens but no named global classes yet).

2. **Locate the project's live Tailwind entry**
   - Search the project for the live Tailwind layer: `@import "tailwindcss"`, an existing `@theme` block, or a conventional `app/globals.css` / `src/app/globals.css` / `styles/globals.css` (Tailwind v4 puts `@theme` in CSS, not necessarily `tailwind.config.js` — prefer the CSS entry).
   - If `$ARGUMENTS` named a path, use it.
   - If exactly one plausible entry is found, use it. If multiple (or none) are found, ask the user via `AskUserQuestion` which file is the live Tailwind entry (offer the candidates) — do not guess.

3. **Write each block between its sentinel markers (idempotent)**
   - Each managed block is wrapped in stable sentinel comments so re-runs replace in place rather than appending duplicates:
     - `@theme` token block → between `/* des-sync:theme start */` and `/* des-sync:theme end */`
     - `@layer components` / `@utility` class block → between `/* des-sync:components start */` and `/* des-sync:components end */`
   - For each block:
     - If both its start and end markers already exist, **replace everything between them** with the current block from the markdown — leave the markers themselves and all surrounding CSS untouched.
     - If the markers are absent, **append** the marked block (markers + content) to the end of the file.
   - **Never touch hand-written CSS.** Only the content strictly between a pair of `des-sync:*` markers is ever rewritten; everything outside the marker pairs is preserved byte-for-byte.
   - Preserve `@import "tailwindcss"` and any existing structure — append managed blocks after it if there is no existing marker.

4. **Report what was synced / changed**
   - List, per block: whether it was **created** (markers appended) or **updated in place** (markers already present), and whether the content actually changed vs. was already current.
   - Name the live file written and the markers used.
   - If the `@theme` block or class block was missing from the markdown, say so and point to `/des-author`.

5. **End-of-action marker**
   - Output as the final line: `🟢 SYNCED · design-system → live Tailwind → Next: /des-build <component>`

## Edge Cases

- **`design-system/` missing**: instruct the user to run `/des-author` first, then STOP. Do NOT author either block here.
- **`global-classes.md` absent or empty**: sync only the `@theme` block; note there are no global classes to sync (valid state). Do not invent classes.
- **Live Tailwind entry ambiguous or not found**: ask the user via `AskUserQuestion` which file is the live entry (offer discovered candidates); never guess a path silently.
- **Markers already present**: replace only between each marker pair (idempotent re-sync); never duplicate a block.
- **Markers absent**: append the marked block(s) after existing content / `@import "tailwindcss"`.
- **Hand-written CSS near a managed block**: leave it untouched — only content strictly between `des-sync:*` markers is rewritten.
- **Partial / corrupted markers** (a `start` without its matching `end`, or vice versa): do NOT rewrite in place — flag the malformed marker pair to the user and ask whether to re-append a fresh marked block, rather than risk eating hand-written CSS.
