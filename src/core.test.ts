import { describe, expect, it } from 'vitest';
import { deserializeEntry, entryPath, localTimestamp, newId, normalizeEntry, normalizeId, normalizeTimestamp, serializeEntry, timestampLabel } from './core';
import type { JournalEntry } from './models';

const entry: JournalEntry = {
  id: '123e4567-e89b-42d3-a456-426614174000', recordedAt: '2026-10-09T09:15:00+05:30',
  occurredAt: '2026-10-08T23:59:00-04:00', mood: '静かな / calm', energy: null,
  narrative: 'A walk by the water.\n\nThen home.', tags: ['journal', '散歩'], source: 'manual'
};
// The writer emits JSON-compatible YAML scalars. Host parsing is separately tested in storage.
function parseGeneratedYaml(yaml: string): Record<string, unknown> {
  return Object.fromEntries(yaml.split('\n').map(line => {
    const index = line.indexOf(':');
    const key = line.slice(0, index), value = line.slice(index + 1).trim();
    return [key, ['manual', 'journal'].includes(value) ? value : JSON.parse(value)];
  }));
}

describe('serialization', () => {
  it('round trips all fields including provenance and original offsets', () => {
    expect(deserializeEntry(serializeEntry(entry), parseGeneratedYaml)).toEqual(entry);
    expect(serializeEntry(entry)).toContain('energy: null');
  });
  it('quotes YAML-sensitive text and leaves narrative Markdown in the body', () => {
    const tricky = { ...entry, mood: '"yes": # mood\n---\nsource: imported', tags: ['a: b', '"quoted"', 'line\u0085break\u2028separator\u2029end'], narrative: '# My heading\n---\n**hello**' };
    expect(deserializeEntry(serializeEntry(tricky), parseGeneratedYaml)).toEqual(tricky);
    expect(serializeEntry(tricky)).toContain('\n# Experience\n\n# My heading\n---\n**hello**\n');
  });
  it('accepts CRLF frontmatter and rejects missing or wrong record types', () => {
    expect(deserializeEntry(serializeEntry(entry).replace(/\n/g, '\r\n'), parseGeneratedYaml).id).toBe(entry.id);
    expect(() => deserializeEntry('plain note', parseGeneratedYaml)).toThrow();
    expect(() => deserializeEntry(serializeEntry(entry).replace('deja_two_type: journal', 'deja_two_type: exposure'), () => ({ deja_two_type: 'exposure' }))).toThrow();
  });
});

describe('storage paths', () => {
  it('uses the original local day, UUID, and an NFC Unicode root', () => {
    expect(entryPath(entry)).toBe(`Déjà-Two/Journal/2026-10-08-${entry.id}.md`);
    expect(entryPath(entry)).toBe(entryPath(normalizeEntry(entry)));
    expect(entryPath(entry)).toBe(entryPath(entry).normalize('NFC'));
  });
  it('never puts user narrative or mood into paths', () => {
    expect(entryPath({ ...entry, mood: '../CON:💙/\\', narrative: '../../escape' })).toBe(entryPath(entry));
    expect(entryPath({ ...entry, id: entry.id.toUpperCase() })).toBe(entryPath(entry));
  });
  it.each(['../../escape', '💙', '', `${entry.id}/..`, `${entry.id}.md`])('rejects unsafe ID %s', id => {
    expect(() => entryPath({ ...entry, id })).toThrow();
  });
});

describe('event normalization', () => {
  it('is pure, idempotent, and preserves stable IDs and timestamps', () => {
    const input = { ...entry, mood: '  calm  ', tags: [' a ', 'a', ''], narrative: '  hello\nthere  ' };
    const result = normalizeEntry(input);
    expect(result).toEqual({ ...entry, mood: 'calm', tags: ['a'], narrative: 'hello\nthere' });
    expect(normalizeEntry(result)).toEqual(result);
    expect(input.tags).toEqual([' a ', 'a', '']);
  });
  it.each([0, 10, null])('accepts optional energy %s', energy => {
    expect(normalizeEntry({ ...entry, energy }).energy).toBe(energy);
  });
  it.each([-1, 11, 2.5, NaN, '5', undefined])('rejects invalid energy %s', energy => {
    expect(() => normalizeEntry({ ...entry, energy })).toThrow();
  });
  it.each([{ mood: ' ' }, { narrative: '' }, { source: 'last.fm' }, { tags: [42] }, { occurredAt: '2026-10-08T12:00' }])('rejects incomplete or imported self-reports %s', fields => {
    expect(() => normalizeEntry({ ...entry, ...fields })).toThrow();
  });
  it('creates distinct RFC 4122 version 4 UUIDs through Web Crypto', () => {
    const ids = Array.from({ length: 1000 }, () => newId());
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(normalizeId(id)).toBe(id);
      expect(id).toMatch(/^[0-9a-f-]{14}4[0-9a-f]{3}-[89ab]/);
    }
  });
});

describe('offset timestamps', () => {
  it.each(['2024-02-29T23:59:59.123+05:45', '2026-10-09T00:00-12:00', '2026-10-09T00:00+14:00', '2026-10-09T00:00:00Z'])('preserves %s exactly', timestamp => {
    expect(normalizeTimestamp(timestamp)).toBe(timestamp);
  });
  it.each(['2025-02-29T12:00+00:00', '2026-04-31T12:00+00:00', '2026-01-01T24:00+00:00', '2026-01-01T00:60+00:00', '2026-01-01T00:00+14:01', '2026-01-01T00:00+05:60', '2026-01-01T00:00', '../../bad', '0000-01-01T00:00Z'])('rejects %s without rolling it forward', timestamp => {
    expect(() => normalizeTimestamp(timestamp)).toThrow();
  });
  it('distinguishes repeated daylight-saving times and keeps displayed offsets', () => {
    const early = '2026-11-01T01:30:00-04:00', late = '2026-11-01T01:30:00-05:00';
    expect(Date.parse(normalizeTimestamp(late)) - Date.parse(normalizeTimestamp(early))).toBe(3600000);
    expect(timestampLabel(early)).toBe('2026-11-01 01:30:00 -04:00');
  });
  it('captures device-local calendar components and an explicit numeric offset', () => {
    // Pin the zone so this stays deterministic on any runner (CI defaults to UTC).
    const previous = process.env.TZ;
    try {
      process.env.TZ = 'America/New_York'; // July = EDT (UTC-04:00)
      const date = new Date(2026, 6, 4, 12, 34, 56);
      const timestamp = localTimestamp(date);
      expect(timestamp).toMatch(/^2026-07-04T12:34:56-04:00$/);
      expect(Date.parse(timestamp)).toBe(date.getTime());
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
  it('preserves a non-hourly local offset (Asia/Kathmandu, UTC+05:45)', () => {
    const previous = process.env.TZ;
    try {
      process.env.TZ = 'Asia/Kathmandu';
      const date = new Date(2026, 6, 4, 12, 34, 56);
      const timestamp = localTimestamp(date);
      expect(timestamp).toMatch(/^2026-07-04T12:34:56\+05:45$/);
      expect(Date.parse(timestamp)).toBe(date.getTime());
    } finally {
      if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
    }
  });
});
