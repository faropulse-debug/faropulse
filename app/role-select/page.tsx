'use client'

import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

// ─── BACKGROUND ───────────────────────────────────────────────────────────────

function SceneBackground() {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 0, overflow: 'hidden' }}>
      {/* Base dark */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'linear-gradient(160deg, #0b0d0f 0%, #0e1014 40%, #0a0c10 100%)',
      }} />
      {/* Amber nebula left */}
      <div style={{
        position: 'absolute',
        width: '55vw', height: '55vw',
        top: '-10vw', left: '-8vw',
        background: 'radial-gradient(circle, rgba(245,130,10,0.065) 0%, transparent 68%)',
        filter: 'blur(40px)',
      }} />
      {/* Blue nebula right */}
      <div style={{
        position: 'absolute',
        width: '50vw', height: '50vw',
        bottom: '-10vw', right: '-5vw',
        background: 'radial-gradient(circle, rgba(80,140,220,0.055) 0%, transparent 68%)',
        filter: 'blur(40px)',
      }} />
      {/* Center ambient */}
      <div style={{
        position: 'absolute',
        width: '40vw', height: '30vw',
        top: '30%', left: '30%',
        background: 'radial-gradient(ellipse, rgba(245,130,10,0.025) 0%, transparent 65%)',
        filter: 'blur(30px)',
      }} />
      {/* Vignette */}
      <div style={{
        position: 'absolute', inset: 0,
        background: 'radial-gradient(ellipse at center, transparent 40%, rgba(0,0,0,0.72) 100%)',
      }} />
      {/* Top scan line */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: '1px',
        background: 'linear-gradient(90deg, transparent 0%, rgba(245,130,10,0.35) 50%, transparent 100%)',
      }} />
    </div>
  )
}

// ─── COMPASS ICON (owner) ─────────────────────────────────────────────────────

function CompassIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <circle cx="20" cy="20" r="17" stroke="rgba(245,130,10,0.5)" strokeWidth="1.5" />
      <circle cx="20" cy="20" r="3" fill="#f5820a" />
      <polygon points="20,6 22.5,18 20,17 17.5,18" fill="#f5820a" opacity="0.9" />
      <polygon points="20,34 17.5,22 20,23 22.5,22" fill="rgba(245,130,10,0.4)" />
      <polygon points="6,20 18,17.5 17,20 18,22.5" fill="rgba(255,255,255,0.35)" />
      <polygon points="34,20 22,22.5 23,20 22,17.5" fill="rgba(255,255,255,0.2)" />
    </svg>
  )
}

// ─── PANEL ICON (manager) ─────────────────────────────────────────────────────

function PanelIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="4" y="4" width="32" height="32" rx="5" stroke="rgba(100,160,240,0.5)" strokeWidth="1.5" />
      <rect x="4" y="4" width="15" height="32" rx="5" fill="rgba(100,160,240,0.08)" />
      <line x1="19" y1="4" x2="19" y2="36" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
      <rect x="8" y="9"  width="7" height="2" rx="1" fill="rgba(100,160,240,0.6)" />
      <rect x="8" y="14" width="7" height="2" rx="1" fill="rgba(100,160,240,0.4)" />
      <rect x="8" y="19" width="7" height="2" rx="1" fill="rgba(100,160,240,0.3)" />
      <rect x="23" y="9"  width="10" height="5" rx="2" fill="rgba(100,160,240,0.15)" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
      <rect x="23" y="18" width="10" height="5" rx="2" fill="rgba(100,160,240,0.15)" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
      <rect x="23" y="27" width="10" height="5" rx="2" fill="rgba(100,160,240,0.15)" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
    </svg>
  )
}

// ─── WORDMARK ─────────────────────────────────────────────────────────────────

function Wordmark() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
      {/* Pulse dot */}
      <div style={{
        width: '8px', height: '8px', borderRadius: '50%',
        background: '#f5820a',
        boxShadow: '0 0 10px rgba(245,130,10,0.8), 0 0 20px rgba(245,130,10,0.4)',
        animation: 'fp-pulse-dot 2s ease-in-out infinite',
      }} />
      <span style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '1.35rem',
        letterSpacing: '0.2em',
        color: 'rgba(255,255,255,0.92)',
        textTransform: 'uppercase',
      }}>
        FARO<span style={{ color: '#f5820a' }}>PULSE</span>
      </span>
    </div>
  )
}

// ─── ROLE CARD ────────────────────────────────────────────────────────────────

interface RoleCardProps {
  icon: React.ReactNode
  title: string
  subtitle: string
  description: string
  accentColor: string
  accentGlow: string
  onClick: () => void
  disabled?: boolean
}

function RoleCard({ icon, title, subtitle, description, accentColor, accentGlow, onClick, disabled }: RoleCardProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '340px',
        padding: '36px 32px',
        background: 'rgba(255,255,255,0.03)',
        border: `1px solid rgba(255,255,255,0.07)`,
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        textAlign: 'left',
        transition: 'transform 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s',
        outline: 'none',
      }}
      onMouseEnter={e => {
        if (disabled) return
        const el = e.currentTarget
        el.style.transform = 'translateY(-4px)'
        el.style.borderColor = `${accentColor}55`
        el.style.background = 'rgba(255,255,255,0.055)'
        el.style.boxShadow = `0 20px 60px rgba(0,0,0,0.4), 0 0 30px ${accentGlow}`
      }}
      onMouseLeave={e => {
        const el = e.currentTarget
        el.style.transform = 'translateY(0)'
        el.style.borderColor = 'rgba(255,255,255,0.07)'
        el.style.background = 'rgba(255,255,255,0.03)'
        el.style.boxShadow = 'none'
      }}
    >
      {/* Top accent line */}
      <div style={{
        position: 'absolute', top: 0, left: '20%', right: '20%', height: '1px',
        background: `linear-gradient(90deg, transparent, ${accentColor}, transparent)`,
        opacity: 0.6,
      }} />

      {/* Icon */}
      <div style={{ marginBottom: '24px' }}>{icon}</div>

      {/* Title */}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 700,
        fontSize: '1.05rem',
        letterSpacing: '0.15em',
        textTransform: 'uppercase',
        color: accentColor,
        marginBottom: '4px',
      }}>
        {title}
      </div>

      {/* Subtitle */}
      <div style={{
        fontFamily: 'var(--font-display)',
        fontWeight: 500,
        fontSize: '0.62rem',
        letterSpacing: '0.2em',
        textTransform: 'uppercase',
        color: 'rgba(255,255,255,0.35)',
        marginBottom: '20px',
      }}>
        {subtitle}
      </div>

      {/* Divider */}
      <div style={{
        height: '1px',
        background: 'rgba(255,255,255,0.07)',
        marginBottom: '20px',
      }} />

      {/* Description */}
      <div style={{
        fontFamily: 'var(--font-body)',
        fontWeight: 300,
        fontSize: '0.82rem',
        lineHeight: 1.65,
        color: 'rgba(255,255,255,0.5)',
      }}>
        {description}
      </div>

      {/* Arrow */}
      <div style={{
        marginTop: '28px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        fontFamily: 'var(--font-display)',
        fontSize: '0.65rem',
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        color: accentColor,
        opacity: 0.7,
      }}>
        <span>Continuar</span>
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M2 7h10M8 3l4 4-4 4" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
    </button>
  )
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function RoleSelectPage() {
  const router = useRouter()
  const { user, isLoading, setActiveMembership, signOut } = useAuth()

  const ownerMemberships  = user?.memberships.filter(m => m.role === 'owner')  ?? []
  const managerMemberships = user?.memberships.filter(m => m.role === 'manager') ?? []

  function handleSelectOwner() {
    if (ownerMemberships.length > 0) {
      setActiveMembership(ownerMemberships[0].id)
    } else {
      document.cookie = 'faro_role=owner; path=/; max-age=86400; SameSite=Lax'
    }
    router.push('/dashboard/owner')
  }

  function handleSelectManager() {
    if (managerMemberships.length > 0) {
      setActiveMembership(managerMemberships[0].id)
    } else {
      document.cookie = 'faro_role=manager; path=/; max-age=86400; SameSite=Lax'
    }
    router.push('/dashboard/manager')
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const firstName = user?.profile.full_name?.split(' ')[0] ?? user?.profile.email?.split('@')[0] ?? ''

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <SceneBackground />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '800px', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Logo */}
        <div style={{ marginBottom: '56px' }}>
          <Wordmark />
        </div>

        {/* Welcome headline */}
        <div style={{ textAlign: 'center', marginBottom: '12px' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: 'clamp(1.5rem, 3vw, 2rem)',
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.88)',
            margin: 0,
          }}>
            {isLoading ? 'Cargando…' : firstName ? `Bienvenido, ${firstName}` : 'Seleccioná tu vista'}
          </h1>
        </div>

        {/* Subheading */}
        <p style={{
          fontFamily: 'var(--font-body)',
          fontWeight: 300,
          fontSize: '0.85rem',
          color: 'rgba(255,255,255,0.38)',
          marginBottom: '52px',
          letterSpacing: '0.03em',
        }}>
          ¿Con qué perspectiva querés operar hoy?
        </p>

        {/* Cards */}
        <div style={{
          display: 'flex',
          gap: '24px',
          flexWrap: 'wrap',
          justifyContent: 'center',
          width: '100%',
        }}>
          <RoleCard
            icon={<CompassIcon size={40} />}
            title="Vista Dueño"
            subtitle="Perspectiva estratégica"
            description="Accedé a métricas globales, rentabilidad por local, comparativas de rendimiento y decisiones de alto nivel."
            accentColor="#f5820a"
            accentGlow="rgba(245,130,10,0.15)"
            onClick={handleSelectOwner}
            disabled={isLoading}
          />
          <RoleCard
            icon={<PanelIcon size={40} />}
            title="Vista Encargado"
            subtitle="Perspectiva operativa"
            description="Gestioná el turno activo, controlá el equipo, revisá el panel diario y ejecutá acciones operativas."
            accentColor="#64a0f0"
            accentGlow="rgba(100,160,240,0.15)"
            onClick={handleSelectManager}
            disabled={isLoading}
          />
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          style={{
            marginTop: '52px',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            fontFamily: 'var(--font-display)',
            fontSize: '0.62rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.25)',
            transition: 'color 0.2s',
            padding: '8px 16px',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.55)' }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.25)' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  )
}
