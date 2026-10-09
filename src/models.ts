/** A self-report is never inferred from imported external activity. */
export interface JournalEntry {
  id: string;
  recordedAt: string;
  occurredAt: string;
  mood: string;
  energy: number | null;
  narrative: string;
  tags: string[];
  source: 'manual';
}

/** Future connector data remains distinct from subjective journal entries. */
export interface Exposure {
  id: string;
  provider: string;
  providerEventId?: string;
  occurredAt: string;
  importedAt: string;
  category: 'music' | 'media' | 'place' | 'weather' | 'activity' | 'other';
  title: string;
  metadata: Record<string, unknown>;
}
