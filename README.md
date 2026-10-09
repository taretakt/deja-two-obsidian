# Déjà-Two (Obsidian prototype)

**What happened? How did you feel?** A free, local-first experiential journal.

This repository is an initial Obsidian plugin scaffold, intended as a proving ground for an eventual standalone **mobile-only, on-device** application. No account, analytics, remote backend, or AI service is required.

## Prototype features
- Command palette: **Déjà-Two: Record an experience**.
- Record a mood, energy level, and narrative.
- Store each entry as Markdown with YAML frontmatter in `Déjà-Two/Journal/`.
- Open a simple timeline from the ribbon or command palette.
- Separate data types for self-reported states and future imported exposures.

## Build and install
1. Install Node.js (recent LTS) and npm.
2. Run `npm install`, then `npm run build`.
3. Copy `main.js`, `manifest.json`, and `styles.css` to `<vault>/.obsidian/plugins/deja-two/`.
4. Restart/reload Obsidian, enable Community Plugins, then enable **Déjà-Two**.
5. Use the command palette to record an experience.

For development, run `npm run dev` and copy or symlink the build output into the test vault plugin folder.

## Privacy
All journal entries are written to the user's vault. This prototype makes no network requests. **Obsidian vaults are not automatically encrypted**: device security, backups, sync tools, and other installed plugins may affect privacy.

## Roadmap
- Better mobile capture and timeline UX.
- Last.fm **read-only import** connector with explicit user authorization.
- Local pattern exploration with transparent sample sizes and uncertainty.
- Portable schema and export compatible with the future standalone mobile app.

## Contributing
See `CODEX_TASK.md` for the initial development brief. This project is MIT licensed.
