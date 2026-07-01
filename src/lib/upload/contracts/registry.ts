import { maxirestSalesContract } from './maxirest-sales'
import { maxirestItemsContract } from './maxirest-items'
 
import type { DataSourceContract, SourceType } from './types'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CONTRACTS_REGISTRY: Record<string, DataSourceContract<any>> = {
  'maxirest-sales': maxirestSalesContract,
  'maxirest-items': maxirestItemsContract,
}

/** Returns a contract by id, or null if not registered. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getContract(id: string): DataSourceContract<any> | null {
  return CONTRACTS_REGISTRY[id] ?? null
}

/** Returns all contracts sorted by uiConfig.order. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function listContracts(): DataSourceContract<any>[] {
  return Object.values(CONTRACTS_REGISTRY)
    .sort((a, b) => a.uiConfig.order - b.uiConfig.order)
}

/** Returns contracts filtered by ingestion source type. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function listContractsBySource(sourceType: SourceType): DataSourceContract<any>[] {
  return listContracts().filter(c => c.sourceType === sourceType)
}
