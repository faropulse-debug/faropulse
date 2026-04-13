// EvolutivoChart.tsx — Gráfico Evolutivo 12 meses
// Lee de financial_results via RPC get_financial_results
// Reemplaza el gráfico actual en EvolutivoSection

'use client';

import { useMemo, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, ReferenceLine
} from 'recharts';

// ── Types ──
interface FinancialRow {
  periodo: string;
  categoria: string;
  concepto: string;
  monto: number;
}

interface ChartPoint {
  name: string;
  periodo: string;
  VENTAS_NOCHE: number;
  TOTAL_COSTOS: number;
  SUELDOS_LIQ: number;
  SUELDOS_CARGAS: number;
  LIQ_FINAL: number;
  SERVICIOS: number;
  RESULTADO_NETO: number;
}

// ── Config ──
const MONTH_LABELS: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
};

const LINES = [
  { key: 'VENTAS_NOCHE', label: 'Facturación Bruta', color: '#f5820a', width: 3 },
  { key: 'TOTAL_COSTOS', label: 'Costos Variables', color: '#6366f1', width: 2 },
  { key: 'SUELDOS_LIQ', label: 'Sueldos + Liquidaciones', color: '#06b6d4', width: 2 },
  { key: 'SERVICIOS', label: 'Servicios', color: '#a855f7', width: 1.5 },
  { key: 'RESULTADO_NETO', label: 'Resultado Neto', color: '#22c55e', width: 3 },
] as const;

// ── Helpers ──
const formatPeriodo = (p: string) => {
  const [y, m] = p.split('-');
  return `${MONTH_LABELS[m] || m} ${y.slice(2)}`;
};

const formatMoney = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '-';
  const abs = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const formatFullMoney = (v: number | null | undefined) => {
  if (v === null || v === undefined) return '-';
  const sign = v < 0 ? '-' : '';
  return `${sign}$${Math.abs(v).toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
};

// ── Transform raw financial_results rows into chart data ──
export function transformFinancialData(rows: FinancialRow[]): ChartPoint[] {
  const byPeriod = new Map<string, Record<string, number>>();

  for (const row of rows) {
    if (!byPeriod.has(row.periodo)) {
      byPeriod.set(row.periodo, {});
    }
    byPeriod.get(row.periodo)![row.concepto] = row.monto;
  }

  const periods = Array.from(byPeriod.keys()).sort();
  // Keep last 12 months
  const last12 = periods.slice(-12);

  return last12.map(periodo => {
    const d = byPeriod.get(periodo)!;
    const sueldos = d['SUELDOS_CARGAS'] || 0;
    const liq = d['LIQ_FINAL'] || 0;
    return {
      name: formatPeriodo(periodo),
      periodo,
      VENTAS_NOCHE: d['VENTAS_NOCHE'] || 0,
      TOTAL_COSTOS: d['TOTAL_COSTOS'] || 0,
      SUELDOS_LIQ: sueldos + liq,
      SUELDOS_CARGAS: sueldos,
      LIQ_FINAL: liq,
      SERVICIOS: d['SERVICIOS'] || 0,
      RESULTADO_NETO: d['RESULTADO_NETO'] || 0,
    };
  });
}

// ── Tooltip ──
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload as ChartPoint;
  if (!d) return null;
  const pct = d.VENTAS_NOCHE
    ? ((d.RESULTADO_NETO / d.VENTAS_NOCHE) * 100).toFixed(1)
    : '0';

  return (
    <div className="rounded-xl border border-amber-500/20 p-4 min-w-[280px]"
      style={{ background: 'rgba(10,10,18,0.95)', backdropFilter: 'blur(20px)' }}>
      <div className="text-amber-500 text-xs font-bold mb-3 tracking-widest uppercase font-[Syne]">
        {d.name}
      </div>
      {LINES.map(line => {
        const val = d[line.key as keyof ChartPoint] as number;
        const isRes = line.key === 'RESULTADO_NETO';
        return (
          <div key={line.key} className="flex justify-between items-center py-1"
            style={{ borderBottom: isRes ? 'none' : '1px solid rgba(255,255,255,0.05)' }}>
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full"
                style={{ background: line.color, boxShadow: `0 0 6px ${line.color}55` }} />
              <span className="text-white/60 text-xs">{line.label}</span>
            </div>
            <span className="font-mono text-xs"
              style={{
                color: isRes ? (val >= 0 ? '#22c55e' : '#ef4444') : '#fff',
                fontWeight: isRes ? 700 : 500,
                fontSize: isRes ? 14 : 12,
              }}>
              {formatFullMoney(val)}
            </span>
          </div>
        );
      })}
      {/* Detalle sueldos */}
      <div className="mt-2 pt-2" style={{ borderTop: '1px solid rgba(6,182,212,0.2)' }}>
        <div className="text-cyan-400/50 text-[10px] tracking-wider mb-1">DETALLE SUELDOS + LIQ</div>
        <div className="flex justify-between text-[11px]">
          <span className="text-white/40">Sueldos y Cargas</span>
          <span className="text-cyan-400 font-mono">{formatFullMoney(d.SUELDOS_CARGAS)}</span>
        </div>
        <div className="flex justify-between text-[11px]">
          <span className="text-white/40">Liquidación Final</span>
          <span className="text-cyan-400 font-mono">{formatFullMoney(d.LIQ_FINAL)}</span>
        </div>
      </div>
      {/* Margen */}
      <div className="mt-2.5 px-3 py-2 rounded-lg flex justify-between items-center"
        style={{
          background: d.RESULTADO_NETO >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${d.RESULTADO_NETO >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}`,
        }}>
        <span className="text-white/50 text-[11px]">Margen Neto</span>
        <span className="font-[Syne] font-extrabold text-base"
          style={{ color: d.RESULTADO_NETO >= 0 ? '#22c55e' : '#ef4444' }}>
          {pct}%
        </span>
      </div>
    </div>
  );
}

// ── Main Component ──
interface EvolutivoChartProps {
  data: FinancialRow[];
  isLoading?: boolean;
}

export default function EvolutivoChart({ data, isLoading }: EvolutivoChartProps) {
  const [activeLines, setActiveLines] = useState<string[]>(LINES.map(l => l.key));

  const toggleLine = (key: string) => {
    setActiveLines(prev =>
      prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
    );
  };

  const chartData = useMemo(() => transformFinancialData(data), [data]);

  const resultadoTotal = chartData.reduce((s, d) => s + d.RESULTADO_NETO, 0);
  const ventasTotal = chartData.reduce((s, d) => s + d.VENTAS_NOCHE, 0);
  const margenProm = ventasTotal ? ((resultadoTotal / ventasTotal) * 100).toFixed(1) : '0';

  if (isLoading) {
    return (
      <div className="animate-pulse rounded-2xl bg-white/5 h-[520px]" />
    );
  }

  if (!chartData.length) {
    return (
      <div className="rounded-2xl bg-white/5 border border-white/10 p-8 text-center text-white/40">
        Sin datos financieros disponibles
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl p-6"
      style={{ background: 'linear-gradient(135deg, #0a0a12 0%, #0d0d1a 50%, #0a0a12 100%)' }}>
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 20% 20%, rgba(245,130,10,0.03) 0%, transparent 60%)' }} />
      <div className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse at 80% 80%, rgba(34,197,94,0.02) 0%, transparent 60%)' }} />

      <div className="relative z-10">
        {/* Header */}
        <div className="text-[10px] tracking-[3px] text-white/30 uppercase mb-1.5 font-[Syne] font-semibold">
          Evolutivo 12 Meses
        </div>
        <div className="flex justify-between items-end mb-5">
          <h2 className="font-[Syne] font-extrabold text-lg text-white tracking-tight m-0">
            Ventas · Costos Variables · Resultado
          </h2>
          <div className="flex gap-6 items-end">
            <div className="text-right">
              <div className="text-[10px] text-white/35 tracking-wider uppercase">Acumulado</div>
              <div className="font-mono text-lg font-bold text-amber-500">
                {formatMoney(ventasTotal)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-white/35 tracking-wider uppercase">Resultado</div>
              <div className="font-mono text-lg font-bold"
                style={{ color: resultadoTotal >= 0 ? '#22c55e' : '#ef4444' }}>
                {formatMoney(resultadoTotal)}
                <span className="text-[11px] text-white/35 ml-1.5">{margenProm}%</span>
              </div>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="rounded-xl p-4 pb-2"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <ResponsiveContainer width="100%" height={340}>
            <LineChart data={chartData} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
              <defs>
                <filter id="glow-resultado">
                  <feGaussianBlur stdDeviation="3" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
              <XAxis
                dataKey="name"
                tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(255,255,255,0.08)' }}
                tickLine={false} dy={8}
              />
              <YAxis
                tickFormatter={formatMoney}
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 10 }}
                axisLine={false} tickLine={false} dx={-5}
              />
              <Tooltip content={<CustomTooltip />}
                cursor={{ stroke: 'rgba(245,130,10,0.15)', strokeWidth: 1 }} />
              <ReferenceLine y={0} stroke="rgba(239,68,68,0.3)" strokeDasharray="6 4" strokeWidth={1.5} />

              {LINES.map(line =>
                activeLines.includes(line.key) ? (
                  <Line
                    key={line.key}
                    type="monotone"
                    dataKey={line.key}
                    stroke={line.color}
                    strokeWidth={line.width}
                    dot={{ r: line.key === 'RESULTADO_NETO' ? 5 : 3, fill: line.color, stroke: '#0a0a12', strokeWidth: 2 }}
                    activeDot={{ r: 7, fill: line.color, stroke: '#0a0a12', strokeWidth: 2 }}
                    filter={line.key === 'RESULTADO_NETO' ? 'url(#glow-resultado)' : undefined}
                    animationDuration={800}
                    animationEasing="ease-out"
                  />
                ) : null
              )}
            </LineChart>
          </ResponsiveContainer>

          {/* Legend toggleable */}
          <div className="flex flex-wrap gap-x-4 gap-y-2 justify-center pb-2">
            {LINES.map(line => {
              const isActive = activeLines.includes(line.key);
              return (
                <button key={line.key} onClick={() => toggleLine(line.key)}
                  className="flex items-center gap-1.5 bg-transparent border-none cursor-pointer transition-opacity"
                  style={{ opacity: isActive ? 1 : 0.3 }}>
                  <div className="rounded-full"
                    style={{
                      width: line.key === 'RESULTADO_NETO' ? 14 : 10,
                      height: line.key === 'RESULTADO_NETO' ? 14 : 10,
                      background: line.color,
                      boxShadow: isActive ? `0 0 8px ${line.color}66` : 'none',
                    }} />
                  <span className="text-[11px]"
                    style={{
                      color: isActive ? 'rgba(255,255,255,0.85)' : 'rgba(255,255,255,0.3)',
                      fontWeight: line.key === 'RESULTADO_NETO' ? 700 : 400,
                    }}>
                    {line.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mini cards */}
        <div className="grid grid-cols-5 gap-2 mt-4">
          {LINES.map(line => {
            const vals = chartData.map(d => d[line.key as keyof ChartPoint] as number);
            const last = vals[vals.length - 1];
            const prev = vals[vals.length - 2];
            const change = prev ? ((last - prev) / Math.abs(prev) * 100).toFixed(0) : '0';
            const isUp = last >= (prev || 0);
            return (
              <div key={line.key} className="rounded-lg p-2.5 text-center"
                style={{ background: 'rgba(255,255,255,0.02)', border: `1px solid ${line.color}15` }}>
                <div className="text-[9px] text-white/30 tracking-wider uppercase mb-1">
                  {line.label.split(' ')[0]}
                </div>
                <div className="font-mono text-sm font-bold"
                  style={{ color: line.key === 'RESULTADO_NETO' ? (last >= 0 ? '#22c55e' : '#ef4444') : line.color }}>
                  {formatMoney(last)}
                </div>
                <div className="text-[10px] mt-0.5"
                  style={{ color: isUp ? 'rgba(34,197,94,0.7)' : 'rgba(239,68,68,0.7)' }}>
                  {isUp ? '▲' : '▼'} {Math.abs(Number(change))}% vs ant.
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
