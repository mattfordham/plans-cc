# Configurable Model Selection for the Skill Library

**ID:** 031
**Created:** 2026-08-20T10:14
**Type:** feature
**Status:** completed
**Completed:** 2026-08-20T10:14
**Branch:** feature/031-configurable-model-selection

## What
Make model selection across the skill library configurable instead of hardcoded, and document
which parts of the library can honor such configuration at all.

Today there are two distinct kinds of model decisions in the library, and they behave very
differently:

**1. Sub-agent spawns with a hardcoded `model: "opus"`** — six call sites, all spawning
`plan-executor`:
- `skills/plan-execute/SKILL.md:690` (step 11c segment execution)
- `skills/plan-execute/SKILL.md:749` (step 11c.6 observation-failure fix)
- `skills/plan-execute/SKILL.md:1035` (step 13 issue resolution)
- `skills/plan-execute/SKILL.md:1104` (step 14 testing/feedback fix)
- `skills/plan-spawn/SKILL.md:231` (parallel round spawn)
- `skills/plan-review/SKILL.md:201` (deferred-observation "Something's wrong" fix)

And `agents/plan-executor.md:12` declares `model: inherit`, which is **dead** — every one of those
six call sites overrides it with an explicit `"opus"`.

**2. Sub-agent spawns with no model specified** (inherit the session model) — five sites doing
read-only research/gathering: `skills/plan-elaborate/SKILL.md:138` (step 8 Explore) and `:412`
(Path C "Research more"), `skills/plan-audit/SKILL.md:54`, `skills/plan-status/SKILL.md:28`,
`skills/plan-retrospect/SKILL.md:208`, plus `skills/plan-execute/SKILL.md:781` ("Research
alternatives" after two failed segment attempts).

The motivating example — "use a stronger model like Fable when elaborating a complex plan" —
exposes the key constraint: **`/plan-elaborate` does not run on a model you can pick.** The skill
body executes in the main session on whatever model Claude Code was launched with. Only Task-tool
spawns accept a `model:` parameter. This mirrors the repo's own existing doctrine at
`skills/plan-spawn/SKILL.md:19` ("a sub-agent has no Skill tool and cannot invoke
`/plan-execute`"). So per-skill model config cannot work for main-loop skills; the judgment work
happens in the main loop, not in a spawnable agent.

This task delivers three things:

1. **A `models` role map in `.plans/config.json`** (`executor` / `research` / `reasoning`) consumed
   by every spawn site, defaulting to today's exact behavior when absent. Roles, not per-skill
   keys — roles survive model releases, and 39 per-skill knobs would be untunable. Also documents
   (rather than removes) the `model: inherit` in `agents/plan-executor.md`.
2. **A `deep` trailing keyword + complexity heuristic on `/plan-elaborate`** that routes the
   *drafting* of Why/How/How Summary/Verification to a `models.reasoning` sub-agent instead of
   running inline — the only mechanism that can escalate model strength mid-session.
3. **A "Model selection (cross-skill contract)" section in `CLAUDE.md`** documenting that
   sub-agent tiers are configurable while main-loop skills are not — preventing anyone from later
   adding a phantom `models.elaborate` key that reads like it works but silently cannot.

**Explicitly rejected:** a `models.elaborate`-style key naming a main-loop skill. A config key that
cannot be enforced is worse than no config key. This is not hypothetical — `segment_threshold` is
already exactly this: written by `plan-init` (`skills/plan-init/SKILL.md:120`) and read by nothing,
while `plan-execute` step 10 hardcodes "segments of 3-4 steps".

## Why
Adds value by making model tiers a per-project setting instead of six hardcoded strings, so a new
model (Fable) can be adopted by editing one config key rather than editing six SKILL.md files. It
also closes a correctness gap: the library currently forces `opus` for every implementation
sub-agent regardless of task difficulty, and offers no way to escalate the *planning* of a genuinely
complex task — the one place a stronger model most clearly pays off.

## How Summary
Introduce an optional, unseeded `models` role map in `.plans/config.json` with three roles
(`executor`, `research`, `reasoning`). Each consuming skill reads it once up front — reusing the
existing explicit-absent-check idiom from `plan-execute:526` — and substitutes a remembered value at
its spawn sites, so an absent key reproduces today's behavior byte-for-byte (`executor` → `"opus"`,
`research` → omit the `model:` parameter entirely). Separately, add an end-anchored `deep` keyword to
`/plan-elaborate` that delegates section *drafting* to a `models.reasoning` sub-agent while the main
loop retains every interactive gate, since a sub-agent cannot call `AskUserQuestion`. Finally,
document the whole contract in `CLAUDE.md`, including the invariant that main-loop skills cannot
honor a model key.

**Files of note:**
- `skills/plan-execute/SKILL.md` — 4 executor sites (690/749/1035/1104) + 1 research site (781); its step-9 config read at :526 is the extension point and the idiom template
- `skills/plan-spawn/SKILL.md` — executor site at :231; already has a read-once rule at :69/:261 to extend
- `skills/plan-review/SKILL.md` — executor site at :201; already reads `plan_comments` there
- `skills/plan-elaborate/SKILL.md` — research sites at :138/:412; the `deep` keyword, its heuristic, and the reasoning-spawn all land here
- `skills/plan-audit/SKILL.md`, `skills/plan-status/SKILL.md`, `skills/plan-retrospect/SKILL.md` — one research site each (:54, :28, :208)
- `agents/plan-executor.md` — the dead `model: inherit` at :12, kept but documented
- `CLAUDE.md` — new `### Model selection (cross-skill contract)` section under Key Conventions

## How
- [x] Step 1: Add the `### Model selection (cross-skill contract)` section to `CLAUDE.md`, placed under Key Conventions after `### Project-root discovery`. Follow the established house style: open with the invariant in bold prose, name every call site explicitly, state the absence-default, add a "why" paragraph, and forbid the anticipated wrong move. Must state: the three roles; **absence = today's behavior** (`executor` → `"opus"`, `research` → omit the `model:` parameter, `reasoning` → only consulted on the `deep` path); that `models` is deliberately **not** seeded into `plan-init`'s template; that it is the first nested object in config.json; and the load-bearing rule that **only Task-tool spawn sites can honor a model key — skill bodies run in the main session on the launch model, so a key like `models.elaborate` is structurally inert and must never be added**. Cite `segment_threshold` as the existing phantom-key precedent. Also update the config-keys list at `CLAUDE.md:159` to include `models`.
- [x] Step 2: Wire the `executor` role into `skills/plan-execute/SKILL.md`. Extend the existing single config read at step 9 (~line 526, alongside `plan_comments`) to also remember `executor_model`, defaulting to `"opus"` when the `models` key or its `executor` entry is absent. Then replace the hardcoded `model: "opus"` at lines 690, 749, 1035, and 1104 with a reference to that remembered value. Phrase the default-if-absent clause **once** at the read site and have all four spawn sites reference it — do not repeat the clause four times (drift risk).
- [x] Step 3: Wire the `executor` role into `skills/plan-spawn/SKILL.md:231` and `skills/plan-review/SKILL.md:201`. In plan-spawn, extend the existing read-once rule at line 69 (and its restatement at :261) rather than adding a second read. In plan-review, extend the config read already present at the :201 spawn site. Same single-clause discipline as Step 2.
- [x] Step 4: Wire the `research` role into the five read-only spawn sites: `skills/plan-elaborate/SKILL.md:138` and `:412`, `skills/plan-audit/SKILL.md:54`, `skills/plan-status/SKILL.md:28`, `skills/plan-retrospect/SKILL.md:208`, and `skills/plan-execute/SKILL.md:781`. **Critical:** the absent-key default must be to omit the `model:` parameter entirely (inherit), never a hardcoded model name — today these sites pass no model, and preserving that exactly is the backwards-compatibility bar.
- [x] Step 5: Document the `model: inherit` line in `agents/plan-executor.md:12`. Keep the value as `inherit`; add a frontmatter comment explaining that all call sites pass an explicit `model:` derived from `models.executor`, so this fallback applies only if a future call site omits the parameter. Verify the comment does not break the YAML frontmatter parse (the installer copies the file verbatim; `bin/install.js` and `bin/dev.js` do not parse frontmatter, but Claude Code does).
- [x] Step 6: Add `deep` keyword parsing to `skills/plan-elaborate/SKILL.md`. Update `argument-hint` (line 4) to `"<id|description> [skip] [deep]"`. In the Arguments section and step 2, add `deep_mode` detection matched **at the END of the remaining argument string only** — unlike `skip`'s per-token match — and strip it before the numeric-vs-description disambiguation. End-anchoring is load-bearing here: a non-numeric remainder becomes an auto-capture description, so "Add deep linking support" must not trigger deep mode. Add worked examples and an edge case for a description legitimately ending in the word "deep".
- [x] Step 7: Add the reasoning-spawn path to `skills/plan-elaborate/SKILL.md`. Define the auto-trigger by **reusing step 10's existing NOT-simple criteria verbatim** (refactor type, open questions present, or "investigate/figure out/explore/design/architecture" in the description) rather than inventing a second rubric; an explicit `deep` argument forces the path regardless. On that path, spawn a `general-purpose` sub-agent with `model: [reasoning_model]` that receives the task content, the CONTEXT.md summary, and the step-8 Explore findings, and returns drafted `## Why`, `## How` checkboxes (3-7, with `👁` tags per the Observation Step Tagging Rules), `## How Summary` (exact format per the How Summary Generation rules), `## Verification`, and optional `## Impact Scope`. **The main loop retains every interactive gate** — Path A/B confirmations and step 12 validation run over the sub-agent's draft, because a sub-agent cannot call `AskUserQuestion`. `deep` and `skip` remain independent and composable (`deep` alone → draft then confirm; `deep skip` → draft then auto-accept with assumption bullets). Fall back to today's inline drafting when the Task tool is unavailable or `models.reasoning` is absent.
- [x] Step 8: 👁 Manually walk the verification matrix below in a scratch project — this repo has no automated tests, so this step is the only proof the defaults hold. Confirm in particular that a project with **no** `models` key behaves identically to today at all eleven spawn sites.

## Verification
Verified by manual walkthrough (no test framework exists in this repo). All checks run in a scratch
project created via `/plan-init`, never against this repo's own `.plans/`.

**Backwards compatibility (the primary bar) — with NO `models` key in config.json:**
- `/plan-execute` on a multi-segment task spawns `plan-executor` with `model: "opus"` at all four sites (segment, observation fix, step-13 issue, step-14 feedback fix)
- `/plan-spawn` and a `/plan-review` deferred-observation fix likewise spawn with `model: "opus"`
- `/plan-elaborate`, `/plan-audit`, `/plan-status`, `/plan-retrospect` spawn their research agents with **no** `model:` parameter at all
- No skill errors or warns about the missing key

**With a `models` key present:**
- Setting `models.executor` to a non-default value changes the model at all six executor sites and nowhere else
- Setting `models.research` changes the five research sites and leaves executor sites untouched
- A partial map (e.g. only `executor` set) leaves the unset roles at their absent-key defaults
- A malformed/unexpected value does not crash a skill — it surfaces plainly

**The `deep` path:**
- `/plan-elaborate 1 deep` triggers the reasoning spawn; `/plan-elaborate 1` on a task meeting the NOT-simple criteria triggers it automatically
- `/plan-elaborate Add deep linking support` does **not** trigger deep mode (mid-string "deep" is part of the description) — the end-anchoring check
- `deep` alone still fires the Path A/B confirmation prompts over the draft; `deep skip` auto-accepts and writes assumption bullets
- With `models.reasoning` absent, `deep` falls back to inline drafting rather than erroring
- The resulting task file has a valid `## How Summary` between `## Why` and `## How`, 3-7 How checkboxes, and a status that flips to `elaborated`

**Docs:** `CLAUDE.md` gains the contract section; its config-key list at line 159 includes `models`;
the section explicitly forbids main-loop model keys and cites `segment_threshold`.

## Impact Scope

### Files to Modify
- [ ] `CLAUDE.md` — new `### Model selection (cross-skill contract)` section; config-key list at :159 updated
- [ ] `skills/plan-execute/SKILL.md` — extend step-9 config read (~:526); executor sites :690, :749, :1035, :1104; research site :781
- [ ] `skills/plan-spawn/SKILL.md` — extend read-once rule (:69, :261); executor site :231
- [ ] `skills/plan-review/SKILL.md` — executor site :201
- [ ] `skills/plan-elaborate/SKILL.md` — `argument-hint` (:4), Arguments + step 2 (`deep_mode`), research sites :138/:412, new reasoning-spawn path, edge cases
- [ ] `skills/plan-audit/SKILL.md` — research site :54
- [ ] `skills/plan-status/SKILL.md` — research site :28
- [ ] `skills/plan-retrospect/SKILL.md` — research site :208
- [ ] `agents/plan-executor.md` — document the `model: inherit` line (:12)

### Related Files (may need updates)
- `skills/plan-init/SKILL.md` — config template at :114-121 is deliberately **left unchanged** (decision: do not seed `models`); confirm no drift
- `README.md` — may warrant a note on the `models` key if it documents config
- `skills/plan-help/SKILL.md` — may warrant mention of the `deep` keyword

### Endpoints/UI Affected
- `/plan-elaborate` gains a `deep` argument (visible in the skill picker via `argument-hint`)
- All other skills: no user-visible interface change; behavior identical unless `models` is set

## Assumptions

### Initial (from elaboration)
_Decisions were made interactively — see Notes for the four resolved design questions._

### Discovered during execution
- [high] Placed the `### Model selection (cross-skill contract)` section immediately after `### Project-root discovery`, before `### How Summary Section`. **Why:** the segment specified this position exactly, and it groups the new contract with the other `(cross-skill contract)` headings.
- [high] Used a `[executor_model]` bracketed placeholder at spawn sites rather than a literal model name. **Why:** matches the existing house idiom in these files, where bracketed tokens (`[segment execution prompt - see template below]`, `[branch]`, `[sha]`) already denote a value Claude substitutes at runtime.
- [low] In `plan-review` the default clause is stated inline at the single spawn site (:201) rather than hoisted to a new up-front config-read step. **Why:** plan-review has no existing consolidated config read — its two reads (`plan_comments` at :201, `git_commits` at :223) are already inline at their point of use. Adding a new up-front read step would have been a structural change beyond the segment's stated scope of "extend the config read already referenced at the :201 spawn site". Added "remember this value for any repeat fix spawn" so the two-fix-attempt retry loop does not re-derive the default.
- [low] Extended plan-spawn's concurrency-safety restatement (~:261) to enumerate the three remembered values (`git_commits`, `plan_comments_off`, `executor_model`) rather than leaving the invariant generic. **Why:** the segment asked to extend that restatement; naming the values makes the read-once guarantee checkable, but the generic wording was already technically sufficient, so this is a clarity call rather than a correctness fix.
- [low] Documented the `research` role's absence-default as "omit the `model:` parameter entirely" and explained why it cannot share `executor`'s literal default. **Why:** the segment required stating the three roles' defaults, and the asymmetry between them is the most likely thing a later implementer would wrongly collapse. The research role itself is wired in a later segment, so this is documentation ahead of implementation.
- [high] Stated the `research` absence-default inline at the single spawn site in `plan-audit`, `plan-status`, and `plan-retrospect`, but hoisted it to a consolidated read in `plan-elaborate` (step 7) and `plan-execute` (step 9). **Why:** follows the per-skill structure rule set in segment 1 — skills with one spawn site state it inline (the `plan-review` precedent), skills with an existing consolidated config read extend that read (the `plan-execute` step-9 precedent). `plan-elaborate` has two research sites, so a single remembered value prevents the drift the elaboration notes flagged.
- [high] Added the `- model: [research_model]` line to the `plan-elaborate`/`plan-audit` Task-parameter code blocks with a trailing `← include this line ONLY when models.research is set; otherwise omit it entirely` annotation. **Why:** those two sites render parameters as a literal block, so a reader copying the block needs the conditionality visible *in* the block, not only in the prose above it. `plan-status`/`plan-retrospect` describe their spawn in prose, so prose-only sufficed there.
- [low] Placed the `reasoning_model` read in `plan-elaborate` step 7 alongside `research_model` rather than lazily inside the new step 9.5. **Why:** one config read per run matches the established idiom, and step 9.5 can then state "set in step 7" as its capability check. The cost is reading a key the non-deep path never uses.
- [low] Numbered the reasoning-spawn path as step **9.5** rather than renumbering steps 10-15. **Why:** the segment said to place it between step 9's findings and step 14's write; a fractional number keeps every existing cross-reference in this file valid (step 10's criteria, step 12's validation, step 14's write are all cited by number in the skill and in the task's own notes). Renumbering would have silently invalidated them.
- [high] Step 9.5 reuses step 10's NOT-simple criteria by restating them verbatim and instructing "evaluate step 10's test early and reuse the result" rather than duplicating a rubric. **Why:** the segment explicitly forbade a second rubric; restating verbatim with an explicit "do not invent a second rubric" guard keeps the two in sync for a future editor.
- [low] Documented the "description legitimately ending in the word deep" edge case as an **accepted cost** (the trailing token is consumed) with rephrase workarounds, rather than adding an escape hatch. **Why:** identical to how `/plan-capture` treats its trailing phrases; inventing a quoting or escaping mechanism here would introduce grammar that exists nowhere else in the skill family.
- [low] Added a `Deep mode active — drafting via reasoning sub-agent.` announce line in step 5 next to the existing skip-mode announce. **Why:** not requested by the segment, but skip mode announces itself and the two flags are presented as peers throughout; a silent deep mode would make the composed `deep skip` run indistinguishable from plain `skip`.
- [high] Wrote the `plan-executor.md` frontmatter comment as `#` YAML comment lines placed directly above `model: inherit`, keeping the value unchanged. **Why:** the segment required valid YAML; verified by parsing the extracted frontmatter with `yaml.safe_load`, which returns `model: 'inherit'` intact.

## Changes

**Step 1 — `CLAUDE.md`:** Added `### Model selection (cross-skill contract)` (:290) after `### Project-root discovery`. Defines the three roles with per-role call-site inventories, the asymmetric absence-defaults, the not-seeded decision, the first-nested-object note, the Task-tool-only rule forbidding `models.elaborate`, and the `segment_threshold` phantom-key precedent. Config-key list at :159 now includes `models`.

**Steps 2-3 — `executor` role:** `skills/plan-execute/SKILL.md` step-9 read (:527) remembers `executor_model`; four spawn sites (:691, :750, :1036, :1105) use `model: [executor_model]`. `skills/plan-spawn/SKILL.md` read-once rule (:69) extended, restatement (:261) enumerates the three remembered values, spawn site (:231) wired. `skills/plan-review/SKILL.md` (:201) read extended and wired. Zero hardcoded `model: "opus"` remain anywhere in `skills/` or `agents/`.

**Step 4 — `research` role:** wired into all six read-only spawn sites across five skills — `plan-elaborate` (:149 consolidated read serving step 8 and Path C), `plan-audit` (:52), `plan-status` (:29), `plan-retrospect`, `plan-execute` (:528, serving the "Research alternatives" escalation). Absence-default is to omit the `model:` parameter entirely; every site explicitly forbids substituting a literal.

**Step 5 — `agents/plan-executor.md`:** four `#` comment lines above `model: inherit` explaining that call sites pass an explicit model from `models.executor`. Value unchanged; frontmatter verified to parse via `yaml.safe_load`.

**Step 6 — `deep` keyword:** `argument-hint` updated; end-anchored `deep_mode` detection added to Arguments (:38-42) and step 2, matched at the END of the remaining string only and stripped before numeric-vs-description disambiguation; worked examples and 8 edge cases added.

**Step 7 — reasoning path:** new step 9.5 "Deep drafting via reasoning sub-agent" (:213) between steps 9 and 10. Auto-triggers on step 10's existing NOT-simple criteria (restated verbatim, no second rubric); `deep` forces it. Spawns `general-purpose` with `model: [reasoning_model]`; falls back to inline drafting when the Task tool is unavailable or `models.reasoning` is absent. Main loop retains every interactive gate.

**Step 8 — verification:** mechanical matrix run and passing — no hardcoded opus remains; `executor_model` referenced across all three consuming skills; `models` NOT seeded into `plan-init` (template untouched, verified with `git diff --quiet`); contract section present and forbidding the phantom key; config-key list updated; `plan-executor.md` YAML parses with `model: 'inherit'` preserved; `deep` end-anchoring documented with the "Add deep linking support" counter-example; step 9.5 correctly positioned; existing `node --test` suite green (16/16). User confirmed the observation at branch `feature/031-configurable-model-selection` @ `a678bef`; behavioral half (live `/plan-elaborate` runs with and without a `models` key) deferred to review.

## Notes
**Completion note (2026-08-20):** Completed with verification criteria only PARTIALLY met, by
explicit user decision. The static/docs criteria were confirmed mechanically (contract section
present and forbidding `models.elaborate`; config-key list updated; zero hardcoded `model: "opus"`
remaining; `executor_model` referenced across all three consuming skills; every research site
specifying omission of the parameter rather than a literal; `plan-executor.md` frontmatter parsing
with `model: 'inherit'` intact; `deep` end-anchoring documented with the "Add deep linking support"
counter-example; step 9.5 positioned between steps 9 and 10; `node --test` 16/16 green). **The
behavioral half of the Verification matrix was never executed** — no live `/plan-elaborate`,
`/plan-execute`, `/plan-spawn`, `/plan-audit`, `/plan-status`, or `/plan-retrospect` run was made in
a scratch project with and without a `models` key, so "spawns with", "triggers", "changes the model
at", and "falls back" remain unproven at completion. Since these skills are declarative instructions
rather than executable code, "the markdown says the right thing" is weaker evidence than a live run.
Anyone picking this up should walk the Verification matrix before trusting the defaults in anger.

Origin: discussion on 2026-08-20 about how the skill library picks models and how to make that
configurable. Elaborated with codebase research on the same day.

**Four design questions resolved interactively during elaboration:**

1. **Config shape → nested map, NOT seeded.** `models: {executor, research, reasoning}` is
   documented in CLAUDE.md but deliberately not written into `plan-init`'s template. Rationale:
   `segment_threshold` is already a phantom key (seeded, never read), and not seeding sidesteps
   both that rot and the nested-object-precedent question for existing projects. Users opt in by
   hand.
2. **`deep` + gates → main loop keeps the gates.** The reasoning sub-agent only *drafts*; Path A/B
   confirmations and step 12 validation still run in the main loop, because a sub-agent has no
   `AskUserQuestion` path back to the user. Keeps `deep` and `skip` independent and composable.
3. **Scope → wire the `research` role too.** The five model-less research spawns come under
   `models.research` in this task, so the role map ships complete rather than executor-only.
   `segment_threshold` was explicitly **left out of scope** — see follow-up below.
4. **`agents/plan-executor.md` → keep `inherit`, document why.** Keeping `inherit` means a future
   call site that omits `model:` inherits the session model rather than silently forcing a tier.

**Design rationale worth preserving:**

- **Three roles, not 39 skill keys.** Role names outlive specific model names; per-skill keys would
  be untunable and would multiply on every new skill.
- **Default to current behavior is a hard requirement, not a nicety.** Absent `models` must
  reproduce today's behavior exactly — including `research` meaning "omit the parameter", not a
  named model.
- **Single default-clause discipline.** Six executor sites share one remembered value; phrase the
  default-if-absent rule once per skill at the config read and reference it, rather than repeating
  it at each spawn site (drift risk flagged in research).
- **The `deep` keyword fits the existing trailing-phrase grammar** (`yolo`/`keep`/`discuss`/
  `branch`/`worktree` in capture/execute). Research confirmed `deep` collides with no existing
  keyword in any skill.
- **The complexity heuristic reuses step 10's existing NOT-simple criteria** rather than inventing
  a parallel rubric — a simplification found during research.

**Follow-up (out of scope for this task):** `segment_threshold` is written by
`skills/plan-init/SKILL.md:120` and read by nothing, while `skills/plan-execute/SKILL.md:616`
hardcodes "segments of 3-4 steps". Either wire it or delete it. Worth a separate `/plan-capture`
once this task lands, since this task's CLAUDE.md section will cite it as the cautionary precedent.

**Verified during research:** no JS reads `.plans/config.json` contents (`lib/find-root.js` only
`statSync`s it for existence; `lib/registry.js` parses a different file), so a nested `models` key
is invisible to all runtime code. `agents/*.md` IS installed to `~/.claude/agents/` by
`bin/install.js` and symlinked by `bin/dev.js`, so the plan-executor frontmatter edit ships to users.
