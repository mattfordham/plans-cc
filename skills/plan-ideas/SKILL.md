---
name: plan-ideas
disable-model-invocation: true
argument-hint: "[id]"
allowed-tools:
  - Read
  - Glob
description: List captured ideas or show details of a specific idea
---

# plan-ideas

Browse captured brainstorm ideas. Without arguments, lists all ideas with key metadata. With an idea ID, shows full details.

## Arguments

- `$ARGUMENTS`: Optional idea ID (e.g., "1", "01", or "001") to show details of a specific idea

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Parse arguments**
   - If `$ARGUMENTS` is numeric → treat as idea ID, go to detail mode (step 6)
   - If `$ARGUMENTS` is empty → list mode (step 3)
   - If `$ARGUMENTS` is non-numeric → error: "Expected an idea ID (number). Run `/plan-ideas` to see all ideas."

3. **Scan idea files** (list mode)
   - Glob `.plans/ideas/*.md`
   - If no files found: "No ideas yet. Run `/plan-brainstorm` to start exploring."

4. **Parse each idea file**
   Extract from each:
   - ID (from filename first 3 digits)
   - Topic (from `# ` header)
   - Created (from `**Created:**` line)
   - Whether it has an `## Expanded Into` section → `expanded = true`
   - Count of bullet items in `## Key Insights` section
   - Whether `## Open Questions` has bullet items → `has_questions = true`

5. **Display idea list**
   Follow the compact style of `/plan-status`:
   ```
   # Ideas

   3 ideas · 1 expanded

   ✦ 003 API redesign (3 insights, open questions)
   ✦ 002 Pricing model (2 insights) → expanded
   ✦ 001 Auth overhaul (4 insights) → expanded

   Next: /plan-ideas <id> to view details, /plan-expand <id> to create tasks
   ```

   Per-idea format (one line each):
   - `✦ NNN Topic (N insights[, open questions]) [→ expanded]`
   - Sort by ID descending (newest first)

6. **Show idea detail** (detail mode, when ID provided)
   - Zero-pad the ID to 3 digits
   - Search `.plans/ideas/NNN-*.md`
   - If not found: "Idea #NNN not found. Run `/plan-ideas` to see available ideas."
   - Read the full file and display it as-is (the brainstorm format is already readable)
   - Append contextual next actions based on expansion status:

   If not yet expanded:
   ```
   ---
   Next: /plan-expand NNN to create tasks from this idea
   ```

   If already expanded:
   ```
   ---
   Already expanded into tasks. Run /plan-expand NNN to add more tasks.
   ```

## Edge Cases

- **No ideas directory**: "No ideas yet. Run `/plan-brainstorm` to start exploring."
- **Malformed idea files**: Skip and note at end (e.g., "1 file could not be parsed")
- **Single idea**: Still show list format (consistent)
- **Idea file missing expected sections**: Show what's available, omit missing parts from summary line
