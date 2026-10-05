---
name: plan-context
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - AskUserQuestion
description: Update project context with tech stack, patterns, and key information
---

# plan-context

Update the project's CONTEXT.md with relevant information about the codebase.

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Read current CONTEXT.md**
   - Load `.plans/CONTEXT.md`
   - Note any existing user-written content to preserve (including a `## Lessons From Past Projects` section, if present — it is managed by `/plan-retrospect seed` and must survive regeneration verbatim)

3. **Auto-detect tech stack**
   Scan for common project files and infer technologies:

   | File | Technology |
   |------|------------|
   | `package.json` | Node.js (check dependencies for React, Vue, Express, etc.) |
   | `Gemfile` | Ruby (check for Rails, Sinatra, etc.) |
   | `requirements.txt` / `pyproject.toml` | Python (check for Django, Flask, FastAPI, etc.) |
   | `go.mod` | Go |
   | `Cargo.toml` | Rust |
   | `composer.json` | PHP (check for Laravel, Symfony, etc.) |
   | `craft` or `config/general.php` | Craft CMS |
   | `tsconfig.json` | TypeScript |
   | `.eslintrc*` | ESLint |
   | `.rubocop.yml` | Rubocop |

4. **Generate directory structure**
   Scan the project root and build a tree of key directories:
   - Use `ls` or Glob to find top-level directories
   - Include: `src/`, `lib/`, `app/`, `bin/`, `config/`, `tests/`, `spec/`, `scripts/`, etc.
   - Exclude: `node_modules/`, `.git/`, `vendor/`, `__pycache__/`, build artifacts
   - For each directory, add a brief purpose annotation:
     ```
     project/
       bin/         # CLI scripts and executables
       src/         # Main source code
       tests/       # Test files
       config/      # Configuration files
     ```
   - Use prescriptive language: "Contains X" not "X is here"

5. **Detect testing patterns**
   Look for test configuration and infer patterns:

   | Config File | Framework |
   |-------------|-----------|
   | `jest.config.js` / `jest.config.ts` | Jest |
   | `.rspec` / `spec/spec_helper.rb` | RSpec |
   | `pytest.ini` / `pyproject.toml` with pytest | pytest |
   | `vitest.config.js` | Vitest |
   | `mocha.opts` / `.mocharc.*` | Mocha |
   | `phpunit.xml` | PHPUnit |

   Also detect:
   - Test directories: `tests/`, `spec/`, `__tests__/`, `test/`
   - Test file patterns: `*.test.js`, `*.spec.ts`, `*_test.py`, `*_spec.rb`
   - Test commands from `package.json` scripts (look for "test" key)
   - Coverage configs: `.nycrc`, `coverage/`, `.coveragerc`

6. **Identify key files**
   Find important entry points and configs:
   - Entry points: `index.js`, `main.py`, `app.rb`, `main.go`, `src/index.*`
   - Configs: `package.json`, `tsconfig.json`, `Makefile`, `docker-compose.yml`
   - Documentation: `README.md`, `ARCHITECTURE.md`, `CONTRIBUTING.md`

7. **Write updated CONTEXT.md**
   Write findings directly (minimal interactivity). Format:

   ```markdown
   # Project Context

   **Project:** [from package.json name or directory name]
   **Updated:** [Today's date YYYY-MM-DD]

   ## Overview
   [Preserve existing if present, otherwise: "_Brief description of this project_"]

   ## Tech Stack
   - [Detected language/runtime]
   - [Detected frameworks]
   - [Detected tools]

   ## Structure
   ```
   project/
     dir1/        # Purpose annotation
     dir2/        # Purpose annotation
     file.ext     # Key file description
   ```

   ## Testing
   - **Framework:** [Detected or "_Not detected_"]
   - **Location:** [Test directories found]
   - **Run:** [Command from package.json or common pattern]
   - **Conventions:** [Any detected patterns or "_None specified_"]

   ## Key Patterns
   [Preserve existing if present, otherwise: "_Architecture decisions, conventions_"]

   ## Lessons From Past Projects
   [Preserve existing if present; managed by /plan-retrospect seed — otherwise omit this section entirely]

   ## Notes
   [Preserve existing if present, otherwise: "_Anything else relevant_"]
   ```

8. **Offer to seed `.plans/SKILL_NOTES.md` (only when absent — opt-in, never forced)**
   This is the same offer `/plan-init` makes, for projects that were initialized before it existed or that skipped it. It is the **only** interactive step in this skill. It fires only when the file is absent **and** at least one signal is detected.
   - **Gate: file present → do nothing.** If `.plans/SKILL_NOTES.md` already exists, skip this step entirely: no prompt, no read-back, no overwrite, and nothing printed about skill notes in the summary. An existing file is never re-offered or touched.
   - **File absent** → follow `skills/plan-init/SKILL.md` step 9 (b)–(e) exactly: detect the four signals (package manager from lockfile, `scripts.dev`, port convention in `AGENTS.md`/`CLAUDE.md`, `design-system/` presence), skip silently when none is found, build the pre-filled `## all` + per-skill proposal, and offer **Skip (recommended)** / **Accept** / **Edit** via `AskUserQuestion`. Do not re-derive the recipe here. That step is the single source of truth.
   - **Skip** (or an Edit that empties the proposal) writes **nothing**. The decline is not recorded anywhere (no `config.json` key), so a later `/plan-context` run offers again while the file is still absent. This is intended: the absence of the file is the complete record.
   - Remember the outcome (created with N notes / skipped / no signals) for step 10. An accepted file is picked up by step 9's `.plans/` commit.

9. **Commit .plans/ changes**
   - Commit via the shared helper (it resolves the project root and skips silently when not in a git repo, when `.plans` is gitignored, when `git_commits` is not `true`, or when nothing changed):
     ```bash
     node ~/.claude/plans-cc/plans-git.js commit "plan: update project context"
     ```
   - If `~/.claude/plans-cc/plans-git.js` does not exist: print `Warning: plans-git helper missing — run npx plans-cc to reinstall` and continue.
   - Surface any `Warning:` lines it prints, but never fail the skill.

10. **Display summary**
   Show what was detected and written:
   ```
   Updated .plans/CONTEXT.md

   Detected:
   - Tech: Node.js, TypeScript, React
   - Testing: Jest (tests/, npm test)
   - Structure: 5 directories mapped

   Created .plans/SKILL_NOTES.md (2 notes)

   Review and edit CONTEXT.md if needed.
   ```
   - The skill-notes line reflects step 8: "Created `.plans/SKILL_NOTES.md` (N notes)" or "Skill notes: skipped (create `.plans/SKILL_NOTES.md` any time, see CLAUDE.md)". Omit the line entirely when the file was already present or no signals were detected.

   End-of-action marker (final line): `🟢 CONTEXT UPDATED`

## Edge Cases

- **No project files found**: Write template with placeholder sections, note that auto-detection found nothing
- **Already has CONTEXT.md with content**: Preserve user-written Overview, Key Patterns, Lessons From Past Projects (managed by `/plan-retrospect seed`), and Notes sections; update Tech Stack, Structure, and Testing with fresh detection. Only emit the `## Lessons From Past Projects` section when it already exists — never write an empty placeholder for it.
- **Large monorepo**: Focus on current directory only, note scope in Overview
- **No tests detected**: Write "Not detected" in Testing section, suggest adding test config
- **Mixed test frameworks**: List all detected frameworks
- **SKILL_NOTES offer** (step 8): gated on the file being absent. An existing `.plans/SKILL_NOTES.md` is never re-offered, overwritten, or mentioned. When the file is absent: no signals → no prompt; **Skip** or an emptied Edit → no file, byte-identical to today. The decline is not remembered, so the next run offers again while the file is still absent.
