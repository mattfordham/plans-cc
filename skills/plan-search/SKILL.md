---
name: plan-search
disable-model-invocation: false
argument-hint: "<query>"
allowed-tools:
  - Read
  - Bash
  - Glob
  - Grep
description: Full-text search across all tasks and ideas
---

# plan-search

Search across all tasks and ideas by keyword. Searches titles and content of task files in pending/, completed/, and ideas/.

## Arguments

- `$ARGUMENTS`: Search query (e.g., "auth", "login timeout", "dark mode")

## Steps

1. **Verify initialization**
   - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
   - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

2. **Parse query**
   - If `$ARGUMENTS` is empty: error "Usage: `/plan-search <query>`"
   - Use the full argument string as the search query

3. **Search task and idea files**
   - Use Grep to search case-insensitively for the query in:
     - `.plans/pending/*.md`
     - `.plans/completed/*.md`
     - `.plans/ideas/*.md` (if directory exists)
   - For each matching file, collect:
     - File path
     - Matching line(s) with 1 line of context above and below

4. **Gather metadata for matches**
   For each file with matches:
   - Extract task/idea ID from filename (first 3 digits)
   - Extract title from `# ` header line
   - Extract status from `**Status:**` line (or "idea" for idea files)
   - Extract type from `**Type:**` line (if present)
   - Store the matching excerpt(s) — keep up to 3 most relevant matches per file

5. **Display results**

   Group results by location:

   ```
   # Search: "auth"

   ## Tasks (3 matches)

   #001 Fix auth timeout [bug] (in-progress)
     ...handles the auth token refresh when...

   #005 Add OAuth support [feature] (elaborated)
     ...implement auth flow using OAuth2 and...

   ## Completed (1 match)

   #003 Initial auth setup [feature]
     ...set up basic auth module with JWT...

   ## Ideas (1 match)

   Idea #2 API Redesign
     ...consider authentication middleware for...

   5 results found
   ```

   **Display rules:**
   - Group into sections: Tasks (pending/), Completed (completed/), Ideas (ideas/)
   - Omit sections with no matches
   - Each result is: ID + title + [type] + (status) on first line, indented excerpt on next line
   - Show up to 3 excerpt lines per file, truncating long lines
   - Show total count at the bottom

6. **If no results**
   ```
   No tasks or ideas matching "[query]".
   ```

## Edge Cases

- **No arguments**: Error with usage hint
- **Not initialized**: Error suggesting `/plan-init`
- **No matching files**: Display "No results" message
- **ideas/ directory doesn't exist**: Skip idea search silently
- **completed/ directory empty**: Skip completed section silently
- **Very broad query**: Show results but cap at 20 files maximum, note "Showing 20 of N matches"
- **Query contains regex characters**: Escape special characters before passing to Grep
