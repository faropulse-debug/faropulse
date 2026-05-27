/** HTTP headers required for Supabase service-role REST calls. */
export interface SvcHeaders {
  apikey: string;
  Authorization: string;
  'Content-Type': string;
}

/** Builds the standard service-role header set for Supabase REST requests. */
export function buildSvcHeaders(serviceKey: string): SvcHeaders {
  return {
    apikey: serviceKey,
    Authorization: `Bearer ${serviceKey}`,
    'Content-Type': 'application/json',
  };
}
