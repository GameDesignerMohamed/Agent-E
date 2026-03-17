# TODOS

## Evaluate automated release tooling (changesets or similar)
**What:** Investigate `@changesets/cli` or `nx release` to automate lockstep version bumps, changelogs, and npm publish.
**Why:** Currently versions are bumped manually across 5 packages + two git remotes. The version-alignment test catches drift, but automation would eliminate the manual step entirely.
**Pros:** One command to bump + publish all packages. Auto-generated changelogs. No chance of partial bumps.
**Cons:** Setup overhead (~1-2 hours). Adds a dev dependency. May need custom config for the two-repo split (public/private).
**Context:** Lockstep versioning was adopted on 2026-03-17 after `@agent-e/pro` drifted to v2.0.3 while others were at v2.0.2 (PR #22). A `version-alignment.test.ts` guard rail was added at the same time. This TODO is about replacing the manual bump process, not the guard rail.
**Depends on:** Nothing — can be done anytime.
