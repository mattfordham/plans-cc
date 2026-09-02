---
name: plan-explain
disable-model-invocation: false
argument-hint: "<id>"
allowed-tools:
  - Read
  - Glob
description: Explain a task as a conceptual model — the core idea, three bullets, and why this shape
---

# plan-explain

Explain how to *think about* a task: the core idea in one line, three bullets of conceptual model, and the design tension the shape resolves.

This is the top rung of the altitude ladder — `## Why` says why the work matters, `## How Summary` says what the technical approach and files are, `## How` says what the steps are, and `/plan-explain` sits **above all three**: *how to hold this in your head*. The highest-value case is a completed task read cold weeks later, when the reasoning behind a design has evaporated and only the diff remains.

**This skill is synthesis, not display.** `/plan-show` already prints every field. If your output could have been produced by copying sections out of the task file, you have not run this skill — you have run `/plan-show` badly. Read the material, build a mental model from it, and write *that*.

This skill is strictly read-only. It never writes, edits, or moves a file.

## Arguments

- `$ARGUMENTS`: Task ID (e.g., "1", "01", or "001")

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`: ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd` there. Do NOT skip this.
   - If no root is found, error: "Not initialized. Run `/plan-init` first."

2. **Parse and resolve task ID**
   - Accept flexible ID formats: "1", "01", "001"
   - Zero-pad to 3 digits for file lookup
   - Search `.plans/pending/NNN-*.md`, `.plans/backlog/NNN-*.md`, and `.plans/completed/NNN-*.md` (a backlogged task stays findable by ID)

3. **Handle missing ID argument**
   - If no `$ARGUMENTS`, list all tasks and ask which to explain:
     ```
     Which task do you want explained?

     Active:
     #001 - Fix login timeout bug (in-progress)
     #002 - Add dark mode (elaborated)

     Completed:
     #003 - Initial setup (completed)
     ```

4. **Validate task exists**
   - If not found in any of the three directories: "Task #NNN not found. Run `/plan-list` to see available tasks."

5. **Read the task file as raw material**

   Read the whole file. Every section is *input to your thinking*, not output to be reprinted:

   | Section | What to mine it for |
   |---------|--------------------|
   | `## What` | The scope boundary — what is and is not in play |
   | `## Why` | The problem being solved; the gap in the world before this work |
   | `## How Summary` | The technical shape and the load-bearing files |
   | `## Diagnosis` | *Bug tasks only* — the root-cause hypothesis, its confidence, and anything struck through as disproved (a ruled-out cause is often the sharpest input to block 3) |
   | `## How` | The sequence — and, more usefully, the *dependency structure* between steps |
   | `## Verification` | What "working" means, which reveals what the design actually guarantees |
   | `## Impact Scope` | Blast radius; which files are central vs. incidental |
   | `## Assumptions` | **The richest source for block 3** — especially `[low]`-tagged judgment calls and any rejected alternative |
   | `## Changes` | *Completed tasks* — what was actually built, which may differ from the plan |
   | `## Notes` | Decisions explicitly recorded as "do not re-litigate" |

   A **completed** task carries materially richer material than an in-flight one: `## Changes` records what was really built, and `### Discovered during execution` assumptions record the calls that only surfaced under contact with the code. Prefer that lived record over the plan's prediction wherever the two disagree — and say so if the difference is itself the interesting part.

6. **Synthesize the three blocks**

   Think before you write. Ask: *if I had to hand this design to someone in thirty seconds, what would I say?* The answer is block 1. *What are the two or three moving parts and how do they hang together?* That is block 2. *What would a competent person have done instead, and why is that wrong here?* That is block 3.

   Output exactly this shape and nothing else — no preamble, no restated task metadata, no headings beyond these:

   ```
   # Task #NNN: [Title]

   **[The core idea in one line.]**

   ## The model
   - **[Piece]** — [what it is and how it relates to the others]
   - **[Piece]** — [what it is and how it relates to the others]
   - **[Piece]** — [what it is and how it relates to the others]

   ## Why this shape
   [The obvious alternative, and the tension that rules it out.]
   ```

   **Block 1 — the core idea in one line.**
   - One sentence. The analogy or the reframe — the thing that makes the rest click.
   - The register wanted is a *reframe*, e.g. "this makes backlog a **location** rather than a **status**," or "the registry is a self-registering index, not a scan."
   - No preamble ("This task is about…"), no hedging, no second sentence.

   **Block 2 — three bullets: the conceptual model.**
   - **Exactly three.** Not two, not five. The constraint is the feature: three is what a reader can hold at once, and forcing the count forces you to decide what is load-bearing.
   - Name the load-bearing **pieces** and — critically — **how they relate**. A bullet that names a piece without stating its relationship to the others is half a bullet.
   - This is **not a file list** and **not a restatement of the How steps**. If your three bullets map one-to-one onto three files or three checkboxes, you have transcribed rather than synthesized. Start over.
   - A piece may be a file, but it may equally be a contract, an invariant, a data shape, a boundary, or a direction of dependency. Prefer whichever carries the meaning.
   - Concepts over mechanics: "the flag's *presence* is the opt-in, so absence silently no-ops everywhere" beats "reads `styleguide:` from `config.md`."

   **Block 3 — why this shape, not the obvious alternative.**
   - This is the block nothing else in the library captures, and the one most worth having. It answers: *what did this design decline to do, and why?*
   - Source it from `## Assumptions` (rejected alternatives, and `[low]`-tagged calls where a genuine fork existed), from `## Why`, from `## Notes` decisions, and from any "instead of / rather than / not X but Y" reasoning in `## How Summary` or `## Changes`.
   - Two to four sentences. Name the alternative concretely, then the tension that rules it out.
   - **If the task genuinely records no rejected alternative, OMIT this block entirely.** Do not invent a strawman, and do not manufacture a tension the source material never states. Omitting is the correct, honest outcome — the same sparse-section discipline `/plan-show` applies to an empty Why or a placeholder How Summary. When omitted, drop the `## Why this shape` heading too; do not print an empty section.

7. **Guard against field-printing**

   Before emitting, check your draft against these. Any hit means rewrite, not ship:
   - A sentence lifted verbatim (or near-verbatim) from `## Why` or `## How Summary`.
   - Three bullets that are the first three `## How` checkboxes reworded.
   - Three bullets that are three filenames with descriptions.
   - A block-1 line that describes *what the task does* rather than *how to think about it*.
   - Any section from the task file reproduced that is not one of the three blocks.

   Length discipline: the whole output should fit on one screen. Longer means you are dumping, not explaining. Do not add a summary, a next-steps list, or an offer to elaborate.

8. **End-of-action marker**
   - Output as the final line (read-only — no "Next:" tail): `🔵 EXPLAINED · Task #NNN`

## Edge Cases

- **No ID argument**: List tasks and prompt for selection (step 3). Do not guess a task.
- **Task not found**: Error with suggestion to run `/plan-list`.
- **Un-elaborated pending task** (status `pending`; `## Why`/`## How Summary` empty or still `_To be filled during elaboration_`, no How checkboxes): there is not enough material to build a model from. Do NOT invent one from the title. Say so and stop:
  ```
  Task #NNN hasn't been elaborated yet — there's only a one-line description to work
  from, which isn't enough to explain a design that doesn't exist yet.

  Run `/plan-elaborate NNN` first, then `/plan-explain NNN`.
  ```
  Still end with the `🔵 EXPLAINED · Task #NNN` marker.
- **Elaborated but thin task**: If the task is elaborated but sparse, produce blocks 1 and 2 from what exists and omit block 3. Never pad.
- **No rejected alternative recorded**: Omit block 3 and its heading (step 6). This is expected and correct, not a failure.
- **Bug task with a disproved hypothesis**: A struck-through cause in `## Diagnosis` (`~~[cause]~~ — disproved: …`) is prime block-3 material — the obvious explanation that turned out to be wrong is exactly the alternative worth naming.
- **Completed task**: Prefer `## Changes` and `### Discovered during execution` assumptions over the plan's predictions; the lived record is the better source.
- **Malformed file**: Synthesize from whatever parses. Note in one line what could not be read, then proceed.
