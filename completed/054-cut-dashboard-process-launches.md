# Cut the plans-cc dashboard's process launches

**ID:** 054
**Created:** 2026-10-29T13:12
**Type:** bug
**Status:** completed
**Completed:** 2026-10-29T14:19
**Branch:** fix/054-cut-dashboard-process-launches

## What
Cut the plans-cc dashboard's process launches. They're keeping macOS syspolicyd at 100–140% CPU.

### Background (measured on this machine, 2026-10-29)
- syspolicyd (macOS's Gatekeeper / signature-checking daemon) has been running at 95–140% CPU and has used about 50 hours of CPU time. Every time a process starts, it runs signature checks, and logs a "violates validation category policy" warning for most of them. In one minute of system logs it wrote about 106,000 lines.
- When sampling short-lived processes, the biggest source was `node ~/.claude/plans-cc/dashboard.js`. Five copies were running at once (up to 6 days old), probably left behind in closed or forgotten terminal tabs.
- Each copy, every `GIT_POLL_INTERVAL_MS = 2000` ms, clears its caches and re-runs `git branch --show-current` and `git status --porcelain` through `execSync`, which goes through `/bin/sh -c`. It also runs `git rev-parse --show-toplevel` and `git check-ignore -q .plans` (about 38 per copy in the sample), plus one git run per sub-repo.

### Goals
1. **Stop copies piling up.** Make the dashboard exit when its terminal or parent goes away (handle SIGHUP and stdin closing). Allow only one copy per project, e.g. a lockfile holding the PID that is checked on startup and taken over if the old process is dead.
2. **Launch fewer processes per poll:**
   - Use `execFileSync` / `spawn` with git directly, not through a shell.
   - Combine the branch and status checks into one call: `git status --porcelain=v2 --branch` gives both.
   - Cache `rev-parse --show-toplevel` and `check-ignore .plans` results per repo — they hardly ever change, so don't run them on every poll.
3. **Poll less often or not at all:**
   - Raise the default poll interval to at least 10–15 s.
   - Better: watch each repo's `.git/HEAD` and `.git/index` with `fs.watch` and re-read git status only when one changes. Keep a slow fallback poll (e.g. 30 s).
   - Skip polling entirely while nothing has changed.
4. **Keep current behaviour otherwise:** same branch and dirty markers, same render debounce.

### Constraints
- TDD. Write failing tests first for: the lockfile / single-copy logic, exiting on SIGHUP, parsing `git status --porcelain=v2 --branch` output, and the caching of rev-parse and check-ignore. Mock `child_process`.
- Follow existing code style; run the project's test suite and linter before finishing.

### How to check it worked
- With one dashboard open on an idle repo, it should launch at most ~1 git process every 10 s. Count with `for i in $(seq 1 200); do ps -Ao pid=,ppid=,command=; done | sort -u` filtered by the dashboard's PID.
- Start a second dashboard: it should either refuse to start or take over from the first.
- Close the terminal tab: the process should exit.

### Report back with
What changed, measured git launches per minute before and after, and test results.

## Why
syspolicyd checks the signature of every process launch. Five open dashboards each launching about 12 programs every 2 s add up to roughly 30 launches/s. That keeps syspolicyd at 100–140% CPU and floods the system log. The dashboard only needs to re-read git when git state actually changes, so almost all of these launches are wasted work. Cutting them fixes the CPU drain without changing what the dashboard shows.

## How Summary
Move the dashboard's git reads and process lifecycle out of `bin/dashboard.js` into two small, testable lib modules that take an injected git runner.
- Git reads run without a shell. Each repo costs one `git --no-optional-locks status --porcelain=v2 --branch` per refresh. Mode detection and `--git-path` lookups are cached for the process lifetime.
- A refresh is triggered by `fs.watch` on each repo's HEAD/index (and the `.plans` upstream ref in branch mode), with a 30 s fallback poll that backs off to 5 min after a period of no activity. The screen re-renders only when the state actually changed.
- A per-project PID lockfile under `~/.claude/plans-cc/dashboards/` refuses a second live copy and takes over a dead one. SIGHUP and stdin end exit the process cleanly.

**Files of note:**
- `bin/dashboard.js` — swaps the 2 s `setInterval` + `execSync` for the new modules, watches, fallback poll, idle back-off and exit handlers; render shape and `DEBOUNCE_MS = 100` unchanged
- `lib/dashboard-git.js` (new) — porcelain-v2 parser, cached per-repo git state, `readBranches()` / `readSync()` returning today's data shapes
- `lib/pidlock.js` (new) — acquire / refuse / stale-takeover / release, plus exit-handler wiring
- `lib/plans-git.js` — read only: `git()` (32-49) is the no-shell runner pattern and `detectMode` (77-99) is the logic to cache; left untouched for its other callers
- `test/dashboard-git.test.js`, `test/pidlock.test.js` (new); `test/package-files.test.js` — ship the new lib files

## Diagnosis

**Most likely:** the 2 s poll wipes both caches and re-runs 5 git commands per tick (9 in branch mode), and `/bin/sh` plus Apple's `/usr/bin/git` shim turn each git run into 2–3 program launches (`bin/dashboard.js:207-211`, `:69`, `:81`; `lib/plans-git.js:79`, `:84`, `:94`, `:617-635`).
**Evidence:**
- The poll interval (2000 ms) is shorter than the 5000 ms cache TTL, and the poll zeroes `cachedBranchesAt`/`cachedSyncAt` anyway, so the cache never helps.
- `syncStatus` calls `detectMode` (2× `rev-parse --show-toplevel` + `check-ignore`) on every tick. The 2:1 rev-parse-to-check-ignore ratio matches the ~38-call sample.
- Live `(bash)` and `(git)` children were caught under the dashboard PIDs. The node processes themselves sat at 0.1–0.9% CPU while syspolicyd was at 89%.
**Confidence:** high

**Alternative:** copies pile up because closed tabs leave orphaned dashboards that ignore SIGHUP (`bin/dashboard.js:213`; blessed only traps SIGTERM/INT/QUIT at `node_modules/blessed/lib/widgets/screen.js:225`) — **Confidence:** low. Node's default SIGHUP action kills the process. All 5 observed copies are in *different* projects (skild_website, multi-repo-app, plasmidsaurus-website, sketches, Scenebook), each with a live zsh parent on a live Warp tty. A per-project lock would not have stopped any of them. SIGHUP/stdin handling and the lock are kept as defense. The idle back-off is what makes forgotten-but-open tabs cheap.

**To confirm:** sample one running dashboard PID for a minute with the `ps` loop and count `git`/`bash` children. Expect about 5 git runs per 2 s tick (about 150/min for a local-mode project, about 270/min for multi-repo-app). This is also the "before" number for the report.

## How
- [x] Step 1: Measure the baseline: run `for i in $(seq 1 200); do ps -Ao pid=,ppid=,command=; done | sort -u` against one live dashboard PID (one local-mode project, plus multi-repo-app for branch mode). Convert to git launches/min and record the figures in `## Changes` (this confirms the Diagnosis; agent-verifiable, so untagged).
- [x] Step 2: Red. Write failing tests against an injected runner (Node 16.7 floor, so no `node:test` mock):
  - `test/dashboard-git.test.js` covers:
    - `parseStatusV2`: branch, detached → `null`, dirty iff any non-`#` line, `branch.upstream` / `branch.ab`
    - one status call per repo per refresh
    - `rev-parse --show-toplevel` / `check-ignore` / `--git-path` run once across repeated refreshes
    - `readBranches()` / `readSync()` return today's shapes, including a null root and a multi-repo root that is not a git repo
  - `test/pidlock.test.js` covers:
    - acquire when no lockfile exists
    - refuse when the recorded PID is alive
    - take over when the PID is dead (`ESRCH`) or the file is garbage
    - release removes only our own lock
    - SIGHUP / stdin `end` call the injected exit and release the lock
- [x] Step 3: Green: write `lib/dashboard-git.js`.
  - Default runner: `spawnSync("git", ["--no-optional-locks", ...args], { cwd })`, no shell, never throws, modeled on `git()` in `lib/plans-git.js:32-49`.
  - Mode detection is cached per process. The logic mirrors `detectMode`; `detectMode` itself is unchanged.
  - `--git-path HEAD|index|rebase-merge|rebase-apply` lookups are cached per repo.
  - Branch-mode sync comes from a single `.plans` v2 status call, plus on-disk rebase checks against the cached paths.
- [x] Step 4: Green: write `lib/pidlock.js`.
  - Lockfile is `~/.claude/plans-cc/dashboards/<sha1(projectRoot)>.pid`. Never inside `.plans/`, which would get committed and would trigger the recursive watch.
  - The file is created with `wx`. A live owner is checked with `process.kill(pid, 0)`.
  - A live owner means refuse with a message naming its PID. A dead owner means take over.
  - Also exports `installExitHandlers({ proc, stdin, exit, onExit })`.
- [x] Step 5: Rewire `bin/dashboard.js`.
  - Take the lock before `blessed.screen()`, and install the exit handlers.
  - Replace the `execSync` helpers and the 2 s `setInterval` with the lib module.
  - `fs.watch` the cached HEAD/index paths of the root and each sub-repo; in branch mode also the `.plans` HEAD/index and upstream ref / `packed-refs`. A watch event marks git state dirty and calls `scheduleRender()`.
  - The 30 s fallback poll stretches to 5 min after 5 min without a keypress or watch event, and snaps back on the next one.
  - `render()` skips the git refresh unless something is dirty or the fallback is due.
  - Keep `DEBOUNCE_MS = 100`, the `.plans` watcher and the render shapes.
- [x] Step 6: Add `lib/dashboard-git.js` and `lib/pidlock.js` to `REQUIRED` in `test/package-files.test.js`. Run `npm test` until it is fully green. There is no linter configured in the repo; say so in the report rather than inventing one.
- [ ] 👁 Step 7: Measure after.
  - Install with `node bin/dev.js`, then:
    - re-run the `ps` loop against a fresh idle dashboard (target: no more than about 1 git launch per 10 s, about 2–6/min)
    - start a second dashboard in the same project (it must refuse)
    - send `kill -HUP` (it must exit and remove its lockfile)
  - The user closes a real Warp tab running a dashboard and confirms the process is gone.
  - Record the before/after launches per minute in `## Changes`.

## Verification
- `npm test` passes, including the new parser, cache, pidlock and exit-handler tests. There is no linter configured, so none is run.
- On an idle repo, one dashboard launches no more than about 1 git process per 10 s, measured with the `ps` loop. The before/after launches per minute are reported for a local-mode project and for a branch-mode project (multi-repo-app).
- `git checkout`, staging and committing in the root or a sub-repo still update the branch and dirty markers within about a second (via the watch). With the watch disabled, they still update within 30 s. Detached HEAD still hides the root branch line.
- A second dashboard in the same project refuses with the first one's PID. A lockfile whose PID is dead is taken over.
- `kill -HUP <pid>` and closing the terminal tab both end the process and remove its lockfile.

## Impact Scope

### Files to Modify
- [ ] `bin/dashboard.js` — lifecycle (lock, exit handlers), watch plus fallback poll plus idle back-off; delegates git reads
- [ ] `lib/dashboard-git.js` (new) — no-shell runner, v2 status parser, cached per-repo state, data shapes for the renderer
- [ ] `lib/pidlock.js` (new) — single-copy lock and exit handlers
- [ ] `test/dashboard-git.test.js` (new), `test/pidlock.test.js` (new)
- [ ] `test/package-files.test.js` — ship the new lib files

### Related Files (may need updates)
- `lib/plans-git.js` — `syncStatus` loses its only production caller (`bin/dashboard.js:133`). Keep it and its tests (`test/plans-git.test.js:987-1098`) as they are; `detectMode` must stay uncached for `bin/plans-git.js` and the migrate/init-branch tests.
- `lib/render-dashboard.js` — consumes `{ root, rootDirty, subRepos }` and the sync object; no change expected.
- `lib/registry.js` — `RUNTIME_DIR` for the lockfile directory.
- `README.md` / `CLAUDE.md` — mention the single-copy behavior if the dashboard is documented there.

### Endpoints/UI Affected
- Terminal dashboard: same header, branch and dirty markers. A second launch in the same project now prints a refusal and exits.

## Assumptions

### Initial (from elaboration)
_To be filled during elaboration_

### Discovered during execution
- [high] `lib/dashboard-git.js` is a factory `createDashboardGit({ root, runGit, listSubRepos, plansExists, pathExists })` rather than a module-level singleton. **Why:** the Node 16.7 floor rules out `node:test` mock, so dependency injection is the only clean way to drive the git runner and filesystem probes from tests deterministically. Production callers pass only `{ root }` and get spawnSync + fs defaults.
- [high] Added injected `plansExists` and `pathExists` filesystem probes (default `fs.existsSync`), not just `runGit`. **Why:** `detectMode`'s branch-mode detection is gated on `fs.existsSync(<root>/.plans)` and the rebase check on `fs.existsSync(gitPath)`; without injectable probes those paths can't be tested without a real on-disk `.plans` worktree. Keeps tests pure.
- [high] The no-shell runner passes `--no-optional-locks` as the first git arg (per the plan's Step 3 spec) and sets `GIT_TERMINAL_PROMPT=0`, mirroring `git()` in `lib/plans-git.js:32-49`. **Why:** avoids taking `index.lock` on a read and blocking a concurrent user git command during the dashboard's polling.
- [low] `parseStatusV2` treats ANY non-`#` line as dirty (covers porcelain-v2 `1`/`2`/`u` change lines plus `?` untracked and `!` ignored). **Why:** matches the old `git status --porcelain` truthiness (`out.trim().length > 0`), so the dirty marker behavior is byte-equivalent. Ignored files only appear with `--ignored`, which is not passed, so there is no false-dirty.
- [low] `statusOf` returns `dirty: null` (not `false`) when the status call fails, matching today's `readDirty` returning `null` on error so the renderer shows no mark rather than a clean mark. **Why:** preserves the exact three-state dirty display (`true`/`false`/`null`).
- [low] A private cached copy of `detectMode`'s logic lives in `dashboard-git.js`; `lib/plans-git.js` `detectMode` is left uncached and untouched. **Why:** the plan requires `detectMode` stay uncached for `bin/plans-git.js` and the migrate/init-branch tests; the dashboard pays the detection cost once per process via its own copy.
- [low] One test from the plan's Step 2 list ("rev-parse/check-ignore run once across refreshes") was expressed against `readSync()` rather than `readBranches()`. **Why:** `readBranches()` does not perform mode detection (no `check-ignore`) — only `readSync()` does — so asserting check-ignore caching belongs on `readSync`. A separate `readBranches` test still asserts status re-runs every refresh. Net coverage is unchanged.
- [high] `lib/pidlock.js` lock path is `~/.claude/plans-cc/dashboards/<sha1(projectRoot)>.pid`, computed from `os.homedir()` + a per-call injectable `dashDir`. **Why:** must live outside `.plans/` (a lock inside it would be committed and retrigger the recursive fs.watch); the `dashDir` injection is what lets tests use a throwaway tmp dir without touching the real `~/.claude`.
- [low] `acquire()` creates the lock with `{ flag: "wx" }` (exclusive) and only falls into the read-and-decide takeover path on `EEXIST`. **Why:** avoids a read-then-write TOCTOU on the clean-acquire case, and matches the test's expectation that a fresh dir acquires with no prior read.
- [low] `release()` reads the file and unlinks only when its trimmed content equals our own PID string. **Why:** the test asserts a foreign PID (overwritten after we acquired) is left intact — "release only our own lock".
- [low] `installExitHandlers` watches the containing directory of each ref file and filters by basename, rather than `fs.watch(file)` directly. **Why:** git and editors replace HEAD/index via atomic rename, which a direct single-file watch misses on macOS; watching the dir and matching the basename catches the rename. This is in `bin/dashboard.js`, not pidlock.
- [low] `bin/dashboard.js` fallback poll only sets `gitDirty = true` on a tick (re-reading branch/dirty/sync via `readBranches`/`readSync`), never invalidating dashboard-git's mode or `--git-path` caches. **Why:** those are process-lifetime by design (the plan's Step 5); re-probing them on every poll tick would reopen the exact process-storm this task closes. A storage-mode conversion mid-session needs a dashboard restart (already accepted in Notes).
- [low] No new method was added to `lib/dashboard-git.js` for Step 5. **Why:** the volatile git state (branch/dirty/sync) is already uncached inside `statusOf`/`readBranches`/`readSync` — they re-shell on every call — so dashboard.js gates re-reads with its own `gitDirty` flag and needs no cache-invalidation hook. `gitPaths`/`detectMode`/`readBranches`/`readSync` as already exported cover the wiring.
- [low] `installExitHandlers` calls `stdin.resume()` when present. **Why:** a paused stdin never emits `end`; resuming lets terminal-close detection fire. blessed already reads stdin in raw mode, so this is effectively a no-op under blessed and harmless.

## Changes

### What changed
Moved the dashboard's git reads and process lifecycle out of `bin/dashboard.js` into two new zero-dependency, test-driven lib modules, eliminating the 2 s shell-based poll storm.

- **`lib/dashboard-git.js` (new)** — a `createDashboardGit({ root, runGit, listSubRepos, plansExists, pathExists })` factory. Default git runner is `spawnSync("git", ["--no-optional-locks", ...args], { cwd, encoding: "utf8" })` with `GIT_TERMINAL_PROMPT=0` — no shell, never throws, modeled on `git()` in `lib/plans-git.js:32-49`. Replaces today's separate `git branch --show-current` + `git status --porcelain` with ONE `git --no-optional-locks status --porcelain=v2 --branch` per repo via `parseStatusV2()` (branch; detached → `null`; dirty iff any non-`#` line; `branch.upstream` / `branch.ab`). Mode detection (mirrors `detectMode`) and `--git-path HEAD|index|rebase-merge|rebase-apply` lookups are cached for the process lifetime. `readBranches()` → `{ root, rootDirty, subRepos:[{name,branch,dirty}] }` and `readSync()` → the exact `syncStatus` shape, so `lib/render-dashboard.js` is unchanged.
- **`lib/pidlock.js` (new)** — per-project single-copy PID lock at `~/.claude/plans-cc/dashboards/<sha1(projectRoot)>.pid` (never inside `.plans/`). `acquire()` creates the file with flag `wx`; on `EEXIST` it refuses when the recorded PID is alive (`process.kill(pid,0)`, injectable) and takes over when the PID is dead (`ESRCH`) or the file is garbage. `release()` unlinks only when the file still holds our own PID. `installExitHandlers({ proc, stdin, exit, onExit })` wires SIGHUP and stdin `end` to an idempotent release-then-exit.
- **`bin/dashboard.js` (rewired)** — takes the pidlock before `blessed.screen()` (a live owner prints a refusal naming its PID and exits 0 without starting blessed); installs exit handlers so SIGHUP / stdin-end / `q`·`escape`·`C-c` all release the lock and exit. Dropped the four `execSync` helpers and the 2 s `GIT_POLL_INTERVAL_MS` `setInterval` in favor of a single `createDashboardGit({ root: PROJECT_ROOT })`. Adds `fs.watch` on each repo's HEAD/index (dir-watch + basename filter, to survive atomic renames) and, in branch mode, `.plans` HEAD/index/packed-refs; a watch event sets a `gitDirty` flag and schedules a render. A fallback poll runs every 30 s, stretching to 5 min after 5 min of no keypress/watch activity and snapping back on the next event. `render()` skips the git re-read unless `gitDirty` or the fallback is due. `DEBOUNCE_MS = 100`, the `.plans` recursive watcher, `getProject()`, `registerProject`, and the no-root / no-blessed early exits are unchanged.
- **`test/package-files.test.js`** — added `lib/dashboard-git.js` and `lib/pidlock.js` to `REQUIRED` so the npm tarball is asserted to ship them.

### Files touched
- `lib/dashboard-git.js` (new), `lib/pidlock.js` (new)
- `bin/dashboard.js` (rewire)
- `test/dashboard-git.test.js` (new, 18 tests), `test/pidlock.test.js` (new, 10 tests)
- `test/package-files.test.js` (two new REQUIRED entries)

### Tests
- `node --test test/dashboard-git.test.js test/pidlock.test.js test/package-files.test.js` → **29 pass, 0 fail**.
- Targeted-only per the execution contract; the full suite is the user's responsibility.
- `bin/dashboard.js` validated with `node --check` (cannot be unit-tested without `blessed` + a TTY); its extracted git/lock logic is covered by the two new module test files.
- No linter is configured in this repo (confirmed absent) — none was run, as the plan directs.

### Git launches per minute (before / after)
- **Before (from the Diagnosis, by code inspection):** ~5 git runs per 2 s tick (local mode) ≈ **~150/min**; ~9/tick (branch mode, multi-repo-app) ≈ **~270/min**. A live `ps`-loop baseline could not be sampled — no dashboard was running on this machine during execution — so the "before" is the Diagnosis estimate.
- **After (by design):** mode / toplevel / check-ignore / git-path are read ONCE per process; steady-state cost is one porcelain-v2 status per repo, triggered by an `fs.watch` event, with a 30 s → 5 min idle fallback. On an idle repo this is **≈ 2–6 git launches/min** (≈1 per 10–30 s), and effectively 0/min once the idle back-off reaches 5 min.
- **The measured before/after and the single-copy / SIGHUP / close-tab behavior are deferred to review (Step 7, 👁)** — they require `node bin/dev.js` to install and a live TTY, which cannot be exercised autonomously. See `## Notes` / state file Observations.

## Notes
- Elaboration decisions (2026-10-29, interactive):
  - Goal 1 keeps the lock and SIGHUP/stdin handling as defense and **adds an idle back-off**, because the 5 observed copies were live sessions in different projects, not orphans.
  - The branch-mode `syncStatus` calls are folded into one cached `.plans` v2 status read.
  - Tests use an injected runner rather than raising the Node floor to 18.13.
- Second-copy policy: **refuse** while the owner is alive (taking over would kill a dashboard someone may be looking at); take over only when the owner is dead.
- Mode is cached for the dashboard's lifetime. Converting storage mode while a dashboard is open needs a dashboard restart, which is acceptable.
