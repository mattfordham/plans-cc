---
name: plan-elaborate
disable-model-invocation: false
argument-hint: "<id|description> [skip] [deep]"
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
  - WebFetch
  - WebSearch
  - AskUserQuestion
description: Research and flesh out a task (auto-captures if given a description)
---

# plan-elaborate

Research the codebase and flesh out a captured task with implementation details. If given a description instead of an ID, auto-captures the task first.

## Execution Contract (read first — non-negotiable)

1. **Skip mode auto-accepts prompts; it does NOT skip steps.** Research, assumption tracking (step 12), and the STOP barrier before execution all still run, even in skip mode.
2. **Never proceed to execution from within this skill.** Elaboration ends at the confirmation/summary; starting work is `/plan-execute`'s job.
3. An `elaborated` task stays in `.plans/pending/` — elaboration never moves task files.

## Arguments

- `$ARGUMENTS`: One or more task IDs, OR a task description, optionally followed by a skip keyword and/or a trailing `deep` keyword

**Parsing rules:**
- **Skip detection** (first) — set `skip_mode = true` if `$ARGUMENTS` contains any of:
  - Single keywords (per-token, case-insensitive): `skip`, `auto`, `noprompt`, `noinput`
  - Phrases (matched against full argument string, case-insensitive): `skip input`, `no input`, `no prompts`, `just go`, `just do it`
  - Strip skip keywords/phrases from `$ARGUMENTS` before further parsing
- **Deep detection** (second, after skip stripping, BEFORE the numeric-vs-description decision) — set `deep_mode = true` **only if the remaining argument string ENDS with the token `deep`** (case-insensitive, allowing trailing whitespace). Strip that trailing `deep` token from the remaining string before further parsing.
  - **CRITICAL — `deep` is END-ANCHORED, unlike `skip`.** `skip` is matched per-token anywhere in the string; `deep` is matched at the END only. This mirrors the trailing-phrase discipline in `skills/plan-capture/SKILL.md` step 2 ("Fix the elaborate system" does not trigger auto-elaborate because `elaborate` is mid-sentence).
  - **Why end-anchoring is load-bearing here:** in this skill any non-numeric remainder becomes an **auto-capture description**. A per-token match would make `/plan-elaborate Add deep linking support` silently enter deep mode AND capture a mangled description "Add linking support". Only a trailing `deep` may ever set the flag.
  - Only the bare token `deep` counts. There are no `deep` synonyms and no multi-word `deep` phrases.
  - `deep` and `skip` are **independent and compose freely** (see step 9.5).
- **Determine argument type** — after removing skip tokens and any trailing `deep`, examine what remains:
  - If ALL remaining tokens are numeric → task IDs. Zero-pad each to 3 digits. Deduplicate.
  - If ANY remaining token is non-numeric → the entire remaining string (including any numbers) is a **task description** for auto-capture. Set `auto_capture = true`.
  - If nothing remains → no IDs and no description (will prompt for IDs)
- IDs and skip keywords coexist freely.
- A description and skip keywords coexist freely.
- A trailing `deep` coexists freely with IDs, a description, and skip keywords.

**Examples:**
- `/plan-elaborate 1` → elaborate task 1, interactive
- `/plan-elaborate 1 3 5` → elaborate tasks 1, 3, 5 sequentially, interactive
- `/plan-elaborate 1 skip` → elaborate task 1, skip all prompts
- `/plan-elaborate 1 3 5 just go` → elaborate tasks 1, 3, 5, skip all prompts
- `/plan-elaborate skip` → skip mode, but no IDs — will prompt for IDs
- `/plan-elaborate auto` → same as skip
- `/plan-elaborate Fix login timeout bug` → auto-capture "Fix login timeout bug", then elaborate
- `/plan-elaborate Add dark mode skip` → auto-capture "Add dark mode", then elaborate in skip mode
- `/plan-elaborate 1 deep` → elaborate task 1 via the reasoning sub-agent, then confirm interactively
- `/plan-elaborate 1 deep skip` → deep drafting, then auto-accept with assumption bullets (skip is stripped first, so the remainder still ends with `deep`)
- `/plan-elaborate 1 skip deep` → identical to the above; skip stripping happens before deep detection, so keyword order does not matter
- `/plan-elaborate 1 3 deep` → deep-elaborate tasks 1 and 3 sequentially
- `/plan-elaborate Redesign the auth layer deep` → auto-capture "Redesign the auth layer", then deep-elaborate it
- `/plan-elaborate Add deep linking support` → auto-capture "Add deep linking support"; **`deep_mode` stays false** — `deep` is mid-string, not the final token, and the description is preserved intact

## Context

Reference `.plans/CONTEXT.md` to understand the project's tech stack, patterns, and key files when researching.

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve arguments**
   - Check for skip keywords/phrases (see Arguments section) → store as `skip_mode` flag (true/false)
   - Strip skip keywords/phrases from `$ARGUMENTS`
   - **Then check for a trailing `deep`:** if the remaining string ENDS with the bare token `deep` (case-insensitive, ignoring trailing whitespace), set `deep_mode = true` and strip that trailing token. Otherwise `deep_mode = false`.
     - This MUST happen **before** the numeric-vs-description decision below, because a description carrying a stray `deep` would otherwise be captured with the keyword still embedded.
     - **End-anchored, not per-token** (unlike `skip`): `/plan-elaborate Add deep linking support` leaves `deep_mode = false` and captures the description verbatim, because `deep` is not the final token. Only a *trailing* `deep` may set the flag. Same discipline as the trailing phrases in `skills/plan-capture/SKILL.md` step 2.
     - `deep_mode` and `skip_mode` are independent; both may be true.
   - Examine remaining tokens:
     - If ALL remaining tokens are numeric → task IDs. Zero-pad each to 3 digits, deduplicate → store as `task_ids` list. Set `auto_capture = false`.
     - If ANY remaining token is non-numeric → the entire remaining string is a task description. Set `auto_capture = true`. Store as `capture_description`.
     - If nothing remains → `task_ids` is empty, `auto_capture = false`

3. **Auto-capture** (only if `auto_capture` is true)

   Print: `--- Auto-capturing task: [capture_description] ---`

   Read `skills/plan-capture/SKILL.md` and follow its steps 1–8 (capture only, no auto-proceed chaining) using `capture_description` as the task description:
   - Verify initialization, generate ID, slugify, infer type, write task file, update config, update PROGRESS.md
   - Store the newly created task ID

   Show brief confirmation:
   ```
   Captured task #NNN: [Title]
   Type: [type] | Status: pending
   ```

   Set `task_ids` to the single newly captured ID. Continue to step 4.

   **If capture fails** (e.g., config error):
   - Print error: `Auto-capture failed: [reason]`
   - STOP — do not proceed with elaboration

4. **Handle missing IDs**
   - If `task_ids` is empty (no `$ARGUMENTS`, no numeric tokens, and no auto-capture), list pending tasks and ask which to elaborate:
     ```
     Pending tasks:
     #001 - Fix login timeout bug (pending)
     #002 - Add dark mode (pending)
     #003 - Refactor auth (elaborated)

     Which task ID(s) to elaborate? (space-separated for multiple)
     ```
   - Parse the user's response for numeric IDs the same way as step 2
   - If `skip_mode` was already set from original args (e.g., `/plan-elaborate skip`), retain it after user provides IDs

5. **Begin multi-task elaboration**

   Wrap steps 6–15 in a per-task loop over `task_ids`:

   - Show progress header for each task:
     ```
     --- Elaborating task [X] of [N]: #NNN ---
     ```
   - If `skip_mode`: announce once at the start: `Skip mode active — auto-accepting all prompts.`
   - If `deep_mode`: announce once at the start: `Deep mode active — drafting via reasoning sub-agent.` (Both may be announced; the flags are independent.)
   - On fatal error per task (not found, already completed): log warning `Skipping #NNN: [reason]`, continue to next task
   - Track results in two lists: `elaborated_tasks` (succeeded), `skipped_tasks` (failed/skipped with reason)

   **For each task in `task_ids`, execute steps 6–15:**

6. **Validate task state**
   - Read the task file from `.plans/pending/NNN-*.md`
   - Check Status field:
     - If `pending`: proceed with initial elaboration
     - If `elaborated` or `in-progress`: proceed with **further elaboration** (see step 11, Path C)
     - If `completed`: log `Skipping #NNN: already completed. Run /plan-reopen NNN first.` and continue to next task
     - If not found: log `Skipping #NNN: not found. Run /plan-list to see available tasks.` and continue to next task
   - **Read the `**Type:**` header value into `task_type`** (one of `bug`, `feature`, `refactor`, `chore`). Read this once per task, here, from the task header only — never re-derive it from the task body. Both step 8 (which research prompt variant to send) and step 9.5 (whether to generate a `## Diagnosis` section) consume this remembered value; do not re-read the header at those sites.

7. **Load project context**
   - Read `.plans/CONTEXT.md`
   - Note tech stack, key patterns, important files
   - Prepare a brief context summary for the research agent
   - Read `.plans/config.json` and remember `research_model` from `models.research` (see **Model selection** in `CLAUDE.md`). Set it ONLY when the `models` key is present AND defines a `research` entry. **When `models.research` is absent there is no default value — the research spawns below pass no `model:` parameter at all**, exactly as today, so the sub-agent inherits the session model. Do NOT substitute `"opus"` or any other literal. Read this once per run; both research spawn sites (step 8 and step 11's Path C "Research more") use this remembered value and never restate the default.
   - In the same read, also remember `reasoning_model` from `models.reasoning` — set it ONLY when the `models` key is present AND defines a `reasoning` entry, otherwise leave it unset. It is consulted only by the `deep` path (step 9.5).

8. **Spawn research sub-agent**
   Use the Task tool to spawn an Explore agent for codebase research.

   **Model:** when `research_model` was set in step 7, pass `model: [research_model]`; when `models.research` was absent, pass **no `model:` parameter at all**.

   **Prompt variant:** the research prompt depends on `task_type` (read in step 6).
   - `task_type` is **not** `bug` → send the **standard prompt** below, unchanged.
   - `task_type` **is** `bug` → send the **diagnostic prompt** instead (see "Diagnostic variant" after the standard prompt). A bug task's research question is *why is this broken*, not *where would a fix go*; the standard prompt never asks the former, so the root-cause theory would otherwise form implicitly and land unstated inside a How step.

   **Standard prompt (non-bug tasks):**

   ```
   Task tool parameters:
   - subagent_type: "Explore"
   - description: "Research task #NNN"
   - model: [research_model]   ← include this line ONLY when models.research is set; otherwise omit it entirely
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
       5. Existing utilities, hooks, helpers, or modules that already handle part of this task — flag anything reusable
       6. Anti-patterns to avoid: previous attempts, deprecated approaches, common pitfalls

       ## Return Format
       Return your findings in this structure:

       ### Relevant Files
       - `path/to/file` — Why it's relevant

       ### Current Implementation
       Brief summary of how related functionality currently works

       ### Suggested Approach
       Recommended implementation steps based on what you found

       ### Reusable Existing Code
       - `path/to/util` — What it does and how it applies
       (or "None found")

       ### Approach Warnings
       - [Concerns about over-engineering or simpler alternatives]
       (or "None")

       ### Open Questions
       Anything unclear that needs user input
   ```

   **Diagnostic variant (bug tasks only — send this INSTEAD of the standard prompt above):**

   Identical Task tool parameters and model rule; only the `## What to Find` and `## Return Format`
   sections differ.

   ```
   Task tool parameters:
   - subagent_type: "Explore"
   - description: "Research task #NNN"
   - model: [research_model]   ← include this line ONLY when models.research is set; otherwise omit it entirely
   - prompt: |
       Research this bug for a plans-cc elaboration. Your job is to explain WHY the
       reported symptom happens — not merely where a fix would go.

       ## Task
       [Task title and What section]

       ## Project Context
       [Brief summary from CONTEXT.md: tech stack, key patterns]

       ## What to Find
       1. How to reproduce the reported symptom — the concrete steps, inputs, or conditions that trigger it
       2. Trace the symptom back through the call path to its ORIGIN — follow it upstream to where the
          bad state or behavior first arises, not just to the file a fix would touch. The two are often
          different files; the symptom site is usually the last place to look for the cause.
       3. Rank candidate causes by evidence. For each, give the `file:line` evidence supporting it and an
          explicit confidence of `high`, `medium`, or `low`. It is fine — and often correct — to return
          more than one candidate.
       4. Name the single observation that would best discriminate between the top candidates: the one
          check, log line, or experiment whose result would most cheaply rule candidates in or out.
       5. Existing utilities, hooks, helpers, or modules that already handle part of this task — flag anything reusable
       6. Anti-patterns to avoid: previous attempts, deprecated approaches, common pitfalls

       ## Return Format
       Return your findings in this structure:

       ### Relevant Files
       - `path/to/file` — Why it's relevant

       ### Reproduction
       The steps/conditions that trigger the symptom (or "Could not determine" and why)

       ### Symptom Trace
       The call path from the reported symptom back to where the bad state originates

       ### Candidate Causes
       Ranked most-likely first. For each: the cause, its `file:line` evidence, and a
       confidence of high / medium / low.

       ### To Confirm
       The single most discriminating observation to run next

       ### Reusable Existing Code
       - `path/to/util` — What it does and how it applies
       (or "None found")

       ### Approach Warnings
       - [Concerns about over-engineering or simpler alternatives]
       (or "None")

       ### Open Questions
       Anything unclear that needs user input
   ```

   **Field-name compatibility (load-bearing).** Downstream steps consume these findings **by field
   name**. `### Relevant Files`, `### Reusable Existing Code`, `### Approach Warnings`, and
   `### Open Questions` are named identically in both variants and MUST stay that way. The diagnostic
   variant renames exactly two fields — `### Current Implementation` → `### Symptom Trace` and
   `### Suggested Approach` → `### Candidate Causes` — and adds two new ones (`### Reproduction`,
   `### To Confirm`). Step 9 maps the two renames back; do not rename anything else.

   **Fallback:** If Task tool is unavailable, fall back to direct research using Glob, Grep, and Read in the main conversation. On a bug task, the fallback research still answers the diagnostic questions above.

9. **Process research findings**
   - Parse the sub-agent's structured response
   - Use "Relevant Files" to identify scope
   - Use "Suggested Approach" to draft the How section
   - Review "Reusable Existing Code" — simplify How steps to use existing code instead of creating new abstractions
   - Surface any "Approach Warnings" to the user before finalizing the approach
   - Note "Open Questions" for user discussion

   **Bug-task field mapping.** When `task_type` is `bug`, step 8 sent the diagnostic variant, whose
   findings rename two fields. Map them back before doing anything else with the findings:
   - **`### Candidate Causes` is the source that `### Suggested Approach` would otherwise provide.**
     Read the top-ranked candidate as the proposed approach: it feeds the How draft (the fix follows
     from the cause), and it is what step 10's "Suggested Approach has ≤4 steps" simplicity test
     evaluates. Count the steps implied by acting on the top-ranked candidate.
   - **`### Symptom Trace` replaces `### Current Implementation`.** Anywhere a step below refers to
     "Current Implementation", use the Symptom Trace.
   - `### Reproduction` and `### To Confirm` are additions with no standard-variant counterpart. They
     are not consumed by steps 9–13; they feed the `## Diagnosis` section (see
     `### Diagnosis Generation` below) and the Verification section.
   - Every other field name is identical across both variants and needs no mapping.

9.5. **Deep drafting via reasoning sub-agent (conditional)**

   This step decides *who drafts* the task sections — a reasoning sub-agent, or the main
   loop inline. It does NOT decide anything else. **Every interactive gate stays in the
   main loop** (see "What stays in the main loop" below); the sub-agent only produces a
   draft that the existing Paths A/B and step 12 then act on exactly as they do today.

   **a. Should this path run?**

   Run the reasoning spawn when **both** of these hold:

   1. **Trigger** — any of:
      - `deep_mode` is true (an explicit `deep` argument **forces** this path regardless of the heuristic below), OR
      - the task is **NOT simple** by step 10's criteria. Use those criteria **verbatim** — task type is `refactor`; research has open questions that need user input; or the description contains "investigate", "figure out", "explore", "design", "architecture". Do **not** invent a second rubric here; evaluate step 10's NOT-simple test early and reuse the result. OR
      - **`task_type` is `bug`.** A stated root-cause hypothesis is worth reasoning-tier drafting even for a small bug, because diagnosis-before-plan is precisely where that tier pays off.

      **This third clause is a 9.5-only trigger and deliberately does NOT change step 10's
      Path A/B routing.** Do not "sync" the two lists — `bug` must never be added to step
      10's NOT-simple criteria. Doing so would force every bug, including a one-line typo
      fix, onto Path B's four-gate interactive flow, and would inflate the skip-mode
      assumption ledger (which propagates into plan-review's low-confidence block and
      plan-retrospect's mining signal). A bug task can therefore be drafted by the reasoning
      sub-agent here and still be routed to Path A by step 10; that combination is intended.
   2. **Capability** — the Task tool is available AND `reasoning_model` was set in step 7 (i.e. `.plans/config.json` has a `models` key defining a `reasoning` entry).

   **If the trigger fires but capability is missing** (Task tool unavailable, or `models.reasoning`
   absent), **fall back to today's inline drafting** — proceed to step 10 unchanged. Never spawn
   the reasoning agent with no model, and never error. When `deep` was explicitly requested,
   note the fallback once in the output, e.g.
   `Deep mode requested, but no models.reasoning configured — drafting inline.`

   **If the trigger does not fire at all**, proceed to step 10 unchanged. The inline path
   remains the default for everything that is not deep-triggered.

   **b. Spawn the reasoning sub-agent**

   ```
   Task tool parameters:
   - subagent_type: "general-purpose"
   - model: [reasoning_model]        ← always present on this path; if it were absent we would have fallen back above
   - description: "Draft elaboration for task #NNN"
   - prompt: |
       Draft the elaboration sections for a plans-cc task. You are drafting ONLY —
       you do not write any files, ask any questions, or modify the task.

       ## Task
       [Task title, `## What` section content, and task type]

       ## Project Context
       [The CONTEXT.md summary prepared in step 7: tech stack, key patterns, key files]

       ## Research Findings
       [The full structured findings from the step 8 Explore agent: Relevant Files,
        Current Patterns, Suggested Approach, Reusable Existing Code, Approach
        Warnings, Open Questions]

       ## Return Format
       Return ONLY these sections, as markdown, ready to be dropped into the task file:

       ### Why
       1-3 sentences on why this task matters.

       ### How Summary
       Follow the `### How Summary Generation` rules exactly: a 1-3 sentence technical
       overview of the approach, followed by a `**Files of note:**` bullet list naming
       the load-bearing files (path + a few words on its role).

       ### Diagnosis
       BUG TASKS ONLY — omit this section entirely for feature/refactor/chore tasks.
       Follow the `### Diagnosis Generation` rules exactly: the stated root-cause
       hypothesis with `**Most likely:**`, `**Evidence:**`, `**Confidence:**`, any
       `**Alternative:**` entries, and `**To confirm:**`. Those rules also govern how
       the `**To confirm:**` line becomes Step 1 of the How checkboxes below.

       ### How
       3-7 checkbox steps in the form `- [ ] Step N: [description]`.
       Tag observation steps with `👁` per the Observation Step Tagging Rules.

       ### Verification
       How to confirm the work is correct.

       ### Impact Scope
       OPTIONAL — include only if you can name concrete files to modify / related files.

       ### Open Questions
       Anything you had to guess at that the user should confirm. May be empty.
   ```

   The sub-agent's contract is identical in **form** to what the inline path produces —
   the `## How Summary` must follow the `### How Summary Generation` rules below, a bug
   task's `## Diagnosis` must follow the `### Diagnosis Generation` rules below, and the
   How checkboxes must follow the Observation Step Tagging Rules below. Point the
   sub-agent at those conventions in the prompt rather than restating them differently.

   Note that the Diagnosis is **not** exclusive to this path — Paths A, B, and C all
   generate it inline from the same `### Diagnosis Generation` rules. This step only
   changes *who drafts* it, exactly as it does for the How Summary.

   **c. What stays in the main loop (non-negotiable)**

   A sub-agent **cannot call `AskUserQuestion`**. Therefore this step moves *drafting* only,
   never gating. After the draft returns, continue into steps 10–14 as usual, with the
   sub-agent's draft standing in for the inline draft:

   - **Step 10's simplicity assessment** still runs, choosing Path A or Path B for the draft.
   - **Path A's single confirmation prompt** still runs in the main loop, presenting the sub-agent's Why/How/Verification.
   - **Path B's questions** (Why, approach, open questions, Verification) still run in the main loop, seeded by the sub-agent's draft and its `### Open Questions`.
   - **Step 12's validation confirmation** still runs on the drafted How steps.
   - **Step 14's file write, status flip to `elaborated`, read-back assertion, and assumption bullets** all still happen in the main loop, unconditionally.

   Do NOT move any of the above into the sub-agent, and do NOT let the sub-agent write to
   the task file.

   **d. Composability with `skip_mode`**

   `deep_mode` and `skip_mode` are orthogonal — `deep` selects the *drafter*, `skip` selects
   whether the *gates* auto-accept:

   - `deep` alone → draft via sub-agent, then confirm interactively (Path A/B prompts run normally).
   - `deep skip` → draft via sub-agent, then auto-accept every prompt, recording assumption bullets in step 12/14 exactly as skip mode does today.
   - `skip` alone → today's inline drafting, auto-accepted.
   - neither → today's behavior, unchanged.

   **e. Fallback after a failed spawn**

   If the sub-agent errors or returns unusable/incomplete output, fall back to inline drafting
   (step 10 onward) for this task and note it in the output. In a multi-task run this fallback
   is per-task — other tasks in the loop still attempt the reasoning spawn.

10. **Assess task simplicity**

   Evaluate whether the task is simple enough for auto-generation:

   **Task is SIMPLE if ALL are true:**
   - Research found ≤3 files to modify
   - Research "Suggested Approach" has ≤4 steps
   - Research "Open Questions" section is empty or absent
   - Task description is specific (mentions file, function, or config name)

   **Task is NOT simple if ANY are true:**
   - Task type is `refactor`
   - Research has open questions that need user input
   - Description contains: "investigate", "figure out", "explore", "design", "architecture"

11. **Fill out task sections (conditional flow)**

    Use `AskUserQuestion` for all user input. Never output questions as plain text.

    ---

    ### Path A: Simple Task (auto-generate with single confirmation)

    If task is simple (per step 10 criteria):

    1. **Auto-generate Why** based on task type:
       - Bug: "Improves reliability by fixing [specific issue from description]"
       - Feature: "Adds value by enabling [capability from description]"
       - Chore: "Maintains project health by [action from description]"

    2. **Auto-generate How** by converting research "Suggested Approach" directly to checkboxes:
       ```markdown
       ## How
       - [ ] Step 1: [First step from Suggested Approach]
       - [ ] Step 2: [Second step from Suggested Approach]
       ...
       ```

       **Tag observation steps** with `👁` (see tagging rules below).

       **Auto-generate the How Summary** per the `### How Summary Generation`
       rules below — derive the overview and "Files of note" list from these How
       steps plus the research "Relevant Files". No confirmation needed.

       **Auto-generate the Diagnosis (bug tasks only).** If `task_type` is `bug`,
       also auto-generate the `## Diagnosis` section per the `### Diagnosis
       Generation` rules below, derived from the step 8 diagnostic findings
       (`Candidate Causes`, `Symptom Trace`, `To Confirm`). No confirmation needed,
       same as the How Summary. Its `**To confirm:**` line becomes Step 1 of the How
       checkboxes above, per that block's linkage rule. For non-bug tasks, emit no
       Diagnosis section at all.

    3. **Auto-generate Verification** based on task type:
       - Bug: "Verify the issue no longer occurs; existing tests pass"
       - Feature: "Verify the new functionality works as expected; tests pass"
       - Chore: "Verify the change is applied correctly; no regressions"

    4. **Show single confirmation prompt**:

       **Skip mode shortcut:** If `skip_mode` is true, auto-select "Yes, proceed" and continue without calling `AskUserQuestion`.

       ```
       question: "This looks straightforward. Proceed with these defaults?"
       header: "Quick"
       options:
         - label: "Yes, proceed"
           description: "Use auto-generated Why/How/Verification"
         - label: "Let me review"
           description: "Walk through each section interactively"
       ```

    - If "Yes, proceed": Skip to step 12 (Validate How steps)
    - If "Let me review": Fall through to Path B below

    ---

    ### Path B: Complex Task (full interactive flow)

    If task is complex OR user chose "Let me review":

    **Why section:**

    **Skip mode shortcut:** If `skip_mode` is true, auto-select the first option (suggested purpose) and continue without calling `AskUserQuestion`.

    Use AskUserQuestion with options based on task type:
    ```
    question: "Why is this task important?"
    header: "Purpose"
    options:
      - label: "[Suggested purpose based on research]"
        description: "Based on codebase analysis"
      - label: "Different reason"
        description: "I'll explain the purpose"
    ```
    - Bug tasks: Suggest "Improves reliability by fixing [specific issue]"
    - Feature tasks: Suggest "Adds value by enabling [capability]"
    - Refactor tasks: Suggest "Improves maintainability by [improvement]"

    **How section (with checkboxes):**
    First, present research findings as a brief summary (not questions):
    ```
    Research findings:
    - Relevant files: [list from sub-agent]
    - Current patterns: [brief summary]
    - Suggested approach: [numbered steps]
    ```

    **Skip mode shortcut:** If `skip_mode` is true, auto-select "Yes, proceed" and continue without calling `AskUserQuestion`.

    Then use AskUserQuestion for approach confirmation:
    ```
    question: "Does this implementation approach look correct?"
    header: "Approach"
    options:
      - label: "Yes, proceed"
        description: "Use the suggested approach as-is"
      - label: "Modify approach"
        description: "I have changes to suggest"
      - label: "Different approach"
        description: "I want to take a different direction"
    ```

    If there are open questions from research, ask them via AskUserQuestion:

    **Skip mode shortcut:** If `skip_mode` is true, auto-select the first option for each question and continue without calling `AskUserQuestion`.

    ```
    question: "[Specific technical question, e.g., 'Should the association be optional?']"
    header: "Design"
    options:
      - label: "[Option A]"
        description: "[Explanation of option A]"
      - label: "[Option B]"
        description: "[Explanation of option B]"
    ```

    Document the agreed approach as **checkbox items**:
    ```markdown
    ## How
    - [ ] Step 1: Description of first task
    - [ ] 👁 Step 2: Add logging and run app to observe output
    - [ ] Step 3: Description of third task
    ```
    - Each checkbox should be a concrete, completable action
    - Aim for 3-7 checkboxes per task (break down large tasks, combine trivial ones)
    - Include file paths where relevant: `- [ ] Update timeout handling in \`src/auth/login.ts\``
    - **Tag observation steps** with `👁` (see tagging rules below)

    **How Summary:** Once the How steps are agreed, generate the `## How Summary`
    section per the `### How Summary Generation` rules below — a 1-3 sentence
    overview plus the "Files of note" list, derived from the How steps and research
    "Relevant Files". In skip mode this is auto-accepted; interactively you may show
    it for confirmation, but keep it lightweight (no separate question is required).

    **Diagnosis (bug tasks only):** If `task_type` is `bug`, also generate the
    `## Diagnosis` section per the `### Diagnosis Generation` rules below, derived
    from the step 8 diagnostic findings. Same lightweight treatment as the How
    Summary — no separate user question; auto-accepted in skip mode and shown only
    in passing when interactive. Its `**To confirm:**` line becomes Step 1 of the
    agreed How steps, per that block's linkage rule. For non-bug tasks, emit no
    Diagnosis section at all.

    **Verification section:**

    **Skip mode shortcut:** If `skip_mode` is true, auto-select the first option (suggested verification) and continue without calling `AskUserQuestion`.

    Use AskUserQuestion for verification criteria:
    ```
    question: "How should we verify this task is complete?"
    header: "Verify"
    options:
      - label: "[Suggested verification based on task type]"
        description: "[Details of suggested verification]"
      - label: "Different criteria"
        description: "I'll specify verification steps"
    ```
    - Bug: Suggest "Verify the [issue] no longer occurs when [trigger]"
    - Feature: Suggest "Verify [capability] works by [test steps]"
    - Refactor: Suggest "Verify existing tests pass, code is cleaner"

    ---

    ### Path C: Further Elaboration (task already elaborated or in-progress)

    If task status is `elaborated` or `in-progress`:

    1. **Show current state:**
       ```
       Task #NNN: [Title]
       Status: [elaborated/in-progress]

       Current steps:
       - [x] Step 1: Already completed step
       - [x] Step 2: Another completed step
       - [ ] Step 3: Pending step
       - [ ] Step 4: Another pending step

       What would you like to add or change?
       ```

    2. **Use AskUserQuestion to determine intent:**

       **Skip mode shortcut:** If `skip_mode` is true, auto-select "Research more" and continue without calling `AskUserQuestion`. After spawning the research agent, auto-accept its findings.

       ```
       question: "What additional elaboration do you need?"
       header: "Elaborate"
       options:
         - label: "Add more steps"
           description: "Add new steps to the How section"
         - label: "Refine existing steps"
           description: "Break down or clarify existing steps"
         - label: "Update verification"
           description: "Change how completion is verified"
         - label: "Research more"
           description: "Spawn research agent for additional context"
       ```

    3. **Based on user selection:**

       **If "Add more steps":**
       - Ask what additional work is needed
       - Append new unchecked steps to the How section (after existing steps)
       - Keep all existing checkboxes in their current state

       **If "Refine existing steps":**
       - Show numbered list of current incomplete steps
       - Ask which step(s) to refine
       - Replace selected step(s) with more detailed breakdown
       - Keep checked steps unchanged

       **If "Update verification":**
       - Show current Verification section
       - Ask for updated verification criteria
       - Replace Verification section content

       **If "Research more":**
       - Spawn Explore agent (same as step 8, including its model rule: `model: [research_model]` when `models.research` is set, no `model:` parameter at all when absent) with focus on remaining work
       - Present findings and ask what to add/change
       - Update How section based on new research

    4. **Preserve existing state:**
       - Do NOT change status (keep `elaborated` or `in-progress`)
       - Do NOT reset any checkboxes
       - Only add to or refine existing content

    5. **Refresh the How Summary:** Whenever How steps are added or refined,
       regenerate the `## How Summary` per the `### How Summary Generation` rules
       below so its overview and "Files of note" list stay in sync with the updated
       How steps. (Leave it untouched if only the Verification section changed.)

    6. **Refresh the Diagnosis (bug tasks only):** If `task_type` is `bug`, whenever
       How steps are added or refined, **regenerate** the `## Diagnosis` per the
       `### Diagnosis Generation` rules below — following the How Summary precedent
       exactly. Regenerate it in place; never append a second Diagnosis section.
       (Leave it untouched if only the Verification section changed.) The one thing
       regeneration must carry forward: any hypothesis already struck through as
       disproved stays struck through — that block's never-delete rule outranks a
       clean rewrite.

       Path C's "Research more" re-run inherits the step 8 diagnostic variant
       automatically — it spawns the same research agent *by reference* (`same as
       step 8`), so a re-elaborated bug task gets fresh `Candidate Causes` /
       `Symptom Trace` / `To Confirm` findings with no extra wiring here.

    ---

    ### Observation Step Tagging Rules

    When generating How checkboxes (in any path above), tag steps with `👁` if they require user observation:

    ```markdown
    - [ ] 👁 Step N: Add request logging and run the app to observe output
    ```

    **Tag with `👁` when:**
    - The step requires the user to manually run, view, or verify something the agent cannot observe (mobile simulator, browser UI, terminal output from a running app, visual appearance, etc.)
    - The step adds instrumentation/logging/debugging where the output requires running the app in a way the agent can't (e.g., mobile simulator, browser, GUI app)

    **Do NOT tag when:**
    - The agent can verify the result itself (running tests, checking file contents, CLI output from build commands)
    - The step writes automated tests or assertions

    **Instrumentation dependency rule:** If a step adds instrumentation/logging solely to inform a subsequent fix step, place them in separate checkboxes so execution can pause between them. Note this relationship in the step description, e.g.:
    ```markdown
    - [ ] 👁 Step 3: Add request logging to track API response times (observation needed before optimization)
    - [ ] Step 4: Optimize slow endpoints based on logging results
    ```

    ---

    ### How Summary Generation

    The `## How Summary` section is a scan-friendly technical "in a nutshell" that
    sits **strictly between `## Why` and `## How`** in the task file. It lets a
    reader grasp the approach and the files in play without reading every step.

    **Format (exactly this shape):**
    ```markdown
    ## How Summary
    [1-3 sentence technical overview of the approach — what changes and how, at a high level.]

    **Files of note:**
    - `path/to/file.ext` — [one-line role in this change]
    - `path/to/other.ext` — [one-line role in this change]
    ```

    **Generation rules:**
    - **Auto-derived, never prompted.** The How Summary is authored automatically
      from material already gathered — there is NO separate user question for it.
      In skip mode it is generated without confirmation (same as the How steps).
    - **Overview line(s):** 1-3 sentences describing the approach at a high level.
      Summarize the *shape* of the work, not the steps. Do NOT restate the How
      checkboxes one-for-one — the step-by-step detail lives in `## How`.
    - **Files of note:** auto-derive the bullet list from (a) the file paths
      referenced in the How checkboxes and (b) the research "Relevant Files" from
      the sub-agent findings. De-duplicate, list the most load-bearing files (aim
      for the handful that matter, not an exhaustive dump), and give each a terse
      one-line role. If no concrete files are known yet, omit the bullet list and
      keep just the overview line.
    - **Stay in sync with How.** The How Summary must always reflect the current
      How steps and their files. Whenever the How section is generated, regenerated,
      or refined, regenerate the How Summary so the two never drift apart.

    ---

    ### Diagnosis Generation

    The `## Diagnosis` section states the root-cause hypothesis for a bug **out loud**,
    so it can be reviewed. Without it the theory still forms — it just hides inside a How
    step ("Re-fetch the CSRF token at `src/auth/session.ts:142`"), a causal claim with no
    stated evidence and no confidence. It sits **strictly between `## How Summary` and
    `## How`** in the task file.

    **Bug tasks only.** Generate this section when `task_type` is `bug`. Never emit it for
    `feature`, `refactor`, or `chore` tasks — for those there is no symptom to explain, and
    an empty Diagnosis is worse than none.

    **Format (exactly this shape):**
    ```markdown
    ## Diagnosis

    **Most likely:** [the cause, in one sentence] (`path/to/file.ext:142`)
    **Evidence:** [what in the code or trace supports this]
    **Confidence:** high | medium | low

    **Alternative:** [a competing cause] (`path/to/other.ext:88`) — **Confidence:** low

    **To confirm:** [the single observation that would best discriminate between these]
    ```

    **Generation rules:**
    - **Auto-derived, never prompted.** Built automatically from the step 8 diagnostic
      findings — `### Candidate Causes` (top-ranked → **Most likely**, the rest →
      **Alternative** entries), `### Symptom Trace` and `### Relevant Files` (→ **Evidence**),
      and `### To Confirm`. There is NO separate user question for it. In skip mode it is
      generated without confirmation (same as the How Summary).
    - **Three mandatory labelled elements:** `**Most likely:**`, `**Confidence:**`, and
      `**To confirm:**`. Everything else is optional — `**Alternative:**` entries are zero or
      more, each carrying its own confidence.
    - **Confidence is `high`, `medium`, or `low`.** Exactly these three words. Not a
      percentage, not a numeric rank, not the two-valued `[high]`/`[low]` vocabulary used by
      assumption bullets.
    - **Cite `file:line` evidence** for the most-likely cause and for each alternative, when a
      concrete location is known. A hypothesis with no evidence pointer is a guess; say so by
      marking its confidence `low`.
    - **This is a hypothesis, not a finding.** Word it as a theory under test, never as settled
      fact. "Most likely the token is read before the refresh completes" — not "The token is
      read before the refresh completes." If execution proves it right, that promotion happens
      later, in the record of the work; it is not the elaborator's call to make.
    - **A disproved hypothesis is struck through or annotated — NEVER deleted.** When a
      candidate is ruled out, keep it and mark it (`~~[cause]~~ — disproved: [what ruled it
      out]`). Knowing what was already ruled out is the most valuable thing the section holds;
      deleting it invites re-investigating the same dead end. The real hazard is the opposite:
      a confidently-worded wrong hypothesis left in place with no annotation.
    - **Stay in sync with How.** Whenever the How section is generated, regenerated, or
      refined, regenerate the Diagnosis alongside it — the How steps *are* the fix implied by
      the hypothesis, so the two must never drift apart.

    **Linking `**To confirm:**` into `## How` (mandatory).**

    When a bug task has a `## Diagnosis`, its `**To confirm:**` line MUST become
    **Step 1** of `## How`, with the first *fix* step coming after it. Confirm the
    hypothesis, then fix — never the reverse. Without this link the drafter states a
    theory and then immediately builds a fix on top of it while it is still unconfirmed,
    which is exactly the defect the Diagnosis section exists to prevent.

    **Tag that Step 1 with `👁` only when confirmation requires the user to observe
    something the agent cannot** — reproducing in a simulator or browser, reading the
    output of a running app, judging visual appearance.

    **Do NOT tag it when the confirmation is agent-verifiable** — adding a failing unit
    test that reproduces the bug, grepping for the suspect branch, running an existing
    test, or inspecting file contents. This is not a new exception: it is the existing
    `### Observation Step Tagging Rules` above ("the agent can verify the result itself",
    "the step writes automated tests or assertions") applied here. Tagging a CLI-verifiable
    confirmation would bolt a spurious pause point onto an ordinary bug fix and make bug
    execution needlessly interactive.

    ```markdown
    ## How
    - [ ] 👁 Step 1: Reproduce the stale-token 401 in the browser after a 30-minute idle (confirms the Diagnosis before any fix)
    - [ ] Step 2: Re-fetch the CSRF token on session refresh in `src/auth/session.ts`
    ```
    ```markdown
    ## How
    - [ ] Step 1: Add a failing unit test that reproduces the off-by-one on an empty page (confirms the Diagnosis; agent-verifiable, so untagged)
    - [ ] Step 2: Fix the boundary condition in `src/paginate.ts`
    ```

    When the confirm step *is* `👁`-tagged, the existing machinery already does the rest:
    `plan-execute` ends its segment at an observation step, and the **Instrumentation
    dependency rule** above already describes this confirm-then-fix shape. Nothing in the
    `👁` machinery needs to change for bug tasks.

12. **Validate How steps against codebase**

    After generating the How section, validate each step:
    - For steps referencing specific files, functions, or hooks: confirm they exist using Glob/Grep
    - For steps proposing new abstractions (new utility, new hook, new helper): search for existing functionality that overlaps
      - If existing solution found: revise the step to reuse it instead of creating something new
    - If a file path referenced in a step is wrong: correct it

    Show user what was adjusted (if anything). If 2+ steps needed correction, use AskUserQuestion to confirm the adjusted plan:

    **Skip mode shortcut:** If `skip_mode` is true, auto-select "Yes, proceed" and continue without calling `AskUserQuestion`.

    ```
    question: "I adjusted N steps based on codebase validation. Does this revised plan look correct?"
    header: "Validation"
    options:
      - label: "Yes, proceed"
        description: "Use the validated plan as-is"
      - label: "Let me review"
        description: "Show me the details of what changed"
    ```

13. **Generate Impact Scope** (for tasks touching 3+ files)

    If the How section references 3 or more files to modify, generate an Impact Scope section:
    ```markdown
    ## Impact Scope

    ### Files to Modify
    - [ ] `path/to/file1.ext` — [what changes]
    - [ ] `path/to/file2.ext` — [what changes]

    ### Related Files (may need updates)
    - `path/to/related1.ext` — [why it might be affected]

    ### Endpoints/UI Affected
    - [endpoint or UI element] — [expected change]
    ```

    Validation:
    - Every file path must exist (verify with Glob)
    - Cross-reference with How steps — every file in Impact Scope should be addressed by at least one How step
    - If fewer than 3 files: skip this section entirely

14. **Update task file**
    - **Set Status to `elaborated` (do this first, as its own action — it must not be lost in the prose below):** Change Status from `pending` to `elaborated` — rewrite the `**Status:** pending` header line to `**Status:** elaborated`. The file stays in `.plans/pending/`. This from→to rewrite fires only when the current status is `pending`; if the header already reads `elaborated`, `in-progress`, or any later status (a direct `/plan-elaborate NNN` re-run on an already-advanced task), **leave the existing status untouched** — do not force it back to `elaborated`.
    - Fill in Why, How Summary, Diagnosis (bug tasks only), How, Verification, and Impact Scope (if applicable) sections
    - Write the `## How Summary` section **between the `## Why` and `## How` sections**
      (replacing its `_To be filled during elaboration_` placeholder), per the
      `### How Summary Generation` rules
    - **Bug tasks only:** write the `## Diagnosis` section **between the `## How Summary`
      and `## How` sections**, per the `### Diagnosis Generation` rules. Write it
      regardless of which drafter produced it (Path A, Path B, Path C, or the step 9.5
      reasoning sub-agent). On a re-elaboration, replace the existing Diagnosis in place
      rather than appending a second one — carrying forward any struck-through disproved
      hypotheses. For non-bug tasks, write no Diagnosis section at all.

    **Propose a build-skill route (only when warranted, never auto-applied):** If the task clearly describes building one or more design-system components/sections AND the project has a `design-system/` directory, propose adding a `**Build:**` field to the task header so `/plan-execute` will route the build through the real `des-build` skill instead of the generic executor. Format (alongside `**Type:**` / `**Status:**`):
    ```
    **Build:** des-build · <Component1>, <Component2>
    ```
    The unit list is the component/section name(s) to build, each becoming one des-build invocation. **This is a deliberate gate, not inference:** surface the suggestion in the normal elaboration interaction and only write the field once the user agrees (in `skip_mode`, you may auto-pick it like any other elaboration decision, but record it as a `- [low]` assumption per the tracking rules below). Never sniff this from task-body keywords on later runs — `/plan-execute` reads the field only, never the body.

    **Skip-mode assumption tracking:** If `skip_mode` is true, every auto-accepted prompt in steps 11–12 (Path A confirmation, Path B Why/approach/open-questions/Verification, Path C intent, Path-C "Research more" auto-accept, step 12 validation confirmation) represents a decision made on the user's behalf without explicit input. Capture each such auto-pick as a bullet under the task's `## Assumptions > Initial (from elaboration)` subsection. If the subsection contains a `_To be filled..._` placeholder, replace it; otherwise append.

    **Bullet format:**
    ```
    - [high|low] [short statement of what was decided]. **Why:** [brief rationale grounded in research]
    ```

    **Tagging heuristics — apply these consistently:**

    Tag `- [high]` (clear pattern-match decision) when ANY of:
    - Research returned ≥3 examples of the same pattern in the codebase
    - Only one plausible library/approach surfaced in research
    - Behavior is clearly documented in CLAUDE.md or referenced docs
    - The chosen option had no plausible alternative in the research findings

    Tag `- [low]` (judgement call worth flagging for review) when ANY of:
    - Research returned <3 examples or conflicting examples
    - Multiple plausible approaches surfaced and we picked the first
    - The chosen path requires an assumption about an external API or data shape not present in the codebase
    - It's a UX or scope decision the source description didn't specify
    - The research "Open Questions" section had unresolved items relevant to this pick

    Skip auto-picks that are pure formatting/process (e.g., "Yes, proceed" on the Path A confirmation when nothing substantive was decided) — only capture picks that represent a real design or scope decision.

    If `skip_mode` is false, do not write any Initial assumptions — that subsection is reserved for skip-mode elaboration. Leave any existing placeholder text intact.

    - Write the updated file
    - **Read-back assertion (verify the status flip actually landed):** Immediately after writing, re-read the task file and confirm the `**Status:**` line now reads `elaborated` (or the later status it was intentionally left at per the from→to rule above — it must NOT read `pending` after a `pending`→`elaborated` elaboration). If it still reads `pending`, rewrite the `**Status:**` line to `elaborated` and write the file again. If the correction cannot be made to stick (e.g. repeated write failure, file not writable), **hard-stop the chain**: do NOT proceed to step 15, do NOT auto-execute, and surface the problem clearly to the user — a task left at `pending` can make `/plan-execute` mis-detect its lifecycle mode, so silently continuing is not safe.

15. **Register project (best-effort telemetry)**
    - Run via Bash, best-effort and silent: `node ~/.claude/plans-cc/plan-touch.js "$PWD" 2>/dev/null || true`
    - This registers the project in the system-wide plans registry for the desktop dashboard.
    - Ignore any error and do NOT surface output to the user. Never let this break the skill.

16. **Commit .plans/ changes**
    - Check if inside a git repo: `git rev-parse --git-dir 2>/dev/null`
    - If not a git repo: skip silently
    - Check if `.plans/` is gitignored: `git check-ignore -q .plans 2>/dev/null`
    - If exit code 0 (ignored): skip silently
    - Read `.plans/config.json` for `git_commits` setting
    - If `git_commits` is not `true`: skip silently
    - Check for uncommitted changes in .plans/: `git status --porcelain .plans/`
    - If no changes: skip silently
    - Commit:
      ```bash
      git add .plans/
      git commit -m "plan: elaborate #NNN - [title]"
      ```
    - If commit fails (e.g. hooks): warn but do not fail the skill

17. **Display confirmation**

    **If part of multi-task loop (multiple `task_ids`):** show abbreviated confirmation:
    ```
    Elaborated #NNN: [Title] (N steps)
    ```
    Then add task to `elaborated_tasks` list and continue to next task.

    **If single task:** show full confirmation. Echo the `Status:` line from the
    `**Status:**` value actually read back from the task file in step 14 — do NOT
    print a hardcoded `elaborated` literal, so a flip that failed to land surfaces
    here instead of being masked by an optimistic constant:
    ```
    Elaborated task #NNN: [Title]
    Status: [actual **Status:** value read back from the file]

    Steps (0/X complete):
    - [ ] Step 1: ...
    - [ ] Step 2: ...
    [etc.]

    Verification:
    [Brief summary of Verification section]

    Next: /plan-execute NNN to start working
    ```

    End-of-action marker (final line): `🟢 ELABORATED · Task #NNN → Next: /plan-execute NNN`

    (When elaborate is running as part of an auto-chain that will immediately execute — e.g. `auto_execute` from `/plan-capture` — suppress this marker; the downstream execute skill emits the final marker.)

    **STOP after displaying this confirmation. Do not proceed to execution.** The user must explicitly invoke `/plan-execute` to begin implementation. If the user responds with feedback or tweaks to the elaboration, apply the changes to the task file and re-display this confirmation — but do NOT start executing the task.

18. **Display multi-task summary**

    Only shown when multiple tasks were processed. If only one task was processed, skip this step entirely.

    ```
    Elaboration Summary

    Elaborated (N of M):
    - #001 - Fix login timeout bug (5 steps)
    - #003 - Add dark mode (4 steps)

    [If any skipped:]
    Skipped (N):
    - #002 - Already completed
    - #999 - Not found

    Next: /plan-execute 1 (or /plan-execute 3)
    ```

    End-of-action marker (final line): `🟢 ELABORATED · N tasks → Next: /plan-execute <first-id>`

    **STOP after displaying this summary. Do not proceed to execution.** The user must explicitly invoke `/plan-execute` to begin implementation. If the user responds with feedback or tweaks to the elaboration, apply the changes to the task file(s) and re-display this summary — but do NOT start executing any task.

## Edge Cases

- **No ID argument**: List pending/elaborated tasks and ask
- **Description instead of ID**: Auto-capture the task, then elaborate the new task
- **Already elaborated or in-progress**: Treat as request for further elaboration (Path C)
- **Task not found**: Error with suggestion to run `/plan-list`
- **No pending tasks**: "No tasks to elaborate. Run `/plan-capture` to add one."
- **CONTEXT.md is minimal**: Still proceed, note that context is limited
- **Task tool unavailable**: Fall back to direct Glob/Grep/Read research
- **Sub-agent returns incomplete findings**: Supplement with direct research or ask user
- **Further elaboration on completed task**: Suggest `/plan-reopen` first
- **Multiple IDs with some invalid**: Skip invalid tasks with warning, continue elaborating valid ones
- **All IDs invalid**: Show error listing each invalid ID and reason
- **Duplicate IDs**: Deduplicate silently (e.g., "1 1 3" becomes IDs `001`, `003`)
- **Skip mode with no IDs**: Remember skip mode, prompt for IDs, then elaborate in skip mode
- **Skip mode with Path C**: Auto-select "Research more", auto-accept findings
- **Mixed pending/elaborated in multi-ID**: Each task follows its own path (A/B/C) independently
- **Sub-agent failure in multi-task**: Log error for that task, skip it, continue to next
- **Description with skip mode**: Auto-capture then elaborate in skip mode (e.g., `/plan-elaborate Fix login bug skip`)
- **Auto-capture failure**: Print error and stop — do not attempt elaboration without a task file
- **Description that looks like numbers**: If ALL tokens are numeric, they're IDs, not a description. "42" is ID 042. "Fix bug 42" is a description (has non-numeric tokens).
- **User responds with tweaks after elaboration**: Apply the requested changes to the task file (update How steps, Why, Verification, etc.), re-display the confirmation, and STOP. Do not proceed to execution — the user must invoke `/plan-execute` explicitly.
- **Description containing "deep" mid-string**: `deep_mode` stays false and the description is captured verbatim. `/plan-elaborate Add deep linking support` auto-captures "Add deep linking support" — `deep` is not the final token, so it is part of the description, never a keyword. This is why `deep` detection is END-anchored while `skip` is per-token.
- **Description legitimately ENDING in the word "deep"**: the trailing token is consumed as the keyword — `/plan-elaborate Make the search index deep` captures "Make the search index deep" **minus** the final word and turns deep mode on. This is the accepted, documented cost of a trailing keyword (identical to `/plan-capture`'s trailing phrases). To keep such a description intact, rephrase it (`Make the search index deeper`, `Deepen the search index`) or capture first with `/plan-capture` and elaborate by ID.
- **`deep` with no IDs** (`/plan-elaborate deep`): after stripping, nothing remains — so there is no description and no IDs. Retain `deep_mode`, prompt for IDs (step 4), then deep-elaborate the tasks the user names. Same handling as `/plan-elaborate skip`.
- **`deep` and `skip` together**: they compose and are order-independent, because skip stripping runs first. `deep` alone = draft via sub-agent then confirm interactively; `deep skip` = draft via sub-agent then auto-accept with assumption bullets.
- **`deep` with multiple IDs**: each task in the loop is deep-elaborated independently; a reasoning-spawn failure on one task falls back to inline drafting for that task only.
- **`deep` requested but `models.reasoning` absent**: fall back to today's inline drafting silently — never spawn a reasoning sub-agent with no model, and never error. Note it once in the output.
- **`deep` requested but the Task tool is unavailable**: same fallback — inline drafting.
