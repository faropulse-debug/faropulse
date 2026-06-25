import { describe, it, expect } from 'vitest'
import { generateItemHash } from '@/src/lib/upload/generate-item-hash'

const base = {
  numero_ticket: 'T-001',
  fecha_caja:    '2025-06-15',
  descripcion:   'Coca Cola',
  cantidad:      1,
  precio_total:  250,
  occurrence:    0,
}

describe('generateItemHash — estabilidad y discriminación', () => {
  it('mismos argumentos → mismo hash', () => {
    expect(generateItemHash(base)).toBe(generateItemHash(base))
  })

  it('occurrence 0 vs 1 → hashes distintos (discrimina duplicados en el mismo ticket)', () => {
    const h0 = generateItemHash({ ...base, occurrence: 0 })
    const h1 = generateItemHash({ ...base, occurrence: 1 })
    expect(h0).not.toBe(h1)
  })

  it('precio_total distinto → distinto hash', () => {
    const h1 = generateItemHash({ ...base, precio_total: 250 })
    const h2 = generateItemHash({ ...base, precio_total: 300 })
    expect(h1).not.toBe(h2)
  })

  it('fecha_caja distinta → distinto hash', () => {
    const h1 = generateItemHash({ ...base, fecha_caja: '2025-06-15' })
    const h2 = generateItemHash({ ...base, fecha_caja: '2025-06-16' })
    expect(h1).not.toBe(h2)
  })

  it('descripcion distinta → distinto hash', () => {
    const h1 = generateItemHash({ ...base, descripcion: 'Coca Cola' })
    const h2 = generateItemHash({ ...base, descripcion: 'Agua Mineral' })
    expect(h1).not.toBe(h2)
  })

  it('numero_ticket distinto → distinto hash', () => {
    const h1 = generateItemHash({ ...base, numero_ticket: 'T-001' })
    const h2 = generateItemHash({ ...base, numero_ticket: 'T-002' })
    expect(h1).not.toBe(h2)
  })
})

describe('generateItemHash — robustez con nulls', () => {
  it('campos null no explotan y son estables', () => {
    const nullArgs = { ...base, numero_ticket: null, descripcion: null, fecha_caja: null }
    const h1 = generateItemHash(nullArgs)
    const h2 = generateItemHash(nullArgs)
    expect(h1).toBe(h2)
  })

  it('cantidad null y precio_total null son estables', () => {
    const h1 = generateItemHash({ ...base, cantidad: null, precio_total: null })
    const h2 = generateItemHash({ ...base, cantidad: null, precio_total: null })
    expect(h1).toBe(h2)
  })
})

describe('generateItemHash — precisión de money y qty', () => {
  it('precio_total con distinta precisión flotante → mismo hash (2 decimales)', () => {
    // toFixed(2): both → '250.10'
    const h1 = generateItemHash({ ...base, precio_total: 250.1 })
    const h2 = generateItemHash({ ...base, precio_total: 250.100000001 })
    expect(h1).toBe(h2)
  })

  it('cantidad con distinta precisión flotante → mismo hash (4 decimales)', () => {
    // toFixed(4): both → '1.5000'
    const h1 = generateItemHash({ ...base, cantidad: 1.5 })
    const h2 = generateItemHash({ ...base, cantidad: 1.5000000001 })
    expect(h1).toBe(h2)
  })
})

describe('generateItemHash — idempotencia ante reordenamiento', () => {
  it('SET de hashes invariante al reordenamiento del archivo', () => {
    // El contador de ocurrencias asigna occurrence=0 al PRIMER Coca Cola de cada orden
    // y occurrence=1 al SEGUNDO. El SET resultante es siempre {hash(Coca,0), hash(Coca,1), hash(Beer,0)}.

    // Orden 1: [CocaCola, Beer, CocaCola]
    const set1 = new Set([
      generateItemHash({ ...base, descripcion: 'Coca Cola', occurrence: 0 }),
      generateItemHash({ ...base, descripcion: 'Beer',      occurrence: 0 }),
      generateItemHash({ ...base, descripcion: 'Coca Cola', occurrence: 1 }),
    ])

    // Orden 2: [Beer, CocaCola, CocaCola] — mismo contenido, mismo contador por grupo
    const set2 = new Set([
      generateItemHash({ ...base, descripcion: 'Beer',      occurrence: 0 }),
      generateItemHash({ ...base, descripcion: 'Coca Cola', occurrence: 0 }),
      generateItemHash({ ...base, descripcion: 'Coca Cola', occurrence: 1 }),
    ])

    expect([...set1].sort()).toEqual([...set2].sort())
    expect(set1.size).toBe(3)  // ningún hash colisionó entre sí
  })
})
