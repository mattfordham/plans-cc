# Add live-updating TUI dashboard CLI

**ID:** 003
**Created:** 2026-04-12T00:00
**Type:** feature
**Status:** completed
**Branch:** feature/003-add-live-updating-tui-dashboard-cli
**Completed:** 2026-04-13T00:00

## What
Add a live-updating TUI dashboard CLI (`bin/dashboard.js`) that watches `.plans/` files and renders task status in real time, mirroring `plan-status` output. Use a TUI library (`blessed`) for a nicer look — this will be the first runtime dependency. Match existing `bin/` script style (shebang + CommonJS + `main()`).

## Why
Adds value by letting a developer keep a live, always-visible view of task state on a second monitor or tmux pane while they work. `/plan-status` is a point-in-time snapshot that requires re-invocation; a watched TUI closes that loop so the user sees checkbox progress, status transitions, and new captures the moment they happen, without context-switching into Claude Code to re-run the skill.

## How
- [x] Step 1: Add `blessed` as the first runtime dependency in `package.json`. Update `engines` note if needed (blessed works on Node 16+). Commit the `package-lock.json` that results.
- [x] Step 2: Register a second bin entry in `package.json`: `"plans-cc-dashboard": "bin/dashboard.js"`. Leave the existing `"plans-cc": "bin/install.js"` untouched.
- [x] Step 3: Create `lib/parse-tasks.js` — a CommonJS module that scans `.plans/pending/` and `.plans/completed/`, extracts `{id, title, type, status, done, total, blockedBy, isBlocked}` per task by parsing the `# Title` header, the `**ID:** / **Type:** / **Status:** / **Blocked by:**` frontmatter lines, and counting `- [x]` / `- [ ]` checkboxes inside the `## How` section only (stop counting at the next `## ` heading). Validate `**Blocked by:**` IDs against `.plans/completed/` filenames. Also return summary counts `{pending, elaborated, inProgress, review, completed}`. No external deps — plain `fs`/`path`.
- [x] Step 4: Create `lib/render-dashboard.js` — a pure function that takes `{tasks, summary, branch, subRepos}` and returns the exact line-by-line string format from `skills/plan-status/SKILL.md` lines 54–84: header, branch line, summary line, one task per line with glyphs (`▶` in-progress, `★` review, `○` elaborated, `·` pending, `⊘` blocked), `[type]` in brackets, `done/total` progress when total>0, and the legend footer. Sort tasks in the same priority order plan-status uses: in-progress → review → elaborated → pending (blocked stays within its status group).
- [x] Step 5: Create `bin/dashboard.js` with the shebang + CJS + `main()` pattern from `bin/install.js`. In `main()`: lazy-require `blessed`, create a `blessed.screen` with a single `blessed.box` for content, do an initial render, then `fs.watch('.plans', { recursive: true })` with a 100ms debounce that re-parses and re-renders. Cache `git branch --show-current` output with a 5s TTL (synchronous `child_process.execSync`, wrapped in try/catch so non-git dirs still work). Wire `q`, `Escape`, and `Ctrl+C` to `process.exit(0)`. If `blessed` is not installed, print a friendly `Run \`npm install blessed\` (or \`npx plans-cc-dashboard\` via a published release) to enable the dashboard.` message and exit non-zero.
- [x] 👁 Step 6: Run `node bin/dashboard.js` from the project root and confirm: it renders the current `.plans/` state in the same format as `/plan-status`; editing a task file (e.g. toggling a `- [ ]` to `- [x]`) triggers a re-render within ~100ms without flicker; creating a new file in `.plans/pending/` appears; `q`/`Ctrl+C` exits cleanly.
- [x] Step 7: Update `README.md` under the command-reference table to add a row for `plans-cc-dashboard` (live TUI dashboard), and add a short "Requirements" note that the dashboard command requires the `blessed` runtime dependency (installed automatically via npm).

## Verification
- `node bin/dashboard.js` renders a TUI whose task lines and summary line match `/plan-status` output byte-for-byte for the same `.plans/` state.
- Editing any file under `.plans/pending/` or `.plans/completed/` re-renders within ~100ms (debounced) with no visible flicker on macOS.
- Creating and deleting task files is reflected live.
- The process exits cleanly on `q`, `Escape`, and `Ctrl+C` with no stray ANSI leakage in the parent shell.
- Existing `npx plans-cc` (installer) still works unchanged — the new bin entry does not interfere.
- Running on a non-git directory does not crash; the `Branch:` line is omitted as `/plan-status` does.

## Impact Scope

### Files to Modify
- [x] `package.json` — add `blessed` to dependencies, add `plans-cc-dashboard` bin entry, add `lib` to `files` array so it ships in the npm package.
- [x] `README.md` — document the new command and the new runtime dependency.
- [x] `bin/install.js` — deploy dashboard runtime and launcher shim (follow-up install-path fix).
- [x] `bin/dev.js` — symlink dashboard runtime and launcher shim for dev mode (follow-up).

### Files to Create
- [x] `bin/dashboard.js` — CLI entry point (watcher + blessed screen).
- [x] `lib/parse-tasks.js` — task file scanner/parser.
- [x] `lib/render-dashboard.js` — pure renderer mirroring plan-status format.

### Related Files (reference only)
- `skills/plan-status/SKILL.md` — authoritative source for the output format the renderer must match.
- `bin/install.js`, `bin/dev.js` — style template (shebang + CJS + single `main()`).
- `.plans/pending/*.md`, `.plans/completed/*.md` — data source the parser reads.

## Changes
- `package.json` — added `blessed ^0.1.81` dependency, added `plans-cc-dashboard` bin entry, added `lib` to files array
- `package-lock.json` — created by `npm install blessed`
- `.gitignore` — added `node_modules/` (first runtime dep required it)
- `lib/parse-tasks.js` — CJS module; `parseTasks(plansDir)` scans pending/completed, parses frontmatter + `## How` checkboxes, resolves `isBlocked`, returns sorted `{tasks, summary}`
- `lib/render-dashboard.js` — CJS module; pure `renderDashboard({tasks, summary, branch, subRepos})` matching plan-status output format
- `bin/dashboard.js` — CLI entry point (executable); blessed screen + debounced `fs.watch` with per-subdir fallback; 5s git branch cache; `q`/`Escape`/`Ctrl+C` exit
- `README.md` — added install-section paragraph about `plans-cc-dashboard` + blessed runtime dep, new table row in Viewing and Tracking, and a usage snippet (`npx plans-cc-dashboard` / `node bin/dashboard.js`); later updated with honest install-story guidance (`~/.claude/plans-cc/`, launcher shim, PATH export)
- `bin/install.js` — deploys `bin/dashboard.js`, `lib/`, and `blessed` (plus any transitive deps) into `~/.claude/plans-cc/`; writes a bash launcher shim at `~/.claude/bin/plans-cc-dashboard`; prints a conditional PATH export hint
- `bin/dev.js` — symlinks `~/.claude/plans-cc/{dashboard.js,lib,node_modules}` back into the repo and writes the same launcher shim for live dev
- Design iterations on the dashboard: leaderboard redesign (colored cards, ASCII banner) → muted Gruvbox palette + left-aligned + minimal wordmark → split-the-difference 3-row box-drawing wordmark + borderless stat cards → removed task-row progress bars (final)

## Issues
- [x] Current rendering is too plain — it mirrors `/plan-status` one-to-one but looks boring as a standalone TUI. Needs leaderboard energy: color coding per status, big box-drawing borders/panels, stat cards for the summary counts, larger/louder task rows, optional ASCII art header. The renderer should diverge from `/plan-status`'s compact text format when running in dashboard mode — full screen real estate should be used.
- [x] Dashboard isn't reachable via the primary install path. `npx plans-cc` only copies skills into `~/.claude/` — it never leaves `bin/dashboard.js`, `lib/`, or `blessed` on disk, so there's no way for an end user to actually run the dashboard after the usual install. Fix: (a) make `bin/install.js` also deploy the dashboard + its runtime into `~/.claude/plans-cc/` and drop a launcher shim at `~/.claude/bin/plans-cc-dashboard`; (b) update `bin/dev.js` to symlink/hint the same; (c) update README to document the real install story.

## Notes
- **Library choice:** `blessed` over `ink`. `ink` v4+ is ESM-only and would force a CJS→ESM conversion for the rest of `bin/`; `ink` v3 is dated. `blessed` is CJS-native, stable since 2018, ~60KB, and its imperative render-on-change model fits a file watcher better than React reconciliation for this use case.
- **Zero-dep tradeoff accepted:** this is the first runtime dependency for plans-cc. The installer path (`npx plans-cc`) is unaffected because it uses a separate bin entry; users who never run the dashboard never load `blessed`. Consider lazy-requiring `blessed` inside `main()` so its absence only errors for dashboard users.
- **macOS fs.watch quirks:** native `fs.watch` fires multiple events per save on macOS — debounce re-render at ~100ms. `recursive: true` is supported on darwin and win32; if a Linux user hits it, fall back to watching the two subdirectories individually (but don't bother until someone reports it).
- **Git branch caching:** shelling out per render is cheap but noisy; 5s TTL keeps the dashboard snappy without going stale in practice.
- **Not interactive:** explicitly per the user's request — this is a read-only visualization. No keybindings beyond exit.
