---
name: plan-elaborate
disable-model-invocation: true
argument-hint: "<id>"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - WebSearch
description: Research and flesh out a task with Why, How, and Verification
---

# plan-elaborate

Research the codebase and flesh out a captured task with implementation details.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Context

Reference `.plans/CONTEXT.md` to understand the project's tech stack, patterns, and key files when researching.

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve task ID**
   - Accept flexible ID formats: "1", "01", "001"
   - Zero-pad to 3 digits for file lookup
   - Find task file: `.plans/pending/NNN-*.md`

3. **Handle missing ID argument**
   - If no `$ARGUMENTS`, list pending tasks and ask which to elaborate:
     ```
     Pending tasks:
     #001 - Fix login timeout bug (pending)
     #002 - Add dark mode (pending)
     #003 - Refactor auth (elaborated)

     Which task ID to elaborate?
     ```

4. **Validate task state**
   - Read the task file
   - Check Status field:
     - If `pending`: proceed
     - If `elaborated`: "Task #NNN is already elaborated. Run `/plan-start NNN` to begin work."
     - If `in-progress`: "Task #NNN is already in progress. Run `/plan-execute NNN` to continue."
     - If not found: "Task #NNN not found. Run `/plan-list` to see available tasks."

5. **Load project context**
   - Read `.plans/CONTEXT.md`
   - Note tech stack, key patterns, important files
   - Prepare a brief context summary for the research agent

6. **Spawn research sub-agent**
   Use the Task tool to spawn an Explore agent for codebase research:

   ```
   Task tool parameters:
   - subagent_type: "Explore"
   - description: "Research task #NNN"
   - prompt: |
       Research this task for a plans-cc elaboration:

       ## Task
       [Task title and What section]

       ## Project Context
       [Brief summary from CONTEXT.md: tech stack, key patterns]

       ## What to Find
       1. Relevant files that would need to be modified or referenced
       2. Current implementation patterns for similar functionality
       3. Suggested approach based on codebase conventions
       4. Any open questions or unclear areas

       ## Return Format
       Return your findings in this structure:

       ### Relevant Files
       - `path/to/file` — Why it's relevant

       ### Current Implementation
       Brief summary of how related functionality currently works

       ### Suggested Approach
       Recommended implementation steps based on what you found

       ### Open Questions
       Anything unclear that needs user input
   ```

   **Fallback:** If Task tool is unavailable, fall back to direct research using Glob, Grep, and Read in the main conversation.

7. **Process research findings**
   - Parse the sub-agent's structured response
   - Use "Relevant Files" to identify scope
   - Use "Suggested Approach" to draft the How section
   - Note "Open Questions" for user discussion

8. **Fill out task sections interactively**

   **Why section:**
   - Ask: "Why is this task important? What problem does it solve?"
   - If user is unsure, suggest based on task type:
     - Bug: "Improves reliability by fixing [issue]"
     - Feature: "Adds value by enabling [capability]"
     - Refactor: "Improves maintainability by [improvement]"

   **How section:**
   - Present research findings:
     ```
     Based on my research:
     - Relevant files: [from sub-agent]
     - Current implementation: [from sub-agent]
     - Suggested approach: [from sub-agent]
     ```
   - If there are open questions, discuss them with user
   - Ask: "Does this approach look right? Any changes?"
   - Document the agreed approach with specific steps

   **Verification section:**
   - Suggest verification criteria based on task type:
     - Bug: "Verify the [issue] no longer occurs when [trigger]"
     - Feature: "Verify [capability] works by [test steps]"
     - Refactor: "Verify existing tests pass, code is cleaner"
   - Ask: "Any additional verification criteria?"

9. **Update task file**
   - Fill in Why, How, Verification sections
   - Update Status to `elaborated`
   - Write the updated file

10. **Display confirmation**
    ```
    Elaborated task #NNN: [Title]
    Status: elaborated

    Approach:
    [Brief summary of How section]

    Verification:
    [Brief summary of Verification section]

    Next: /plan-start NNN to begin working
    ```

## Edge Cases

- **No ID argument**: List pending/elaborated tasks and ask
- **Already elaborated**: Inform user and suggest `/plan-start`
- **Task not found**: Error with suggestion to run `/plan-list`
- **No pending tasks**: "No tasks to elaborate. Run `/plan-capture` to add one."
- **CONTEXT.md is minimal**: Still proceed, note that context is limited
- **Task tool unavailable**: Fall back to direct Glob/Grep/Read research
- **Sub-agent returns incomplete findings**: Supplement with direct research or ask user
