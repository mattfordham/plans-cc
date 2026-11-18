# Doc: Polish README for public sharing (dashboard + desktop-app screenshots & cross-link)

**ID:** 058
**Created:** 2026-11-17T00:00
**Type:** chore
**Status:** completed
**Completed:** 2026-11-17T20:55
**Branch:** chore/058-polish-readme-for-public-sharing

## What
Update read me doc for the sake of get up and sharing publicly add some screenshots of the dashboard and Crosslink to the desktop app and add some screenshots of the desktop app also plan on spawning The same updates for the desktop app at the end. I'm going to be sharing this with potential clients so it would be nice to have it appear professional and complete.

## Why
The README is the first thing a potential client sees, and today it reads as dense internal reference docs — accurate but with no visuals, no hero moment, and no at-a-glance value proposition. Adding dashboard and desktop-app screenshots plus a cross-link to the companion macOS desktop app makes plans-cc look professional and complete when shared publicly, without sacrificing the existing reference material developers rely on.

## How Summary
Additive polish to the root `README.md` — not a rewrite. Add a hero/value-prop blurb and an honest badge row near the top, introduce a committed `docs/images/` asset directory, embed dashboard screenshots (captured by running the in-repo terminal dashboard against this repo's own `.plans/`), and add a new "Desktop app (macOS)" section that describes the companion app (paraphrasing the handoff spec), cross-links to it, and hosts its screenshots. Finish by capturing a follow-up task to mirror these README updates in the separate `plans-desktop` repo. The existing exhaustive reference content (command tables, lifecycle diagrams, workflows) stays intact.

**Files of note:**
- `README.md` — the deliverable; receives the hero blurb, badges, image embeds, and the new desktop-app section
- `docs/images/` — new committed asset directory holding the optimized screenshots (created during execution)
- `bin/dashboard.js` — the in-repo terminal/blessed dashboard that gets screenshotted (`node bin/dashboard.js` against a populated `.plans/`)
- `.plans/artifacts/desktop-app-spec.md` — gitignored handoff spec; read it for prose to paraphrase in the desktop-app section (never link to it — it isn't public)
- `package.json` — source of truth for honest badge content (MIT, Node >=16.7.0, install via `npx` from GitHub — not on npm)

## How
- [x] Step 1: Add a hero + value-prop blurb and an honest badge row near the top of `README.md` (below the tagline). Badges must be truthful — MIT license, Node >=16.7.0, "Built for Claude Code". Do NOT add an npm-version/downloads badge (the package installs via `npx` from GitHub, not npm).
- [x] 👁 Step 2: Capture dashboard screenshots by running `node bin/dashboard.js` against this repo's own populated `.plans/`, then save optimized images into a new `docs/images/` directory (e.g. `docs/images/dashboard.png`). Terminal/TUI capture requires a human or screenshot tool — the agent cannot take the screenshot unaided, so this step produces the committed image files. _(Prereq scaffolding done: `docs/images/.gitkeep` created; actual screenshot capture deferred to review — see Observations.)_
- [x] Step 3: Embed the dashboard screenshot(s) in `README.md` using repo-relative paths (`![Dashboard](docs/images/dashboard.png)`) so they render on GitHub. Place near the dashboard command documentation or in the hero.
- [x] Step 4: Add a new "Desktop app (macOS)" section to `README.md` that briefly describes the companion app's two surfaces (menu-bar glance + cross-project browser), paraphrasing `.plans/artifacts/desktop-app-spec.md` §1 — never link to that gitignored spec. Include a cross-link to the desktop app's public repo/page using a clearly-marked placeholder (`<!-- TODO: desktop app URL -->`) since no public URL exists in this repo yet; do NOT invent a URL.
- [x] 👁 Step 5: Add desktop-app screenshot placeholders (menu-bar glance + browser window) in that section, referencing `docs/images/` paths. The actual images live in the separate `plans-desktop` repo and are deferred to the spawned follow-up task — leave clearly-marked placeholders here rather than inventing images. _(Placeholders + TODO comments added for `desktop-menubar.png` and `desktop-browser.png`; actual image capture deferred to the plans-desktop follow-up — see Observations.)_
- [x] Step 6: Do a light tone pass for a client audience — keep all existing reference content intact (command tables, lifecycle diagrams, workflows); optionally move the deepest reference material (remote sessions, full Development section) into a `<details>` block if the top reads too dense. No full rewrite.
- [x] Step 7: Capture a follow-up task (via `/plan-capture`) to mirror these README updates in the separate `plans-desktop` repo — its own README polish, screenshots, and a cross-link back to plans-cc. That repo is external to this one, so this is a handoff/spawn, not an edit here. _(Captured as task #059 in `.plans/pending/059-mirror-readme-polish-in-plans-desktop.md`.)_

## Verification
- `README.md` renders correctly on GitHub with all embedded images displaying (no broken image links); repo-relative paths resolve.
- Badges are accurate and contain no false claims (no npm badge; license and Node version match `package.json`).
- The desktop-app section describes the companion app and includes a clearly-marked URL placeholder — no invented/fabricated URL is present.
- A follow-up task for the `plans-desktop` README exists in `.plans/`.
- The existing reference content (command tables, lifecycle diagrams, workflows, install instructions) is preserved — a `git diff` shows additions, not deletions of substantive reference material.

## Impact Scope

### Files to Modify
- [ ] `README.md` — add hero/value-prop blurb, badge row, image embeds, and the new "Desktop app (macOS)" section; light tone pass

### Related Files (may need updates)
- `docs/images/` — new directory; holds committed, optimized screenshot assets (created during execution)
- `package.json` — read-only reference for honest badge content (not modified)
- `.plans/artifacts/desktop-app-spec.md` — read-only source to paraphrase for the desktop-app section (not modified, not linked — it's gitignored)

### Endpoints/UI Affected
- The GitHub-rendered README landing page — the primary public-facing surface being improved

## Assumptions

### Initial (from elaboration)
- [high] Asset images live in a new top-level `docs/images/` directory, referenced with repo-relative paths so they render on GitHub. **Why:** conventional GitHub layout; research found no existing assets/images directory, so a convention had to be chosen.
- [high] This is an additive polish, not a rewrite — existing reference content (command tables, lifecycle diagrams, workflows) is preserved; only a hero blurb, badges, visuals, and the desktop-app section are added. **Why:** the task is a "chore"/docs polish and research warned explicitly against over-engineering or restructuring the whole README.
- [high] Badges are built only from known-true facts (MIT, Node >=16.7.0, "Built for Claude Code") and deliberately exclude an npm-version/downloads badge. **Why:** the package installs via `npx` from GitHub and is not published to npm; a client-facing doc must stay truthful.
- [low] The "dashboard" to screenshot is the in-repo terminal/blessed TUI (`bin/dashboard.js`), captured against this repo's own `.plans/`. **Why:** research disambiguated two dashboards; the in-repo one is the only screenshottable surface living in this repo, and the separate macOS app's screenshots are handled via the cross-link/follow-up.
- [low] The desktop-app cross-link is written as a clearly-marked placeholder (`<!-- TODO: desktop app URL -->`) rather than a real URL. **Why:** no public URL/repo for the desktop app exists anywhere in this repo (research Open Question 2); inventing one would be wrong, so a placeholder the user fills in is the safe choice.
- [low] Desktop-app screenshots are left as placeholders here and deferred to the spawned `plans-desktop` follow-up task. **Why:** that app lives in a separate repo not visible from here (research Open Question 3); the images can only be captured there.
- [low] A follow-up task to mirror the README updates in the `plans-desktop` repo is captured (not spawned as a parallel worktree), since that repo is external. **Why:** the task says "plan on spawning the same updates for the desktop app at the end"; `/plan-spawn` operates on worktrees within one project, so a plain capture/handoff is the correct mechanism for a separate external repo.

### Discovered during execution
- [high] Placed the badge row immediately after the tagline and the value-prop blurb between it and `## Overview`, per the step spec. **Why:** The step directed "below the tagline, before `## Overview`"; keeping badges adjacent to the title and the prose blurb just above Overview reads naturally for a first-time viewer.
- [low] Linked the MIT badge to `LICENSE` (repo-relative), the Node badge to nodejs.org, and the Claude Code badge to the Claude Code docs. **Why:** The step mandated the three badge image URLs but not their link targets; relative `LICENSE` and canonical doc links are the honest, non-broken choices. Shields badges render fine without links, so these are additive.
- [low] Did NOT embed any screenshot in the README this segment. **Why:** My segment covers only Steps 1-2 (hero/badges + `docs/images/` scaffolding). The `dashboard.png` embed is Step 3 (a later segment), and the real screenshot capture is deferred to human review per the observation-step instructions.
- [high] Placed the `dashboard.png` embed directly below the fenced `plans-cc-dashboard` / `node bin/dashboard.js` command block (under `## Commands`), with an adjacent TODO HTML comment. **Why:** Step 3 directed "near the dashboard command documentation"; immediately after the command block is where a reader expects to see what the dashboard looks like, and the embed path stays repo-relative so it renders on GitHub once the human drops the image in.
- [high] Added the new `## Desktop app (macOS)` section between `## File Structure` and `## Remote sessions (branch mode)`. **Why:** Step 4 offered that exact slot as a good spot; a read-only companion-viewer callout reads naturally right after the `.plans/` file-structure explanation and before the remote-session plumbing.
- [low] Rendered the desktop-app cross-link as a blockquoted link line `> **[Plans Desktop →](#)**` with an inline `<!-- TODO: desktop app URL -->`. **Why:** Step 4 suggested exactly this shape; the `#` href is an obvious visible placeholder and the TODO comment names what needs filling in, without fabricating any URL.
- [low] Named the two desktop screenshot placeholders `docs/images/desktop-menubar.png` (Surface A) and `docs/images/desktop-browser.png` (Surface B), each with an adjacent TODO comment noting they're produced in the `plans-desktop` repo / follow-up task. **Why:** Step 5 gave those example filenames; one image per surface matches the two-surface description and the honest-placeholder pattern from Step 3. Did NOT mark the observation verified or fabricate any image — human capture happens outside this agent.
- [high] Step 6 tone pass was minimal: did NOT add a `<details>` collapsible block and did NOT restructure section ordering. **Why:** The top (hero → Overview → Installation → Getting Started) already reads smoothly and professionally for a first-time reader, and the step says to force a collapsible only if the top is genuinely too dense — it isn't. Conservative "change less" default.
- [low] Reworded one awkward aside in Installation from "`blessed` is the only runtime dependency — previously the package was zero-dep." to "`blessed` (used by the dashboard) is the package's only runtime dependency." **Why:** The "previously zero-dep" clause is a developer-facing changelog note that reads oddly to a public/client audience; the reword preserves the load-bearing fact (blessed is the only runtime dependency) and adds useful context (it powers the dashboard). No substantive reference material removed.

## Changes

### Step 1 — Hero blurb + honest badge row (`README.md`)
- Added a bold value-prop blurb below the tagline (before `## Overview`) framing plans-cc for a first-time/client reader.
- Added a truthful badge row (no npm badge, since the package installs via `npx` from GitHub):
  - `[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)`
  - `[![Node](https://img.shields.io/badge/node-%3E%3D16.7.0-green.svg)](https://nodejs.org)`
  - `[![Built for Claude Code](https://img.shields.io/badge/built%20for-Claude%20Code-d97757.svg)](https://docs.anthropic.com/en/docs/claude-code)`

### Step 2 — `docs/images/` scaffolding (observation deferred)
- Created `docs/images/` with an empty `docs/images/.gitkeep` so embed paths have a home and the directory is tracked.
- The actual dashboard TUI screenshot (`docs/images/dashboard.png`) cannot be captured by an automated agent and is **deferred to review** — a human runs `node bin/dashboard.js` against this repo's `.plans/` and drops the optimized image in. See `## Observations` / state file.

### Step 3 — Embed dashboard screenshot (`README.md`)
- Added `![plans-cc dashboard](docs/images/dashboard.png)` below the `plans-cc-dashboard` / `node bin/dashboard.js` command block under `## Commands`, with an adjacent TODO comment so the embed is honest (renders once the human adds the PNG).

### Step 4 — New `## Desktop app (macOS)` section (`README.md`)
- Added between `## File Structure` and `## Remote sessions (branch mode)`. Paraphrases the gitignored handoff spec §1 (never links to it): describes the read-only machine-wide macOS viewer and its two surfaces (menu-bar glance + cross-project browser window).
- Cross-link rendered as a visible placeholder `> **[Plans Desktop →](#)** <!-- TODO: desktop app URL -->` — no URL fabricated.

### Step 5 — Desktop-app screenshot placeholders (observation deferred)
- Added two honest `![...](docs/images/...)` embeds (`desktop-menubar.png`, `desktop-browser.png`) with adjacent TODO comments noting the images are produced in the separate `plans-desktop` repo / follow-up task. No images fabricated.

### Step 6 — Light tone pass (`README.md`)
- Conservative: no `<details>` collapsible added, no section reordering (the top already reads well). One awkward Installation aside reworded from "`blessed` is the only runtime dependency — previously the package was zero-dep." to "`blessed` (used by the dashboard) is the package's only runtime dependency." No substantive reference content removed — `git diff` is additions + this one light edit.

### Step 7 — Follow-up capture (external `plans-desktop` repo)
- Captured follow-up task **#059** at `.plans/pending/059-mirror-readme-polish-in-plans-desktop.md` to mirror this README polish in the separate `plans-desktop` repo: its own README polish/badges, capture the two desktop screenshots, supply the public desktop-app URL (filling the `<!-- TODO: desktop app URL -->` placeholder here), and cross-link back to plans-cc. Bumped `config.json` `next_id` 59 → 60.

### Net result
- `README.md` diff: additions-only polish (hero blurb, 3 honest badges, dashboard screenshot embed, new `## Desktop app (macOS)` section, 2 desktop screenshot placeholders) plus one light Installation reword. All existing reference content (command tables, lifecycle diagrams, workflows, install instructions, Development section) preserved.
- New files: `docs/images/.gitkeep`.
- **Deferred to review (👁):** the three real images — `docs/images/dashboard.png` (human runs `node bin/dashboard.js` and screenshots the TUI) and the two desktop screenshots (produced in `plans-desktop`, task #059). Markdown embeds + TODO comments are in place so they render once the images land.

## Notes
- Research flagged that committing binary screenshots into a previously text-only, near-zero-dependency repo adds weight — keep images optimized and few; compress GIFs aggressively if used.
- The desktop app is internally named "plans-desktop" / "Plans Desktop" (a macOS Swift app); its handoff spec is at `.plans/artifacts/desktop-app-spec.md` (gitignored — readable for content, not linkable).
- Screenshot capture of a terminal TUI cannot be done by the agent unaided; Steps 2 and 5 are `👁`-tagged and expect a human/tool to produce the image files.
