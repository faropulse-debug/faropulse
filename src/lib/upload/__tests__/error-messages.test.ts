import { describe, it, expect } from 'vitest'
import { translateUploadError } from '../error-messages'

describe('translateUploadError', () => {
  describe('VALIDATION_FAILED — formato inválido', () => {
    it('PDF o no-Excel', () => {
      const r = translateUploadError('VALIDATION_FAILED', ['Archivo no es Excel'])
      expect(r.titulo).toContain('no parece un reporte')
      expect(r.detalle).toContain('.xlsx')
      expect(r.tecnico).toContain('VALIDATION_FAILED')
    })

    it('Excel vacío (0 filas)', () => {
      const r = translateUploadError('VALIDATION_FAILED', ['Excel vacío'])
      expect(r.titulo).toContain('vacío')
      expect(r.detalle).toContain('POS')
    })
  })

  describe('VALIDATION_FAILED — columnas faltantes', () => {
    it('faltan columnas genéricas', () => {
      const detail = 'Faltan columnas requeridas: [total, comensales]. Sobran columnas: []'
      const r = translateUploadError('VALIDATION_FAILED', [detail])
      expect(r.titulo).toContain('faltan columnas')
      expect(r.detalle).toContain('total')
      expect(r.detalle).toContain('comensales')
    })

    it('archivo de ítems subido en ventas', () => {
      const detail = 'Faltan columnas requeridas: [total, comensales, tipo_documento]. Sobran columnas: [descripcion, cantidad, precio_total, familia, subfamilia]'
      const r = translateUploadError('VALIDATION_FAILED', [detail])
      expect(r.titulo).toContain('ítems')
      expect(r.detalle).toContain('Cargar Ítems')
    })

    it('archivo de ventas subido en ítems', () => {
      const detail = 'Faltan columnas requeridas: [descripcion, cantidad, precio_total, familia]. Sobran columnas: [total, comensales, tipo_documento]'
      const r = translateUploadError('VALIDATION_FAILED', [detail])
      expect(r.titulo).toContain('ventas')
      expect(r.detalle).toContain('Cargar Ventas')
    })
  })

  describe('TOO_MANY_REJECTED', () => {
    it('más del 5% rechazadas', () => {
      const r = translateUploadError('TOO_MANY_REJECTED')
      expect(r.titulo).toContain('Demasiadas filas')
      expect(r.detalle).toContain('5%')
      expect(r.tecnico).toBe('TOO_MANY_REJECTED')
    })
  })

  describe('Errores de commit / Postgres', () => {
    it('commit_upload RPC failed', () => {
      const msg = 'commit_upload RPC failed (500): {"code":"23505","details":"...","message":"duplicate key"}'
      const r = translateUploadError(msg)
      expect(r.titulo).toContain('problema al guardar')
      expect(r.detalle).not.toContain('soporte')
      expect(r.tecnico).toBe(msg)
    })
  })

  describe('Errores de ruta', () => {
    it('faltan location_id u org_id', () => {
      const r = translateUploadError('Faltan location_id u org_id')
      expect(r.titulo).toContain('Sesión no válida')
    })

    it('Se requiere el archivo', () => {
      const r = translateUploadError('Se requiere el archivo items')
      expect(r.titulo).toContain('Falta el archivo')
    })
  })

  describe('Errores de red', () => {
    it('HTTP 500', () => {
      const r = translateUploadError('HTTP 500')
      expect(r.titulo).toContain('comunicación')
    })
  })

  describe('Fallback', () => {
    it('código desconocido → mensaje genérico, nunca muestra el código crudo al usuario', () => {
      const r = translateUploadError('UNKNOWN_INTERNAL_CODE_XYZ')
      expect(r.titulo).toBeTruthy()
      expect(r.detalle).toBeTruthy()
      // el código crudo va en tecnico, no en titulo/detalle
      expect(r.titulo).not.toContain('UNKNOWN_INTERNAL_CODE_XYZ')
      expect(r.detalle).not.toContain('UNKNOWN_INTERNAL_CODE_XYZ')
      expect(r.tecnico).toContain('UNKNOWN_INTERNAL_CODE_XYZ')
    })

    it('error vacío → fallback genérico', () => {
      const r = translateUploadError('')
      expect(r.titulo).toBeTruthy()
      expect(r.detalle).toBeTruthy()
    })
  })

  describe('campo tecnico siempre presente', () => {
    it('incluye el código original y los errores', () => {
      const r = translateUploadError('VALIDATION_FAILED', ['Archivo no es Excel'])
      expect(r.tecnico).toContain('VALIDATION_FAILED')
      expect(r.tecnico).toContain('Archivo no es Excel')
    })
  })
})
