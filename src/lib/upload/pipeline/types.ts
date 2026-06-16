/** HTTP headers required for Supabase service-role REST calls. */
export interface SvcHeaders {
  apikey: string;
  'Content-Type': string;
  [key: string]: string;
}

/** Builds the standard service-role header set for Supabase REST requests.
 *  Only `apikey` is sent — sending the key on `Authorization: Bearer` too makes
 *  the platform try to parse it as a JWT, which fails for the new sb_secret_ keys. */
export function buildSvcHeaders(serviceKey: string): SvcHeaders {
  return {
    apikey: serviceKey,
    'Content-Type': 'application/json',
  };
}
