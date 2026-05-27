import { randomUUID } from 'crypto';
import { buildSvcHeaders } from './types';

export type EventType =
  | 'upload.received'
  | 'upload.validated'
  | 'upload.parsed'
  | 'upload.abort_check'
  | 'upload.committed'
  | 'upload.rejected'
  | 'upload.failed'
  | 'upload.rolled_back'
  | 'upload.anomaly';

export interface RecordEventParams {
  /** If omitted, a new UUID is generated. */
  eventId?:    string;
  eventType:   EventType;
  contractId:  string;
  orgId?:      string | null;
  locationId?: string | null;
  payload?:    Record<string, unknown>;
}

export interface RecordEventResult {
  id:         string;
  event_id:   string;
  event_type: string;
  created_at: string;
}

export async function recordEvent(
  params: RecordEventParams,
  supaUrl: string,
  serviceKey: string,
): Promise<RecordEventResult> {
  const { eventType, contractId, orgId, locationId, payload } = params;
  const eventId = params.eventId ?? randomUUID();

  const response = await fetch(`${supaUrl}/rest/v1/upload_events`, {
    method: 'POST',
    headers: {
      ...buildSvcHeaders(serviceKey),
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      event_id:    eventId,
      event_type:  eventType,
      contract_id: contractId,
      org_id:      orgId ?? null,
      location_id: locationId ?? null,
      payload:     payload ?? {},
    }),
  });

  if (response.status !== 201) {
    const detail = await response.text().catch(() => '(no body)');
    throw new Error(
      `recordEvent: unexpected status ${response.status} — ${detail}`,
    );
  }

  const rows = (await response.json()) as RecordEventResult[];
  return rows[0];
}
