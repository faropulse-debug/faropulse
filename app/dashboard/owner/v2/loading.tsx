export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-950">
      <div className="max-w-[1280px] mx-auto px-6 py-8">

        {/* Header */}
        <div className="mb-6">
          <div className="h-2.5 w-28 rounded bg-white/[0.07] animate-pulse mb-2" />
          <div className="h-2 w-16 rounded bg-white/[0.04] animate-pulse" />
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-white/[0.07] mb-7">
          {[72, 44, 88, 76].map((w, i) => (
            <div
              key={i}
              className="h-9 rounded-t animate-pulse bg-white/[0.06]"
              style={{ width: w }}
            />
          ))}
        </div>

        {/* Reconcile link */}
        <div className="flex justify-end mb-5">
          <div className="h-7 w-44 rounded-md bg-white/[0.04] animate-pulse" />
        </div>

        {/* Estado Negocio skeleton — 4 KPI cards */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-5 mb-4">
          <div className="h-2.5 w-36 rounded bg-white/[0.08] animate-pulse mb-5" />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="rounded-lg border border-white/[0.06] bg-white/[0.04] p-4 space-y-3 animate-pulse"
              >
                <div className="h-2 w-20 rounded bg-white/[0.08]" />
                <div className="h-6 w-24 rounded bg-white/[0.11]" />
                <div className="h-2 w-16 rounded bg-white/[0.06]" />
              </div>
            ))}
          </div>
          <div className="space-y-2">
            <div className="h-2 w-full rounded bg-white/[0.04] animate-pulse" />
            <div className="h-2 w-4/5 rounded bg-white/[0.04] animate-pulse" />
            <div className="h-2 w-3/5 rounded bg-white/[0.03] animate-pulse" />
          </div>
        </div>

        {/* Alertas skeleton */}
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.025] p-5">
          <div className="h-2.5 w-40 rounded bg-white/[0.08] animate-pulse mb-5" />
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <div
                key={i}
                className="flex items-center gap-3 rounded-lg border border-white/[0.04] bg-white/[0.03] p-3 animate-pulse"
              >
                <div className="h-4 w-4 rounded-full bg-white/[0.09] shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-2 w-3/4 rounded bg-white/[0.07]" />
                  <div className="h-2 w-1/2 rounded bg-white/[0.05]" />
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  )
}
