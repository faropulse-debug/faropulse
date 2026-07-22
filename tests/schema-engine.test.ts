import { describe, it, expect } from 'vitest'
import { evaluateSchemaDiff, validateShadowFreshness, normalizeSqlBody } from '../scripts/lib/schema-engine'
import type { SchemaState } from '../scripts/lib/supabase-api'

function createEmptySchema(): SchemaState {
  return { tables: {}, functions: {}, applied_migrations: [] }
}

describe('Schema Engine', () => {
  describe('normalizeSqlBody', () => {
    it('debe remover comentarios de una sola linea', () => {
      const sql = `SELECT * FROM table; -- esto es un comentario`
      expect(normalizeSqlBody(sql)).toBe('SELECT * FROM table;')
    })
    it('debe remover comentarios multilinea', () => {
      const sql = `SELECT * /* ignorar esto */ FROM table;`
      expect(normalizeSqlBody(sql)).toBe('SELECT * FROM table;')
    })
    it('debe normalizar espacios en blanco sin afectar case', () => {
      const sql = `SELECT\n\t  * FROM    table;`
      expect(normalizeSqlBody(sql)).toBe('SELECT * FROM table;')
    })
  })

  describe('validateShadowFreshness', () => {
    it('debe lanzar error si faltan migraciones', () => {
      const local = ['001', '002', '003']
      const applied = ['001', '002']
      expect(() => validateShadowFreshness(local, applied)).toThrow(/Faltan 1 migraciones/)
    })
    it('debe pasar si todas están aplicadas', () => {
      const local = ['001', '002']
      const applied = ['001', '002', '003']
      expect(() => validateShadowFreshness(local, applied)).not.toThrow()
    })
  })

  describe('evaluateSchemaDiff', () => {
    it('detecta DRIFT cuando hay tabla extra en entorno real', () => {
      const expected = createEmptySchema()
      const actual = createEmptySchema()
      actual.tables['data_freshness'] = { name: 'data_freshness', columns: {}, constraints: {}, indices: {} }

      const findings = evaluateSchemaDiff(expected, actual, 'post-apply')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toMatchObject({
        level: 'CRITICAL',
        type: 'DRIFT',
        objectType: 'TABLE',
        objectName: 'data_freshness'
      })
    })

    it('detecta MISSING como INFO en ci/pre-deploy y ERROR en post-apply', () => {
      const expected = createEmptySchema()
      expected.tables['nueva_tabla'] = { name: 'nueva_tabla', columns: {}, constraints: {}, indices: {} }
      const actual = createEmptySchema()

      const findingsCi = evaluateSchemaDiff(expected, actual, 'ci')
      expect(findingsCi[0]).toMatchObject({ level: 'INFO', type: 'MISSING' })

      const findingsPost = evaluateSchemaDiff(expected, actual, 'post-apply')
      expect(findingsPost[0]).toMatchObject({ level: 'ERROR', type: 'MISSING' })
    })

    it('detecta MISMATCH en tipos de columna', () => {
      const expected = createEmptySchema()
      expected.tables['t1'] = { 
        name: 't1', columns: { 'c1': { name: 'c1', type: 'text', nullable: true, default_val: null } }, constraints: {}, indices: {} 
      }
      const actual = createEmptySchema()
      actual.tables['t1'] = { 
        name: 't1', columns: { 'c1': { name: 'c1', type: 'integer', nullable: true, default_val: null } }, constraints: {}, indices: {} 
      }

      const findings = evaluateSchemaDiff(expected, actual, 'post-apply')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toMatchObject({
        level: 'ERROR',
        type: 'MISMATCH',
        objectType: 'COLUMN',
        objectName: 't1.c1'
      })
      expect(findings[0].detail).toContain('Tipo distinto. Esperado: text, Real: integer')
    })

    it('detecta MISMATCH en constraint divergente', () => {
      const expected = createEmptySchema()
      expected.tables['t1'] = { 
        name: 't1', columns: {}, indices: {},
        constraints: { 'c1': { name: 'c1', type: 'c', def: 'CHECK (id > 0)' } }
      }
      const actual = createEmptySchema()
      actual.tables['t1'] = { 
        name: 't1', columns: {}, indices: {},
        constraints: { 'c1': { name: 'c1', type: 'c', def: 'CHECK (id >= 0)' } }
      }

      const findings = evaluateSchemaDiff(expected, actual, 'post-apply')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toMatchObject({
        level: 'ERROR',
        type: 'MISMATCH',
        objectType: 'CONSTRAINT',
        objectName: 't1.c1'
      })
    })

    it('detecta MISMATCH de cuerpo alterado en funciones CRITICAS', () => {
      const expected = createEmptySchema()
      expected.functions['user_has_membership(uuid)'] = {
        name: 'user_has_membership', args: 'uuid', return_type: 'boolean', body: 'SELECT true'
      }
      const actual = createEmptySchema()
      actual.functions['user_has_membership(uuid)'] = {
        name: 'user_has_membership', args: 'uuid', return_type: 'boolean', body: 'SELECT false'
      }

      const findings = evaluateSchemaDiff(expected, actual, 'post-apply')
      expect(findings).toHaveLength(1)
      expect(findings[0]).toMatchObject({
        level: 'ERROR',
        type: 'MISMATCH',
        objectType: 'FUNCTION',
        objectName: 'user_has_membership(uuid)'
      })
    })

    it('ignora diferencias de cuerpo en funciones NO CRITICAS (solo valida firma)', () => {
      const expected = createEmptySchema()
      expected.functions['helper(uuid)'] = {
        name: 'helper', args: 'uuid', return_type: 'boolean', body: 'SELECT true'
      }
      const actual = createEmptySchema()
      actual.functions['helper(uuid)'] = {
        name: 'helper', args: 'uuid', return_type: 'boolean', body: 'SELECT false'
      }

      const findings = evaluateSchemaDiff(expected, actual, 'post-apply')
      expect(findings).toHaveLength(0) // No falla porque helper no está en CRITICAL_FUNCTIONS
    })

    it('ignora tabla schema_migrations explícitamente', () => {
      const expected = createEmptySchema()
      const actual = createEmptySchema()
      actual.tables['schema_migrations'] = { name: 'schema_migrations', columns: {}, constraints: {}, indices: {} }
      
      const findings = evaluateSchemaDiff(expected, actual, 'post-apply')
      expect(findings).toHaveLength(0) // DRIFT ignorado
    })
  })
})
