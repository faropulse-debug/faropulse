'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSent(true)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">🔦 FARO</h1>
          <p className="text-gray-400 text-lg">Recuperar contraseña</p>
        </div>

        <div className="bg-gray-900 rounded-2xl p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-amber-500/10 mb-2">
                <span className="text-3xl">📬</span>
              </div>
              <p className="text-white font-medium">Te enviamos un link a tu email</p>
              <p className="text-gray-400 text-sm">
                Revisá tu bandeja de entrada y seguí las instrucciones.
              </p>
              <a
                href="/login"
                className="block mt-4 text-sm text-amber-400 hover:text-amber-300 transition-colors"
              >
                ← Volver al login
              </a>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <p className="text-gray-400 text-sm">
                Ingresá tu email y te enviamos un link para restablecer tu contraseña.
              </p>

              <div>
                <label className="block text-sm text-gray-400 mb-1.5">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  className="w-full bg-gray-800 text-white rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-amber-500 placeholder-gray-600"
                  placeholder="tu@email.com"
                />
              </div>

              {error && <p className="text-red-400 text-sm">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-amber-500 hover:bg-amber-400 disabled:bg-amber-800 disabled:cursor-not-allowed text-gray-950 font-medium rounded-lg py-2.5 transition-colors"
              >
                {loading ? 'Enviando...' : 'Enviar link de recuperación'}
              </button>

              <div className="text-center pt-1">
                <a href="/login" className="text-sm text-gray-500 hover:text-amber-400 transition-colors">
                  ← Volver al login
                </a>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
