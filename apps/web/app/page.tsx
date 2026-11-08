'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';

export default function HomePage() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [gymName, setGymName] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const isSuper = localStorage.getItem('is_platform_admin') === 'true';
      const storedName = localStorage.getItem('user_name');
      const storedGymName = localStorage.getItem('gym_name');
      if (token) {
        setIsAuthenticated(true);
        setIsSuperAdmin(isSuper);
        if (storedName) setUserName(storedName);
        if (storedGymName) setGymName(storedGymName);
      } else {
        setIsAuthenticated(false);
        setIsSuperAdmin(false);
      }
    }
  }, []);

  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_name');
      localStorage.removeItem('is_platform_admin');
      localStorage.removeItem('gym_id');
      localStorage.removeItem('gym_name');
    }
    setIsAuthenticated(false);
    setIsSuperAdmin(false);
    setUserName(null);
    setGymName(null);
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6 md:p-12 text-center bg-neutral-950 text-neutral-100">
      <div className="w-full max-w-4xl border border-neutral-800 bg-neutral-900/60 p-8 md:p-12 rounded-2xl shadow-2xl backdrop-blur-sm">
        <div className="inline-block px-3 py-1 mb-4 text-xs font-semibold tracking-wider uppercase text-emerald-400 bg-emerald-950/80 border border-emerald-800 rounded-full">
          {isAuthenticated ? (
            gymName ? `Authenticated • ${gymName}` : `Signed in as ${userName || 'User'}`
          ) : (
            'Phase 3 — Slice 1 Ready'
          )}
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-white mb-3">
          Gym Management SaaS
        </h1>
        <p className="text-neutral-400 text-sm leading-relaxed mb-6">
          Multi-tenant front-desk operations, automated subscription billing, and real-time attendance engine.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-6">
          <Link
            href="/members"
            data-testid="members-directory-link"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-950/50 cursor-pointer"
          >
            Open Members Directory
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </Link>
          {isAuthenticated ? (
            <>
              <Link
                href="/plans"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm transition border border-neutral-800"
              >
                Membership Plans
              </Link>
              <Link
                href="/payments"
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-white font-medium text-sm transition border border-neutral-800"
              >
                Payments Ledger
              </Link>
              {isSuperAdmin && (
                <Link
                  href="/platform/tenants"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-neutral-900 hover:bg-neutral-800 text-emerald-400 font-medium text-sm transition border border-emerald-900"
                >
                  Super Admin
                </Link>
              )}
              <button
                type="button"
                onClick={handleSignOut}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-sm transition border border-neutral-700 cursor-pointer"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-sm transition border border-neutral-700"
            >
              Sign In to GymOS
            </Link>
          )}
        </div>

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
