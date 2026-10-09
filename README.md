# Déjà-Two · Sprint 001 public beta

**What happened? How did you feel?** A free, open-source, local-first experiential journal for Obsidian, with unlimited journaling and tracking. This plugin is a prototype for a future mobile-only, on-device application.

Record an experience from **Déjà-Two: Record an experience** in the command palette. Open **Déjà-Two: Open experience timeline** from the command palette or the book-heart ribbon icon. The timeline also has a **New experience** button.

## Capture and timeline

- Capture an occurred-at date/time, a mood dropdown, a custom mood override, optional energy (0–10), and a narrative. **Other / custom** requires text; custom text overrides any dropdown choice. Energy starts as **Not recorded**.
- The UTC offset starts at your device's current offset. When backdating or traveling, explicitly enter the offset at the event's location and time, including daylight saving. The date/time field has no time zone of its own. A repeated daylight-saving hour is distinguished by its offset.
- Each entry stores a Web Crypto UUID, `recorded_at`, `occurred_at`, and `source: manual`. Both timestamps include their offsets. Existing timestamps are never rewritten or converted when the device time zone changes. An offset preserves the captured local time; it does not identify a named time zone.
- Entries live in `Déjà-Two/Journal/YYYY-MM-DD-UUID.md`. The date is the event's saved local date. Mood and narrative never enter filenames. Paths use a fixed Unicode NFC root and validated UUIDs. Existing files are never overwritten; saves check for duplicate IDs throughout the journal folder and serialize concurrent writes within this plugin instance. External edits or other devices can still introduce duplicates.
- The timeline sorts by the occurred-at instant, newest first, and displays the original date/time with offset, mood, and narrative preview. Tap or click the row to open the Markdown note. Edits, renames, creates, and deletes refresh the view; **Refresh** also reloads it.
- Empty journals invite a first entry. Save errors keep the draft in the open modal. Unreadable or invalid journal notes get an explanation and an open-note button; they are never changed. Legacy non-UUID scaffold entries remain local notes but need corrected properties to appear as timeline entries. There is no automatic migration.

## Build and install

Use Node.js 22 and npm. From the repository root:

```sh
npm install
npm run typecheck
npm run build
npm test
```

1. Create `<vault>/.obsidian/plugins/deja-two/` (use your vault's configured configuration directory if different).
2. Copy **only** `main.js`, `manifest.json`, and `styles.css` into that folder.
3. Reload Obsidian. In **Settings → Community plugins**, allow community plugins and enable **Déjà-Two**.
4. Use the command palette to capture an experience and open its timeline.

On mobile, place the same three files in the mobile vault's plugin folder using a file-transfer method available on your device, then reload and enable the plugin there. A build is not performed on the phone. Hidden vault configuration folders may require a desktop-assisted transfer. The manifest enables mobile (`isDesktopOnly: false`); installation and interaction still require the runtime checks below.

For development, `npm run dev` watches the source. Copy its output to a separate test vault. No package installation or development server is needed by plugin users.

## Privacy, backups, and uninstall

Plugin code performs **no network I/O**. There is no backend, account, telemetry, advertising, analytics SDK, automatic upload, or runtime dependency beyond the Obsidian host. Journal and mood data stay in local vault Markdown. There are no connectors implemented in this beta, and no emotional states are inferred from imported activity.

Vault files are not automatically encrypted. Device security, other plugins, and any sync or backup tools you independently choose can affect access to your notes. Building the source with npm and running GitHub CI are separate developer operations; they may access package services. The plugin does not initiate those operations.

Back up the vault, including `Déjà-Two/Journal/`, using your chosen backup process. Test restoring a copy into a separate vault. The Markdown files contain the journal data; reinstalling the plugin alone does not restore deleted notes. Closing or canceling a capture discards its unsaved draft.

To uninstall **without losing entries**:

1. Back up `Déjà-Two/Journal/`.
2. Disable Déjà-Two in Community plugins, then uninstall it there (or remove only `.obsidian/plugins/deja-two/` after disabling).
3. **Keep `Déjà-Two/Journal/`.** Entries remain ordinary editable Markdown notes. Reinstalling the plugin can read them again. Do not delete your journal folder when removing the plugin.

## Reproducible packaging

Use the checked-in lockfile and Node.js 22 in a clean checkout:

```sh
npm ci
npm run typecheck
npm run build
npm test
mkdir -p dist/deja-two
cp main.js manifest.json styles.css dist/deja-two/
cd dist
tar -czf deja-two-0.1.0.tar.gz deja-two
```

This procedure reproduces the package contents from the lockfile; archive timestamps can differ. Verify `manifest.json`, `package.json`, and `versions.json` agree before a versioned release. The archive contains one `deja-two/` folder with the three required plugin files; it excludes source, tests, dependencies, and journal data. Extract that folder under the vault's plugins directory. `tar` is a packaging prerequisite, not a plugin dependency.

`.github/workflows/build.yml` installs from the lockfile, typechecks, builds, runs tests, and uploads those three files as a review artifact. It does not publish a release or submit to the Obsidian community directory. No screenshots are available.

## Architecture and future connectors

`src/models.ts` separates subjective `JournalEntry` values from imported `Exposure` records. `src/core.ts` has no Obsidian imports: validation/normalization, Web Crypto UUID generation, timestamp handling, filename derivation, and Markdown serialization are reusable independently of the host. YAML decoding is injected; `storage.ts` supplies Obsidian's `parseYaml` and vault I/O. The UI is in `main.ts`.

`src/connectors.ts` documents the **interface and types only**:

- An `ExposureConnector` identifies a single `source` and has `authorize`, `importExposures`, and `disconnect` methods.
- `ConnectorAuthorization` represents explicit user consent for that source with an offset-bearing authorization timestamp. It is not a credential or an authorization enforcement implementation.
- `ExposureImport` returns only `Exposure[]` plus an optional pagination cursor. Exposure UUIDs must remain stable on reimport; `provider` identifies the source, `providerEventId` supports deduplication, and `occurredAt` / `importedAt` retain timestamp offsets.
- A future host must require user authorization before import, scope credentials/state to that source, and allow each connector to be removed independently. Disconnect revokes consent and deletes its credentials/state. Previously imported records remain unless the user separately chooses to delete them; manual journal entries remain untouched.
- Connectors must never produce subjective self-reports or infer emotional states from scrobbles. Any future transport would require a separately authorized change to this beta's no-network scope.

**Last.fm is not implemented.** There are no credential fields, network transports, connector registrations, or background import jobs in this beta.

## Verification and remaining runtime checks

Verified in the Linux development environment: `npm install`, TypeScript checks against the installed Obsidian API, browser-targeted production build, and 49 passing Vitest tests. Tests cover serialization, timestamps, normalization, filename safety, IDs, and simulated vault writes/read failures/concurrency. Test-only Obsidian stand-ins parse the writer's scalar subset; they do not exercise Obsidian's actual YAML parser or UI.

A source and bundle audit found only browser/Web Crypto and Obsidian APIs in plugin code: no Node/Electron imports or network calls. Node APIs in build/test tooling are not bundled into the plugin. `npm install` reported three development dependency advisories (one moderate, two critical) in the Vitest toolchain. Requested dependency versions were preserved; no runtime dependencies were added.

| Platform | Status |
| --- | --- |
| Linux development environment | Install, typecheck, build, and automated tests passed |
| Obsidian desktop (Windows, macOS, Linux) | **not runtime-tested: requires real Obsidian** |
| Obsidian mobile (iOS, Android) | **not runtime-tested: requires real Obsidian** |

Before distribution, run this checklist on desktop and both mobile platforms:

- Install, enable, reload, disable, and re-enable; check commands, ribbon, and view restoration.
- Capture a custom mood, blank energy and energy 0/10, multiline Unicode text, and a backdated event with a non-hour offset. Check real YAML properties and Markdown contents.
- Try empty narrative/custom mood, invalid timestamps, and a blocked journal folder. Confirm readable errors, retained draft, and retry behavior. Rapidly tap Save and verify one note.
- Open the timeline, tap a note, edit its mood/time/body, rename/delete it, and check refresh. Test empty and malformed-note states.
- Change the device time zone and confirm saved offsets and event times stay unchanged. Test both sides of a daylight-saving repeated hour.
- Check narrow screens, software keyboard, scrolling, touch targets, keyboard focus, and light/dark themes.
- Back up, uninstall while retaining the journal folder, restore into a separate vault, and reinstall.

MIT licensed. See `CODEX_TASK.md` for the authoritative Sprint 001 brief.
