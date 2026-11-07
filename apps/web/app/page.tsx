export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8 text-center">
      <div className="max-w-2xl border border-neutral-800 bg-neutral-900/60 p-8 rounded-xl shadow-2xl backdrop-blur-sm">
        <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider uppercase text-emerald-400 bg-emerald-950/80 border border-emerald-800 rounded-full">
          Phase 1 Verified
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
          Gym Management SaaS
        </h1>
        <p className="text-neutral-400 text-sm leading-relaxed mb-6">
          Multi-tenant front-desk operations, automated subscription billing, and real-time attendance engine.
        </p>
        <div className="grid grid-cols-2 gap-4 text-left text-xs text-neutral-300">
          <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950/40">
            <span className="font-semibold text-neutral-200">API Gateway:</span> Fastify v5
          </div>
          <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950/40">
            <span className="font-semibold text-neutral-200">Database:</span> PostgreSQL 16 + RLS
          </div>
          <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950/40">
            <span className="font-semibold text-neutral-200">Isolation:</span> Composite FKs &amp; Tenant Roles
          </div>
          <div className="p-3 rounded-lg border border-neutral-800 bg-neutral-950/40">
            <span className="font-semibold text-neutral-200">Ledger:</span> Append-Only Locking Counter
          </div>
        </div>
      </div>
    </main>
  );
}
