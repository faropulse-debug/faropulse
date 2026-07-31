#!/usr/bin/env node
/**
 * Criterio: el dependency-audit falla SOLO si `npm audit fix` (sin --force)
 * resolvería algo. Vulnerabilidades sin fix, o que solo se resuelven con
 * --force (bump major, ej. Next 16→9 para sharp/postcss), se reportan pero
 * no bloquean — un check siempre rojo no informa nada.
 *
 * Por qué no alcanza con leer el campo `fixAvailable` del JSON de
 * `npm audit`: en grafos con dependencias anidadas puede decir `true`
 * (sugiriendo fix simple) para un paquete que en la práctica no se mueve
 * sin --force, porque la causa raíz está más arriba en el árbol (visto en
 * este repo: eslint-plugin-react reportaba fixAvailable=true pero dos
 * corridas reales de `npm audit fix` no lo tocaron — la causa raíz es
 * minimatch vía eslint, que sí requiere --force).
 *
 * Por eso el criterio es empírico, no heurístico: se corre `npm audit fix`
 * de verdad sobre un checkout descartable (el del job de CI) y se compara
 * el set de vulnerabilidades high/critical antes vs. después. Lo que
 * desapareció es lo que `npm audit fix` resuelve — eso es lo accionable.
 */
import { readFileSync } from 'node:fs'

const [beforePath, afterPath] = process.argv.slice(2)
if (!beforePath || !afterPath) {
  console.error('Uso: check-dependency-audit.mjs <before.json> <after.json>')
  process.exit(2)
}

function highCritSet(path) {
  const raw = JSON.parse(readFileSync(path, 'utf8'))
  const vulns = Object.values(raw.vulnerabilities ?? {})
  return new Map(
    vulns
      .filter(v => v.severity === 'high' || v.severity === 'critical')
      .map(v => [v.name, v.severity])
  )
}

const before = highCritSet(beforePath)
const after = highCritSet(afterPath)

const resolved = [...before].filter(([name]) => !after.has(name))
const remaining = [...after].sort(([a], [b]) => a.localeCompare(b))

if (remaining.length > 0) {
  console.log(`🔵 ${remaining.length} vulnerabilidad(es) high/critical SIN fix simple disponible (requieren --force o no tienen fix aún) — no bloquean:`)
  for (const [name, severity] of remaining) console.log(`   - ${name} (${severity})`)
}

if (resolved.length > 0) {
  console.log(`\n🚨 ${resolved.length} vulnerabilidad(es) accionable(s) — \`npm audit fix\` las resolvería y el lockfile commiteado no lo refleja:`)
  for (const [name, severity] of resolved) console.log(`   - ${name} (${severity})`)
  console.log('\n❌ Corré `npm audit fix` local y commiteá el package-lock.json actualizado.')
  process.exit(1)
}

console.log('\n✅ Nada accionable vía `npm audit fix` — las vulnerabilidades restantes (si las hay) requieren --force y quedan documentadas arriba, sin bloquear.')
