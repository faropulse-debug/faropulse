'use client'

import { useMemo }          from 'react'
import { useDashboardData } from '@/hooks/useDashboardData'
import { SectionLabel }     from '@/components/dashboard/SectionLabel'
import { PEBarChart }       from '@/components/dashboard/PEBarChart'
import type { PELineas }    from '@/components/dashboard/PEBarChart'

// ─── Constants ────────────────────────────────────────────────────────────────

const DIAS_ES      = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']
const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

const peLineas: Record<'diario' | 'semanal' | 'mensual' | 'semestral', PELineas> = {
  diario:    { peMin:  280_000,   peOperativo:   454_000, peIdeal:    516_000 },
  semanal:   { peMin: 1_960_000,  peOperativo: 3_178_000, peIdeal:  3_610_000 },
  mensual:   { peMin: 8_500_000,  peOperativo: 11_800_000, peIdeal: 13_400_000 },
  semestral: { peMin: 51_000_000, peOperativo: 70_800_000, peIdeal: 80_400_000 },
}

// ─── Mock fallback ────────────────────────────────────────────────────────────

type PEBar = { label: string; ventas: number; pe: number }

const MOCK: Record<'diario' | 'semanal' | 'mensual' | 'semestral', PEBar[]> = {
  diario: [
    { label: 'Lun', ventas: 2_100_000, pe: 454_000 },
    { label: 'Mar', ventas:   890_000, pe: 454_000 },
    { label: 'Mié', ventas: 3_200_000, pe: 454_000 },
    { label: 'Jue', ventas: 4_100_000, pe: 454_000 },
    { label: 'Vie', ventas: 5_800_000, pe: 454_000 },
    { label: 'Sáb', ventas: 7_200_000, pe: 454_000 },
    { label: 'Dom', ventas:   320_000, pe: 454_000 },
  ],
  semanal: [
    { label: 'S1', ventas: 18_400_000, pe: 3_178_000 },
    { label: 'S2', ventas: 21_200_000, pe: 3_178_000 },
    { label: 'S3', ventas: 19_800_000, pe: 3_178_000 },
    { label: 'S4', ventas: 22_700_000, pe: 3_178_000 },
    { label: 'S5', ventas: 15_100_000, pe: 3_178_000 },
    { label: 'S6', ventas: 23_400_000, pe: 3_178_000 },
  ],
  mensual: [
    { label: 'Jul', ventas:  38_400_000, pe: 11_800_000 },
    { label: 'Ago', ventas:  41_200_000, pe: 11_800_000 },
    { label: 'Sep', ventas:  44_800_000, pe: 11_800_000 },
    { label: 'Oct', ventas:  47_900_000, pe: 11_800_000 },
    { label: 'Nov', ventas:  52_300_000, pe: 11_800_000 },
    { label: 'Dic', ventas:  82_100_000, pe: 11_800_000 },
  ],
  semestral: [
    { label: 'S1 2024', ventas: 198_000_000, pe: 70_800_000 },
    { label: 'S2 2024', ventas: 306_700_000, pe: 70_800_000 },
    { label: 'S1 2025', ventas: 265_000_000, pe: 70_800_000 },
    { label: 'S2 2025', ventas: 341_000_000, pe: 70_800_000 },
  ],
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  locationId: string
}

export function PuntoDeEquilibrioSection({ locationId }: Props) {
  const { data: liveData, isLoading } = useDashboardData(locationId)

  const peData = useMemo(() => {
    if (!liveData) return MOCK

    const diario = liveData.ventasDiarias.length > 0
      ? liveData.ventasDiarias.map(d => ({
          label:  DIAS_ES[new Date(d.fecha + 'T12:00:00').getDay()],
          ventas: Number(d.ventas),
          pe:     peLineas.diario.peOperativo,
        }))
      : MOCK.diario

    const semanal = liveData.ventasSemanales.length > 0
      ? liveData.ventasSemanales.map((d, i) => ({
          label:  `S${i + 1}`,
          ventas: Number(d.ventas),
          pe:     peLineas.semanal.peOperativo,
        }))
      : MOCK.semanal

    const mensual = liveData.financialResults.filter(r => r.concepto === 'VENTAS_NOCHE').length > 0
      ? liveData.financialResults
          .filter(r => r.concepto === 'VENTAS_NOCHE')
          .slice(-6)
          .map(r => ({
            label:  MESES_CORTOS[parseInt(r.periodo.split('-')[1]) - 1],
            ventas: r.monto,
            pe:     peLineas.mensual.peOperativo,
          }))
      : MOCK.mensual

    return { ...MOCK, diario, semanal, mensual }
  }, [liveData])

  return (
    <div style={{ marginBottom: '52px' }}>
      <SectionLabel>Punto de Equilibrio</SectionLabel>
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(440px, 1fr))', gap: '16px',
        opacity: isLoading ? 0.5 : 1, transition: 'opacity 0.3s',
      }}>
        <PEBarChart title="PE DIARIO — última semana"      data={peData.diario}    lineas={peLineas.diario}    />
        <PEBarChart title="PE SEMANAL — últimas 6 semanas" data={peData.semanal}   lineas={peLineas.semanal}   />
        <PEBarChart title="PE MENSUAL — últimos 6 meses"   data={peData.mensual}   lineas={peLineas.mensual}   />
        <PEBarChart title="PE SEMESTRAL — histórico"       data={peData.semestral} lineas={peLineas.semestral} />
      </div>
    </div>
  )
}
