import type { JournalEntry } from './models';

export const JOURNAL_ROOT = 'Déjà-Two/Journal';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class EntryError extends Error {}

export function normalizeId(value: unknown): string {
  if (typeof value !== 'string' || !UUID.test(value.trim())) throw new EntryError('Entry ID must be a UUID.');
  return value.trim().toLowerCase();
}

/** Uses Web Crypto on desktop and mobile; never substitutes a weak random ID. */
export function newId(): string {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Validate without converting to UTC or changing a stored offset. */
export function normalizeTimestamp(value: unknown): string {
  if (typeof value !== 'string') throw new EntryError('Choose a valid date, time, and UTC offset.');
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) throw new EntryError('Choose a valid date, time, and UTC offset.');
  const [, year, month, day, hour, minute, second, , offset] = match;
  const y = Number(year), m = Number(month), d = Number(day);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  const offsetHour = offset === 'Z' ? 0 : Number(offset.slice(1, 3));
  const offsetMinute = offset === 'Z' ? 0 : Number(offset.slice(4, 6));
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > days[m - 1] || Number(hour) > 23 ||
      Number(minute) > 59 || Number(second ?? 0) > 59 || offsetHour > 14 || offsetMinute > 59 ||
      (offsetHour === 14 && offsetMinute !== 0) || !Number.isFinite(Date.parse(value))) {
    throw new EntryError('Choose a valid date, time, and UTC offset.');
  }
  return value;
}

export function localTimestamp(date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  const minutes = -date.getTimezoneOffset();
  const offset = `${minutes < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
  return normalizeTimestamp(`${String(date.getFullYear()).padStart(4, '0')}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}${offset}`);
}

export function normalizeEntry(input: unknown): JournalEntry {
  if (!input || typeof input !== 'object') throw new EntryError('This is not a journal entry.');
  const e = input as Record<string, unknown>;
  if (e.source !== 'manual') throw new EntryError('Journal entries must be self-reported.');
  if (typeof e.mood !== 'string' || !e.mood.trim()) throw new EntryError('Choose a mood or type your own.');
  if (typeof e.narrative !== 'string' || !e.narrative.trim()) throw new EntryError('Write a short note before saving.');
  if (e.energy !== null && (typeof e.energy !== 'number' || !Number.isInteger(e.energy) || e.energy < 0 || e.energy > 10)) {
    throw new EntryError('Energy must be blank or a whole number from 0 to 10.');
  }
  if (!Array.isArray(e.tags) || !e.tags.every(tag => typeof tag === 'string')) throw new EntryError('Entry tags must be text.');
  return {
    id: normalizeId(e.id), recordedAt: normalizeTimestamp(e.recordedAt), occurredAt: normalizeTimestamp(e.occurredAt),
    mood: e.mood.trim(), energy: e.energy as number | null, narrative: e.narrative.trim(),
    tags: [...new Set(e.tags.map(tag => tag.trim()).filter(Boolean))], source: 'manual'
  };
}

/** Only validated date/UUID components enter the filename; Unicode root stays NFC. */
export function entryPath(input: JournalEntry): string {
  const entry = normalizeEntry(input);
  return `${JOURNAL_ROOT}/${entry.occurredAt.slice(0, 10)}-${entry.id}.md`.normalize('NFC');
}

function yamlString(value: string): string {
  // Escape Unicode line separators, which YAML otherwise folds inside quotes.
  return JSON.stringify(value).replace(/[\u0085\u2028\u2029]/g, char =>
    `\\u${char.charCodeAt(0).toString(16).padStart(4, '0')}`);
}

export function serializeEntry(input: JournalEntry): string {
  const e = normalizeEntry(input);
  return [
    '---', 'deja_two_type: journal', `id: ${yamlString(e.id)}`,
    `recorded_at: ${yamlString(e.recordedAt)}`, `occurred_at: ${yamlString(e.occurredAt)}`,
    `mood: ${yamlString(e.mood)}`, `energy: ${e.energy}`, 'source: manual',
    `tags: [${e.tags.map(yamlString).join(', ')}]`, '---', '', '# Experience', '', e.narrative, ''
  ].join('\n');
}

/** YAML parsing is supplied by the host, keeping the portable core dependency-free. */
export function deserializeEntry(markdown: string, parse: (yaml: string) => unknown): JournalEntry {
  const match = /^\uFEFF?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/.exec(markdown);
  if (!match) throw new EntryError('Missing journal properties.');
  const metadata = parse(match[1]);
  if (!metadata || typeof metadata !== 'object') throw new EntryError('Invalid journal properties.');
  const m = metadata as Record<string, unknown>;
  if (m.deja_two_type !== 'journal') throw new EntryError('This is not a journal entry.');
  return normalizeEntry({
    id: m.id, recordedAt: m.recorded_at, occurredAt: m.occurred_at, mood: m.mood,
    energy: m.energy ?? null, source: m.source, tags: m.tags ?? [],
    narrative: match[2].replace(/^\s*# Experience\s*\r?\n/, '').trim()
  });
}

export function timestampLabel(timestamp: string): string {
  return normalizeTimestamp(timestamp).replace('T', ' ').replace(/([+-]\d{2}:\d{2})$/, ' $1').replace(/Z$/, ' +00:00');
}
