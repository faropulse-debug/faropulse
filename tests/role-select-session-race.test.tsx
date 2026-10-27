import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import React, { act } from 'react'
import { createRoot, Root } from 'react-dom/client'
import { AuthProvider } from '@/providers/AuthProvider'
import RoleSelectPage from '@/app/role-select/page'
import * as supabaseLib from '@/lib/supabase'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}))

// DOM query helpers
function queryByText(container: HTMLElement, text: string | RegExp): HTMLElement | null {
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_ELEMENT)
  let node: Node | null
  while ((node = walker.nextNode())) {
    const el = node as HTMLElement
    const content = el.textContent || ''
    if (typeof text === 'string' ? content.includes(text) : text.test(content)) {
      return el
    }
  }
  return null
}

async function findByText(
  container: HTMLElement,
  text: string | RegExp,
  timeoutMs = 1000,
): Promise<HTMLElement> {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    const el = queryByText(container, text)
    if (el) return el
    await new Promise(r => setTimeout(r, 10))
  }
  throw new Error(`Element with text "${text}" not found within ${timeoutMs}ms`)
}

function createQueryBuilder(resolveData: any, delayMs = 0) {
  const builder: any = {
    select: vi.fn().mockImplementation(() => builder),
    eq: vi.fn().mockImplementation(() => builder),
    single: vi.fn().mockImplementation(async () => {
      if (delayMs > 0) await new Promise(r => setTimeout(r, delayMs))
      return resolveData
    }),
    then: (onfulfilled: any, onrejected: any) => {
      const p = delayMs > 0
        ? new Promise(r => setTimeout(r, delayMs)).then(() => resolveData)
        : Promise.resolve(resolveData)
      return p.then(onfulfilled, onrejected)
    },
  }
  return builder
}

describe('S2-0: race de INITIAL_SESSION en /role-select', () => {
  let container: HTMLDivElement
  let root: Root
  let authCallback: ((event: AuthChangeEvent, session: Session | null) => void) | null = null

  beforeEach(() => {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    authCallback = null
    localStorage.clear()
  })

  afterEach(() => {
    act(() => {
      root.unmount()
    })
    container.remove()
    vi.restoreAllMocks()
  })

  function setupSupabaseMock(options: {
    profile?: any
    memberships?: any[]
    membershipsDelay?: number
  }) {
    const mockClient: any = {
      auth: {
        onAuthStateChange: vi.fn((cb) => {
          authCallback = cb
          return { data: { subscription: { unsubscribe: vi.fn() } } }
        }),
        signOut: vi.fn().mockResolvedValue({}),
      },
      from: vi.fn((table: string) => {
        if (table === 'profiles') {
          return createQueryBuilder({
            data: options.profile ?? { id: 'u1', full_name: 'Owner User' },
            error: null,
          })
        }
        if (table === 'memberships') {
          return createQueryBuilder(
            {
              data: options.memberships ?? [
                {
                  id: 'm1',
                  user_id: 'u1',
                  role: 'owner',
                  is_active: true,
                  location_id: 'loc-1',
                  organization: { id: 'org-1', name: 'Pizzería Demo', slug: 'demo', plan: 'pro' },
                },
              ],
              error: null,
            },
            options.membershipsDelay ?? 0,
          )
        }
        return createQueryBuilder({ data: [], error: null })
      }),
    }

    vi.spyOn(supabaseLib, 'getSupabase').mockReturnValue(mockClient)
  }

  // S2-0: race de INITIAL_SESSION — pasar a it() cuando CC lo arregle
  it.fails(
    'reproduce el falso "sin acceso": si INITIAL_SESSION llega con session=null antes de SIGNED_IN, nunca debe mostrar "No tenés acceso a ningún local" para un usuario legítimo',
    async () => {
      setupSupabaseMock({
        memberships: [
          {
            id: 'm1',
            user_id: 'u1',
            role: 'owner',
            is_active: true,
            location_id: 'loc-1',
            organization: { id: 'org-1', name: 'Pizzería Demo', slug: 'demo', plan: 'pro' },
          },
        ],
        membershipsDelay: 20,
      })

      // 1. Montar componente
      await act(async () => {
        root.render(
          <AuthProvider>
            <RoleSelectPage />
          </AuthProvider>,
        )
      })

      expect(authCallback).not.toBeNull()

      // En el montaje inicial, isLoading=true muestra "Cargando locales..."
      expect(queryByText(container, 'Cargando locales...')).not.toBeNull()
      expect(queryByText(container, 'No tenés acceso a ningún local')).toBeNull()

      // Historial de si en algún momento se vio el mensaje indebido
      let sawFalseNoAccess = false

      // 2. Simular race: Supabase emite INITIAL_SESSION con session: null
      await act(async () => {
        authCallback!('INITIAL_SESSION', null)
      })

      // Verificamos el estado inmediatamente tras INITIAL_SESSION null
      if (queryByText(container, 'No tenés acceso a ningún local')) {
        sawFalseNoAccess = true
      }

      // 3. Unos ms después, el cliente resuelve la sesión y emite SIGNED_IN
      const mockSession: any = {
        user: { id: 'u1', email: 'owner@faropulse.test' },
        access_token: 'valid-jwt',
      }

      await act(async () => {
        authCallback!('SIGNED_IN', mockSession)
      })

      // Durante la resolución de buildUser (microtask + queries), verificamos si sigue en falso "sin acceso"
      if (queryByText(container, 'No tenés acceso a ningún local')) {
        sawFalseNoAccess = true
      }

      // 4. Esperar a que buildUser complete y muestre el local
      const locationCard = await findByText(container, 'Pizzería Demo')
      expect(locationCard).not.toBeNull()

      // ASSERTION CRÍTICA: El texto "No tenés acceso a ningún local" NUNCA debió
      // renderizarse en ningún momento de la secuencia para un usuario que sí tiene 1 membership.
      // (Falla en el código actual porque INITIAL_SESSION null pone isLoading=false prematuramente).
      expect(sawFalseNoAccess).toBe(false)
    },
  )

  it('control positivo: un usuario autenticado con 0 memberships SÍ debe ver "No tenés acceso a ningún local"', async () => {
    setupSupabaseMock({
      memberships: [], // 0 memberships legítimo
      membershipsDelay: 10,
    })

    // Montar componente
    await act(async () => {
      root.render(
        <AuthProvider>
          <RoleSelectPage />
        </AuthProvider>,
      )
    })

    // Usuario inicia sesión con 0 memberships
    const mockSession: any = {
      user: { id: 'u1', email: 'no-membership@faropulse.test' },
      access_token: 'valid-jwt',
    }

    await act(async () => {
      authCallback!('INITIAL_SESSION', null)
      authCallback!('SIGNED_IN', mockSession)
    })

    // Esperar a que resuelva buildUser
    const noAccessEl = await findByText(container, 'No tenés acceso a ningún local. Contactá al administrador.')
    expect(noAccessEl).not.toBeNull()
  })

  it('variante B1: TOKEN_REFRESHED posterior a INITIAL_SESSION null también reproduce el flash indebido si user todavía no está cargado', async () => {
    // Documenta variante de evento: si llega TOKEN_REFRESHED en vez de SIGNED_IN
    setupSupabaseMock({
      memberships: [
        {
          id: 'm1',
          user_id: 'u1',
          role: 'owner',
          is_active: true,
          location_id: 'loc-1',
          organization: { id: 'org-1', name: 'Pizzería Demo', slug: 'demo', plan: 'pro' },
        },
      ],
      membershipsDelay: 10,
    })

    await act(async () => {
      root.render(
        <AuthProvider>
          <RoleSelectPage />
        </AuthProvider>,
      )
    })

    let sawFalseNoAccess = false

    await act(async () => {
      authCallback!('INITIAL_SESSION', null)
    })

    if (queryByText(container, 'No tenés acceso a ningún local')) {
      sawFalseNoAccess = true
    }

    const mockSession: any = {
      user: { id: 'u1', email: 'owner@faropulse.test' },
      access_token: 'refreshed-jwt',
    }

    await act(async () => {
      authCallback!('TOKEN_REFRESHED', mockSession)
    })

    await findByText(container, 'Pizzería Demo')

    // Verificamos que efectivamente se produjo el falso "sin acceso" intermedio
    expect(sawFalseNoAccess).toBe(true)
  })

  it('variante B2: query de memberships lenta incrementa la ventana de exposición del falso "sin acceso"', async () => {
    // Documenta variante de timing: con latencia en la query de memberships
    setupSupabaseMock({
      memberships: [
        {
          id: 'm1',
          user_id: 'u1',
          role: 'owner',
          is_active: true,
          location_id: 'loc-1',
          organization: { id: 'org-1', name: 'Pizzería Demo', slug: 'demo', plan: 'pro' },
        },
      ],
      membershipsDelay: 50,
    })

    await act(async () => {
      root.render(
        <AuthProvider>
          <RoleSelectPage />
        </AuthProvider>,
      )
    })

    await act(async () => {
      authCallback!('INITIAL_SESSION', null)
    })

    const mockSession: any = {
      user: { id: 'u1', email: 'owner@faropulse.test' },
      access_token: 'valid-jwt',
    }

    // Disparamos SIGNED_IN pero no esperamos a que termine buildUser todavía
    act(() => {
      authCallback!('SIGNED_IN', mockSession)
    })

    // Mientras la query de memberships está en vuelo (50ms), el mensaje falso sigue visible
    expect(queryByText(container, 'No tenés acceso a ningún local')).not.toBeNull()

    // Cuando termina de resolver, finalmente aparece la card
    const card = await findByText(container, 'Pizzería Demo')
    expect(card).not.toBeNull()
    expect(queryByText(container, 'No tenés acceso a ningún local')).toBeNull()
  })
})
