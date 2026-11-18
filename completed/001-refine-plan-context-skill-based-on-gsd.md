# Refine the plan-context skill based on observations from the gsd project

**ID:** 001
**Created:** 2026-01-28T09:15
**Type:** refactor
**Status:** completed
**Completed:** 2026-01-28T09:50

## What
Refine the plan-context skill based on observations from the gsd project https://github.com/glittercowboy/get-shit-done

## Why
The current CONTEXT.md lacks a file map showing directory structure and file purposes. This means Claude has to re-explore the codebase each session. Adding a structure overview helps maintain orientation across conversations.

## How
1. Update the CONTEXT.md template to include a "Structure" section with:
   - Directory tree (key directories, not exhaustive)
   - Brief purpose annotations for each directory
   - File descriptions inline with the tree or as a list

2. Add a "Testing" section to CONTEXT.md with:
   - Testing framework (Jest, RSpec, pytest, etc.)
   - Test file location patterns (spec/, __tests__/, *.test.js, etc.)
   - How to run tests (npm test, bundle exec rspec, etc.)
   - Any testing conventions or rules (TDD, coverage requirements, etc.)

3. Update plan-context skill to auto-generate the structure:
   - Scan for common directories (src/, lib/, app/, bin/, test/, spec/, etc.)
   - Identify key files (entry points, configs, READMEs)
   - Generate tree with annotations based on common patterns
   - Use prescriptive language ("Contains X" vs "X is here")

4. Auto-detect testing patterns:
   - Look for test config files (jest.config.js, .rspec, pytest.ini, etc.)
   - Identify test directories and file naming conventions
   - Extract test commands from package.json scripts or common patterns
   - Note any testing-related configs (.nycrc, coverage settings, etc.)

5. Reduce interactivity:
   - Auto-detect and write findings directly
   - User can edit CONTEXT.md after if needed
   - Only ask questions when genuinely uncertain

6. Keep existing sections (Overview, Tech Stack, Key Patterns, Notes)

**Files to modify:**
- `skills/plan-context/SKILL.md` — Update steps and template
- `skills/plan-init/SKILL.md` — Update CONTEXT.md template

## Verification
- [ ] `/plan-context` generates a Structure section with directory tree
- [ ] Tree shows key directories with purpose annotations
- [ ] Important files are listed with descriptions
- [ ] Testing section shows framework, patterns, and run commands
- [ ] Tech stack auto-detection still works
- [ ] Less interactive — writes findings without excessive Q&A
- [ ] Template in `/plan-init` matches new structure (including Testing section)

## Changes
- Updated `skills/plan-init/SKILL.md`: Added Structure and Testing sections to CONTEXT.md template
- Updated `skills/plan-context/SKILL.md`:
  - Added step 4 "Generate directory structure" with tree generation and annotations
  - Added step 5 "Detect testing patterns" with framework detection table
  - Updated step 7 to write findings directly (reduced interactivity)
  - Added edge cases for no tests detected and mixed frameworks

## Notes
**Research from gsd project:**
- Uses STRUCTURE.md in `.planning/codebase/` for file mapping
- Prescriptive guidance ("Use X" not "X is used")
- File paths formatted as backticks throughout
- Anti-padding discipline — reports what couldn't be found
- Focus areas: tech, arch, quality, concerns (we're keeping it simpler)
