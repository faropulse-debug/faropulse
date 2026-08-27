import { describe, it, expect } from 'vitest'
import {
  extractReferencedSecrets,
  evaluateSecretsParity,
} from '../scripts/lib/secrets-engine'

describe('Secrets Engine (Motor Puro)', () => {
  describe('extractReferencedSecrets', () => {
    it('extrae nombres de secrets referenciados en YAML', () => {
      const yaml = `
        env:
          URL: \${{ secrets.NEXT_PUBLIC_SUPABASE_URL_STG }}
          KEY: \${{secrets.NEXT_PUBLIC_SUPABASE_ANON_KEY_STG}}
          PASS: \${{ secrets.QA_OWNER_PASSWORD }}
      `
      const secrets = extractReferencedSecrets(yaml)
      expect(secrets).toEqual([
        'NEXT_PUBLIC_SUPABASE_ANON_KEY_STG',
        'NEXT_PUBLIC_SUPABASE_URL_STG',
        'QA_OWNER_PASSWORD',
      ])
    })

    it('ignora el secret built-in GITHUB_TOKEN', () => {
      const yaml = `
        env:
          TOKEN: \${{ secrets.GITHUB_TOKEN }}
          CUSTOM: \${{ secrets.MY_CUSTOM_SECRET }}
      `
      const secrets = extractReferencedSecrets(yaml)
      expect(secrets).toEqual(['MY_CUSTOM_SECRET'])
    })

    it('retorna array vacio si no hay secrets', () => {
      const yaml = `name: CI\njobs:\n  test:\n    runs-on: ubuntu-latest\n`
      expect(extractReferencedSecrets(yaml)).toEqual([])
    })
  })

  describe('evaluateSecretsParity', () => {
    it('detecta secrets faltantes y mapea los archivos que los referencian', () => {
      const files = new Map<string, string>([
        ['ci.yml', 'env:\n  A: ${{ secrets.QA_A }}\n  B: ${{ secrets.QA_B }}\n'],
        ['deploy.yml', 'env:\n  B: ${{ secrets.QA_B }}\n  C: ${{ secrets.QA_C }}\n'],
      ])

      const existing = ['QA_A'] // QA_B y QA_C faltan

      const result = evaluateSecretsParity(files, existing)
      expect(result.missingSecrets).toEqual(['QA_B', 'QA_C'])
      expect(result.referencedSecrets.get('QA_B')).toEqual(['ci.yml', 'deploy.yml'])
      expect(result.referencedSecrets.get('QA_C')).toEqual(['deploy.yml'])
    })

    it('devuelve missingSecrets vacio cuando todos los secrets existen', () => {
      const files = new Map<string, string>([
        ['ci.yml', 'env:\n  A: ${{ secrets.QA_A }}\n'],
      ])

      const existing = ['QA_A', 'OTRO_SECRET']
      const result = evaluateSecretsParity(files, existing)
      expect(result.missingSecrets).toEqual([])
    })
  })
})
