"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-red-500/10 mb-6">
          <span className="text-3xl">⚠️</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Algo salió mal</h1>
        <p className="text-gray-400 text-sm mb-6">
          Ocurrió un error inesperado. Podés intentar de nuevo.
        </p>
        <button
          onClick={reset}
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          Reintentar
        </button>
      </div>
    </main>
  );
}
