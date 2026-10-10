import { parseYaml, TFile, TFolder, Vault } from 'obsidian';
import type { JournalEntry } from './models';
import { deserializeEntry, entryPath, JOURNAL_ROOT, normalizeEntry, serializeEntry } from './core';

export { JOURNAL_ROOT } from './core';
export interface StoredEntry { file: TFile; entry: JournalEntry }

export function listEntries(vault: Vault): TFile[] {
  return vault.getMarkdownFiles().filter(file => file.path.normalize('NFC').startsWith(`${JOURNAL_ROOT}/`));
}

export async function readEntry(vault: Vault, file: TFile): Promise<JournalEntry> {
  return deserializeEntry(await vault.read(file), parseYaml);
}

// Serialize writes, including folder creation and cross-date ID checks, per vault.
const pending = new WeakMap<Vault, Promise<unknown>>();
export function saveEntry(vault: Vault, input: JournalEntry): Promise<string> {
  const operation = (pending.get(vault) ?? Promise.resolve()).catch(() => undefined).then(async () => {
    const entry = normalizeEntry(input);
    for (const file of listEntries(vault)) {
      // Fail closed if a journal cannot be read: never overwrite or guess its ID.
      const existing = await vault.read(file);
      let parsed: JournalEntry;
      try { parsed = deserializeEntry(existing, parseYaml); }
      catch {
        // Also protect IDs in hand-edited/legacy notes whose other fields are invalid.
        const header = /^---\r?\n([\s\S]*?)\r?\n---/.exec(existing);
        if (header) {
          const metadata = parseYaml(header[1]);
          if (typeof metadata?.id === 'string' && metadata.id.trim().toLowerCase() === entry.id) throw new Error('Duplicate entry ID');
        }
        continue;
      }
      if (parsed.id === entry.id) throw new Error('Duplicate entry ID');
    }
    const parts = JOURNAL_ROOT.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const dir = parts.slice(0, i).join('/');
      const existing = vault.getAbstractFileByPath(dir);
      if (existing && !(existing instanceof TFolder)) throw new Error('Journal folder is occupied by a file');
      if (!existing) await vault.createFolder(dir);
    }
    const path = entryPath(entry);
    if (vault.getAbstractFileByPath(path)) throw new Error('Entry path already exists');
    await vault.create(path, serializeEntry(entry));
    return path;
  });
  pending.set(vault, operation);
  return operation;
}