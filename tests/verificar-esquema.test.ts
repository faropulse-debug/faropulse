import { describe, it, expect } from 'vitest'
import { diffExistence, type NamedObject } from '../scripts/verificar-esquema'

describe('diffExistence (triggers y politicas RLS de verificar-esquema.ts)', () => {
  it('no reporta nada cuando los dos lados tienen los mismos objetos', () => {
    const stg: NamedObject[]  = [{ table: 'profiles', name: 'profiles_updated_at' }]
    const prod: NamedObject[] = [{ table: 'profiles', name: 'profiles_updated_at' }]

    const { onlyStg, onlyProd } = diffExistence(stg, prod)
    expect(onlyStg).toHaveLength(0)
    expect(onlyProd).toHaveLength(0)
  })

  it('detecta un trigger/policy que existe solo en PROD', () => {
    const stg: NamedObject[]  = []
    const prod: NamedObject[] = [{ table: 'upload_events', name: 'trg_block_update_upload_events' }]

    const { onlyStg, onlyProd } = diffExistence(stg, prod)
    expect(onlyStg).toHaveLength(0)
    expect(onlyProd).toEqual([{ table: 'upload_events', name: 'trg_block_update_upload_events' }])
  })

  it('detecta un trigger/policy que existe solo en STG', () => {
    const stg: NamedObject[]  = [{ table: 'location_business_config', name: 'lbc_select_policy' }]
    const prod: NamedObject[] = []

    const { onlyStg, onlyProd } = diffExistence(stg, prod)
    expect(onlyStg).toEqual([{ table: 'location_business_config', name: 'lbc_select_policy' }])
    expect(onlyProd).toHaveLength(0)
  })

  it('distingue por tabla — mismo nombre de policy en tablas distintas no es un match', () => {
    const stg: NamedObject[]  = [{ table: 'profiles', name: 'select_policy' }]
    const prod: NamedObject[] = [{ table: 'memberships', name: 'select_policy' }]

    const { onlyStg, onlyProd } = diffExistence(stg, prod)
    expect(onlyStg).toEqual([{ table: 'profiles', name: 'select_policy' }])
    expect(onlyProd).toEqual([{ table: 'memberships', name: 'select_policy' }])
  })
})
