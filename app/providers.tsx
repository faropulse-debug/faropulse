'use client'

import { AuthProvider } from '@/providers/AuthProvider'

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
