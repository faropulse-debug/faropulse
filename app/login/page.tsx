'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Eye, EyeOff, Bell, BarChart2, Compass, Globe, Linkedin, Instagram, X, ArrowRight } from 'lucide-react'

// ─── BOKEH & PARTICLE DATA ────────────────────────────────────────────────────

const BOKEH = [
  { x: 74, y: 20, s: 200, o: 0.07, b: 55 },
  { x: 82, y: 46, s: 150, o: 0.09, b: 45 },
  { x: 69, y: 66, s: 130, o: 0.06, b: 42 },
  { x: 58, y: 33, s: 180, o: 0.05, b: 65 },
  { x: 90, y: 27, s: 95,  o: 0.10, b: 32 },
  { x: 76, y: 78, s: 160, o: 0.06, b: 52 },
  { x: 44, y: 16, s: 75,  o: 0.07, b: 28 },
  { x: 33, y: 60, s: 240, o: 0.03, b: 90 },
  { x: 88, y: 62, s: 85,  o: 0.08, b: 30 },
  { x: 61, y: 85, s: 110, o: 0.05, b: 40 },
  { x: 50, y: 50, s: 300, o: 0.03, b: 80 },
  { x: 20, y: 38, s: 160, o: 0.04, b: 60 },
]

const PARTICLES = [
  [14,11],[27,7],[41,17],[54,4],[67,13],[75,8],[82,21],[21,31],
  [37,26],[47,37],[61,30],[71,43],[17,47],[31,54],[43,61],[57,57],
  [69,64],[79,71],[11,67],[24,74],[39,77],[51,71],[64,81],[77,84],
  [87,77],[7,37],[5,21],[93,41],[91,17],[84,87],[13,55],[48,88],
]

// ─── SCENE BACKGROUND (8 layers) ─────────────────────────────────────────────

function SceneBackground() {
  return (
    <div className="absolute inset-0 pointer-events-none" aria-hidden>

      {/* L1 — Base tonal: deep black with petrol-blue undertones */}
      <div className="absolute inset-0" style={{
        background: 'linear-gradient(158deg, #03050b 0%, #060916 25%, #050810 55%, #080807 82%, #060508 100%)',
      }}/>

      {/* L2 — Atmosphere: large diffuse nebulae */}
      <div className="absolute inset-0" style={{
        background: `
          radial-gradient(ellipse 65% 55% at 12% 18%, rgba(16,24,48,0.72) 0%, transparent 65%),
          radial-gradient(ellipse 45% 65% at 4%  82%, rgba(9,13,22,0.48)  0%, transparent 58%),
          radial-gradient(ellipse 75% 45% at 65% 8%,  rgba(7,11,21,0.38)  0%, transparent 52%)
        `,
      }}/>
      {/* L2b — Warm amber core atmosphere */}
      <div className="absolute" style={{
        top: '18%', left: '14%', width: '58%', height: '62%',
        background: 'radial-gradient(ellipse, rgba(88,50,7,0.16) 0%, rgba(58,33,4,0.07) 42%, transparent 68%)',
        filter: 'blur(44px)',
      }}/>

      {/* L3 — Bokeh warm lights */}
      {BOKEH.map((b, i) => (
        <div key={i} className="absolute rounded-full" style={{
          left: `${b.x}%`, top: `${b.y}%`,
          width: `${b.s}px`, height: `${b.s}px`,
          background: `radial-gradient(circle, rgba(220,138,28,${b.o}) 0%, rgba(200,115,18,${b.o * 0.35}) 38%, transparent 70%)`,
          filter: `blur(${b.b}px)`,
          transform: 'translate(-50%, -50%)',
        }}/>
      ))}

      {/* L4 — Amber particles / luminous dust */}
      {PARTICLES.map(([px, py], i) => (
        <div key={i} className="absolute rounded-full" style={{
          left: `${px}%`, top: `${py}%`,
          width:  `${1 + (i % 3 === 0 ? 1 : 0)}px`,
          height: `${1 + (i % 3 === 0 ? 1 : 0)}px`,
          background: `rgba(245,${138 + (i % 4) * 6},${14 + (i % 5) * 4},${0.11 + (i % 5) * 0.055})`,
          filter: i % 4 === 0 ? 'blur(0.6px)' : 'none',
        }}/>
      ))}

      {/* L5 — Vignette: strong, elegant */}
      <div className="absolute inset-0" style={{
        background: 'radial-gradient(ellipse 88% 88% at 36% 47%, transparent 18%, rgba(1,2,7,0.52) 52%, rgba(0,1,5,0.88) 100%)',
      }}/>

      {/* L6 — Narrative light: warm bloom near pulse / logo zone */}
      <div className="absolute" style={{
        top: '22%', left: '20%', width: '400px', height: '320px',
        background: 'radial-gradient(ellipse, rgba(245,130,10,0.11) 0%, rgba(245,130,10,0.04) 42%, transparent 68%)',
        filter: 'blur(38px)',
        animation: 'fp-breathe 5s ease-in-out infinite',
      }}/>
      {/* L6b — Secondary glow near card */}
      <div className="absolute" style={{
        top: '28%', right: '4%', width: '380px', height: '380px',
        background: 'radial-gradient(ellipse, rgba(245,130,10,0.055) 0%, transparent 65%)',
        filter: 'blur(55px)',
      }}/>

      {/* L7 — Surface floor: subtle grounding */}
      <div className="absolute bottom-0 left-0 right-0 h-36" style={{
        background: 'linear-gradient(to top, rgba(2,4,9,0.72) 0%, rgba(4,6,12,0.28) 55%, transparent 100%)',
      }}/>
      <div className="absolute bottom-0 left-0 right-0 h-px" style={{
        background: 'linear-gradient(90deg, transparent 4%, rgba(245,130,10,0.04) 22%, rgba(245,130,10,0.09) 44%, rgba(245,130,10,0.04) 68%, transparent 92%)',
      }}/>

      {/* L8 — Lateral depth: data signals right edge */}
      <div className="absolute right-7 top-1/4 bottom-1/4 w-px" style={{
        background: 'linear-gradient(to bottom, transparent, rgba(245,130,10,0.08) 30%, rgba(245,130,10,0.13) 50%, rgba(245,130,10,0.08) 70%, transparent)',
      }}/>
      <div className="absolute right-12 top-1/3 bottom-1/3 w-px" style={{
        background: 'linear-gradient(to bottom, transparent, rgba(245,130,10,0.05) 40%, rgba(245,130,10,0.09) 50%, rgba(245,130,10,0.05) 60%, transparent)',
      }}/>
      {[27,35,43,52,60,68,76,83].map((t, i) => (
        <div key={i} className="absolute rounded-full" style={{
          right: `${3.5 + (i % 3) * 1.4}%`,
          top: `${t}%`,
          width: `${1.5 + (i % 2) * 0.5}px`,
          height: `${1.5 + (i % 2) * 0.5}px`,
          background: `rgba(245,130,10,${0.07 + (i % 4) * 0.03})`,
        }}/>
      ))}
    </div>
  )
}

// ─── LIGHTHOUSE SVG ───────────────────────────────────────────────────────────

function Lighthouse() {
  return (
    <svg width="30" height="62" viewBox="0 0 30 62"
      fill="none" overflow="visible" aria-hidden>
      <defs>
        <linearGradient id="lh-b1" x1="15" y1="14" x2="95" y2="-2" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#f5820a" stopOpacity="0.7"/>
          <stop offset="45%"  stopColor="#f5820a" stopOpacity="0.18"/>
          <stop offset="100%" stopColor="#f5820a" stopOpacity="0"/>
        </linearGradient>
        <linearGradient id="lh-b2" x1="15" y1="14" x2="95" y2="6" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#e8a040" stopOpacity="0.42"/>
          <stop offset="55%"  stopColor="#f5820a" stopOpacity="0.07"/>
          <stop offset="100%" stopColor="#f5820a" stopOpacity="0"/>
        </linearGradient>
        <radialGradient id="lh-halo" cx="50%" cy="50%" r="50%">
          <stop offset="0%"   stopColor="#f5820a" stopOpacity="0.5"/>
          <stop offset="55%"  stopColor="#f5820a" stopOpacity="0.1"/>
          <stop offset="100%" stopColor="#f5820a" stopOpacity="0"/>
        </radialGradient>
      </defs>

      {/* Beam — wide atmospheric fan */}
      <path d="M15 14 L95 -5 L95 24 Z" fill="url(#lh-b1)"/>
      <path d="M15 14 L95 -1 L95 17 Z" fill="url(#lh-b2)"/>

      {/* Halo glow */}
      <ellipse cx="15" cy="14" rx="13" ry="9" fill="url(#lh-halo)"/>

      {/* Tower body — elegantly tapered */}
      <path d="M11 19.5 L19 19.5 L17.5 54 L12.5 54Z"
        fill="#07090f" stroke="rgba(245,130,10,0.28)" strokeWidth="0.5"/>

      {/* Tower accent bands */}
      {[31,42,51].map((y, i) => (
        <line key={i}
          x1={11.5 + i * 0.3} y1={y}
          x2={18.5 - i * 0.3} y2={y}
          stroke={`rgba(245,130,10,${0.18 - i * 0.04})`}
          strokeWidth="0.65"
        />
      ))}

      {/* Gallery / deck ring */}
      <rect x="8.5" y="18.5" width="13" height="1.5" rx="0.5"
        fill="rgba(245,130,10,0.45)"/>

      {/* Lantern room — glass cylinder */}
      <rect x="9.5" y="9" width="11" height="10" rx="1.5"
        fill="rgba(245,130,10,0.07)"
        stroke="rgba(245,130,10,0.55)"
        strokeWidth="0.6"/>

      {/* Cap — elegant dome */}
      <path d="M9 9 L15 2.5 L21 9Z"
        fill="rgba(245,130,10,0.48)"
        stroke="rgba(245,130,10,0.28)"
        strokeWidth="0.4"/>

      {/* Light source — core */}
      <circle cx="15" cy="14" r="2.8" fill="#f5820a" opacity="0.88"/>
      <circle cx="15" cy="14" r="1.6" fill="#fff6dc" opacity="0.95"/>

      {/* Glow rings — animated */}
      <circle cx="15" cy="14" r="5"  fill="#f5820a" opacity="0.2"
        style={{ animation: 'fp-breathe 3.5s ease-in-out infinite' }}/>
      <circle cx="15" cy="14" r="8"  fill="#f5820a" opacity="0.07"/>

      {/* Foundation steps */}
      <rect x="11"   y="54"   width="8"  height="2.5" rx="0.4" fill="rgba(245,130,10,0.38)"/>
      <rect x="9.5"  y="56.5" width="11" height="2"   rx="0.4" fill="rgba(245,130,10,0.27)"/>
      <rect x="8"    y="58.5" width="14" height="2.5" rx="0.4" fill="rgba(245,130,10,0.18)"/>
    </svg>
  )
}

// ─── EKG CONNECTOR (logo trace) ───────────────────────────────────────────────

function LogoEkg() {
  return (
    <svg width="54" height="16" viewBox="0 0 54 16" fill="none" aria-hidden
      style={{ filter: 'drop-shadow(0 0 4px rgba(245,130,10,0.6))' }}>
      <defs>
        <linearGradient id="lekg" x1="0" y1="0" x2="54" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%"   stopColor="#f5820a" stopOpacity="0.1"/>
          <stop offset="30%"  stopColor="#f5820a" stopOpacity="0.75"/>
          <stop offset="58%"  stopColor="#e8a040" stopOpacity="1"/>
          <stop offset="82%"  stopColor="#f5820a" stopOpacity="0.55"/>
          <stop offset="100%" stopColor="#f5820a" stopOpacity="0.08"/>
        </linearGradient>
      </defs>
      {/* Glow layer */}
      <path d="M0,8 L10,8 L12,6 L14,10 L16,1 L18,15 L20,8 L32,8 L54,8"
        stroke="#f5820a" strokeWidth="5" strokeLinecap="round" fill="none" opacity="0.1"/>
      {/* Main trace */}
      <path d="M0,8 L10,8 L12,6 L14,10 L16,1 L18,15 L20,8 L32,8 L54,8"
        stroke="url(#lekg)" strokeWidth="1.35" strokeLinecap="round" fill="none"/>
      {/* Animated peak */}
      <circle cx="17" cy="1.5" r="1.8" fill="#f5820a">
        <animate attributeName="r"       values="1.8;2.9;1.8" dur="2.6s" repeatCount="indefinite"/>
        <animate attributeName="opacity" values="0.9;0.3;0.9"  dur="2.6s" repeatCount="indefinite"/>
      </circle>
    </svg>
  )
}

// ─── LOGO MARK ────────────────────────────────────────────────────────────────

function LogoMark() {
  return (
    <div className="flex items-center gap-2.5">
      <Lighthouse />
      <LogoEkg />
      <div>
        <div style={{
          fontFamily: 'var(--font-display)',
          fontSize: '1.95rem',
          fontWeight: 700,
          letterSpacing: '0.11em',
          lineHeight: 1,
        }}>
          <span style={{ color: '#f5820a', textShadow: '0 0 16px rgba(245,130,10,0.45)' }}>FARO</span>
          <span style={{ color: 'rgba(255,255,255,0.92)' }}>PULSE</span>
        </div>
        <div style={{
          fontFamily: 'var(--font-body)',
          fontSize: '0.6rem',
          letterSpacing: '0.28em',
          color: 'rgba(255,255,255,0.3)',
          marginTop: '6px',
          textTransform: 'uppercase',
        }}>
          Decisiones que guían tu negocio
        </div>
      </div>
    </div>
  )
}

// ─── PULSE VISUALIZATION (center hero) ───────────────────────────────────────

function PulseViz() {
  return (
    <div className="relative w-full" style={{ maxWidth: '540px' }}>
      {/* Bloom behind R-peak */}
      <div className="absolute rounded-full" style={{
        left: '30%', top: '50%', transform: 'translate(-50%,-50%)',
        width: '140px', height: '140px',
        background: 'radial-gradient(circle, rgba(245,130,10,0.22) 0%, rgba(245,130,10,0.07) 40%, transparent 70%)',
        filter: 'blur(22px)',
        animation: 'fp-breathe 3.2s ease-in-out infinite',
      }}/>

      <svg viewBox="0 0 540 82" fill="none" className="w-full" style={{
        filter: 'drop-shadow(0 0 10px rgba(245,130,10,0.38)) drop-shadow(0 0 22px rgba(245,130,10,0.14))',
      }}>
        <defs>
          <linearGradient id="pv-main" x1="0" y1="0" x2="540" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#f5820a" stopOpacity="0"/>
            <stop offset="12%"  stopColor="#f5820a" stopOpacity="0.28"/>
            <stop offset="35%"  stopColor="#f5820a" stopOpacity="0.82"/>
            <stop offset="46%"  stopColor="#e8a040" stopOpacity="1"/>
            <stop offset="57%"  stopColor="#f5820a" stopOpacity="0.72"/>
            <stop offset="78%"  stopColor="#f5820a" stopOpacity="0.28"/>
            <stop offset="100%" stopColor="#f5820a" stopOpacity="0"/>
          </linearGradient>
          <linearGradient id="pv-glow" x1="0" y1="0" x2="540" y2="0" gradientUnits="userSpaceOnUse">
            <stop offset="0%"   stopColor="#f5820a" stopOpacity="0"/>
            <stop offset="44%"  stopColor="#f5820a" stopOpacity="0.38"/>
            <stop offset="50%"  stopColor="#f5820a" stopOpacity="0.45"/>
            <stop offset="56%"  stopColor="#f5820a" stopOpacity="0.38"/>
            <stop offset="100%" stopColor="#f5820a" stopOpacity="0"/>
          </linearGradient>
        </defs>

        {/* Topography suggestion — abstract dark surface below */}
        <path
          d="M0,74 Q90,68 180,71 Q220,72 265,70 Q300,68 340,71 Q390,73 450,70 Q495,68 540,74 L540,82 L0,82Z"
          fill="rgba(6,10,18,0.45)"/>
        <path
          d="M0,76 Q110,71 220,73 Q300,74 380,72 Q460,71 540,76"
          stroke="rgba(245,130,10,0.07)" strokeWidth="0.8" fill="none"/>

        {/* Glow bloom layer (thick, diffuse) */}
        <path
          d="M0,45 L85,45 L112,43 L135,45 L154,47 L167,24 L174,62 L181,45 L218,45 L252,41 L272,45 L310,45 L540,45"
          stroke="url(#pv-glow)" strokeWidth="14" strokeLinecap="round" fill="none" opacity="0.28"/>

        {/* Main ECG trace */}
        <path
          d="M0,45 L85,45 L112,43 L135,45 L154,47 L167,24 L174,62 L181,45 L218,45 L252,41 L272,45 L310,45 L540,45"
          stroke="url(#pv-main)" strokeWidth="1.5" strokeLinecap="round" fill="none"/>

        {/* R-peak animated dot */}
        <circle cx="167" cy="24.5" r="3.5" fill="#f5820a" opacity="0.92">
          <animate attributeName="r"       values="3.5;5.8;3.5"     dur="2.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.92;0.38;0.92"   dur="2.8s" repeatCount="indefinite"/>
        </circle>
        <circle cx="167" cy="24.5" r="9" fill="#f5820a" opacity="0.16">
          <animate attributeName="r"       values="9;16;9"           dur="2.8s" repeatCount="indefinite"/>
          <animate attributeName="opacity" values="0.16;0.04;0.16"   dur="2.8s" repeatCount="indefinite"/>
        </circle>
      </svg>
    </div>
  )
}

// ─── LOGIN FORM (needs Suspense for useSearchParams) ─────────────────────────

function LoginFormInner() {
  const router       = useRouter()
  const searchParams = useSearchParams()
  const resetSuccess = searchParams.get('reset') === 'success'

  const [email,        setEmail]        = useState('')
  const [password,     setPassword]     = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [remember,     setRemember]     = useState(false)
  const [loading,      setLoading]      = useState(false)
  const [error,        setError]        = useState('')

  async function handleLogin() {
    setLoading(true)
    setError('')
    try {
      console.log('[ENV]', { url: process.env.NEXT_PUBLIC_SUPABASE_URL, key: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 20) })
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(`[${error.status}] ${error.message}`)
        setLoading(false)
        return
      }
      const { data: memberships, error: membError } = await supabase
        .from('memberships')
        .select('*, organization:organizations(id, name, slug, plan)')
        .eq('user_id', data.user.id)
        .eq('is_active', true)
      if (membError) {
        setError('Error al cargar membresías: ' + membError.message)
        setLoading(false)
        return
      }
      const list = memberships ?? []
      // Set role cookie for solo-manager fast path (middleware reads this)
      if (list.length === 1 && list[0].role === 'manager') {
        const maxAge = remember ? 60 * 60 * 24 * 30 : 86400
        document.cookie = `faro_role=manager; path=/; max-age=${maxAge}; SameSite=Lax`
      }
      const { getRedirectPath } = await import('@/lib/redirectAfterLogin')
      router.push(getRedirectPath(list))
    } catch (err) {
      setError('Error inesperado: ' + String(err))
      setLoading(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '13.5px 16px 13.5px 42px',
    background: 'rgba(255,255,255,0.04)',
    border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '11px',
    color: 'rgba(255,255,255,0.88)',
    fontFamily: 'var(--font-body)',
    fontSize: '13.5px',
    outline: 'none',
    transition: 'border-color 0.2s, box-shadow 0.2s, background 0.2s',
  }

  const labelStyle: React.CSSProperties = {
    display: 'block',
    fontFamily: 'var(--font-display)',
    fontWeight: 500,
    fontSize: '0.67rem',
    letterSpacing: '0.18em',
    color: 'rgba(255,255,255,0.42)',
    textTransform: 'uppercase',
    marginBottom: '10px',
  }

  return (
    <div className="relative w-full" style={{ maxWidth: '415px' }}>
      {/* Card */}
      <div className="relative" style={{
        background: 'rgba(6,8,15,0.82)',
        border: '1px solid rgba(255,255,255,0.07)',
        borderTop: '1px solid rgba(255,255,255,0.11)',
        borderRadius: '20px',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
        boxShadow: [
          'inset 0 0 0 1px rgba(245,130,10,0.035)',
          'inset 0 1px 0 rgba(255,255,255,0.065)',
          '0 40px 80px rgba(0,0,0,0.68)',
          '0 10px 32px rgba(0,0,0,0.42)',
          '0 0 90px rgba(245,130,10,0.038)',
        ].join(', '),
        padding: '44px 40px 40px',
      }}>
        {/* Top amber shimmer */}
        <div className="absolute top-0 left-[22%] right-[22%] h-px" style={{
          background: 'linear-gradient(90deg, transparent, rgba(245,130,10,0.32), transparent)',
        }}/>

        {/* Title */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 600,
            fontSize: '1.35rem',
            letterSpacing: '0.18em',
            color: 'rgba(255,255,255,0.92)',
            margin: '0 0 12px 0',
            textTransform: 'uppercase',
          }}>
            Iniciar sesión
          </h2>
          <div style={{ width: '32px', height: '2px', background: '#f5820a' }}/>
        </div>

        {/* Messages */}
        {resetSuccess && (
          <div style={{ background: 'rgba(245,130,10,0.08)', border: '1px solid rgba(245,130,10,0.24)', borderRadius: '10px', padding: '10px 15px', marginBottom: '20px', fontFamily: 'var(--font-body)', fontSize: '13px', color: 'rgba(245,158,11,0.9)' }}>
            Contraseña actualizada. Iniciá sesión.
          </div>
        )}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '10px', padding: '10px 15px', marginBottom: '20px', fontFamily: 'monospace', fontSize: '11.5px', lineHeight: 1.5, color: 'rgba(255,100,100,0.88)', wordBreak: 'break-word' }}>
            {error}
          </div>
        )}

        <form onSubmit={e => { e.preventDefault(); handleLogin() }}>

          {/* Email */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Usuario</label>
            <div className="relative">
              <span className="absolute left-[15px] top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(245,130,10,0.52)', display: 'flex' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
                </svg>
              </span>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Ingresé su usuario" required style={inputStyle}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(245,130,10,0.52)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,130,10,0.09)'; e.currentTarget.style.background = 'rgba(245,130,10,0.04)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';  e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              />
            </div>
          </div>

          {/* Password */}
          <div style={{ marginBottom: '20px' }}>
            <label style={labelStyle}>Contraseña</label>
            <div className="relative">
              <span className="absolute left-[15px] top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'rgba(245,130,10,0.52)', display: 'flex' }}>
                <svg width="13" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </span>
              <input
                type={showPassword ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Ingresé su contraseña" required style={{ ...inputStyle, paddingRight: '44px' }}
                onFocus={e => { e.currentTarget.style.borderColor = 'rgba(245,130,10,0.52)'; e.currentTarget.style.boxShadow = '0 0 0 3px rgba(245,130,10,0.09)'; e.currentTarget.style.background = 'rgba(245,130,10,0.04)' }}
                onBlur={e  => { e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)';  e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
              />
              <button type="button" onClick={() => setShowPassword(v => !v)}
                className="absolute right-[14px] top-1/2 -translate-y-1/2 flex"
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.32)', padding: 0, lineHeight: 1 }}>
                {showPassword ? <EyeOff size={14}/> : <Eye size={14}/>}
              </button>
            </div>
          </div>

          {/* Remember + forgot */}
          <div className="flex items-center justify-between" style={{ marginBottom: '28px' }}>
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)}
                style={{ accentColor: '#f5820a', width: '13px', height: '13px' } as React.CSSProperties}/>
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'rgba(255,255,255,0.36)' }}>
                Recordar sesión
              </span>
            </label>
            <a href="/forgot-password"
              style={{ fontFamily: 'var(--font-body)', fontSize: '12px', color: 'rgba(245,130,10,0.62)', textDecoration: 'none', transition: 'color 0.2s' }}
              onMouseEnter={e => e.currentTarget.style.color = 'rgba(245,130,10,0.95)'}
              onMouseLeave={e => e.currentTarget.style.color = 'rgba(245,130,10,0.62)'}>
              ¿Olvidaste tu contraseña?
            </a>
          </div>

          {/* Submit */}
          <button
            type="submit" disabled={loading}
            className="w-full flex items-center justify-center gap-2.5"
            style={{
              height: '52px',
              background: 'linear-gradient(135deg, #c46305 0%, #e57e09 32%, #f5900b 58%, #df720a 82%, #c86206 100%)',
              border: '1px solid rgba(245,130,10,0.18)',
              borderRadius: '12px',
              color: '#08070a',
              fontFamily: 'var(--font-display)',
              fontWeight: 600,
              fontSize: '0.9rem',
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              cursor: loading ? 'not-allowed' : 'pointer',
              boxShadow: '0 4px 22px rgba(245,130,10,0.28), inset 0 1px 0 rgba(255,255,255,0.1)',
              opacity: loading ? 0.72 : 1,
              marginBottom: '26px',
              transition: 'box-shadow 0.2s, transform 0.18s',
            }}
            onMouseEnter={e => { if (!loading) { e.currentTarget.style.boxShadow = '0 4px 32px rgba(245,130,10,0.52), inset 0 1px 0 rgba(255,255,255,0.14)'; e.currentTarget.style.transform = 'scale(1.012)' }}}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = '0 4px 22px rgba(245,130,10,0.28), inset 0 1px 0 rgba(255,255,255,0.1)'; e.currentTarget.style.transform = 'scale(1)' }}
          >
            {loading ? (
              <>
                <span className="inline-block w-4 h-4 rounded-full border-2 border-black/20 border-t-black/80"
                  style={{ animation: 'spin 0.7s linear infinite' }}/>
                Entrando...
              </>
            ) : (
              <><span>Acceder</span><ArrowRight size={16}/></>
            )}
          </button>
        </form>

        {/* Divider */}
        <div className="flex items-center gap-3" style={{ marginBottom: '18px' }}>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }}/>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.68rem', color: 'rgba(255,255,255,0.27)', letterSpacing: '0.14em', whiteSpace: 'nowrap' }}>
            O CONTINUÁ CON
          </span>
          <div className="flex-1 h-px" style={{ background: 'rgba(255,255,255,0.07)' }}/>
        </div>

        {/* Social */}
        <div className="grid grid-cols-3 gap-2.5" style={{ marginBottom: '28px' }}>
          {[
            { name: 'Google', icon: <span style={{ fontWeight: 800, fontSize: '14px', color: '#EA4335', lineHeight: 1 }}>G</span> },
            { name: 'Apple',  icon: <span style={{ fontSize: '13px', lineHeight: 1 }}>🍎</span> },
            { name: 'SSO',    icon: <span style={{ fontFamily: 'var(--font-display)', fontWeight: 600, fontSize: '10px', letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)' }}>SSO</span> },
          ].map((s, i) => (
            <button key={i} disabled title="Próximamente"
              className="flex items-center justify-center gap-1.5 transition-all duration-200"
              style={{
                height: '46px',
                background: 'rgba(255,255,255,0.03)',
                border: '1px solid rgba(255,255,255,0.07)',
                borderRadius: '10px',
                cursor: 'not-allowed',
                opacity: 0.45,
              }}>
              {s.icon}
              <span style={{ fontFamily: 'var(--font-body)', fontSize: '11px', color: 'rgba(255,255,255,0.5)', letterSpacing: '0.06em' }}>
                {s.name}
              </span>
            </button>
          ))}
        </div>

        {/* Security badge */}
        <div className="flex items-center justify-center gap-2">
          <div className="rounded-full" style={{ width: '7px', height: '7px', background: '#22c55e', boxShadow: '0 0 7px rgba(34,197,94,0.55)', animation: 'fp-pulse-dot 2.8s ease-in-out infinite' }}/>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: '0.67rem', color: 'rgba(255,255,255,0.27)', letterSpacing: '0.07em' }}>
            Acceso seguro · Encriptación AES-256
          </span>
        </div>
      </div>
    </div>
  )
}

// ─── DEFAULT EXPORT ───────────────────────────────────────────────────────────

export default function FaropulseLogin() {
  return (
    <div className="relative min-h-screen flex overflow-hidden" style={{ background: '#03050a' }}>
      <SceneBackground />

      {/* ── Left panel: 58% ─────────────────────────────────────────────── */}
      <div
        className="relative z-10 flex flex-col justify-between"
        style={{
          flex: '0 0 58%',
          padding: '52px 58px 46px 62px',
          animation: 'fp-slide-left 0.9s ease-out both',
        }}
      >
        {/* Logo */}
        <LogoMark />

        {/* Center: pulse + headline + subhead + benefits */}
        <div className="flex flex-col" style={{ flex: 1, justifyContent: 'center', paddingTop: '28px', paddingBottom: '28px' }}>
          <PulseViz />

          <h1 style={{
            fontFamily: 'var(--font-body)',
            fontSize: 'clamp(2rem, 3.2vw, 2.72rem)',
            fontWeight: 300,
            lineHeight: 1.18,
            color: 'rgba(255,255,255,0.93)',
            margin: '28px 0 14px',
            letterSpacing: '-0.015em',
          }}>
            Sentí el{' '}
            <span style={{
              fontWeight: 700,
              color: '#f5820a',
              textShadow: '0 0 22px rgba(245,130,10,0.58), 0 0 55px rgba(245,130,10,0.2)',
            }}>
              pulso
            </span>
            <br />de tu negocio.
          </h1>

          <p style={{
            fontFamily: 'var(--font-body)',
            fontSize: '1rem',
            fontWeight: 400,
            color: 'rgba(255,255,255,0.56)',
            letterSpacing: '0.04em',
            margin: '0 0 52px',
          }}>
            Anticipate. Decidí. Avanzá.
          </p>

          {/* Benefits */}
          <div className="flex" style={{ gap: '44px' }}>
            {[
              { icon: <Bell size={17}/>,     label: 'Alertas\nInteligentes'    },
              { icon: <BarChart2 size={17}/>, label: 'Insights\nEn tiempo real' },
              { icon: <Compass size={17}/>,   label: 'Decisiones\nClaras'       },
            ].map(({ icon, label }, i) => (
              <div key={i}
                className="flex flex-col items-center"
                style={{ gap: '10px', animation: `fp-slide-up 0.65s ease-out ${0.7 + i * 0.12}s both` }}
              >
                <div style={{
                  width: '42px', height: '42px',
                  border: '1px solid rgba(245,130,10,0.27)',
                  borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#f5820a',
                  background: 'rgba(245,130,10,0.06)',
                }}>
                  {icon}
                </div>
                <span style={{
                  fontFamily: 'var(--font-display)',
                  fontWeight: 600,
                  fontSize: '0.6rem',
                  letterSpacing: '0.18em',
                  color: 'rgba(255,255,255,0.58)',
                  textTransform: 'uppercase',
                  textAlign: 'center',
                  lineHeight: 1.45,
                  whiteSpace: 'pre-line',
                }}>
                  {label}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center" style={{
          gap: '14px',
          fontFamily: 'var(--font-body)',
          fontSize: '0.72rem',
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.07em',
        }}>
          <Globe size={12} style={{ color: 'rgba(245,130,10,0.48)', flexShrink: 0 }}/>
          <span>www.faropulse.io</span>
          <span style={{ color: 'rgba(255,255,255,0.12)' }}>·</span>
          <Linkedin  size={12} style={{ color: 'rgba(245,130,10,0.4)', cursor: 'pointer' }}/>
          <Instagram size={12} style={{ color: 'rgba(245,130,10,0.4)', cursor: 'pointer' }}/>
          <X         size={12} style={{ color: 'rgba(245,130,10,0.4)', cursor: 'pointer' }}/>
          <span>@faropulse</span>
        </div>
      </div>

      {/* ── Right panel: 42% ────────────────────────────────────────────── */}
      <div
        className="relative z-10 flex items-center justify-center"
        style={{
          flex: '0 0 42%',
          padding: '48px 54px',
          borderLeft: '1px solid rgba(255,255,255,0.048)',
          animation: 'fp-slide-right 0.9s ease-out 0.15s both',
        }}
      >
        <Suspense>
          <LoginFormInner />
        </Suspense>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
