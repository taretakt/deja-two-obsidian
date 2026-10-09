import { beforeEach, describe, expect, it, vi } from 'vitest';

// Vault simulation only; this does not test the real Obsidian runtime.
import { TFile, TFolder, type Vault } from 'obsidian';
import { JOURNAL_ROOT, listEntries, readEntry, saveEntry } from './storage';
import { entryPath, serializeEntry } from './core';
import type { JournalEntry } from './models';

const entry: JournalEntry = {
  id: '123e4567-e89b-42d3-a456-426614174000', recordedAt: '2026-10-09T09:15:00+05:30',
  occurredAt: '2026-10-08T23:59:00-04:00', mood: 'calm', energy: null,
  narrative: 'A walk.', tags: [], source: 'manual'
};
function file(path: string): TFile { return Object.assign(new TFile(), { path }); }
function folder(path: string): TFolder { return Object.assign(new TFolder(), { path }); }
let files: Map<string, TFile | TFolder>, contents: Map<string, string>, vault: Vault;
beforeEach(() => {
  files = new Map(); contents = new Map();
  vault = {
    getMarkdownFiles: () => [...files.values()].filter((f): f is TFile => f instanceof TFile),
    getAbstractFileByPath: (path: string) => files.get(path) ?? null,
    read: vi.fn(async (f: TFile) => {
      if (!contents.has(f.path)) throw new Error('Unavailable');
      return contents.get(f.path)!;
    }),
    createFolder: vi.fn(async (path: string) => {
      if (files.has(path)) throw new Error('Exists');
      const f = folder(path); files.set(path, f); return f;
    }),
    create: vi.fn(async (path: string, data: string) => {
      if (files.has(path)) throw new Error('Exists');
      const f = file(path); files.set(path, f); contents.set(path, data); return f;
    })
  } as unknown as Vault;
});

describe('vault wrapper', () => {
  it('creates folders and a real Markdown file, then reads it', async () => {
    const path = await saveEntry(vault, entry);
    expect(path).toBe(entryPath(entry));
    expect(files.get(JOURNAL_ROOT)).toBeInstanceOf(TFolder);
    expect(await readEntry(vault, files.get(path) as TFile)).toEqual(entry);
    expect(listEntries(vault)).toEqual([files.get(path)]);
  });
  it('rejects an ID already stored on another day without overwriting', async () => {
    const path = await saveEntry(vault, entry);
    await expect(saveEntry(vault, { ...entry, occurredAt: '2026-10-07T12:00+01:00' })).rejects.toThrow('Duplicate');
    expect(contents.get(path)).toBe(serializeEntry(entry));
    expect(contents.size).toBe(1);
  });
  it('serializes simultaneous saves and rejects a repeated ID', async () => {
    const results = await Promise.allSettled([saveEntry(vault, entry), saveEntry(vault, entry)]);
    expect(results.map(r => r.status)).toEqual(['fulfilled', 'rejected']);
    expect(contents.size).toBe(1);
  });
  it('allows distinct simultaneous saves to share newly created folders', async () => {
    await Promise.all([saveEntry(vault, entry), saveEntry(vault, { ...entry, id: '223e4567-e89b-42d3-a456-426614174000' })]);
    expect(contents.size).toBe(2);
    expect(vault.createFolder).toHaveBeenCalledTimes(2);
  });
  it('protects duplicate IDs in a malformed entry', async () => {
    const path = entryPath(entry);
    files.set(path, file(path));
    contents.set(path, serializeEntry(entry).replace('mood: "calm"', 'mood: ""'));
    await expect(saveEntry(vault, entry)).rejects.toThrow('Duplicate');
  });
  it('does not write after a read failure and permits retry after recovery', async () => {
    const path = `${JOURNAL_ROOT}/unavailable.md`;
    files.set(path, file(path));
    await expect(saveEntry(vault, entry)).rejects.toThrow('Unavailable');
    expect(vault.create).not.toHaveBeenCalled();
    files.delete(path);
    await expect(saveEntry(vault, entry)).resolves.toBe(entryPath(entry));
  });
  it('rejects a file occupying the journal folder', async () => {
    files.set('Déjà-Two', file('Déjà-Two'));
    await expect(saveEntry(vault, entry)).rejects.toThrow('occupied');
    expect(vault.create).not.toHaveBeenCalled();
  });
  it('keeps unrelated vault notes out of the timeline', () => {
    files.set('Other/note.md', file('Other/note.md'));
    files.set(`${JOURNAL_ROOT}-old/note.md`, file(`${JOURNAL_ROOT}-old/note.md`));
    expect(listEntries(vault)).toEqual([]);
  });
});
