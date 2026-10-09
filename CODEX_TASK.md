# Codex assignment — Déjà-Two Sprint 001

## Mission
Take the existing starter Obsidian plugin and make it a tested, polished, mobile-compatible public beta. Do not turn it into a web app. This Obsidian implementation is a disposable prototype for a future **mobile-only, on-device** application.

## Non-negotiables
- Free, open-source core; unlimited journaling and tracking.
- No backend, user accounts, telemetry, ads, analytics SDK, or automatic upload.
- Journal and mood data remain in local vault Markdown files.
- Do not infer emotional states from scrobble data.
- No clinical claims, diagnostic language, or performance claims.
- Optional connectors are user-authorized, source-specific, and independently removable.
- No copyrighted BioShock art/assets; original, restrained Art Deco/retrofuturist styling.

## Sprint acceptance criteria
1. `npm install`, `npm run typecheck`, and `npm run build` pass.
2. Plugin loads in Obsidian desktop and mobile (test both, or document limitations honestly).
3. Quick capture: occurred-at time, mood (including custom free-text), optional energy, narrative; save to Markdown.
4. Timeline displays actual date/time, mood, and narrative preview; open entry on tap.
5. Preserve original time zone/offset when capturing local timestamps; never silently change past event times.
6. Avoid duplicate IDs and sanitize any generated paths; support clean empty/error states.
7. Add unit tests for serialization, storage path generation, and event normalization.
8. README documents install, privacy, backups, and how to uninstall without losing journal entries.
9. Add basic release automation or a reproducible manual packaging procedure.
10. Produce a brief implementation summary and list of tested/untested platforms.

## Architecture guidance
- Keep exposure records separate from subjective self-reports.
- Stable IDs and provenance for all records.
- Make core data model independent of Obsidian APIs for future mobile reuse.
- Do not build Last.fm yet; leave a documented connector interface for the next sprint.
- Prefer Obsidian APIs over Node/Electron-only APIs.
- Follow official Obsidian plugin developer and publishing guidelines.

## First task
Inspect the scaffold, identify build/type/API issues, fix them, and open a PR with tested functionality and screenshots if available. Do not publish to the community directory without approval.
