# Retrospective-Learning Skill (mine plan history for cross-project lessons)

**ID:** 025
**Created:** 2026-07-15T00:00
**Type:** feature
**Status:** completed
**Branch:** feature/025-retrospective-learning-skill
**Completed:** 2026-07-15T00:00

## What
A new plan-cc skill that mines completed plan history — within a project and across
projects — to turn the accumulated "what happened and why" into actionable, ranked,
prescriptive lessons that give a head start on the next similar project.

Motivating use case: the user repeatedly builds CMS-implementation websites, driving
the bulk of the work through the plan skills. Each build is repetitive in some ways
and time-consuming in others. The skill should look back at a project's (or several
similar projects') history and answer: where was time spent, which tool/area kept
fighting back, which steps were consistently unnecessary or consistently missing, and
what context had to be rediscovered — then carry those lessons forward into the next
similar build.

## Why
The plan archive quietly accumulates a fingerprint of a project's difficulty — every
reopen, deferred `[low]` assumption, pause, and recurring file-of-note is a symptom that
means nothing alone but diagnoses a pattern in aggregate. That signal is currently
write-only: no skill reads across completed tasks, so the lessons of a finished project
never reach the next similar one and the same tools/areas get re-fought from scratch.
This skill turns that dormant history into a head start — named, prescriptive, ranked
lessons carried forward — which is highest-value for repetitive work like CMS-site
builds where each project rhymes with the last.

## How Summary
Add a single new read-first skill, `skills/plan-retrospect/SKILL.md`, with one analysis
engine and three argument-selected modes: `report` (this project, transient), `across`
(cross-project, transient) and `seed` (write lessons into a new project). It mines the
prose sections of `.plans/completed/*.md` (Assumptions `### Discovered during execution`
`[low]` bullets, `**Files of note:**`, Notes `**Reopened:**`/`**Paused:**` churn lines)
plus HISTORY.md, using a cheap heat-map pass to rank hot spots then a delegated deep-read
subagent (the plan-status pattern) to explain the why — keeping the scan out of the
user's transcript. Cross-project mode enumerates other roots by reading
`~/.claude/plans-cc/projects.json` directly and filters by a hybrid similarity match
(domain/keyword arg + each project's CONTEXT.md tech-stack, user-confirmed). Output obeys
an anti-generic contract: named + task-id-cited + evidence-ranked. Durable artifacts land
in the existing `.plans/artifacts/` convention; `seed` writes into a preserved CONTEXT.md
section. Wiring is docs-only (installer auto-globs skills/). The deeper data-capture gaps
(state-file friction, discuss/clarify traces, timing telemetry) are explicitly deferred
to follow-up tasks so v1 ships against data that exists today.

**Files of note:**
- `skills/plan-retrospect/SKILL.md` — the new skill (the whole deliverable); create.
- `skills/plan-status/SKILL.md` — copy its subagent-delegation pattern for the heavy scan.
- `skills/plan-search/SKILL.md` — copy its cross-corpus Grep-then-collect pattern.
- `skills/plan-summary/SKILL.md` — copy its exact-format report block + display-rules style.
- `skills/plan-context/SKILL.md` — the `seed` write target; must add a preserved section so regeneration doesn't clobber lessons.
- `lib/registry.js` — `readProjects()` returns `[{path,lastSeen}]`; read `projects.json` directly, no new lib.
- `CLAUDE.md` / `README.md` / `skills/plan-help/SKILL.md` — add the skill to their tables (house-consistency wiring).

## How
- [x] Step 1: Create `skills/plan-retrospect/SKILL.md` — frontmatter (`name: plan-retrospect`, `disable-model-invocation: false`, `argument-hint: "[report | across | seed] [domain/keyword]"`, `allowed-tools: Read, Write, Bash, Glob, Grep, Agent, AskUserQuestion`), H1, intro, `## Arguments`, and the verbatim Step-1 project-root-discovery init block used by every plan-* skill.
- [x] Step 2: Write the shared **mining engine** steps — a heat-map pass (Grep/collect metadata across `.plans/completed/*.md` + HISTORY.md: count recurring `**Files of note:**`, `**Reopened:**`/`**Paused:**` lines, `[low]` Discovered-during-execution bullets, Created→Completed deltas as a weak time proxy) delegated to an Explore/general-purpose subagent per the `plan-status` delegation pattern, then a deep-read pass into only the top-ranked hot spots to extract the why.
- [x] Step 3: Write the **anti-generic output contract** section — every lesson must be Named (actual tool/file/error), task-id-cited, and evidence-ranked/quantified ("cost N reopens across M tasks"); include the exact-format report block + display rules modeled on `plan-summary` step 4.
- [x] Step 4: Write **mode `report`** (default) — single-project retrospective printed to the conversation only (no file); marker `🔵 RETROSPECT · N lessons`.
- [x] Step 5: Write **mode `across`** — enumerate other project roots by reading `~/.claude/plans-cc/projects.json` (documented stable schema; fall back to this-project-only when the registry is empty/single); hybrid similarity filter via the `domain/keyword` arg matched against titles/What and each root's `CONTEXT.md` tech-stack, then an `AskUserQuestion` to confirm/adjust the project set before mining.
- [x] Step 6: Write **mode `seed`** and the durable-artifact write path — `seed` writes lessons into a NEW dedicated CONTEXT.md section (e.g. `## Lessons From Past Projects`) using `plan-context`'s section-preserving discipline; the durable ad-hoc artifact lands at `.plans/artifacts/retrospective-<domain>.md`. Gate both write faces behind their explicit mode arg so an autonomous invocation can never silently mutate CONTEXT.md; write-face marker `🟢 RETROSPECT · <target>`.
- [x] Step 7: Teach `plan-context` to **preserve** the new `## Lessons From Past Projects` section (add it to plan-context's preserved-sections list) so its regeneration never clobbers seeded lessons.
- [x] Step 8: Wire house-consistency docs — add `plan-retrospect` to the **All Skills** table and the End-of-Action Markers 🔵/🟢 rows in `CLAUDE.md`, to `README.md`'s command table, and to `skills/plan-help/SKILL.md`'s reference.
- [x] Step 9: Write `## Edge Cases` (registry empty → single-project; no completed tasks → graceful "nothing to retrospect yet"; CONTEXT.md missing tech-stack for similarity; a project root in the registry whose `.plans/` was deleted — already live-pruned by `readProjects()` but handle a direct-JSON read) and a final **End-of-action marker** step.
- [x] Step 10: Manually test the full skill against this repo's own 22 completed tasks: run `report`, confirm it surfaces real named hot spots with task-id citations; dry-run `across` and `seed` (verify CONTEXT.md preservation and artifact placement) via `node bin/dev.js` reinstall. _(Prereqs done: `node bin/dev.js` live-symlinked the skill; it is invocable. User skipped the interactive run — deferred to review.)_

## Verification
- `report` mode, run against this repo's `.plans/completed/`, produces named + task-id-cited + evidence-ranked lessons (not vague advice) — e.g. it should notice worktree/checkout churn across tasks #022/#023/#024.
- `across` mode enumerates other registered projects from `~/.claude/plans-cc/projects.json`, applies the similarity filter, and asks for confirmation before mining; degrades gracefully to single-project when the registry has only this project.
- `seed` writes a `## Lessons From Past Projects` section into `.plans/CONTEXT.md`, and a subsequent `/plan-context` run preserves it rather than clobbering it.
- The durable artifact lands under `.plans/artifacts/` and the installer picks up the new skill with no `bin/install.js` change (`node bin/dev.js` then the skill is invocable).
- Write faces (`seed`, durable artifact) never fire from `report`/`across` — no silent CONTEXT.md mutation.

## Impact Scope

### Files to Modify
- [ ] `skills/plan-retrospect/SKILL.md` — NEW: the entire skill (all three modes + mining engine).
- [ ] `skills/plan-context/SKILL.md` — add `## Lessons From Past Projects` to preserved sections.
- [ ] `CLAUDE.md` — add skill to All Skills table + End-of-Action Markers rows.
- [ ] `README.md` — add skill to command table.
- [ ] `skills/plan-help/SKILL.md` — add skill to command reference.

### Related Files (may need updates)
- `lib/registry.js` — no change expected; `readProjects()` reused as-is (or via direct JSON read).
- `lib/parse-tasks.js` — deliberately NOT extended (signal is prose; Grep/Read directly).
- `bin/install.js` / `bin/dev.js` — no change (both glob `skills/` dynamically).

### Endpoints/UI Affected
- New user command `/plan-retrospect [report | across | seed] [domain]`.
- The desktop-app registry contract is read-only-consumed, not modified.

## Assumptions

### Initial (from elaboration)
- [low] Ship as ONE skill with three argument-selected modes (`report`/`across`/`seed`) rather than three skills or a plan-complete hook. **Why:** house style favors an argument switch (cf. plan-list/plan-elaborate multi-mode); a completion hook would require plan-complete edits and couple the retrospective to the lifecycle, which the ad-hoc/seed-forward modes explicitly don't want.
- [low] `disable-model-invocation: false` (read-first), but guard the `seed`/durable-artifact write faces behind their explicit mode arg. **Why:** matches the read-only-report family precedent (plan-search/plan-status/plan-summary are `false`), while preventing an autonomous invocation from silently mutating CONTEXT.md — the research flagged this exact tension.
- [low] Enumerate cross-project roots by reading `~/.claude/plans-cc/projects.json` directly (schema `{version, projects:[{path,lastSeen}]}`), not by adding a new lib/CLI. **Why:** research confirmed the schema is documented/stable and there is no read-CLI; `readProjects()` exists but a markdown skill reading the JSON is the lowest-dependency, family-consistent path.
- [low] Mine the completed markdown with Grep/Read; do NOT extend `lib/parse-tasks.js` into a body-section parser. **Why:** the retrospective signal lives entirely in prose sections the parser doesn't touch; extending it adds a tested structured-parsing surface for a job Grep/Read (the plan-search pattern) does better.
- [low] Durable artifact lives at `.plans/artifacts/retrospective-<domain>.md`; do not create a new `.plans/retrospectives/` dir. **Why:** `artifacts/` is the established convention for durable derived docs (desktop-app-spec.md precedent); a new top-level dir would force plan-init/plan-cleanup/desktop-parser edits.
- [low] Similarity matching is hybrid (domain/keyword arg + CONTEXT.md tech-stack, user-confirmed via AskUserQuestion). **Why:** the user chose "hybrid" in brainstorm; auto-only mis-matches and manual-only is high-friction.
- [low] Delegate the heavy cross-project/cross-file scan to a subagent (plan-status pattern). **Why:** research warned the scan is I/O-heavy and would flood the user's transcript; delegation keeps the window clean.
- [low] v1 scope: mine only data that survives today; DEFER the deeper capture gaps (preserving the state-file friction log at completion, a `friction:` tag, discuss/clarify audit trail, real timing telemetry) to separate follow-up tasks. **Why:** the "trail-forward" richer-signal work touches plan-execute/plan-complete/plan-reopen and is a larger, separable change; shipping the analyzer against existing data delivers value first and de-risks scope.

### Discovered during execution
- [low] Used `subagent_type: general-purpose` for the mining scan (matching plan-status verbatim), not an `Explore` subagent. **Why:** plan-status — the delegation pattern the segment prompt cites — spawns exactly one `general-purpose` Agent and instructs it to return a compact structured report; copying that keeps house consistency and the subagent needs Write access (silent PROGRESS-style refresh precedent) which Explore lacks.
- [low] Structured the file as an intro + `## Arguments` + shared `## Steps` (Step 1 discovery, Step 2 parse mode, Step 3 dispatch-into-engine) + a standalone `## Mining Engine` section + a standalone `## Output Contract` section, with an HTML-comment placeholder block marking where steps 4-9 land. **Why:** the mining engine and output contract are shared by all three modes, so lifting them out of the numbered `## Steps` (rather than inlining under one mode) makes them callable from every mode and leaves the mode/edge-case segments a clean insertion point without renumbering.
- [low] Made the deep-read (Pass 2) subagent-delegation OPTIONAL ("may also be delegated"), while Pass 1 is mandatorily delegated. **Why:** Pass 1 is the transcript-flooding I/O-heavy scan the research warned about; Pass 2 reads only a handful of top-ranked files, so forcing a second subagent hop there is not clearly worth it — left it as an option the mode segments can harden.
- [low] Report block ends with `🔵 RETROSPECT · N lessons` for read-only modes and defers the `seed` `🟢` write-face marker to the later mode segment. **Why:** the segment owns only the engine + contract; wiring the exact seed marker/target belongs to step 6, so the contract documents the read-only marker and flags the write marker as later-wired rather than inventing its final form now.
- [low] The `seed` artifact `<domain>` default is the literal slug `all` when no `domain/keyword` filter is given (filter slugged lowercased with non-alphanumerics → `-`). **Why:** the segment prompt suggested "a sensible default like `all`"; `all` reads as "unfiltered whole-corpus retrospective" and yields a stable, collision-free filename (`retrospective-all.md`) that pairs cleanly with filtered runs (`retrospective-craft.md`).
- [low] `seed` mines THIS project by default (like `report`) and only reuses a confirmed `across` set when the user explicitly asks. **Why:** the segment prompt fixed v1 default as this-project lessons; making `across`-reuse opt-in keeps `seed` from silently triggering the cross-project confirmation gate and matches the "seed = this project's forward-carried lessons" framing.
- [low] The CONTEXT.md `## Lessons From Past Projects` section is written section-preservingly by replacing in place if present else appending at the end, and the section body OMITS the trailing end-of-action marker line (the `🟢`/`🔵` marker belongs to the conversation, not the file). **Why:** mirrors `plan-context`'s preserve-named-section discipline; a marker line baked into CONTEXT.md would be noise on every future read and would accumulate on re-seed.
- [low] `across` excludes THIS project's own resolved root from the candidate set before similarity filtering, and degrades to a `report`-style run only after prune+self-exclusion leaves zero others. **Why:** comparing a project against itself is not "cross-project"; excluding self first makes the degrade condition ("no OTHER projects") precise and prevents a lone-registered project from mining itself twice.
- [low] plan-context's `## Lessons From Past Projects` preserve directive is placed *between* `## Key Patterns` and `## Notes` in the write template, worded `[Preserve existing if present; managed by /plan-retrospect seed — otherwise omit this section entirely]`. **Why:** the segment prompt specified "right before `## Notes`"; the "otherwise omit entirely" clause (unlike the sibling sections' `_placeholder_` fallbacks) keeps a plain `/plan-context` run from emitting an empty retrospect-owned section on projects that never seeded one.
- [low] The `seed` end-of-action marker documented in the final marker step is `🟢 RETROSPECT · <target>` (e.g. `🟢 RETROSPECT · CONTEXT.md + artifact`), taking `<target>` as the concrete write targets rather than a fixed string. **Why:** Step 6 already emits the concrete `🟢 RETROSPECT · CONTEXT.md + artifact` marker; the final marker step generalizes it as `<target>` so a future single-face seed (e.g. artifact-only) can name its own target without contradicting Step 6.
- [low] In the CLAUDE.md End-of-Action Markers table, `retrospect` is annotated as `retrospect (seed)` in the 🟢 row and `retrospect (report/across)` in the 🔵 row rather than a bare `retrospect` in both. **Why:** plan-retrospect is the only skill that emits *different* markers per mode; the parenthetical qualifiers make the mode→emoji mapping unambiguous to a reader instead of listing the same skill in two rows with no explanation.

## Changes

**New skill — `skills/plan-retrospect/SKILL.md`** (the whole deliverable, ~310 lines):
- Frontmatter (`name: plan-retrospect`, `disable-model-invocation: false`, `argument-hint: "[report | across | seed] [domain/keyword]"`, `allowed-tools: Read, Write, Bash, Glob, Grep, Agent, AskUserQuestion`), H1 + intro, `## Arguments` (mode + domain/keyword filter).
- `## Steps`: Step 1 project-root-discovery init block (verbatim house pattern), Step 2 mode parse, Step 3 engine dispatch, Step 4 `report`, Step 5 `across`, Step 6 `seed`, Step 7 end-of-action-marker step.
- `## Mining Engine`: Pass 1 heat-map delegated to a `general-purpose` subagent (Files-of-note recurrence, Reopened/Paused churn, `[low]` Discovered bullets, Created→Completed day-delta time proxy) with evidence ranking; Pass 2 targeted deep-read into top hot spots for the *why*.
- `## Output Contract (anti-generic)`: Named + task-id-cited + evidence-ranked/quantified rule, exact report-format block, display rules.
- `## Edge Cases`: empty/single registry → single-project; no completed tasks → graceful; missing tech-stack → keyword-only similarity; deleted `.plans/` path → live-prune skip; corrupt `projects.json` → zero others; `seed` with no lessons → no empty write.

**`skills/plan-context/SKILL.md`** — teach it to preserve `## Lessons From Past Projects` (managed by `/plan-retrospect seed`): added to the write template (between Key Patterns and Notes, omit-when-absent), the read/analyze preserve note, and the Edge Cases preserve list.

**Docs wiring** — added `plan-retrospect` to: `CLAUDE.md` All Skills table + both End-of-Action Markers rows (🟢 `retrospect (seed)`, 🔵 `retrospect (report/across)`); `README.md` command table; `skills/plan-help/SKILL.md` reference (pipes escaped `\|` in the arg hints).

**Install** — no `bin/install.js`/`bin/dev.js` change needed (both glob `skills/`); `node bin/dev.js` live-symlinked the new skill and it is now invocable.

**Deviations:** none. **Tests:** none — pure-markdown deliverable, no `lib/` code touched.

## Notes

Captured from a `/plan-brainstorm` session. The concept crystallized through discussion
into the following shape (this is design intent for elaboration, not final spec):

**One analysis engine, three entry points:**
- **Distill-on-close** — when a project/milestone wraps, compress its completed archive
  into a durable, reusable *lessons artifact*.
- **Seed-forward** — starting a similar new project, pull relevant lessons and seed the
  new project's CONTEXT.md with "what to expect / what bit you last time."
- **Ad-hoc report** — analyze and show patterns anytime, untied to a lifecycle moment.

**Lens = the codebase/project** (what the work reveals — not "how I personally work"
and not "is the plans-cc workflow good"). Layered analysis: a cheap countable
**heat-map** pass over metadata to find hot spots, then a **deep-read** pass into only
those hot spots to explain the *why*.

**Cross-project spine:** walk the existing machine-wide registry
(`~/.claude/plans-cc/projects.json`, every project root + `lastSeen`). **Hybrid
similarity matching** — auto-suggest similar projects from CONTEXT.md tech-stack
signals, user confirms/adjusts the set before mining.

**Two data tiers:**
- *Infer from what survives today* — `### Discovered during execution` `[low]`/`[high]`
  bullets with `**Why:**` reasoning (the richest permanent signal), recurring
  `**Files of note:**` in How Summaries, `**Reopened:**`/`**Paused:**` lines in Notes,
  and the dense HISTORY.md summary paragraphs.
- *Lay a cleaner trail forward* — introduce a lightweight **friction tag** (recorded
  during execute/complete) so tool-struggle is named explicitly instead of inferred.
  The skill grows richer over time as this trail accumulates.

**Anti-generic output contract (the guardrail that keeps it act-on-able):**
- **Named** — actual tool / actual file / actual recurring error, each with task-id
  citations. No vague "auth was hard, add more tests."
- **Prescriptive** — output isn't prose to read; it's concrete CONTEXT.md entries, a
  "landmines" list, and/or checklist items dropped into the new project ready to use.
- **Ranked & quantified** — by evidence weight ("cost 4 reopens across 3 projects") so
  it's clear what's worth acting on vs. noise.

**Known data gaps to design around** (from a codebase exploration during the brainstorm):
- The execution **state file** (`.plans/state/NNN-state.md`: Deviations, Observation
  verdicts, Key Decisions) is **deleted on `/plan-complete`** — the richest live-friction
  log currently evaporates. Motivates the "trail-forward" friction tag and/or preserving
  a friction digest at completion.
- **discuss/clarify leave no persistent trace** in the task file (only optional git
  commits, which are disabled in this repo) — "what got argued about repeatedly" is
  invisible today.
- **No timing/duration/revision telemetry** — "time-consuming" can only be *proxied*
  from Created→Completed deltas (polluted by idle time), pause-counts, and reopen-counts.
  Elaboration should decide whether proxies suffice or real timing capture is worth adding.

**Existing precedent to reuse, not reinvent:** `plan-search` is the only skill that
reads across the whole corpus (pending/backlog/completed/ideas); `plan-summary` is
session-scoped only; `plan-status`/`plan-audit` don't read completed-file bodies.
`lib/parse-tasks.js` extracts header/status fields and could be extended to parse
Assumptions/Notes/Changes bodies. There is no existing cross-task analysis skill.

Related: [[012-collections-of-plans-epics]] (both concern reading across many plans).
