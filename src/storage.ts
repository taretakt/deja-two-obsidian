import { normalizePath, TFile, Vault } from 'obsidian';
import type { JournalEntry } from './models';

export const JOURNAL_ROOT = 'Déjà-Two/Journal';

function yamlString(value: string): string {
  return JSON.stringify(value); // JSON strings are valid YAML scalars.
}

function serialize(entry: JournalEntry): string {
  const frontmatter = [
    '---',
    'deja_two_type: journal',
    `id: ${yamlString(entry.id)}`,
    `recorded_at: ${yamlString(entry.recordedAt)}`,
    `occurred_at: ${yamlString(entry.occurredAt)}`,
    `mood: ${yamlString(entry.mood)}`,
    `energy: ${entry.energy === null ? 'null' : entry.energy}`,
    `source: manual`,
    `tags: [${entry.tags.map(yamlString).join(', ')}]`,
    '---', '',
    '# Experience', '',
    entry.narrative, ''
  ];
  return frontmatter.join('\n');
}

export async function saveEntry(vault: Vault, entry: JournalEntry): Promise<string> {
  const parts = JOURNAL_ROOT.split('/');
  for (let i = 1; i <= parts.length; i++) {
    const dir = normalizePath(parts.slice(0, i).join('/'));
    if (!vault.getAbstractFileByPath(dir)) await vault.createFolder(dir);
  }
  const safeId = entry.id.replace(/[^a-zA-Z0-9_-]/g, '');
  const day = entry.occurredAt.slice(0, 10);
  const path = normalizePath(`${JOURNAL_ROOT}/${day}-${safeId}.md`);
  if (vault.getAbstractFileByPath(path)) throw new Error('Entry ID already exists');
  await vault.create(path, serialize(entry));
  return path;
}

export function listEntries(vault: Vault): TFile[] {
  return vault.getMarkdownFiles()
    .filter(file => file.path.startsWith(`${JOURNAL_ROOT}/`))
    .sort((a, b) => b.basename.localeCompare(a.basename));
}
