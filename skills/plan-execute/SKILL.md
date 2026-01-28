---
name: plan-execute
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
description: Continue work on an active task
---

# plan-execute

Continue working on a task that's already in-progress. Load context and resume work. When the project has an existing test suite, follow TDD (Test-Driven Development) practices.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001") — optional if only one task is in-progress

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Find in-progress tasks**
   - Scan `.plans/pending/*.md` for files with `Status: in-progress`
   - Build list of in-progress task IDs and titles

3. **Resolve which task to execute**

   **If `$ARGUMENTS` provided:**
   - Zero-pad to 3 digits
   - Find matching task file
   - Verify it's in-progress

   **If no `$ARGUMENTS`:**
   - If exactly one in-progress task: auto-select it
   - If multiple in-progress tasks: list them and ask:
     ```
     Multiple tasks in progress:
     #001 - Fix login timeout bug
     #003 - Refactor auth module

     Which task ID to continue?
     ```
   - If no in-progress tasks: "No tasks in progress. Run `/plan-start <id>` to begin one."

4. **Detect test suite**
   Check for an existing test suite by looking for:

   **Ruby/RSpec:**
   - `spec/` directory with `*_spec.rb` files
   - `Gemfile` containing `rspec`

   **JavaScript/TypeScript:**
   - `package.json` containing `jest`, `mocha`, `vitest`, or test scripts
   - `__tests__/` directory or `*.test.js`, `*.spec.ts` files

   **Python:**
   - `pytest.ini`, `pyproject.toml` with pytest config, or `tests/` directory
   - `*_test.py` or `test_*.py` files

   **Go:**
   - `*_test.go` files

   **Other:**
   - Any `test/`, `tests/`, or `spec/` directory with test files

   Note: If a test suite is detected, set `has_tests = true` for use in step 6.

5. **Load task and context**
   - Read the task file fully
   - Read `.plans/CONTEXT.md` for project context
   - Note what's in the Changes section (work done so far)

6. **Present current state**
   ```
   Continuing task #NNN: [Title]
   Type: [type] | Status: in-progress
   Test Suite: [Detected: RSpec/Jest/pytest/etc.] or [None detected]

   ## Approach (How)
   [How section content]

   ## Progress So Far (Changes)
   [Changes section content, or "No changes recorded yet"]

   ## Remaining Verification
   [Verification criteria not yet met]

   ## Relevant Files
   [Files from How section + any mentioned in Changes]
   ```

7. **Resume work (TDD workflow if test suite detected)**

   **If `has_tests = true`, follow TDD (Red-Green-Refactor):**

   For each piece of functionality to implement:

   a. **RED - Write failing test first**
      - Write a test that describes the expected behavior
      - Run the test to confirm it fails (this validates the test is meaningful)
      - If the test passes immediately, the behavior may already exist or the test is wrong

   b. **GREEN - Write minimal code to pass**
      - Implement just enough code to make the test pass
      - Don't over-engineer; focus on making the test green
      - Run tests to confirm the new test passes

   c. **REFACTOR - Improve while keeping tests green**
      - Clean up code, remove duplication, improve naming
      - Run tests after each refactor to ensure nothing breaks
      - Only refactor when all tests are passing

   d. **Repeat** for each piece of functionality

   **Test commands by framework:**
   - RSpec: `bundle exec rspec` or `bundle exec rspec spec/path/to_spec.rb`
   - Jest: `npm test` or `npx jest path/to/test.js`
   - Vitest: `npm test` or `npx vitest run`
   - Mocha: `npm test` or `npx mocha`
   - pytest: `pytest` or `pytest tests/test_file.py`
   - Go: `go test ./...` or `go test -run TestName`

   **If no test suite detected:**
   - Continue implementing according to the How section
   - Make code changes as needed
   - Consider suggesting test setup if the task involves significant new functionality

8. **Update Changes section**
   After making changes, update the task file's Changes section:
   ```markdown
   ## Changes
   - Added test `spec/auth/timeout_spec.rb` - test for timeout handling (RED)
   - Modified `src/auth/login.ts` - added timeout handling (GREEN)
   - Refactored timeout logic into separate method (REFACTOR)
   - [Continue listing changes as they're made]
   ```

   When following TDD, annotate changes with their TDD phase when helpful.

9. **Run tests before pausing**
   If a test suite exists, run the full relevant test suite before pausing work:
   - Ensure all tests pass
   - If tests fail, either fix them or note the failures in the status

10. **Periodic status**
    When pausing or completing a work session, show:
    ```
    Progress on #NNN:
    - [Summary of what was done]
    - [What remains]
    - Tests: [All passing] or [X failing - details]

    Continue with `/plan-execute NNN` or complete with `/plan-complete NNN`
    ```

## Edge Cases

- **No ID + one active task**: Auto-select the single in-progress task
- **No ID + multiple active**: List them and ask which to continue
- **No in-progress tasks**: Suggest `/plan-start` with list of available tasks
- **ID provided but not in-progress**:
  - If pending/elaborated: "Task #NNN hasn't been started. Run `/plan-start NNN` first."
  - If completed: "Task #NNN is already completed."
  - If not found: "Task #NNN not found."
- **Changes section already has content**: Build on it, don't overwrite
- **Test suite detected but task is pure refactor**: Still use TDD — run existing tests before and after each change to ensure no regressions
- **Test already exists for the functionality**: Skip RED phase, go straight to GREEN
- **Flaky or slow tests**: Run focused tests during development (`rspec spec/file_spec.rb:42`), full suite before pausing
- **No test suite but task mentions testing**: Suggest setting up a test framework appropriate to the project
