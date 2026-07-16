---
name: plan-retrospect
disable-model-invocation: false
argument-hint: "[report | across | seed] [domain/keyword]"
allowed-tools:
  - Read
  - Write
  - Bash
  - Glob
  - Grep
  - Agent
  - AskUserQuestion
description: Mine completed plan history for named, ranked, cross-project lessons
---

# plan-retrospect

Mine the completed plan archive — within a project or across similar projects — and
turn its accumulated "what happened and why" into named, ranked, prescriptive lessons.
Every reopen, deferred `[low]` assumption, pause, and recurring file-of-note is a
symptom that means nothing alone but diagnoses a pattern in aggregate. This skill reads
that dormant signal and carries the lessons forward so the same tools and areas don't
get re-fought from scratch on the next similar build.

Three argument-selected modes share one analysis engine:

- **`report`** (default) — a single-project retrospective printed to the conversation
  only. Read-only, transient.
- **`across`** — a cross-project retrospective that enumerates other registered projects
  and mines the similar ones. Read-only, transient.
- **`seed`** — write the distilled lessons durably into this project's CONTEXT.md (and a
  standalone artifact) so a fresh project starts with "what bit you last time."

## Arguments

- `$ARGUMENTS`: An optional mode followed by an optional domain/keyword filter.
  - **Mode** (first token, optional): one of `report`, `across`, or `seed`. When the
    first token is not one of these, treat the mode as `report` (the default) and the
    whole argument string as the domain/keyword filter.
  - **`domain/keyword`** (remaining tokens, optional): a similarity/focus filter —
    e.g. a tech-stack term (`craft`, `rails`, `nextjs`), a project domain (`cms`,
    `ecommerce`), or a topic (`auth`, `worktree`). In `across` mode it narrows the set
    of projects considered similar; in `report`/`seed` it focuses the mined lessons on
    a theme. When omitted, the retrospective is unfiltered.
  - Examples: `/plan-retrospect` (report, unfiltered), `/plan-retrospect report worktree`
    (this project, focused on worktree churn), `/plan-retrospect across craft`
    (cross-project, Craft-CMS-similar), `/plan-retrospect seed cms` (write CMS lessons
    into CONTEXT.md).

## Steps

1. **Verify initialization**
   - Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`:
     ascend from cwd to the nearest ancestor containing `.plans/config.json`, then `cd`
     there. Do NOT skip this.
     - Before ascending, collapse a cwd inside a `.worktrees/<name>/` tree to the path
       just above `.worktrees` (in a worktree, `.plans` is a symlink up to the parent, so
       the parent genuinely is the project root).
     - Halt the ascent at two stop conditions: `$HOME` (inclusive — check it, then stop)
       and the filesystem root.
     - When the discovered root differs from cwd, `cd` to it and print exactly one line:
       `Using plans root: <path> (from <cwd>)`. When root == cwd, print nothing.
   - If no root is found, error with the exact text:
     `Not initialized. Run /plan-init first.`

2. **Parse the mode and filter**
   - Split `$ARGUMENTS` on whitespace. If the first token is `report`, `across`, or
     `seed`, that is the **mode** and the rest is the **domain/keyword** filter.
     Otherwise the mode is `report` and the entire argument string is the filter.
   - An empty `$ARGUMENTS` means `report` mode with no filter.
   - Hold the mode and filter for the mode dispatch below; both feed the shared mining
     engine.

3. **Mining engine (shared)** — see the **Mining Engine** section below. All three modes
   call into it. `report` mines this project; `across` mines the confirmed similar-project
   set; `seed` mines this project and then writes the result. The engine is a two-pass
   heat-map-then-deep-read scan delegated to a subagent so its I/O stays out of the
   transcript.

4. **Mode `report` (default) — transient single-project retrospective**
   - This is the mode when Step 2 resolved `report` (including the no-mode default).
   - Run the shared **Mining Engine** over THIS project's `.plans/` only (the single root
     that Step 1 `cd`'d into). Pass the `domain/keyword` filter through as a lesson focus.
   - Shape the distilled lesson candidates with the **Output Contract** — every lesson
     Named AND task-id-cited AND quantified; discard anything that cannot be. Order
     heaviest-evidence-first.
   - **Print the report block to the conversation ONLY. Write NO file** — `report` is
     read-only and transient; it never touches CONTEXT.md or the artifact (see the
     write-face gating in Step 6).
   - End with the read-only marker as the very last line, where `N` is the number of
     lessons actually emitted:
     ```
     🔵 RETROSPECT · N lessons
     ```
   - If the corpus yields no evidence-backed lessons, say so plainly (e.g.
     `No evidence-backed lessons yet — the completed archive is too thin to mine.`) and
     still end with `🔵 RETROSPECT · 0 lessons`. Never pad with generic filler.

5. **Mode `across` — cross-project retrospective**
   - This mode enumerates OTHER registered projects, narrows to the similar ones, and
     mines that confirmed set. It is read-only, exactly like `report`.

   1. **Enumerate registered project roots.** Read the machine-wide registry directly at
      `~/.claude/plans-cc/projects.json` (documented stable schema
      `{ version: 1, projects: [{ path, lastSeen }] }`). Use Bash/Read only — do NOT add
      a new lib or CLI, and do NOT shell out to `plan-touch`/registry helpers.
      - **Live-prune / tolerate.** Skip any listed `path` whose `<path>/.plans/` no longer
        exists on disk. Tolerate a missing, empty, or corrupt registry file — treat any of
        those as *zero other projects* (never an error).
      - Exclude THIS project's own root (the one Step 1 resolved) from the candidate set.

   2. **Degrade gracefully.** If, after pruning and excluding self, there are no other
      projects, fall back to a single-project `report`-style run over THIS project and say
      so explicitly (e.g. `No other registered projects to compare — showing this project
      only.`). Then follow the `report` output + marker rules from Step 4 and stop.

   3. **Hybrid similarity filter.** When other candidates exist, narrow to the *similar*
      ones using both signals together:
      - **(a) domain/keyword match** — match the `domain/keyword` arg against each
        candidate's completed-task titles and `## What` text (Grep the candidate's
        `<path>/.plans/completed/*.md`). When no filter was given, this signal is neutral.
      - **(b) tech-stack / overview match** — read each candidate root's
        `<path>/.plans/CONTEXT.md` and compare its Tech Stack / Overview signals against
        THIS project's CONTEXT.md (shared language, framework, or domain).
      - Auto-suggest the similar set from these two signals combined.

   4. **Confirmation gate (mandatory — never mine cross-project silently).** Present the
      auto-suggested set and use **`AskUserQuestion`** to let the user confirm or adjust
      exactly which projects will be mined BEFORE any cross-project mining runs. The user's
      confirmed selection is the mined set. Do not proceed to the engine until confirmed.

   5. **Mine and report.** Run the shared **Mining Engine** over the confirmed project set
      (multiple roots), apply the **Output Contract**, and **print the report block to the
      conversation ONLY — write NO file** (same read-only contract as `report`). The scope
      line names the number of similar projects mined.
   - End with the same read-only marker as `report`, as the very last line:
     ```
     🔵 RETROSPECT · N lessons
     ```

6. **Mode `seed` — the ONLY write mode (durable CONTEXT.md section + artifact)**
   - `seed` mines THIS project exactly like `report` (run the shared **Mining Engine** over
     this project's `.plans/`, apply the **Output Contract**). It may reuse a confirmed
     `across` set only if the user explicitly asks; the v1 default is this-project lessons.
   - **Write-face gating (load-bearing).** Both write faces below fire ONLY in `seed` mode.
     `report` and `across` NEVER write either face — so an autonomous invocation can never
     silently mutate CONTEXT.md. State this to yourself before writing: if the mode is not
     `seed`, do not write.

   1. **Write the CONTEXT.md section (section-preserving).** Fold the ranked lessons into a
      dedicated section titled exactly `## Lessons From Past Projects` in
      `.plans/CONTEXT.md`, following the section-preserving discipline `plan-context` uses
      (see `skills/plan-context/SKILL.md`): read the current CONTEXT.md, and
      - if a `## Lessons From Past Projects` section already exists, **replace that section
        in place** (from its heading up to the next `## ` heading or end-of-file), leaving
        every other section byte-for-byte untouched;
      - otherwise **append** the new section at the end of CONTEXT.md.
      - Never clobber the rest of CONTEXT.md. The section body is the Output Contract's
        ranked lessons + hot-spots block (without the trailing end-of-action marker line —
        that marker belongs to the conversation, not the file).

   2. **Write the durable standalone artifact.** Also write the full report to
      `.plans/artifacts/retrospective-<domain>.md`, where `<domain>` is a slug of the
      `domain/keyword` filter (lowercased, non-alphanumerics → `-`), or `all` when no
      filter was given. Create `.plans/artifacts/` first if it does not exist. This is the
      established durable-artifact convention (cf. the existing
      `.plans/artifacts/desktop-app-spec.md`). The artifact holds the complete report block
      (title, scope line, ranked lessons, hot spots) so it stands alone.

   3. **Report and mark.** Tell the user both write targets (the CONTEXT.md section and the
      artifact path). End with the write-face marker as the very last line — a `🟢`
      (write) marker naming the targets:
      ```
      🟢 RETROSPECT · CONTEXT.md + artifact
      ```

7. **Display the end-of-action marker (final line)**
   - Emit the mode-appropriate marker as the very last line of the response:
     - `report` / `across` (read-only): `🔵 RETROSPECT · N lessons`, where `N` is the
       number of lessons actually emitted (`0` when the corpus is too thin — never pad).
     - `seed` (write): `🟢 RETROSPECT · <target>`, where `<target>` names the write
       targets, e.g. `🟢 RETROSPECT · CONTEXT.md + artifact`.
   - Read-only markers take no `→ Next:` tail; the `seed` marker may point to the artifact
     path if useful.

## Mining Engine

The engine converts a set of one or more `.plans/` roots into a ranked list of hot
spots and the *why* behind each. It runs in two passes so the cheap countable work
scopes the expensive prose-reading work, and the whole thing is delegated to a subagent
(the `plan-status` pattern) so the raw scan never floods the user's transcript.

**Corpus.** For each root being mined, the corpus is:
- `.plans/completed/*.md` — the archived task files (the primary signal).
- `.plans/HISTORY.md` — the dense per-task completion summaries.

Treat a missing directory or file as empty (zero contributions), never an error.

### Pass 1 — Heat-map (cheap, countable, delegated)

Delegate the whole scan to ONE subagent so its Grep/Read/Glob calls stay out of the
user's window. Do NOT run the scan tools yourself.

- Print a single short line like `Mining plan history…` before the tool call (the only
  pre-report text the user should see).
- Spawn ONE Agent (`subagent_type: general-purpose`) with a prompt that instructs it to
  scan the corpus and return ONLY a compact structured report (no raw file contents).
  The subagent must, across every completed file (and HISTORY.md) in the mined root(s):

  1. **Files of note** — Grep `**Files of note:**` blocks and the bullet lines beneath
     them; tally how many *distinct tasks* name each file/path. A file recurring across
     many tasks is a hot spot (the area the work keeps returning to).
  2. **Reopen churn** — Grep `**Reopened:**` lines in the Notes section; count reopens
     per task and in aggregate. Reopens are the strongest "this fought back" signal.
  3. **Pause churn** — Grep `**Paused:**` lines in Notes; count pauses per task and in
     aggregate. Pauses proxy context-switch cost / blocked work.
  4. **Deferred low-confidence decisions** — Grep `- [low]` bullets under
     `### Discovered during execution` (and `### Initial (from elaboration)`); collect
     the decision text and its `**Why:**`. A cluster of `[low]` bullets around the same
     tool/file marks an area of repeated uncertainty.
  5. **Time proxy** — for each completed task, parse the `**Created:**` timestamp (header)
     and the completion date (from HISTORY.md or the completed-file archive metadata), and
     compute a Created→Completed day delta. This is a WEAK proxy for effort (polluted by
     idle time), used only to break ties and flag outliers — never presented as real duration.

  The subagent returns a compact ranked report: per-hot-spot the signal counts and the
  citing task ids, plus aggregate churn totals. No file dumps, no prose beyond the
  structured tallies.

**Ranking.** Score each hot spot by evidence weight, heaviest signal first: reopens >
pauses > `[low]` clusters > file-of-note recurrence, with the time-delta proxy as a
tiebreaker only. Keep the top N hot spots (aim for the 5-8 with the strongest evidence)
for the deep-read pass.

### Pass 2 — Deep-read (targeted, the *why*)

Only now read prose, and only for the top-ranked hot spots — never the whole corpus.

- For each top hot spot, Read the specific completed task file(s) that cite it and pull
  the *why* from their prose: the `**Why:**` on the relevant `[low]` bullets, the reopen
  reason, the `## What`/`## Why` framing, and any Notes churn lines.
- Distill each hot spot into a single lesson candidate that names the actual
  tool/file/error, cites the contributing task ids, and quantifies the evidence — ready
  to be shaped by the **Output Contract** below.

The deep-read pass may also be delegated to the same subagent (passing it the ranked hot
spots to read) so the prose reads stay out of the transcript too; the main agent receives
only the distilled lesson candidates.

## Output Contract (anti-generic)

The whole value of this skill is that its output is act-on-able, not a wall of vague
advice. Every emitted lesson MUST satisfy all three of these, or it is dropped:

- **Named** — it references an *actual* tool, file/path, or recurring error, never a
  vague category. "`git worktree remove` teardown churned" — not "worktrees were tricky."
  "auth token refresh in `lib/auth.js`" — not "auth was hard."
- **Task-id-cited** — every lesson lists the completed task ids that evidence it, e.g.
  `(#022, #023, #024)`. A lesson with no citations is not a lesson; drop it.
- **Evidence-ranked / quantified** — the lesson states its evidence weight in numbers,
  e.g. `cost 4 reopens across 3 tasks` or `named as a file-of-note in 6 tasks`. Lessons
  are ordered heaviest-evidence-first so it is clear what is worth acting on vs. noise.

A candidate that cannot be made Named AND cited AND quantified is noise — discard it
rather than pad the report with generic filler.

### Exact report format

Emit lessons in this exact shape (the modes reuse this block; `report`/`across` print it
to the conversation, `seed` folds it into the CONTEXT.md section and artifact):

```
# Retrospective: <this project | N similar projects> [— filter: <domain/keyword>]

<one-line scope line: N completed tasks mined across M project(s)>

## Lessons (ranked by evidence)

1. <Named lesson — actual tool/file/error>. — cost <X reopens / Y pauses / named in Z tasks> (<#ids>)
   → <prescriptive next-time action: the concrete thing to do differently>
2. <Named lesson>. — <quantified evidence> (<#ids>)
   → <prescriptive action>
...

## Hot spots (by area)
- <file/path or tool> — <count> tasks (<#ids>)
- <file/path or tool> — <count> tasks (<#ids>)
```

**Display rules:**
- **Ranked, heaviest first.** Order lessons by evidence weight; the number prefix is the
  rank. Aim for the 3-8 lessons with real evidence — never pad to a target count.
- **Every lesson line carries its `(#ids)` citations and a quantified `— cost …` clause.**
  Omit neither. A line missing either was not evidence-backed; do not print it.
- **Every lesson has a `→` prescriptive action** on its own indented line — the concrete
  "do this next time," not a restatement of the problem.
- **Hot spots** is a flat list of the recurring files/tools with their task-count and
  citing ids — the raw heat-map behind the lessons, for the reader who wants to verify.
- **Filter echo.** When a `domain/keyword` filter is active, echo it in the title so the
  reader knows the scope was narrowed.
- **DO NOT** emit vague advice, uncited lessons, tables, or multi-paragraph prose per
  lesson. One named + cited + quantified line plus one `→` action each.
- The block ends with the mode's **end-of-action marker** as its very last line
  (`🔵 RETROSPECT · N lessons` for the read-only `report`/`across` modes; a `🟢`
  write-face marker for `seed`).

## Edge Cases

- **Registry empty or single-project (`across`)**: If the machine-wide registry lists no
  other projects (after live-pruning and excluding self), degrade to a single-project
  `report`-style run over THIS project, say so explicitly, and stop — do not error.
- **No completed tasks in a mined root**: Treat an empty (or missing) `.plans/completed/`
  and `.plans/HISTORY.md` as zero contributions, not an error. If the whole corpus is
  empty, report gracefully — `Nothing to retrospect yet — no completed tasks to mine.` —
  and end with `🔵 RETROSPECT · 0 lessons`.
- **Candidate CONTEXT.md missing tech-stack signals (`across`)**: When a candidate root's
  CONTEXT.md has no usable Tech Stack / Overview signals, fall back to the
  domain/keyword-only similarity signal for that candidate rather than dropping it or
  erroring.
- **Registry `path` whose `.plans/` was deleted**: Skip it — live-prune on the direct
  JSON read (per the registry contract), never treat it as an error.
- **Corrupt or missing `projects.json`**: Treat a missing, empty, or unparseable registry
  file as *zero other projects*. In `across` this degrades to the single-project fallback
  above; never surface a parse error to the user.
- **`seed` with no lessons**: If the mining engine yields no evidence-backed lessons, do
  NOT write an empty `## Lessons From Past Projects` section and do NOT create an empty
  artifact. Report that there was nothing durable to seed and leave CONTEXT.md untouched.
- **Read-only modes never write**: `report` and `across` must never touch CONTEXT.md or the
  artifact, even when invoked autonomously — only `seed` writes (see the write-face gating
  in Step 6).
