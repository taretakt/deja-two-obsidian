import type { Exposure } from './models';

/** Contract only: no connector implementation or runtime network transport. */
export interface ConnectorAuthorization {
  source: string;
  authorizedAt: string; // ISO timestamp with offset; explicit user action.
}

export interface ExposureImport {
  records: Exposure[];
  nextCursor?: string;
}

/** A future source-specific adapter may return exposures, never JournalEntry values. */
export interface ExposureConnector {
  readonly source: string;
  readonly displayName: string;
  authorize(): Promise<ConnectorAuthorization>;
  importExposures(authorization: ConnectorAuthorization, cursor?: string): Promise<ExposureImport>;
  /** Revoke consent and remove this connector's local credentials/state only. */
  disconnect(): Promise<void>;
}
