---
name: plan-context
disable-model-invocation: true
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
description: Update project context with tech stack, patterns, and key information
---

# plan-context

Update the project's CONTEXT.md with relevant information about the codebase.

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Read current CONTEXT.md**
   - Load `.plans/CONTEXT.md`
   - Note any existing user-written content to preserve

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

   ## Notes
   [Preserve existing if present, otherwise: "_Anything else relevant_"]
   ```

8. **Display summary**
   Show what was detected and written:
   ```
   Updated .plans/CONTEXT.md

   Detected:
   - Tech: Node.js, TypeScript, React
   - Testing: Jest (tests/, npm test)
   - Structure: 5 directories mapped

   Review and edit CONTEXT.md if needed.
   ```

## Edge Cases

- **No project files found**: Write template with placeholder sections, note that auto-detection found nothing
- **Already has CONTEXT.md with content**: Preserve user-written Overview, Key Patterns, and Notes sections; update Tech Stack, Structure, and Testing with fresh detection
- **Large monorepo**: Focus on current directory only, note scope in Overview
- **No tests detected**: Write "Not detected" in Testing section, suggest adding test config
- **Mixed test frameworks**: List all detected frameworks
