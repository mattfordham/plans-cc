# Doc: Mirror README polish in the plans-desktop repo (screenshots + cross-link back to plans-cc)

**ID:** 059
**Created:** 2026-11-17T00:00
**Type:** chore
**Status:** completed
**Completed:** 2026-11-18T11:16

## What
Follow-up handoff from task #058. The plans-cc README was polished for public/client sharing (hero blurb, honest badges, dashboard screenshot embed, and a new "Desktop app (macOS)" section). The companion macOS app lives in a **separate external repo** (`plans-desktop`), so its own README polish could not be done from this repo. This task mirrors the same polish there:

- Give the `plans-desktop` README its own professional hero + value-prop blurb and honest badges.
- Capture and commit the two desktop-app screenshots that plans-cc #058 left as placeholders: the **menu-bar glance** and the **cross-project browser window**. Save them in that repo (and, if desired, provide copies for plans-cc's `docs/images/desktop-menubar.png` and `docs/images/desktop-browser.png`, which currently have `<!-- TODO -->` placeholders).
- Add a **cross-link back to plans-cc** from the plans-desktop README.
- Provide the public desktop-app URL that plans-cc #058 left as `<!-- TODO: desktop app URL -->` so that placeholder can be filled in.

## Why
plans-cc #058 made the main repo client-ready but deliberately left desktop-app images and the desktop-app URL as clearly-marked placeholders, because the app's source and screenshots live in a repo not visible from plans-cc. Completing this handoff makes BOTH repos look professional and complete when shared, and lets the two READMEs cross-link cleanly.

## Notes
- The desktop app is a native macOS app (internally "plans-desktop" / "Plans Desktop"), a read-only machine-wide viewer with two surfaces: a menu-bar glance and a cross-project browser window. Its build spec was handed off at plans-cc's gitignored `.plans/artifacts/desktop-app-spec.md`.
- Placeholders left in the plans-cc README by #058 that this task resolves:
  - `<!-- TODO: desktop app URL -->` (the cross-link target) — supply the real public URL.
  - `docs/images/desktop-menubar.png` and `docs/images/desktop-browser.png` — supply the real screenshots.
  - (plans-cc's own `docs/images/dashboard.png` is a separate TODO handled in plans-cc itself, not here.)
- This is a **handoff to an external repo**, not an in-repo edit — `/plan-spawn` operates on worktrees within one project, so a plain captured follow-up task is the right mechanism. Execute it from within the `plans-desktop` project.
