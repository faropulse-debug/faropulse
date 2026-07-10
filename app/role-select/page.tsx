'use client'

import { useState, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'

// BACKGROUND

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

// ICONS

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

function PanelIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <rect x="4" y="4" width="32" height="32" rx="5" stroke="rgba(100,160,240,0.5)" strokeWidth="1.5" />
      <rect x="4" y="4" width="15" height="32" rx="5" fill="rgba(100,160,240,0.08)" />
      <line x1="19" y1="4" x2="19" y2="36" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
      <rect x="8" y="9" width="7" height="2" rx="1" fill="rgba(100,160,240,0.6)" />
      <rect x="8" y="14" width="7" height="2" rx="1" fill="rgba(100,160,240,0.4)" />
      <rect x="8" y="19" width="7" height="2" rx="1" fill="rgba(100,160,240,0.3)" />
      <rect x="23" y="9" width="10" height="5" rx="2" fill="rgba(100,160,240,0.15)" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
      <rect x="23" y="18" width="10" height="5" rx="2" fill="rgba(100,160,240,0.15)" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
      <rect x="23" y="27" width="10" height="5" rx="2" fill="rgba(100,160,240,0.15)" stroke="rgba(100,160,240,0.3)" strokeWidth="1" />
    </svg>
  )
}

function LocationIcon({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M8 17.5h24v16H8v-16Z" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" />
      <path d="M6 17.5 9.5 8h21L34 17.5H6Z" fill="rgba(245,130,10,0.16)" stroke="rgba(245,130,10,0.45)" strokeWidth="1.4" />
      <path d="M12 17.5V22c0 1.8 1.4 3.2 3.2 3.2s3.2-1.4 3.2-3.2v-4.5" stroke="rgba(245,130,10,0.5)" strokeWidth="1.3" />
      <path d="M21.6 17.5V22c0 1.8 1.4 3.2 3.2 3.2S28 23.8 28 22v-4.5" stroke="rgba(245,130,10,0.5)" strokeWidth="1.3" />
      <rect x="14" y="27" width="12" height="6.5" rx="1.6" fill="rgba(255,255,255,0.08)" stroke="rgba(255,255,255,0.18)" strokeWidth="1" />
    </svg>
  )
}

function UploadIcon({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" fill="none">
      <path d="M12 28.5h16c3.6 0 6.5-2.8 6.5-6.4 0-3.2-2.3-5.9-5.4-6.3C27.9 10.4 23.9 7 19 7c-5.6 0-10.2 4.4-10.5 10-3.2.8-5.5 3.5-5.5 6.9 0 3.9 3.1 4.6 7 4.6" stroke="rgba(245,130,10,0.52)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M20 30V17" stroke="#f5820a" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M15.5 21.5 20 17l4.5 4.5" stroke="#f5820a" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="20" cy="20" r="17" stroke="rgba(245,130,10,0.16)" strokeWidth="1" />
    </svg>
  )
}

function LockIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <rect x="3.5" y="7" width="9" height="6.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M5.5 7V5.2A2.5 2.5 0 0 1 8 2.7a2.5 2.5 0 0 1 2.5 2.5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

// WORDMARK

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

// CARDS

interface LocationCardProps {
  title: string
  role: string
  onClick: () => void
  disabled?: boolean
}

function LocationCard({ title, role, onClick, disabled }: LocationCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        width: '100%',
        minHeight: '270px',
        padding: '14px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        textAlign: 'left',
        transition: 'transform 0.2s, border-color 0.2s, background 0.2s, box-shadow 0.2s',
        outline: 'none',
      }}
      onMouseEnter={e => {
        if (disabled) return
        const el = e.currentTarget
        el.style.transform = 'translateY(-4px)'
        el.style.borderColor = 'rgba(245,130,10,0.36)'
        el.style.background = 'rgba(255,255,255,0.055)'
        el.style.boxShadow = '0 20px 60px rgba(0,0,0,0.38), 0 0 26px rgba(245,130,10,0.12)'
      }}
      onMouseLeave={e => {
        if (disabled) return
        const el = e.currentTarget
        el.style.transform = 'translateY(0)'
        el.style.borderColor = 'rgba(255,255,255,0.07)'
        el.style.background = 'rgba(255,255,255,0.03)'
        el.style.boxShadow = 'none'
      }}
    >
      <div style={{
        position: 'relative',
        height: '120px',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '18px',
        background: 'linear-gradient(135deg, rgba(245,130,10,0.18), rgba(100,160,240,0.08) 58%, rgba(255,255,255,0.04))',
        border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(circle at 30% 20%, rgba(255,255,255,0.18), transparent 34%), radial-gradient(circle at 78% 70%, rgba(245,130,10,0.16), transparent 40%)',
        }} />
        <div style={{ position: 'relative', color: 'rgba(255,255,255,0.62)' }}>
          <LocationIcon size={42} />
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '14px' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '1rem',
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.88)',
            marginBottom: '8px',
            overflowWrap: 'anywhere',
          }}>
            {title}
          </div>
          <div style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '0.78rem',
            color: 'rgba(255,255,255,0.34)',
          }}>
            Dirección no configurada
          </div>
        </div>

        <span style={{
          flexShrink: 0,
          padding: '5px 8px',
          borderRadius: '999px',
          border: '1px solid rgba(245,130,10,0.22)',
          background: 'rgba(245,130,10,0.08)',
          fontFamily: 'var(--font-display)',
          fontSize: '0.58rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'rgba(245,130,10,0.82)',
        }}>
          {role}
        </span>
      </div>
    </button>
  )
}

interface RoleCardProps {
  icon: ReactNode
  title: string
  description: string
  accentColor: string
  accentGlow: string
  onClick: () => void
  disabled?: boolean
}

function RoleCard({ icon, title, description, accentColor, accentGlow, onClick, disabled }: RoleCardProps) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        position: 'relative',
        width: '100%',
        maxWidth: '340px',
        padding: '36px 32px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: '16px',
        backdropFilter: 'blur(20px)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
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
        if (disabled) return
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
        marginBottom: '20px',
      }}>
        {title}
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

      {/* Action */}
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
        {disabled ? (
          <>
            <LockIcon size={14} />
            <span>Sin acceso</span>
          </>
        ) : (
          <>
            <span>Continuar</span>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 7h10M8 3l4 4-4 4" stroke={accentColor} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </>
        )}
      </div>
    </button>
  )
}

// MAIN PAGE

type ModuleKey = 'business' | 'operations' | 'upload'

export default function RoleSelectPage() {
  const router = useRouter()
  const { user, isLoading, setActiveMembership, signOut } = useAuth()
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null)

  const memberships = user?.memberships ?? []
  const selectedMembership = memberships.find(m => m.id === selectedMembershipId) ?? null
  const selectedLocalName = selectedMembership?.organization?.name ?? 'este local'

  const modules: Array<{
    key: ModuleKey
    icon: ReactNode
    title: string
    description: string
    href: string
    accentColor: string
    accentGlow: string
  }> = [
    {
      key: 'business',
      icon: <CompassIcon size={42} />,
      title: 'Datos de Negocio',
      description: 'Rentabilidad, P&L, inversión y descuentos',
      href: '/dashboard/owner/v2?modulo=negocio',
      accentColor: '#f5820a',
      accentGlow: 'rgba(245,130,10,0.16)',
    },
    {
      key: 'operations',
      icon: <PanelIcon size={42} />,
      title: 'Datos Operativos',
      description: 'Operación del día, ventas y mix de canales',
      href: '/dashboard/owner/v2?modulo=operaciones',
      accentColor: '#64a0f0',
      accentGlow: 'rgba(100,160,240,0.16)',
    },
    {
      key: 'upload',
      icon: <UploadIcon size={42} />,
      title: 'Carga de Información',
      description: 'Subir datos de ventas y P&L',
      href: '/dashboard/upload',
      accentColor: '#f5820a',
      accentGlow: 'rgba(245,130,10,0.16)',
    },
  ]

  function handleSelectMembership(membershipId: string) {
    setActiveMembership(membershipId)
    setSelectedMembershipId(membershipId)
  }

  function handleSelectModule(href: string) {
    router.push(href)
  }

  function canAccessModule(module: ModuleKey) {
    if (!selectedMembership) return false

    const { role } = selectedMembership

    if (role === 'owner' || role === 'super_admin') return true
    if (role === 'manager') return module !== 'upload'
    if (role === 'encargado' || role === 'staff') return module === 'operations'

    return false
  }

  async function handleSignOut() {
    await signOut()
    router.push('/login')
  }

  const firstName = user?.profile.full_name?.split(' ')[0] ?? user?.profile.email?.split('@')[0] ?? ''
  const isModuleStep = Boolean(selectedMembership)

  return (
    <div style={{ position: 'relative', minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <SceneBackground />

      <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: isModuleStep ? '1040px' : '960px', padding: '40px 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        {/* Logo */}
        <div style={{ marginBottom: '48px' }}>
          <Wordmark />
        </div>

        {/* Welcome headline */}
        <div style={{ textAlign: 'center', marginBottom: '14px' }}>
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '2rem',
            letterSpacing: '0.04em',
            color: 'rgba(255,255,255,0.88)',
            margin: 0,
          }}>
            {isLoading ? 'Cargando...' : firstName ? `Bienvenido, ${firstName}` : 'Bienvenido'}
          </h1>
        </div>

        <h2 style={{
          fontFamily: 'var(--font-display)',
          fontWeight: 500,
          fontSize: '1.25rem',
          letterSpacing: '0.03em',
          color: 'rgba(255,255,255,0.58)',
          margin: '0 0 42px',
          textAlign: 'center',
          overflowWrap: 'anywhere',
        }}>
          {isModuleStep ? `¿Qué querés hacer en ${selectedLocalName}?` : '¿En qué local querés trabajar?'}
        </h2>

        {isLoading ? (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center',
          }}>
            Cargando locales...
          </p>
        ) : memberships.length === 0 ? (
          <p style={{
            fontFamily: 'var(--font-body)',
            fontWeight: 300,
            fontSize: '0.85rem',
            color: 'rgba(255,255,255,0.5)',
            textAlign: 'center',
          }}>
            No tenés acceso a ningún local. Contactá al administrador.
          </p>
        ) : isModuleStep ? (
          <>
            <button
              onClick={() => setSelectedMembershipId(null)}
              style={{
                alignSelf: 'flex-start',
                marginBottom: '24px',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                fontFamily: 'var(--font-display)',
                fontSize: '0.68rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.42)',
                transition: 'color 0.2s',
                padding: '8px 0',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(245,130,10,0.82)' }}
              onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.42)' }}
            >
              ← Volver
            </button>

            <div style={{
              display: 'flex',
              gap: '24px',
              flexWrap: 'wrap',
              justifyContent: 'center',
              width: '100%',
            }}>
              {modules.map(module => {
                const hasAccess = canAccessModule(module.key)

                return (
                  <RoleCard
                    key={module.key}
                    icon={module.icon}
                    title={module.title}
                    description={module.description}
                    accentColor={module.accentColor}
                    accentGlow={module.accentGlow}
                    onClick={() => handleSelectModule(module.href)}
                    disabled={!hasAccess}
                  />
                )
              })}
            </div>
          </>
        ) : (
          <div style={{
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            justifyContent: 'center',
            width: '100%',
          }}>
            {memberships.map(m => (
              <LocationCard
                key={m.id}
                title={m.organization?.name ?? 'Mi local'}
                role={m.role.toUpperCase()}
                onClick={() => handleSelectMembership(m.id)}
                disabled={isLoading}
              />
            ))}
          </div>
        )}

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
