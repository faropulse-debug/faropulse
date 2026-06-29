import Link from "next/link";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-950">
      <div className="text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 mb-6">
          <span className="text-3xl">🔍</span>
        </div>
        <h1 className="text-3xl font-bold text-white mb-2">Página no encontrada</h1>
        <p className="text-gray-400 text-sm mb-6">
          La página que buscás no existe o fue movida.
        </p>
        <Link
          href="/dashboard"
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium transition-colors"
        >
          Ir al Dashboard
        </Link>
      </div>
    </main>
  );
}
