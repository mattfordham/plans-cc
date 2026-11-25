# GitHub Issues: How to Automatically Import as Plans?

**ID:** 056
**Created:** 2026-11-12T00:00
**Type:** feature
**Status:** elaborated

## What
Github Issues. How to automatically import as plans?

Design and build a way to pull GitHub Issues into plans-cc as pending tasks, so that an issue backlog can seed the plan backlog without hand-copying each one. Delivered as a new `/plan-gh-import` skill that batch-reads issues via the `gh` CLI, maps each to a task file, and is safe to re-run (already-imported issues are detected and skipped).

## Why
Teams already track work as GitHub Issues; re-typing each one into `/plan-capture` is friction that stops plans-cc being adopted on issue-driven repos. A batch importer turns an existing issue backlog into an elaboratable plan backlog in one command, mirroring the value `/plan-import` and `/plan-mine` already provide for markdown docs and transcripts.

## How Summary
Add a new sibling import skill, `/plan-gh-import`, modeled line-for-line on `plan-import`: a `disable-model-invocation: true` multi-task minter that fetches issues with `gh issue list --json …` (the project's zero-dependency external-access path), maps each issue to the standard task template, dedups against a stored issue-URL `**Source:**` field so re-runs are idempotent, then mints task IDs through the existing shared branch-mode loop-minter contract (`plans-git.js sync` once before the loop, `commit --sync-push` once after). No npm dependency is added and no runtime (`lib/`) code changes — the work is one new SKILL.md plus three doc registrations. Register the new ID-minter in CLAUDE.md's "Allocate ID (branch mode)" enumeration, the "All Skills" table, and the README Commands table. The installer (`bin/install.js`) copies every `skills/*` directory, so it picks the new skill up with no edit.

**Files of note:**
- `skills/plan-gh-import/SKILL.md` — NEW: the importer skill (the deliverable), modeled on `plan-import`.
- `skills/plan-import/SKILL.md` — template to copy: frontmatter, proposal→confirm→loop structure, task-file template, advisory dedup, loop-minter ID block.
- `skills/plan-mine/SKILL.md` — reference for the `allowed-tools` list that includes `Bash` (needed to run `gh`).
- `skills/plan-execute/SKILL.md` — step 2.5 `source_kind = "github-issue"` precedent for issue field extraction and `**Source:**` format to stay consistent with.
- `skills/plan-capture/SKILL.md` — reuse the slug rule (step 4), the type keyword table (step 5), and the artifact-prefix heuristic (step 5.5).
- `lib/plans-git.js` — unchanged; called as `~/.claude/plans-cc/plans-git.js` for `mode` / `sync` / `commit --sync-push`.
- `CLAUDE.md` — register the new minter in the "Allocate ID (branch mode)" enumeration + the "All Skills" table.
- `README.md` — add a Commands-table row for `/plan-gh-import`.

## How
- [ ] Step 1: Author `skills/plan-gh-import/SKILL.md` frontmatter and header — `name: plan-gh-import`, `disable-model-invocation: true`, `allowed-tools: [Read, Write, Edit, Bash, Glob, AskUserQuestion]`, `argument-hint: "[gh issue list filters, e.g. --label bug --state open]"`, and a one-line description. Copy `skills/plan-import/SKILL.md`'s Step 1 (Project-root discovery) verbatim.
- [ ] Step 2: Add a `gh` preflight step — run `gh auth status` (and `gh --version`); if `gh` is missing or unauthenticated, error with a clear message pointing to `gh auth login`, and stop. This is the only external-tool gate.
- [ ] Step 3: Fetch issues — `gh issue list --json number,title,body,labels,state,url,author,assignees [--repo owner/name] [filters from $ARGUMENTS] --limit N`. Default to open issues; pass `$ARGUMENTS` straight through to `gh`; infer the repo from the current git remote (gh default) unless `--repo` is given.
- [ ] Step 4: Map each issue to task fields — title→Title (apply the `plan-capture` slug rule + artifact-prefix heuristic), body→`## What`, labels→Type via a hardcoded `bug`/`enhancement`→`feature`/`refactor`/`tech-debt`/`chore`/`docs` mapping that falls back to the `plan-capture` title keyword table; carry `url`, `number`, `author`, `assignees`, and `labels` through for the Source line and Notes.
- [ ] Step 5: Dedup / idempotency — Glob `.plans/pending/`, `.plans/completed/`, and `.plans/backlog/` and grep for a stored `**Source:**` issue URL; annotate already-imported issues in the proposal (advisory, matching plan-import) so re-runs don't double-import.
- [ ] Step 6: Proposal → confirm → loop — reuse plan-import's proposal table and the shared **Allocate ID (branch mode)** loop-minter block verbatim: `plans-git.js mode`; if `branch`, `plans-git.js sync` once *before* the loop; per approved issue read `next_id`, write `.plans/pending/NNN-slug.md` from the standard task template with a `**Source:** Imported from GitHub issue #<number> (<url>)` header field and a Notes block recording author/assignees/labels, increment `next_id`; update PROGRESS.md; `plans-git.js commit --sync-push "<msg>"` once *after* the loop (plain `commit` outside branch mode).
- [ ] Step 7: Register the new skill in docs — add it to CLAUDE.md's **Allocate ID (branch mode)** minter enumeration and call-sites list, add a row to the CLAUDE.md "All Skills" table and the README Commands table. Confirm no `bin/install.js` change is needed (it copies every `skills/*` directory).
- [ ] Step 8: Add the end-of-action marker to the skill (`🟢 IMPORTED · N tasks → Next: /plan-status`) and manually test the full path against a repo with issues (preflight failure, fresh import, idempotent re-run).

## Verification
- `skills/plan-gh-import/SKILL.md` exists with valid YAML frontmatter and follows the plan-import skeleton (frontmatter fields, Step-1 discovery block, proposal→confirm→loop, loop-minter ID block).
- Running `/plan-gh-import` against a repo with open issues creates one `.plans/pending/NNN-slug.md` per approved issue, each carrying a `**Source:**` issue URL, a correctly-inferred `**Type:**`, and the issue body in `## What`.
- Re-running `/plan-gh-import` detects already-imported issues (by stored URL) and does not create duplicates.
- A missing/unauthenticated `gh` fails loudly with a `gh auth login` hint and mints nothing.
- No new npm dependency is introduced (`package.json` unchanged); `bin/install.js` picks the skill up with no edit.
- CLAUDE.md ("Allocate ID (branch mode)" enumeration + "All Skills" table) and README Commands table list `/plan-gh-import`.
- `npm test` still passes (no `lib/` runtime changes expected).

## Impact Scope

### Files to Modify
- [ ] `skills/plan-gh-import/SKILL.md` — NEW: the importer skill (the primary deliverable).
- [ ] `CLAUDE.md` — add `/plan-gh-import` to the "Allocate ID (branch mode)" minter enumeration + call-sites list, and to the "All Skills" table.
- [ ] `README.md` — add a Commands-table row for `/plan-gh-import`.

### Related Files (may need updates)
- `skills/plan-import/SKILL.md` — source template (read/copy, not modified).
- `skills/plan-mine/SKILL.md` — allowed-tools reference (read, not modified).
- `skills/plan-execute/SKILL.md` — step 2.5 `github-issue` precedent (read, not modified).
- `skills/plan-capture/SKILL.md` — slug/type/artifact-prefix rules (read/reuse, not modified).
- `lib/plans-git.js` — called by path; no change expected.
- `bin/install.js` — no change (copies every `skills/*` directory); verify only.

### Endpoints/UI Affected
- New user-facing command `/plan-gh-import` surfaced in the skill picker.

## Assumptions

### Initial (from elaboration)
- [high] Build this as a NEW `/plan-gh-import` skill rather than overloading `/plan-import`. **Why:** research shows `/plan-import` is documented as the structured-markdown importer; the project's import/mine split keeps one skill per source kind, and a new sibling matches that pattern.
- [high] Reach GitHub via the `gh` CLI (through `Bash`), not an npm GitHub SDK. **Why:** the project is deliberately near-zero-dependency (only `blessed`, for the dashboard); `gh` is the sanctioned dependency-free path and `plan-execute` already reaches external services (Trello/GitHub/Linear) without SDKs.
- [high] Infer the target repo from the current git remote (gh's default), allowing an explicit `--repo owner/name` override. **Why:** gh already resolves the repo from the remote, so this is the least-surprising default and needs no new config.
- [low] Default to importing OPEN issues only and pass `$ARGUMENTS` straight through to `gh issue list` (`--label`, `--state`, `--assignee`, `--milestone`, `--limit`). **Why:** the source description didn't specify scope; open issues are the common "backlog to import" case, and pass-through filters avoid baking policy into the skill. Closed-issue import is left out of v1.
- [low] Map labels→Type with a hardcoded table (`bug`→bug, `enhancement`/`feature`→feature, `refactor`/`tech-debt`→refactor, `chore`/`docs`→chore), falling back to the plan-capture title keyword heuristic; NOT configurable. **Why:** research returned no agreed mapping; a hardcoded default honors the absence-discipline convention (no new `/plan-init` config keys) while staying predictable.
- [low] Use the full issue **URL** as the idempotency key, stored in a `**Source:**` header field, with dedup done by grepping pending/completed/backlog for that URL; keep dedup advisory (annotate in the proposal) rather than hard-silent-skip. **Why:** issue numbers collide across repos so the URL is safest; advisory dedup matches plan-import's existing confirm-driven convention.
- [low] Map title→Title and body→`## What`, and record author/assignees/labels in the task's `## Notes`. **Why:** title+body are the load-bearing fields (consistent with plan-execute's github-issue extraction); assignee/label metadata is useful context but not structural, so it belongs in Notes.
- [low] Keep the confirmation gate (proposal table) rather than adding an auto-confirm/non-interactive mode in v1. **Why:** both `/plan-import` and `/plan-mine` always gate on explicit confirmation; matching that keeps the skill family consistent, and an autonomous mode can be a follow-up.

### Discovered during execution
_To be filled during execution_

## Changes
_To be filled during execution_

## Notes
This task is design-and-build: it answers "how to automatically import GitHub issues as plans" by specifying and building the `/plan-gh-import` skill. No `lib/` runtime code changes are anticipated — the skill is declarative markdown and leans entirely on the existing `plans-git.js` helper and `gh` CLI. If a future iteration wants true automation (unattended/cron import), that is a separate follow-up building on this skill's confirmation-gated v1.
