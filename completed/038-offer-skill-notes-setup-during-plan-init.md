# Offer SKILL_NOTES.md setup during /plan-init

**ID:** 038
**Created:** 2026-09-24T12:00
**Type:** feature
**Status:** completed
**Completed:** 2026-09-24T10:05
**Branch:** feature/038-offer-skill-notes-setup-during-plan-init

## What
Offer to set up .plans/SKILL_NOTES.md during /plan-init (opt-in, never created without consent): detect package manager from lockfile, the dev script, any port convention in AGENTS.md/CLAUDE.md, and design-system/ presence; propose pre-filled notes; let the user accept, edit, or skip (skip = no file, today's behavior). Optionally have /plan-context make the same offer for already-initialized projects with no SKILL_NOTES.md. Update the CLAUDE.md SKILL_NOTES contract from "not seeded by /plan-init" to "offered, never created without consent". No new standalone skill.

## Why
SKILL_NOTES.md is powerful but invisible — a project only benefits from it if someone knows to hand-author it, so in practice most projects never gain the per-project nudges (package manager, dev-server port, lint-before-finish) that the contract was built to carry. A one-time opt-in offer at init surfaces the capability at exactly the moment a project is being set up, while preserving the hard invariant that declining leaves no file and behaves byte-identically to today.

## How Summary
Add a new opt-in "offer to seed `.plans/SKILL_NOTES.md`" step to `/plan-init` (after the plan-comments prompt, before the confirmation), modeled directly on des-author's styleguide opt-in (read-first, offer via `AskUserQuestion`, write only on explicit accept, decline = write nothing). The offer detects four signals — package manager from lockfile, `scripts.dev` from `package.json`, a port convention from `AGENTS.md`/`CLAUDE.md`, and `design-system/` presence — and pre-fills a proposal in the documented `## all` + per-skill section format. `/plan-context` gains the same offer, gated on the file being absent. The CLAUDE.md contract line and the plan-init step-6 prohibition are relaxed from "never seeded" to "offered, never created without consent", keeping `models`/`worktree_links` explicitly never-seeded.

**Files of note:**
- `skills/plan-init/SKILL.md` — primary: new offer step + relax step-6 prohibition + add `AskUserQuestion` to allowed-tools
- `skills/plan-context/SKILL.md` — mirror offer step (absent-only) + add `AskUserQuestion` to allowed-tools
- `CLAUDE.md` — SKILL_NOTES contract: split SKILL_NOTES out of the shared never-seeded bullet
- `skills/des-author/SKILL.md` (step 9) — reference pattern to mirror (read-first / offer / write-only-on-yes / decline = nothing)
- `skills/plan-execute/SKILL.md` (step 11 dev-server block) — canonical lockfile→pkg-manager + dev-script + port detection recipe to reuse

## How
- [x] Step 1: Add `AskUserQuestion` to the `allowed-tools` frontmatter of `skills/plan-init/SKILL.md` (it is already used by steps 7/8 but unlisted — pre-existing gap) and to `skills/plan-context/SKILL.md` (which currently lists only Read/Write/Bash/Glob/Grep and needs it for the new offer).
- [x] Step 2: Write a shared detection recipe (as prose in the new step) that mirrors `skills/plan-execute/SKILL.md` step 11's dev-server block: package manager from lockfile (`pnpm-lock.yaml`→pnpm, `yarn.lock`→yarn, `bun.lockb`→bun, `package-lock.json`/none→npm), dev script from `package.json` `scripts.dev`, port convention from `AGENTS.md`/`CLAUDE.md` (`PORT=<base + task number>` pattern), and `design-system/` directory presence.
- [x] Step 3: Add a new offer step to `skills/plan-init/SKILL.md` between step 8 (plan comments) and step 9 (display confirmation), renumbering the subsequent steps. Model it on des-author step 9: (a) read-first — if `.plans/SKILL_NOTES.md` already exists (e.g. from a repair path), skip and note it's present; (b) run the Step-2 detection; (c) build a proposed file body in the documented `## all` + per-skill format (pkg-manager + dev-server note under `## all`; a commented `## des-build` review-pages placeholder only when `design-system/` is present); (d) offer via `AskUserQuestion` with three options — **Skip (recommended)**, **Accept**, **Edit** — where Skip writes nothing (today's behavior), Accept writes the proposed file, and Edit shows the proposal then applies the user's adjustments before writing.
- [x] Step 4: Relax the step-6 prohibition in `skills/plan-init/SKILL.md` (currently "never generated here") to state that SKILL_NOTES.md is offered in the new step and created only on explicit consent — while keeping `models`/`worktree_links` explicitly never-seeded.
- [x] Step 5: Add the mirror offer step to `skills/plan-context/SKILL.md`, gated on `.plans/SKILL_NOTES.md` being absent (never re-offer or overwrite when present), reusing the Step-2/Step-3 detection and offer shape. Place it between step 7 (write CONTEXT.md) and step 8 (commit).
- [x] Step 6: Update the SKILL_NOTES contract in `CLAUDE.md` — split the "Not seeded by `/plan-init`" bullet so SKILL_NOTES.md reads "offered during `/plan-init` (and by `/plan-context` when absent), never created without explicit consent; declining writes nothing (byte-identical to today)", while stating `models`/`worktree_links` remain never-seeded. Lightly touch `skills/plan-help/SKILL.md` line 87 if wording drift warrants ("offered during /plan-init").
- [x] Step 7: Manually verify the full flow per the lifecycle: run `/plan-init` in a fresh Node project with a lockfile and a `dev` script, confirm the offer pre-fills correctly, confirm Skip writes no file, Accept writes a well-formed file, and Edit applies changes; then confirm `/plan-context` re-offers only when the file is absent.

## Verification
- Running `/plan-init` in a project with a lockfile + `scripts.dev` surfaces the SKILL_NOTES offer with correctly detected package manager and dev-server pre-fill, and choosing **Skip** leaves NO `.plans/SKILL_NOTES.md` (byte-identical to today's init output aside from the extra declined prompt).
- Choosing **Accept** writes a `.plans/SKILL_NOTES.md` whose sections and bullet format match the documented shape (`## all` + per-skill `## <skill-name>`) and would be consumed cleanly by the reading skills' Step-1.5 blocks.
- Running `/plan-init` when `.plans/SKILL_NOTES.md` already exists does not re-prompt; running `/plan-context` offers the setup only when the file is absent and never overwrites an existing one.
- The `CLAUDE.md` SKILL_NOTES contract and `skills/plan-init/SKILL.md` step 6 no longer say "never seeded", now say "offered, never created without consent", and still explicitly exclude `models`/`worktree_links` from seeding.
- Both `skills/plan-init/SKILL.md` and `skills/plan-context/SKILL.md` list `AskUserQuestion` in `allowed-tools`.
- No new standalone skill was created.

## Impact Scope

### Files to Modify
- [x] `skills/plan-init/SKILL.md` — add `AskUserQuestion` to allowed-tools; add the opt-in offer step; relax the step-6 SKILL_NOTES prohibition
- [x] `skills/plan-context/SKILL.md` — add `AskUserQuestion` to allowed-tools; add the absent-only mirror offer step
- [x] `CLAUDE.md` — split SKILL_NOTES out of the shared never-seeded bullet; reword to "offered, never created without consent"

### Related Files (may need updates)
- `skills/plan-help/SKILL.md` — line 87 wording may warrant a light touch ("offered during /plan-init"); not strictly required
- `skills/des-author/SKILL.md` — reference only (the opt-in pattern being mirrored); not modified
- `skills/plan-execute/SKILL.md` — reference only (the detection recipe being reused); not modified

### Endpoints/UI Affected
- `/plan-init` interactive flow — one additional `AskUserQuestion` prompt (defaulting to Skip)
- `/plan-context` interactive flow — one conditional `AskUserQuestion` prompt (only when SKILL_NOTES.md is absent)

## Assumptions

### Initial (from elaboration)
- [low] Ship BOTH offer sites now — `/plan-init` and the `/plan-context` mirror — rather than deferring the plan-context half. **Why:** the task names both explicitly ("Optionally have /plan-context make the same offer"); it is a modest, symmetric addition and shipping both closes the gap for already-initialized projects in one pass.
- [high] Add `AskUserQuestion` to `plan-context`'s `allowed-tools`. **Why:** research confirmed plan-context lists only Read/Write/Bash/Glob/Grep, so the new offer's prompt cannot run without it — there is no alternative.
- [low] Also add `AskUserQuestion` to `plan-init`'s `allowed-tools`. **Why:** research found it is already invoked by existing steps 7/8 but unlisted (a pre-existing frontmatter gap); listing it makes the new step's dependency explicit and fixes the latent inconsistency. Judgement call to fix it as part of this task rather than leave it.
- [low] Offer UX = three options **Skip (recommended) / Accept / Edit**, with **Skip as the recommended default** and **Edit** showing the proposal then applying a follow-up free-text adjustment before writing. **Why:** matches the task's "accept, edit, or skip" wording; making Skip the one-keystroke default preserves the "today's behavior" invariant and mitigates the prompt-fatigue warning from research (plan-init already asks two prompts).
- [low] When `design-system/` is present, seed a **commented placeholder** `## des-build` note (e.g. review-pages location) rather than a fabricated concrete path. **Why:** research noted the review-pages path is not auto-detectable, so a concrete value would be a guess; a commented hint invites the user to fill it without asserting a wrong value.
- [low] Decline writes NOTHING — no stub, no empty file. **Why:** mirrors des-author's "write nothing on decline" edge case and the CLAUDE.md absence discipline (absent = byte-identical to today); an empty stub would violate "absent ⇒ today's behavior exactly".
- [low] Keep `models` and `worktree_links` explicitly never-seeded in the CLAUDE.md edit. **Why:** the task scopes the change to SKILL_NOTES.md only; those two contracts (CLAUDE.md) independently require never-seeding, so the reworded bullet must split SKILL_NOTES out without loosening them.
- [low] `plan-help` line 87 is a "related, optional" touch rather than a required edit. **Why:** its current wording ("Optional, hand-authored") is not wrong post-change; updating it to mention the offer is a nicety, so it is scoped as related rather than a core modify.

### Discovered during execution
- [low] When no signal is detected (no lockfile/`package.json`, no `dev` script, no port convention, no `design-system/`), plan-init step 9 skips the offer silently: no prompt, no file, no confirmation line. **Why:** with nothing to pre-fill the proposal would be empty, and an empty prompt only adds to prompt fatigue (init already asks two questions).
- [low] A `package.json` with no lockfile counts as an npm signal; no `package.json` means no package-manager signal. **Why:** this matches plan-execute's "else npm" fallback without inventing an npm note for non-Node projects.
- [low] The dev-server bullet is proposed only when `scripts.dev` exists, using the AGENTS.md/CLAUDE.md port base if found, else 3000. A package-manager bullet can be proposed on its own. **Why:** a dev-server note with no dev script would point at a command that does not exist, and base 3000 is plan-execute's documented default.
- [high] The dev-server bullet uses the exact shape plan-execute step 11c.5 reads back (`- Dev server: PORT=<BASE + task number> <pm> dev`, with `npm run dev` for npm). **Why:** plan-execute's source-1 example already uses this shape, so the seeded note is consumed as-is.
- [low] Package-manager bullet wording: `- Package manager: <pm> (use <pm> for installs and scripts, never another package manager)`. **Why:** the task gave no wording, and phrasing it as an instruction makes it act as a note rather than a bare fact.
- [high] The design-system placeholder is an HTML comment inside a `## des-build` section, not a bullet. If `## all` would be empty, the `## all` heading is left out. **Why:** reading skills count bullets as notes, so a comment keeps the "applied <n> note(s)" count accurate. An empty heading would be noise.
- [low] Step 9 (plan-init) also covers the "already present" case in the step-10 confirmation line ("Skill notes: `.plans/SKILL_NOTES.md` already present — left as-is"), in addition to the created/skipped lines. **Why:** the read-first branch needed a visible outcome, and des-author's step 9 likewise "notes it's set".
- [high] An Edit that leaves no bullets and no sections writes nothing and counts as Skip. The decline is never recorded in config.json. **Why:** this was given as segment guidance, and it follows the absence discipline and the phantom-config-key warning in CLAUDE.md.
- [high] CLAUDE.md:358 cites `skills/plan-init/SKILL.md:120` for `segment_threshold`. Adding `AskUserQuestion` to the frontmatter moved that line to 121, so the next segment, which edits CLAUDE.md, should update the reference. **Why:** the citation is a line number, and adding a frontmatter line shifted it.
- [high] plan-context's offer step (new step 8) references `skills/plan-init/SKILL.md` step 9 (b)–(e) and does not duplicate the recipe. Its only local logic is the absent-file gate and the summary line. **Why:** plan-init step 9 declares itself the single source of truth, and a copied recipe would drift.
- [low] When the file is already present, plan-context prints nothing about skill notes. plan-init prints an "already present" line instead. **Why:** plan-context runs repeatedly on established projects, so a line on every run would be noise, while plan-init's repair path is a one-off where the confirmation is useful.
- [low] The CLAUDE.md contract intro "An **optional**, hand-authored markdown file" was reworded to "(hand-authored, or seeded on explicit consent, see below)". **Why:** it otherwise contradicted the new "Offered, never created without consent" bullet.
- [high] CLAUDE.md:358 now cites `skills/plan-init/SKILL.md:121` for `segment_threshold`. **Why:** checked with sed: line 121 is `"segment_threshold": 4`.

## Changes
- `skills/plan-init/SKILL.md` — `AskUserQuestion` added to allowed-tools. New step 9 "Offer to seed `.plans/SKILL_NOTES.md` (opt-in — never forced)" covers read-first, four-signal detection (mirrors plan-execute 11c.5), silent skip when no signals are found, a pre-filled `## all` body plus a commented `## des-build` placeholder, and Skip (recommended) / Accept / Edit. Old steps 9–12 renumbered to 10–13, including the step-7 cross-reference. Step 6 now says SKILL_NOTES is offered; models/worktree_links remain never-seeded. Confirmation line and edge case added.
- `skills/plan-context/SKILL.md` — `AskUserQuestion` added to allowed-tools. New step 8 makes the offer only when the file is absent, following plan-init step 9 (b)–(e) by reference; it stays silent when the file exists. Commit and summary renumbered to 9 and 10. Summary line and edge case added.
- `CLAUDE.md` — the SKILL_NOTES contract bullet "Not seeded by /plan-init" becomes "Offered, never created without consent", naming both offer sites; models/worktree_links remain never-seeded. Opening sentence reworded. `segment_threshold` line reference updated to plan-init:121.
- `skills/plan-help/SKILL.md` — File Structure annotation now mentions the /plan-init offer.

## Notes
Follow-up from the review of #037, which introduced the SKILL_NOTES contract. Model the offer on des-author's opt-in styleguide offer (asks first, writes only on yes).
