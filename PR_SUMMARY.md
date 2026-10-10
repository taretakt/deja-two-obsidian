# Sprint 001: local journal capture and timeline beta

Capture now saves offset-bearing event and recording timestamps, UUIDs, custom moods, optional energy, and narratives to local Markdown. The timeline reads actual note content, sorts by event time, displays the saved offset/mood/preview, and opens notes. Empty/error states and responsive CSS support desktop and mobile layouts.

Acceptance coverage:

1. Install, typecheck, and build pass; dependency versions and package scripts are unchanged.
2. Plugin code uses Obsidian/browser APIs and the manifest enables mobile. Obsidian desktop (Windows/macOS/Linux) and mobile (iOS/Android): **not runtime-tested: requires real Obsidian**.
3. Capture includes occurred-at time, dropdown plus custom mood override, optional energy, and narrative.
4. Timeline displays actual event content and opens the vault note; vault changes trigger refresh.
5. Explicit offsets are retained without rewriting historical times. Backdated/travel offsets are user-entered.
6. UUID validation, deterministic Unicode-safe paths, duplicate checks, serialized saves, and readable error states protect captures.
7. Pure reusable core plus 50 passing tests, including simulated vault failures, concurrent writes, and pinned-zone offset checks that catch a forced-UTC regression on any runner. No real Obsidian APIs or YAML runtime are exercised by the test stand-ins.
8. README covers desktop/mobile installation, privacy, backups, and uninstalling while retaining Markdown entries.
9. CI builds/tests and collects the three plugin files; README gives a lockfile-based manual packaging procedure. GitHub-hosted CI itself was not run here.
10. Tested: Linux development tooling and automated tests. All real Obsidian platforms remain untested, with a manual checklist in README.

No backend, account, telemetry, ads, analytics, automatic upload, runtime network I/O, or new runtime dependencies. Self-reports and imported exposures stay separate. Future connector interfaces/types document source-specific authorization and independent removal; Last.fm is not implemented. Styling uses original CSS only. No screenshots exist or were fabricated.

Remaining review items: real desktop/iOS/Android interaction and YAML integration; cross-device concurrent editing is outside the per-instance save lock. npm reported three development-toolchain advisories (one moderate, two critical); dependency versions were preserved. Existing non-UUID scaffold notes remain accessible as notes and are not automatically migrated.

No commit, branch, push, remote PR, release publication, or community-directory submission was performed. Changes are left in the working tree for review.
