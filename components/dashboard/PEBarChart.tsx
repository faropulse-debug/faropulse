'use client'

import {
  BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ReferenceLine, ResponsiveContainer,
} from 'recharts'
import { fmtMillones } from '@/lib/format'

export type PELineas = { peMin: number; peOperativo: number; peIdeal: number }

function peBarColor(ventas: number, l: PELineas): string {
  if (ventas >= l.peIdeal)     return '#10b981'
  if (ventas >= l.peOperativo) return '#f59e0b'
  if (ventas >= l.peMin)       return '#f97316'
  return '#ef4444'
}

function peZoneLabel(ventas: number, l: PELineas): string {
  if (ventas >= l.peIdeal)     return 'Sobre PE Ideal'
  if (ventas >= l.peOperativo) return 'Entre PE Op. y Ideal'
  if (ventas >= l.peMin)       return 'Entre PE Mín y Op.'
  return 'Bajo PE Mínimo'
}

function PETooltip({ active, payload, label, lineas }: { active?: boolean; payload?: Array<{value: number}>; label?: string; lineas: PELineas }) {
  if (!active || !payload?.length) return null
  const ventas = payload[0].value
  const l      = lineas
  const diffOp = ventas - l.peOperativo
  const pctOp  = ((diffOp / l.peOperativo) * 100).toFixed(1)
  const color  = peBarColor(ventas, l)
  const zone   = peZoneLabel(ventas, l)
  return (
    <div style={{
      background: 'rgba(10,12,15,0.97)', border: '1px solid rgba(245,130,10,0.25)',
      borderRadius: '10px', padding: '10px 14px',
      fontFamily: 'var(--font-body)', fontSize: '12px', color: 'rgba(255,255,255,0.85)',
      minWidth: '178px',
    }}>
      <div style={{ color: '#f5820a', fontFamily: 'var(--font-display)', letterSpacing: '0.1em', marginBottom: '8px', fontSize: '11px' }}>{label}</div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '3px' }}>
        <span style={{ color: 'rgba(255,255,255,0.45)' }}>Ventas</span>
        <span style={{ fontWeight: 600 }}>{fmtMillones(ventas)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
        <span style={{ color: '#ef4444' }}>PE Mín</span>
        <span>{fmtMillones(l.peMin)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '2px' }}>
        <span style={{ color: '#f59e0b' }}>PE Operativo</span>
        <span>{fmtMillones(l.peOperativo)}</span>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', marginBottom: '6px' }}>
        <span style={{ color: '#10b981' }}>PE Ideal</span>
        <span>{fmtMillones(l.peIdeal)}</span>
      </div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', gap: '12px',
        paddingTop: '6px', borderTop: '1px solid rgba(255,255,255,0.08)',
        color, fontWeight: 600, fontSize: '11px',
      }}>
        <span>{zone}</span>
        <span>{diffOp >= 0 ? '+' : ''}{fmtMillones(diffOp)} ({pctOp}%)</span>
      </div>
    </div>
  )
}

const LEGEND = [
  { color: '#10b981', label: 'Sobre PE Ideal' },
  { color: '#f59e0b', label: 'Entre PE Op. y Ideal' },
  { color: '#f97316', label: 'Entre PE Mín y Op.' },
  { color: '#ef4444', label: 'Bajo PE Mínimo' },
]

export interface PEBarChartProps {
  title:  string
  data:   Array<{ label: string; ventas: number; pe: number }>
  lineas: PELineas
}

export function PEBarChart({ title, data, lineas }: PEBarChartProps) {
  const sobreOp   = data.filter(d => d.ventas >= lineas.peOperativo).length
  const total     = data.length
  const mayoriaOk = sobreOp >= Math.ceil(total / 2)
  const summaryClr = mayoriaOk ? '#10b981' : '#ef4444'

  return (
    <div style={{
      background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: '16px', backdropFilter: 'blur(20px)', padding: '20px 20px 16px',
    }}>
      <div style={{
        fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '0.62rem',
        letterSpacing: '0.2em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)',
        marginBottom: '16px',
      }}>{title}</div>

      <ResponsiveContainer width="100%" height={160}>
        <BarChart data={data} margin={{ top: 6, right: 44, left: 0, bottom: 0 }} barSize={28}>
          <CartesianGrid strokeDasharray="2 4" stroke="rgba(255,255,255,0.04)" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-body)' }}
            axisLine={false} tickLine={false}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 10, fontFamily: 'var(--font-body)' }}
            axisLine={false} tickLine={false}
            tickFormatter={v => fmtMillones(v)}
            width={48}
          />
          <Tooltip content={<PETooltip lineas={lineas} />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
          <ReferenceLine y={lineas.peMin} stroke="#ef4444" strokeDasharray="4 4" strokeOpacity={0.6}
            label={{ value: 'PE Mín', fill: '#ef4444', fillOpacity: 0.7, fontSize: 9, fontFamily: 'var(--font-display)', position: 'right' }} />
          <ReferenceLine y={lineas.peOperativo} stroke="#f59e0b" strokeDasharray="4 4" strokeOpacity={0.7}
            label={{ value: 'PE Op.', fill: '#f59e0b', fillOpacity: 0.8, fontSize: 9, fontFamily: 'var(--font-display)', position: 'right' }} />
          <ReferenceLine y={lineas.peIdeal} stroke="#10b981" strokeDasharray="4 4" strokeOpacity={0.6}
            label={{ value: 'PE Ideal', fill: '#10b981', fillOpacity: 0.7, fontSize: 9, fontFamily: 'var(--font-display)', position: 'right' }} />
          <Bar dataKey="ventas" radius={[4, 4, 0, 0]}>
            {data.map((entry, i) => (
              <Cell key={i} fill={peBarColor(entry.ventas, lineas)} fillOpacity={0.82} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div style={{
        display: 'flex', flexWrap: 'wrap', gap: '10px 16px',
        marginTop: '12px', paddingTop: '10px', borderTop: '1px solid rgba(255,255,255,0.05)',
      }}>
        {LEGEND.map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
            <div style={{ width: '8px', height: '8px', borderRadius: '2px', background: color, opacity: 0.85 }} />
            <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.63rem', color: 'rgba(255,255,255,0.35)' }}>{label}</span>
          </div>
        ))}
      </div>

      <div style={{
        display: 'flex', alignItems: 'center', gap: '6px',
        marginTop: '10px', fontFamily: 'var(--font-body)', fontSize: '0.72rem',
      }}>
        <span style={{ fontWeight: 700, fontSize: '0.95rem', color: summaryClr }}>{sobreOp}</span>
        <span style={{ color: 'rgba(255,255,255,0.3)' }}>de {total} períodos sobre PE Operativo</span>
        <span style={{
          marginLeft: 'auto', fontWeight: 600, color: summaryClr,
          background: `${summaryClr}18`, borderRadius: '4px', padding: '2px 8px',
        }}>{Math.round(sobreOp / total * 100)}%</span>
      </div>
    </div>
  )
}
