# Nested usage: run plan skills from sub-repo directories against a centralized .plans/

**ID:** 024
**Created:** 2026-07-09T00:00
**Type:** feature
**Status:** completed
**Completed:** 2026-07-09T00:00
**Branch:** feature/024-nested-usage-centralized-plans-subdirs

## What
How could we handle nested usage? For example, consider my multi-repo-app project, the plans, and the repos. It would be nice to have centralized plans. How can I run plan skills from within sub directories.

## Why
The "centralized plans, many repos" layout the user describes — an multi-repo-app parent directory holding `.plans/` plus several git sub-repos — is **already the multi-repo shape plans-cc supports**. `plan-execute` detects it by finding that the cwd is not itself a git repo and scanning immediate children for `.git` (`skills/plan-execute/SKILL.md:374-377`); `plan-review` arbitrates concurrent reviews by disjoint repo sets (`skills/plan-review/SKILL.md:69-76`); `plan-complete` tears down per-repo worktrees (`skills/plan-complete/SKILL.md:329-335`).

What does **not** work is *invoking* the skills from anywhere but that parent. Every skill locates the plans directory as the literal relative path `.plans/config.json` resolved against the current working directory, and hard-errors when it is absent:

> - FIRST, use Glob or Read to check if `.plans/config.json` exists. Do NOT skip this file check.
> - If the file does not exist, error: "Not initialized. Run `/plan-init` first."

That exact block appears in ~29 skills (e.g. `plan-execute:119-120`, `plan-review:28-29`, `plan-capture:34-35`). Nothing anywhere walks up parent directories — a codebase-wide search for parent/ancestor/upward discovery returns only the *multi-repo parent* concept and `git rev-parse --show-toplevel`, never a `.plans/` search. The JS tools are the same: `bin/dashboard.js:11` pins `PLANS_DIR = path.resolve(process.cwd(), ".plans")` and exits 1 if it's missing; `bin/plan-touch.js:18` takes `process.argv[2] || process.cwd()` verbatim.

The practical consequence: a Claude Code session opened in `multi-repo-app/api/` (where you actually edit code) cannot run `/plan-capture` at all. You must open a session at the multi-repo-app root, or duplicate a `.plans/` per repo and lose the centralized view. The fix is a **single root-discovery contract** — walk up from cwd to the nearest ancestor containing `.plans/config.json`, `cd` there, and proceed exactly as today. Every downstream behavior (relative `.worktrees/`, sub-repo scanning, registry normalization) already assumes "cwd == project root", so establishing that invariant early is the whole feature.

There is also a real hazard to close: `plan-init` checks only the current directory (`skills/plan-init/SKILL.md:20`, "Look for `.plans/` directory in current working directory"). Running `/plan-init` inside `multi-repo-app/api/` today silently creates a *second, nested* `.plans/`, fragmenting the centralized plans the user wants. Discovery must make that a deliberate, confirmed choice.

## How Summary
Introduce one shared root-discovery contract — walk up from cwd to the nearest ancestor containing `.plans/config.json`, `cd` to it, and print a one-line notice when the root differs from cwd — and reference it from every skill's init check instead of the hard-coded relative-path test. Harden `plan-init` to refuse to silently nest a second `.plans/` under an existing one, and teach `bin/dashboard.js` / `bin/plan-touch.js` the same upward walk so the TUI and the registry agree with the skills. Document the contract in CLAUDE.md alongside the existing worktree-hygiene and observation-provenance contracts.

**Files of note:**
- `CLAUDE.md` — home for the new "Project-root discovery" cross-skill contract section
- `skills/plan-init/SKILL.md` — step 1 must detect an ancestor `.plans/` and confirm before nesting
- `skills/plan-execute/SKILL.md` — the most root-sensitive skill (worktrees, sub-repo scan); its step 1 and the `.worktrees/` steps must run from the discovered root
- `skills/plan-review/SKILL.md` — already has a "verify pwd matches the project root" guard (`:62`); rewrite it to *use* discovery rather than assume the user knows the root
- `skills/plan-capture/SKILL.md`, `skills/plan-elaborate/SKILL.md`, `skills/plan-status/SKILL.md`, and the ~25 other skills carrying the verbatim init check
- `lib/find-root.js` — new: shared `findProjectRoot(startDir)` used by the JS tools
- `bin/dashboard.js` — `PLANS_DIR` currently pinned to cwd (`:11`), plus the sub-repo scan at `:90-103`
- `bin/plan-touch.js` — `projectRoot = argv[2] || cwd` (`:18`), should normalize through discovery
- `lib/registry.js` — `normalizeProjectRoot` (`:44-50`) already strips `.worktrees/` suffixes; discovery must compose with it, not fight it

## How
- [x] Step 1: Write the canonical **Project-root discovery** contract into `CLAUDE.md` as a new cross-skill section (peer of "Worktree hygiene" and "Observation provenance"). Specify exactly: from cwd, ascend parent-by-parent to the filesystem root looking for a directory containing `.plans/config.json`; the first hit wins; if none, error `Not initialized. Run /plan-init first.` (unchanged text). Stop the ascent at `$HOME` (inclusive) and the filesystem root; a cwd inside `.worktrees/<name>/` is collapsed to the path above `.worktrees` *before* the ascent begins (a pre-ascent collapse, not a stop — see the corrected assumption below). When the discovered root ≠ cwd, `cd` to it and print one line: `Using plans root: <path> (from <cwd>)`. State the invariant the rest of the system depends on: **after step 1, cwd is the project root**, so `.worktrees/`, the sub-repo scan, and `.plans/` relative paths keep working untouched.

- [x] Step 2: Add `lib/find-root.js` exporting `findProjectRoot(startDir)` implementing the same walk, returning the absolute root or `null`. Compose with, don't duplicate, `registry.normalizeProjectRoot`: run the `.worktrees/` strip first, then ascend. Mirror the existing best-effort style in `lib/registry.js` — never throw.

- [x] Step 3: Harden `skills/plan-init/SKILL.md` step 1 (`:19-22`). Before creating anything, run discovery from cwd. If an ancestor `.plans/` exists and cwd is not that root, do **not** silently create a nested one — use `AskUserQuestion` to offer: (a) use the existing root at `<path>` (recommended; nothing is created), or (b) create a separate nested `.plans/` here, with an explicit warning that plans will be fragmented and the two roots will not see each other. Keep today's "Already initialized" error for the exact-cwd case.

- [x] Step 4: Replace the hard-coded init check in every skill with a reference to the contract. The verbatim block ("FIRST, use Glob or Read to check if `.plans/config.json` exists…") becomes "Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md`; `cd` there. If no root is found, error: `Not initialized. Run /plan-init first.`" Cover the ~29 skills carrying the block, plus the two soft variants that must *not* start hard-erroring: `plan-status:23-24` (prints a notice, does not error) and `plan-guide:19-20` (offers setup guidance). `plan-init` is exempt — step 3 owns its behavior.

- [x] Step 5: Reconcile the root-sensitive skills that already reason about cwd. In `plan-review`, rewrite the `:62` guard ("verify [pwd] matches the project root … If it does not, `cd` to the project root") to invoke discovery rather than assume the root is known — and preserve the two existing exemptions unchanged: the `**Worktree:**`-present branch that intentionally `cd`s *into* a worktree, and the non-git-parent multi-repo case at `:63`. In `plan-execute`, confirm the sub-repo scan (`:374-377`) and every relative `.worktrees/` path (`:430,433,458`) run after the `cd`, so a session started in `multi-repo-app/api/` produces worktrees at the multi-repo-app root, not inside the sub-repo. Apply the same audit to `plan-spawn:82`, `plan-complete:294`, and `plan-merge-reviews:40`.

- [x] Step 6: Teach the JS tools the walk. In `bin/dashboard.js`, replace the `:11` cwd pin with `findProjectRoot(process.cwd())`, keep the exit-1 message when it returns `null`, and re-anchor the sub-repo scan (`:90-103`) and `registerProject` call (`:30`) to the discovered root rather than `process.cwd()`. In `bin/plan-touch.js:18`, pass `argv[2] || cwd` through discovery so a touch fired from a sub-repo registers the centralized root and not the sub-repo — otherwise the desktop app lists phantom projects.

- [x] Step 7: Update the docs surface: the CLAUDE.md "Machine-Wide Project Registry" note (a touch from a sub-repo now normalizes upward) and `skills/plan-help/SKILL.md` (state that skills may be run from any directory beneath the project root). Add a short "Nested / centralized plans" paragraph explaining the multi-repo-app layout: parent holds `.plans/`, git sub-repos beneath it, skills invocable from anywhere inside.

- [x] Step 8: Manual verification pass per the Verification section below.

## Verification
- From a scratch fixture `~/tmp/multi-repo-app/` containing `.plans/` (via `/plan-init`) and two git sub-repos `api/` and `web/`: run `/plan-capture Test nested` from inside `multi-repo-app/api/`. It writes `multi-repo-app/.plans/pending/NNN-*.md` — not `multi-repo-app/api/.plans/` — and prints the `Using plans root:` notice.
- `/plan-status` and `/plan-list` from `multi-repo-app/web/` report the same tasks as from `multi-repo-app/`.
- `/plan-init` run inside `multi-repo-app/api/` presents the AskUserQuestion choice and, on the recommended option, creates nothing. Choosing the nested option warns explicitly and only then creates `multi-repo-app/api/.plans/`.
- `/plan-execute NNN worktree` started from `multi-repo-app/api/` creates `multi-repo-app/.worktrees/NNN-slug/` (parent-level, per the multi-repo layout), not `multi-repo-app/api/.worktrees/`.
- `npx plans-cc-dashboard` launched from `multi-repo-app/api/` renders the centralized board instead of exiting 1.
- `node bin/plan-touch.js` from `multi-repo-app/api/` writes the path `~/multi-repo-app` — verify with `cat ~/.claude/plans-cc/projects.json`; no `api` entry appears.
- Regression: in this repo (`plans/`, a plain single-repo project with `.plans/` at the git root), every skill behaves exactly as before, prints **no** `Using plans root:` notice, and `/plan-status` is unchanged.
- Regression: run `/plan-review` from inside a live `.worktrees/NNN-slug/` for a `keep`-executed task. Discovery resolves to the **parent** root (correct — `.plans` in a worktree symlinks there), and `/plan-review` still reviews *inside* the worktree by reading the task's `**Worktree:**` field. Confirm the in-worktree review is not broken.
- Regression: with no `.plans/` anywhere up the tree (e.g. from `/tmp`), the error text is still exactly `Not initialized. Run /plan-init first.`, and the walk terminates at `$HOME`/filesystem root without scanning the whole disk.

## Impact Scope
Roughly 33 files. The change is broad but shallow — most of it is one substituted paragraph per skill.

- `CLAUDE.md` — new cross-skill contract section + registry/nested-layout notes
- `lib/find-root.js` — new
- `lib/registry.js` — compose `normalizeProjectRoot` with the ascent
- `bin/dashboard.js`, `bin/plan-touch.js` — adopt discovery
- `skills/plan-init/SKILL.md` — nesting guard (behavior change)
- `skills/plan-review/SKILL.md`, `skills/plan-execute/SKILL.md`, `skills/plan-spawn/SKILL.md`, `skills/plan-complete/SKILL.md`, `skills/plan-merge-reviews/SKILL.md` — root-sensitive reconciliation
- `skills/plan-status/SKILL.md`, `skills/plan-guide/SKILL.md` — soft-variant checks preserved
- ~22 remaining `skills/plan-*/SKILL.md` — mechanical init-check substitution
- `skills/plan-help/SKILL.md` — documentation

## Assumptions

### Initial (from elaboration)
- **The multi-repo-app layout is the existing multi-repo layout.** The user's "centralized plans + repos" is the parent-holds-`.plans/`, git-sub-repos-beneath shape that `plan-execute:374-377` already detects. This task adds *invocation from anywhere inside*, not a new project model. If multi-repo-app is instead a single git repo with nested package directories, the multi-repo machinery never engages, but root discovery still delivers the requested behavior — so the plan holds either way.
- **First-hit-wins on the ascent.** A nested `.plans/` closer to cwd shadows a centralized ancestor. This preserves any existing per-repo setup rather than silently redirecting it, and step 3 exists to stop new ones being created by accident.
- **`.worktrees/` semantics are unchanged.** Because discovery `cd`s to the root before any git command runs, every relative `.worktrees/` path resolves as it does today. This is the single riskiest assumption and step 5 is dedicated to verifying it.
- ~~**Ascent must not escape a worktree.** The `.worktrees`-segment stop condition keeps discovery inside `.worktrees/NNN-slug/`.~~ **CORRECTED during segment 1.** This was wrong. Because `.plans` inside a worktree is a symlink up to the parent (`plan-execute:463`), the parent *is* the root — discovery correctly resolves a worktree cwd OUT to the parent, and there is no root inside the worktree to find. `.worktrees` is therefore a **pre-ascent collapse**, not a stop condition; the stop conditions are `$HOME` (inclusive) and the filesystem root. `/plan-review` stays in its worktree via the task's existing `**Worktree:**` field, not via discovery — the two concerns are deliberately uncoupled (user-confirmed).
- **The registry stores roots, never sub-repos.** `normalizeProjectRoot` already encodes "a worktree path is not a project"; the same principle extends to "a sub-repo path is not a project."
- Scope excludes any *cross-project* aggregation (one `.plans/` spanning unrelated roots) — the machine-wide registry and desktop app already cover that.

### Discovered during execution
- [high] Composed the `.worktrees` stop with `registry.normalizeProjectRoot` (strip first, then ascend) rather than reimplementing a segment scan in `find-root.js`. **Why:** the task explicitly directed reuse; `normalizeProjectRoot` already returns the path *before* `.worktrees`, so running it first satisfies the stop condition and centralizes the worktree semantics in one place. Added it to `registry.js`'s `module.exports` (it was previously unexported) — a minimal, sanctioned change.
- [high] `hasPlansConfig` uses `fs.statSync(...).isFile()` on `<dir>/.plans/config.json` inside a try/catch returning false. **Why:** mirrors `registry.hasPlansDir`'s best-effort statSync-in-try/catch idiom, and `config.json` being a file (not just present) is the real init signal.
- [low] Placed the CLAUDE.md "Project-root discovery" contract AFTER "Observation provenance" (and its trailing Backlog paragraph), before "How Summary Section". **Why:** it groups with the other cross-skill contracts ("Worktree hygiene", "Observation provenance") and the task left the exact position to my judgment; nothing downstream depends on the ordering.
- [low] `find-root.js` wraps the whole ascent in an outer try/catch (belt-and-suspenders) in addition to `hasPlansConfig`'s inner guard. **Why:** the contract mandates "never throw"; `os.homedir()`/`path` are effectively safe, but the outer guard makes the null-on-any-error invariant explicit and future-proof, matching registry.js's swallow-everything posture.
- [low] In the test, `fs.realpathSync` the `mkdtempSync` root before asserting equality. **Why:** on macOS `os.tmpdir()` resolves through a `/var` → `/private/var` symlink, and `path.dirname`-based ascent preserves whatever prefix `normalizeProjectRoot`'s `path.resolve` produced; realpath-ing the expected value keeps the assertion robust without weakening it.

#### Segment 2 (steps 4-6)
- [high] Used one canonical two-line contract-reference block across all 29 hard-error skills (24 via a scripted perl bulk-replace of the identical dominant pattern, 5 variant skills — clarify/discuss/cleanup/merge-reviews/review — edited to match). **Why:** the segment prompt supplied the canonical replacement verbatim and stressed near-identical wording so "the contract is obviously one thing"; consistency was explicitly prioritized over per-file cleverness.
- [high] `bin/install.js` needed NO change. **Why:** line 70 copies the whole `lib/` dir recursively (`fs.cpSync(LIB_SOURCE, ..., { recursive: true })`) rather than enumerating individual files, so `lib/find-root.js` ships automatically. The `package.json` `files` array already lists `lib`.
- [low] Restructured `dashboard.js`'s module-level `PLANS_DIR`/`CONTEXT_FILE` consts to derive from a new module-level `PROJECT_ROOT = findProjectRoot(process.cwd())`, making all three nullable (`PLANS_DIR`/`CONTEXT_FILE` are `null` when no root is found) and moving the not-found guard in `main()` from `!fs.existsSync(PLANS_DIR)` to `!PROJECT_ROOT`. **Why:** discovery must run exactly once, but the null case has to be handled inside `main()` (module-level `process.exit` would fire at require time and break testing/require-inspection). Nullable consts + a single `main()` guard keeps discovery at module scope while deferring the exit — chosen over threading a resolved value through every function. Every other `process.cwd()` project reference (`registerProject`, `readBranch`, sub-repo scan, basename fallback) re-anchored to `PROJECT_ROOT`; the not-found message now says "no .plans/ found in this directory or any parent."
- [high] `bin/plan-touch.js`: when `findProjectRoot` returns `null` (no `.plans/` up the tree), register NOTHING and exit 0 silently. **Why:** the segment prompt's preferred choice — a path with no `.plans/` anywhere above it is not a plans-cc project, and registering it would pollute the desktop app's project list with a phantom. Required `../lib/find-root` with the same `./lib/find-root` fallback the file already uses for `registry`, preserving the repo-vs-installed dual layout and the total best-effort (try/catch, always exit 0) posture.

#### Segment 3 (step 7 — docs)
- [low] Placed the "Nested / centralized plans" explanation as the closing paragraph OF the "Project-root discovery" contract section (rather than a new sibling section immediately after). **Why:** the segment prompt named both as acceptable and preferred whichever reads naturally; folding it in keeps the concrete layout example adjacent to the walk that resolves it, and avoids a new heading for what is one illustrative paragraph.
- [low] Put the plan-help note as a short prose paragraph directly after the Quick Start fenced block, before "### All Commands", rather than inside the command table or a dedicated notes heading. **Why:** the prompt said "likely a short intro/notes area rather than the command table"; the file has no existing notes heading, and the Quick Start already mentions `/plan-init` and "current directory", so the ascent/exception note reads as a natural clarification there without bloating the table.
- [high] The registry note references `lib/find-root.js` as "the upward normalization" alongside the existing `lib/registry.js` / `bin/plan-touch.js` pointers, and frames the behavior as normalize-upward-before-register producing a roots-only registry. **Why:** directly matches the segment prompt's instruction and the verified segment-2 behavior (`plan-touch.js` threads the start path through `findProjectRoot` so sub-repo/worktree touches register the parent root).

## Changes

### Segment 1 (steps 1-3)
- `CLAUDE.md` — added the **"Project-root discovery (cross-skill contract)"** section after "Observation provenance". Then corrected its prose (see Assumptions): stop conditions are `$HOME` (inclusive) + filesystem root; `.worktrees` is a pre-ascent collapse; discovery and worktree-selection are explicitly uncoupled.
- `lib/find-root.js` — **new.** `findProjectRoot(startDir)` → absolute root or `null`. Composes with `registry.normalizeProjectRoot` (collapse first, then ascend). Never throws.
- `test/find-root.test.js` — **new.** 8 cases: root at startDir, root from nested subdir, no root anywhere, first-hit-wins shadowing, `.worktrees` collapse (×2), `.plans/` without `config.json` ignored, nonexistent startDir returns null.
- `lib/registry.js` — exported `normalizeProjectRoot` (was internal). No behavior change; `test/registry.test.js` still 8/8.
- `skills/plan-init/SKILL.md` — step 1 hardened: cwd-has-config → unchanged "Already initialized" error; incomplete `.plans/` → unchanged repair offer; **ancestor root found → `AskUserQuestion` nesting guard** (recommended: use existing root, create nothing; alternative: create nested `.plans/` with an explicit fragmentation warning); no root anywhere → initialize as before. Discovery exemption documented in-file so a future reader doesn't "fix" it.

### Segment 2 (steps 4-6)
- **31 `skills/plan-*/SKILL.md` migrated to the contract.** 29 hard-error skills now say "Resolve the project root per the **Project-root discovery** contract in `CLAUDE.md` … then `cd` there", with the error text `Not initialized. Run /plan-init first.` preserved verbatim (28 canonical two-line; `plan-merge-reviews` keeps its merged single-line shape). The 2 soft variants keep their distinct non-erroring behavior: `plan-status` prints and stops (retaining "Do not spawn a subagent"), `plan-guide` still offers setup guidance. `plan-init` untouched (exempt).
- `skills/plan-review/SKILL.md` — the main-repo root guard now *invokes* discovery instead of assuming the caller is at the root. Explicitly documents that this is separate from the `**Worktree:**` branch, which still decides the checkout from the task field and must never be overridden by discovery.
- `skills/plan-execute/SKILL.md` — invariant note added at the sub-repo scan: after the step-1 discovery `cd`, cwd IS the project root, which is what keeps the scan and every relative `.worktrees/` path correct unchanged.
- `skills/plan-spawn/SKILL.md`, `skills/plan-complete/SKILL.md`, `skills/plan-merge-reviews/SKILL.md` — root guards and relative `.worktrees/` paths re-anchored to the discovered root. No git semantics, teardown sequences, merge dispatch, or repo-set concurrency rules changed.
- `bin/dashboard.js` — `PROJECT_ROOT = findProjectRoot(process.cwd())` at module scope; `PLANS_DIR`/`CONTEXT_FILE` derive from it; `main()` guards the null case (exit 1, message now says "or any parent"); `registerProject`, `readBranch`, the sub-repo scan, and the project-name fallback all re-anchored. Launching from a sub-repo no longer exits 1.
- `bin/plan-touch.js` — start path threaded through `findProjectRoot` (same defensive `../lib` → `./lib` require as `registry`), so a touch from a sub-repo registers the centralized root, never a phantom sub-repo entry. A null root registers nothing. Best-effort try/catch + always `exit(0)` preserved.
- `bin/install.js` — verified no change needed; it copies `lib/` recursively, so `find-root.js` ships automatically.

**Verified against the real project:** `~/work/multi-repo-app` is exactly the assumed layout (`.plans/` at a non-git parent, five git sub-repos). `findProjectRoot` resolves all five sub-repos to the multi-repo-app root; each would previously have errored `Not initialized. Run /plan-init first.`

### Segment 3 (steps 7-8)
- `CLAUDE.md` — "Machine-Wide Project Registry" now notes that a touch from inside a sub-repo or worktree normalizes upward to the discovered root, so the registry holds only roots and the desktop app never shows phantom projects; `lib/find-root.js` added to its pointer list.
- `CLAUDE.md` — new **"Nested / centralized plans"** paragraph closing the discovery contract, with a concrete `multi-repo-app/` tree. States plainly that this is *not* a new project model — it is the existing multi-repo shape — and that what discovery adds is invocation from anywhere inside the tree. Plans stay centralized; only the invocation site got flexible.
- `skills/plan-help/SKILL.md` — notes that any `plan-*` skill may be run from a sub-directory or sub-repo, prints `Using plans root: <path>` when it resolves upward, and that `/plan-init` is the exception.
- **Step 8 (observation) deferred to review** at `feature/024-nested-usage-centralized-plans-subdirs @ 562c8fb`. See `.plans/state/024-state.md` → Observations for the exact command to run and why it was deferred (running `node bin/dev.js` would overwrite installed global skills mid-task). No later steps depend on it.

**Consistency check:** `grep` confirms no surviving text anywhere in `CLAUDE.md` claims `.worktrees` is a *stop condition* or that discovery returns a worktree path — the corrected semantics hold across all three docs edits.

## Notes
Prior art worth mirroring: git's own `--show-toplevel` ascent, and the `node_modules`/`package.json` resolution walk. Both stop at a boundary and take the first hit — the same two properties this contract needs.

**Found but deliberately NOT fixed (out of scope, pre-existing):** `CLAUDE.md`'s "Project Structure" block is stale independently of this task — it claims `31 total` skills (there are 34) and omits `lib/` and `test/` entirely. It was already wrong before #024; fixing it here would have silently widened the diff. Worth a separate chore task.
