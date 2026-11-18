# Support remote Figma MCP in des-build and des-author

**ID:** 060
**Created:** 2026-11-18T00:00
**Type:** feature
**Status:** completed
**Branch:** feature/060-support-remote-figma-mcp-in-des-build
**Completed:** 2026-11-18T00:00

## What
Support remote Figma MCP in des-build and des-author. Also double check that the plans desktop app doesn't need to have any related tools whitelisted

## Why
The `des-*` family currently hardcodes the **local** Figma Dev Mode MCP server
(`mcp__figma-dev-mode-mcp-server__*`) as its only Figma source. A **remote** Figma MCP
server now exists (`https://mcp.figma.com/mcp`, installed via the
`figma@claude-plugins-official` plugin, tools namespaced `mcp__plugin_figma_figma__*`).
Users on the remote server cannot run `des-build` or `des-author` at all: des-build's
Step 1a preflight probes only the local server, so it hard-ABORTs even though a perfectly
good remote connection is available. We want either server to satisfy the Figma input —
remote-first with local fallback — while keeping the "both inputs required, no degraded
mode" guarantee intact: the preflight must still ABORT when *neither* server responds.
The desktop app must be confirmed to need no related whitelisting (it makes no Figma/MCP
calls — it only reads `~/.claude/plans-cc/projects.json`).

## How Summary
Make both `des-build` and `des-author` accept EITHER Figma MCP server. In each skill:
add the four remote `mcp__plugin_figma_figma__*` read tools to `allowed-tools` alongside
the existing local ones; generalize every hardcoded local tool reference in the prose to
"the local server's `X` or the remote server's `Y`" (remote-first, local-fallback); and
require `create_session` (with fileKey) before any remote file read. The preflight gate
keeps its hard-ABORT semantics but now passes when *either* server answers, and records
which one did. Update the `CLAUDE.md:484` Figma-access contract so it names both servers.
Confirm (already verified during elaboration) that the desktop-app spec references no
Figma/MCP tools, so nothing needs whitelisting there — document that finding in Changes.

**Files of note:**
- `skills/des-build/SKILL.md` — allowed-tools (L12-16), Step 1a preflight probe (L55), Step 5 node pull (L113), Step 8a verify (L141); the `html font-size` and screenshot tool refs.
- `skills/des-author/SKILL.md` — allowed-tools (L12-15), Step 1 MCP-first (L38), Step 2 survey (L47), edge case (L132).
- `CLAUDE.md` — the Figma-access-belongs-to-des-build contract (L484).
- `.plans/artifacts/desktop-app-spec.md` — read-only confirmation target (no Figma refs → no change).

## How
- [x] Step 1: Confirm scope — grep the repo for every `figma-dev-mode-mcp-server` / `plugin_figma` reference, and confirm the desktop-app spec (`.plans/artifacts/desktop-app-spec.md`) contains no Figma/MCP tool references (so no whitelisting is needed there). Record the finding.
- [x] Step 2: In `skills/des-build/SKILL.md` `allowed-tools`, add the remote read tools `mcp__plugin_figma_figma__get_design_context`, `get_metadata`, `get_variable_defs`, `get_screenshot` alongside the existing local ones (`create_session` is already present). Keep the local `figma-dev-mode-mcp-server` tools — do NOT remove them, or the local path breaks.
- [x] Step 3: In `skills/des-build/SKILL.md` prose, generalize the hardcoded local tool references to accept either server, remote-first with local fallback: Step 1a preflight probe (L55), Step 5 node pull (L113), Step 8a screenshot (L141). The preflight still hard-ABORTs, but only when NEITHER server answers; it records which server responded. Require `create_session` (fileKey) before remote file reads, and note remote reads always need fileKey + nodeId from a URL (no current-selection reads).
- [x] Step 4: In `skills/des-author/SKILL.md` `allowed-tools`, add the same four remote read tools alongside the local ones.
- [x] Step 5: In `skills/des-author/SKILL.md` prose, generalize Step 1 ("Prefer the Figma Dev Mode MCP"), Step 2 survey tool refs, and the edge case (L132) to accept either server, remote-first with local fallback, and to require `create_session` before remote reads.
- [x] Step 6: In `CLAUDE.md`, update the "Figma MCP access belongs to des-build" contract (L484) so it names BOTH server tool namespaces (`mcp__figma-dev-mode-mcp-server__*` and `mcp__plugin_figma_figma__*`) as the capability that belongs to des-build/des-author and not to `/plan-execute`.
- [x] Step 7: Verify — re-grep to confirm both server namespaces are present in both skills' allowed-tools and prose; confirm the local server is NOT removed anywhere; confirm `CLAUDE.md` names both; confirm no new references leaked into `/plan-execute` or the desktop spec; run `npm test` (unaffected lib tests must still pass).

## Verification
- `grep -n "plugin_figma" skills/des-build/SKILL.md skills/des-author/SKILL.md` shows the four remote read tools in each skill's allowed-tools and in the generalized prose.
- `grep -n "figma-dev-mode-mcp-server" skills/des-build/SKILL.md skills/des-author/SKILL.md` still shows the local tools (nothing removed — local fallback intact).
- des-build Step 1a preflight prose aborts only when NEITHER server responds, and records which answered.
- `CLAUDE.md` Figma-access contract names both `mcp__figma-dev-mode-mcp-server__*` and `mcp__plugin_figma_figma__*`.
- No Figma/MCP tool references leaked into `/plan-execute`'s allowed-tools or `.plans/artifacts/desktop-app-spec.md`; desktop app confirmed to need no whitelisting.
- `npm test` passes (lib unit tests are unaffected by skill-markdown edits).

## Impact Scope
- `skills/des-build/SKILL.md` — allowed-tools + Step 1a/5/8a prose.
- `skills/des-author/SKILL.md` — allowed-tools + Step 1/2/edge-case prose.
- `CLAUDE.md` — Figma-access contract (L484).
- `.plans/artifacts/desktop-app-spec.md` — read-only confirmation (no change expected).

## Assumptions

### Initial (from elaboration)
- [high] This is a declarative skill-markdown change; there is no executable test for SKILL.md files. Verification is by grep assertions + the existing `npm test` lib suite (which this does not touch). **Why:** skills are pure markdown the model follows, per the project CLAUDE.md "Skills themselves are declarative, not executable code, and have no automated tests."
- [high] The local `figma-dev-mode-mcp-server` tools stay in both skills (remote-first, local-fallback — never remove local). **Why:** the capture Notes explicitly warn that removing the local server before this lands makes des-build preflight BLOCK; the goal is to ACCEPT either server, not swap one for the other.
- [high] The desktop app needs no Figma/MCP whitelisting. **Why:** `.plans/artifacts/desktop-app-spec.md` contains zero Figma/MCP references (confirmed by grep during elaboration); it only consumes `~/.claude/plans-cc/projects.json`.
- [low] Out-of-repo global skills (`~/.claude/skills/figma-port|figma-build|figma-tokens`) are OUT OF SCOPE for this task — the task targets the in-repo `des-*` family. **Why:** the capture Notes list them under "Out of repo"; editing files outside this repo is beyond the stated deliverable, which is the `des-build`/`des-author` skills and the `CLAUDE.md` contract.
- [low] The remote server's `create_session` requirement (fileKey before file reads; fileKey+nodeId from a URL) is surfaced as prose guidance in both skills rather than enforced by a new preflight sub-check. **Why:** the preflight's job is reachability (either server answers); session mechanics are a usage detail the skill prose documents, consistent with how the existing prose documents local-server usage.

### Discovered during execution
- [low] In des-build Step 1a I added a numbered remote sub-procedure (derive fileKey+nodeId from the URL → `create_session` → `get_metadata` probe), then "fall through to local", then "ABORT only when NEITHER responds". **Why:** chose a prose structure that keeps the hard-ABORT semantics intact while making the remote-first/local-fallback order and the mandatory create_session explicit; an alternative flatter phrasing was possible but the task asked to surface the create_session + fileKey facts, which a numbered sub-procedure states most unambiguously.
- [low] Recorded the answering server by adding a `Figma server: remote (mcp.figma.com) ✓ [or: local (Dev Mode MCP) ✓]` line as the FIRST line of the existing Preflight evidence block (above the node-reachable line), rather than appending it. **Why:** the server choice governs Steps 5/8a, so stating it first reads as the top-level fact; placement was a judgment call between first vs. appended.
- [low] In Steps 5 and 8a I spelled out the full `get_screenshot / get_metadata / get_design_context` (Step 5) and `get_screenshot / get_design_context` (Step 8a) tool names for BOTH namespaces rather than writing `mcp__plugin_figma_figma__*`. **Why:** explicit tool names match the allowed-tools list and the existing local-only prose style; the glob form would have been terser but less checkable.
- [low] Also generalized the des-build `allowed-tools` block only (not the line-27 `description` or the line-34 "Two required inputs" paragraph, which still say "Figma Dev Mode MCP"). **Why:** the segment scope named Step 1a/5/8a prose + allowed-tools specifically; the description/intro paragraph generalization, if wanted, belongs with the CLAUDE.md prose pass in the next segment — flagged here so it is not lost. No file outside the listed scope was touched.
- [low] (segment 2) In des-author Step 1, kept the generic `get_variable_defs`/`get_metadata`/`get_design_context`/`get_screenshot` bullets under a shared "from whichever server is connected" preface rather than duplicating them per namespace. **Why:** the method names are server-agnostic; duplicating them per server would bloat the step without adding information, and des-author's non-blocking nature makes the exact namespace less load-bearing than in des-build.
- [low] (segment 2) In des-author I added an explicit "des-author does not hard-abort, unlike des-build" clause to Step 1's non-blocking line. **Why:** the segment instruction stressed preserving the non-blocking semantics; stating the contrast with des-build inline makes the intentional divergence auditable rather than looking like an omission.
- [low] (segment 2) CLAUDE.md contract: broadened the subject to "`des-build` (and `des-author`)" and named both namespaces, but left the rest of the paragraph (which still says "des-build's own allowed-tools") verbatim. **Why:** des-author declares the same tools, but the paragraph's argument is about not leaking Figma access to the orchestrator; rewording every "des-build" mention to "des-build/des-author" would churn the reasoning without changing it. Broadening the namespace list was the required change; the single-skill phrasing of the argument body is still accurate.

## Changes

Both `des-build` and `des-author` now accept **either** Figma MCP server — the remote
plugin (`mcp__plugin_figma_figma__*`, `https://mcp.figma.com/mcp`) **remote-first**, with
the local Dev Mode MCP (`mcp__figma-dev-mode-mcp-server__*`) as the fallback. The local
server was NOT removed anywhere; both are accepted. The "both inputs required, no degraded
mode" guarantee is preserved: des-build's preflight still hard-ABORTs, but now only when
*neither* server responds, and it records which server answered.

**`skills/des-build/SKILL.md`**
- `allowed-tools`: added the four remote read tools (`get_design_context`, `get_metadata`,
  `get_variable_defs`, `get_screenshot`) under `mcp__plugin_figma_figma__*`, alongside the
  existing local tools and the already-present `create_session` (local tools kept).
- `description` (frontmatter) + the "Two required inputs, no degraded mode" intro: now name
  a "reachable Figma MCP (remote plugin or local Dev Mode)" instead of only Dev Mode.
- Step 1a preflight: rewritten as remote-first (derive fileKey+nodeId from the Figma URL →
  mandatory `mcp__plugin_figma_figma__create_session` → `get_metadata` probe) → local
  fallback (`mcp__figma-dev-mode-mcp-server__get_metadata`) → **ABORT only when NEITHER
  responds**. The `🔴 BLOCKED` message and autonomous-abort semantics preserved; the evidence
  block now records `Figma server: remote (mcp.figma.com) ✓ [or: local (Dev Mode MCP) ✓]`.
- Step 5 (node pull) and Step 8a (verify screenshot): generalized to "whichever server
  Step 1a established as live", naming both namespaces.

**`skills/des-author/SKILL.md`**
- `allowed-tools`: added `mcp__plugin_figma_figma__create_session` + the four remote read
  tools alongside the local tools (local kept).
- Step 1 ("Confirm the Figma input source"): now MCP-first, **remote-first with local
  fallback**, naming both servers; documents the remote server's mandatory `create_session`
  (fileKey) before reads and the fileKey+nodeId-from-URL requirement (no current-selection
  reads). des-author's **non-blocking** behavior is preserved and made explicit (it does NOT
  hard-abort like des-build — it proceeds with whatever input is available).
- Step 2 survey + the "Figma MCP not connected" edge case: generalized to either server.

**`CLAUDE.md`**
- The "Figma MCP access belongs to des-build" contract (L484) now reads "belongs to
  `des-build` (and `des-author`)" and names **both** tool namespaces
  (`mcp__figma-dev-mode-mcp-server__*` and `mcp__plugin_figma_figma__*`) as the capability
  that must not be granted to `/plan-execute`. The argument/reasoning is unchanged.

**Desktop app — no whitelisting needed (confirmed).**
`.plans/artifacts/desktop-app-spec.md` contains **zero** Figma/MCP tool references (grep for
`figma`/`mcp__` returns no matches). The desktop app only consumes
`~/.claude/plans-cc/projects.json` and makes no Figma/MCP calls, so nothing there needs any
related tools whitelisted. No change made to the spec.

**Verification run.** `npm test` → 144/144 pass (the `lib/` unit suite is unaffected by the
markdown edits). Grep assertions all pass: both remote namespaces present in both skills'
allowed-tools + prose; local server still present everywhere (fallback intact); CLAUDE.md
names both; zero Figma/MCP refs leaked into `skills/plan-execute/SKILL.md` or the desktop
spec.

**Out of scope (noted, not done):** the global `~/.claude/skills/figma-port|figma-build|
figma-tokens` live outside this repo and were deliberately left untouched — this task's
deliverable is the in-repo `des-*` family + the `CLAUDE.md` contract.

## Notes
Context from capture session (2026-11-18):
- Remote server: `https://mcp.figma.com/mcp`, installed via the `figma@claude-plugins-official` plugin; tools are namespaced `mcp__plugin_figma_figma__*` (confirmed: `get_metadata`, `get_design_context`, `get_variable_defs`, `get_screenshot`, `create_session`).
- Remote server requires `create_session` (with fileKey) before any file tool, and always needs fileKey + nodeId from a URL — no current-selection reads (that's desktop-only).
- Hardcoded local-server refs: `skills/des-build/SKILL.md` (allowed-tools + Step 1a preflight probe + Steps at ~113/141), `skills/des-author/SKILL.md` (allowed-tools + "Prefer the Figma Dev Mode MCP"), `CLAUDE.md:484` (Figma-access-belongs-to-des-build contract). des-build already lists a stray `mcp__plugin_figma_figma__create_session`.
- Proposed shape: accept either server (remote first, local fallback); preflight still hard-aborts if neither responds; record which server answered.
- Out of repo: global `~/.claude/skills/figma-port|figma-build|figma-tokens` also reference only the local server.
- Desktop app: initial read is that it only consumes `~/.claude/plans-cc/projects.json` and makes no Figma/MCP calls — confirm against `.plans/artifacts/desktop-app-spec.md`.
- Don't remove the local `figma-dev-mode-mcp-server` until this lands, or des-build preflight will BLOCK.
