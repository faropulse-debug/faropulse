import type { SupabaseClient } from '@supabase/supabase-js'

export interface CucinaGoConfig {
  baseUrl: string
  empresa: string
  suca:    string
}

export async function getCucinaGoConfig(
  locationId: string,
  supabase:   SupabaseClient,
): Promise<CucinaGoConfig> {
  const { data, error } = await supabase
    .from('location_pos_config')
    .select('base_url, empresa, suca')
    .eq('location_id', locationId)
    .eq('provider', 'cucinago')
    .maybeSingle()

  if (error || !data) {
    throw new Error('No hay configuración de CucinaGo para este local')
  }

  return { baseUrl: data.base_url, empresa: data.empresa, suca: data.suca }
}
