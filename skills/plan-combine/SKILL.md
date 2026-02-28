---
name: plan-combine
disable-model-invocation: true
argument-hint: "<id> <id> [id...]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - AskUserQuestion
description: Merge multiple tasks into a single task
---

# plan-combine

Merge multiple tasks into a single task. Useful when related tasks should be worked on together or when tasks captured separately are actually parts of a larger effort.

## Arguments

- `$ARGUMENTS`: Two or more task IDs separated by spaces (e.g., "2 4 5")

## Steps

1. **Verify initialization**
   - Check for `.plans/config.json`
   - If not found, error: "Not initialized. Run `/plan-init` first."

2. **Parse task IDs from arguments**
   - If no `$ARGUMENTS`, list pending tasks and use AskUserQuestion:
     ```
     question: "Which tasks do you want to combine?"
     header: "Tasks"
     options:
       - label: "Select specific IDs"
         description: "I'll provide the task IDs to combine"
     ```
     Then ask for the IDs.
   - Split arguments by spaces
   - If fewer than 2 IDs provided: "Need at least 2 task IDs to combine."

3. **Resolve and validate each task**
   - Zero-pad each ID to 3 digits
   - Find each task file in `.plans/pending/NNN-*.md`
   - For each task, validate:
     - If not found: "Task #NNN not found."
     - If status is `in-progress`: "Cannot combine #NNN — task is in progress. Complete or reset it first."
     - If status is `review`: "Cannot combine #NNN — task is in review. Complete or reopen it first."
     - If status is `completed` (in completed/ folder): "Cannot combine #NNN — task is already completed."

4. **Check for branches**
   - For each task, check if a `Branch:` field exists and is not empty
   - If any task has a branch, warn:
     ```
     Warning: Task #NNN has branch '[branch-name]' which will be orphaned.
     ```
     Use AskUserQuestion:
     ```
     question: "Task #NNN has an associated branch. Continue anyway?"
     header: "Branch"
     options:
       - label: "Continue"
         description: "Proceed and orphan the branch"
       - label: "Cancel"
         description: "Abort the combine operation"
     ```

5. **Read all task files**
   - Parse metadata from each: ID, Title, Type, Status, Created
   - Extract content sections: What, Why, How, Verification, Notes

6. **Display merge preview**
   ```
   Combining N tasks into #[lowest-ID]:

     #NNN - [Title] [status]
     #NNN - [Title] [status]
     #NNN - [Title] [status]
   ```

   If any task is `pending` while others are `elaborated`:
   ```
   Note: Task #NNN is pending, so combined task will need elaboration.
   ```

7. **Determine combined title**
   Use AskUserQuestion:
   ```
   question: "What should the combined task be titled?"
   header: "Title"
   options:
     - label: "[Title from first/lowest ID task]"
       description: "Keep the existing title from task #NNN"
     - label: "[Auto-generated combined title]"
       description: "Generated from task descriptions"
   ```

   For auto-generated title: combine key nouns/verbs from all tasks into a concise phrase (max 60 chars).

8. **Determine combined type**
   - Collect types from all tasks
   - If all same type: use that type
   - If mixed types, prioritize: bug > feature > refactor > chore
   - If ambiguous, use AskUserQuestion:
     ```
     question: "What type best describes the combined task?"
     header: "Type"
     options:
       - label: "bug"
         description: "Fixing broken behavior"
       - label: "feature"
         description: "Adding new functionality"
       - label: "refactor"
         description: "Improving code structure"
       - label: "chore"
         description: "Maintenance or tooling"
     ```

9. **Determine combined status and merge content**

   **Status logic:**
   - If ALL source tasks are `elaborated`: combined status = `elaborated`
   - If ANY source task is `pending`: combined status = `pending`

   **Content merging:**

   *What section:*
   Concatenate all What sections with separators:
   ```markdown
   ## What

   ### From #NNN: [Original Title]
   [What content]

   ---

   ### From #NNN: [Original Title]
   [What content]
   ```

   *Why section:*
   - If combined status is `elaborated`: merge all Why content with separators
   - If combined status is `pending`: use placeholder `_To be filled during elaboration_`

   *How section:*
   - If combined status is `elaborated`: concatenate all checkbox items, grouped by source task:
     ```markdown
     ## How

     ### From #NNN: [Title]
     - [ ] Step 1...
     - [ ] Step 2...

     ### From #NNN: [Title]
     - [ ] Step 1...
     ```
   - If combined status is `pending`: use placeholder `_To be filled during elaboration_`

   *Verification section:*
   - If combined status is `elaborated`: merge all verification criteria
   - If combined status is `pending`: use placeholder `_To be filled during elaboration_`

   *Notes section:*
   - Concatenate all Notes sections (if any have content beyond placeholder)
   - Add a note about the merge:
     ```
     Combined from tasks #NNN, #NNN, #NNN on [YYYY-MM-DD]
     ```

10. **Write combined task file**
    - Use the lowest ID from source tasks
    - Generate new slug from combined title
    - Write to `.plans/pending/NNN-new-slug.md`
    - Use Created date from earliest source task

11. **Delete source task files**
    - Delete all source task files except the one being kept (lowest ID)
    - If the kept ID's file has a different name (due to new slug), delete old and write new

12. **Update PROGRESS.md**
    - Update Stats section counts
    - If any combined task was in "Up Next" section, update it
    - Update "Last updated" date

13. **Display confirmation**
    ```
    Combined N tasks into #[ID]: [New Title]

    Merged content:
    - What: [N] sections combined
    - Status: [elaborated|pending]
    [If elaborated:] - Steps: 0/[total] complete

    Deleted tasks: #NNN, #NNN

    [If pending:]
    Next: /plan-elaborate [ID]

    [If elaborated:]
    Next: /plan-execute [ID]
    ```

## Edge Cases

- **< 2 IDs provided**: Error "Need at least 2 task IDs to combine."
- **Task not found**: Error "Task #NNN not found."
- **Task in-progress**: Block "Cannot combine #NNN — task is in progress."
- **Task in review**: Block "Cannot combine #NNN — task is in review."
- **Task completed**: Block "Cannot combine #NNN — task is already completed."
- **Task has branch**: Warn about orphaned branch, ask to proceed
- **No arguments**: List pending tasks, prompt for which to combine
- **Duplicate IDs**: Deduplicate silently (e.g., "2 2 3" becomes "2 3")
- **All tasks have same ID**: Error after deduplication "Need at least 2 different task IDs."
- **Mixed elaborated/pending**: Reset to pending, notify user
