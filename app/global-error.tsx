"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
  error,
}: {
  error: Error & { digest?: string };
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="es">
      <body style={{ margin: 0, background: '#030712', fontFamily: 'system-ui, sans-serif' }}>
        <main style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 64,
              height: 64,
              borderRadius: 16,
              background: 'rgba(239,68,68,0.1)',
              marginBottom: 24,
            }}>
              <span style={{ fontSize: 28 }}>⚠</span>
            </div>
            <h1 style={{ color: '#fff', fontSize: 24, fontWeight: 700, margin: '0 0 8px' }}>
              Algo salió mal
            </h1>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: '0 0 24px' }}>
              Ocurrió un error inesperado. Intentá recargar la página.
            </p>
            <a
              href="/dashboard/owner/v2"
              style={{
                display: 'inline-block',
                padding: '10px 20px',
                borderRadius: 8,
                background: '#2563eb',
                color: '#fff',
                fontSize: 14,
                fontWeight: 500,
                textDecoration: 'none',
              }}
            >
              Volver al Dashboard
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
