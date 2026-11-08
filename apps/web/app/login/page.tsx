'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginUser, type GymMembershipItem } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Multi-Tenant Selection State
  const [pendingMemberships, setPendingMemberships] = useState<GymMembershipItem[]>([]);
  const [showSelectTenantModal, setShowSelectTenantModal] = useState<boolean>(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const isSuper = localStorage.getItem('is_platform_admin') === 'true';
      if (token) {
        if (isSuper) {
          router.replace('/platform/tenants');
        } else {
          router.replace('/members');
        }
      }
    }
  }, [router]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await loginUser(identifier, password);
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', res.accessToken);
        localStorage.setItem('user_name', res.user.fullName);
        if (res.user.phone) localStorage.setItem('user_phone', res.user.phone);
        if (res.user.email) localStorage.setItem('user_email', res.user.email);
        if (res.user.isPlatformAdmin) {
          localStorage.setItem('is_platform_admin', 'true');
        } else {
          localStorage.removeItem('is_platform_admin');
        }
        if (res.memberships && res.memberships.length > 0) {
          localStorage.setItem('user_memberships', JSON.stringify(res.memberships));
        }
        if (res.allMemberships) {
          localStorage.setItem('all_user_memberships', JSON.stringify(res.allMemberships));
        }
      }

      // If credentials unlocked multiple gyms, present "Select Gym Tenant" modal right after login!
      if (res.memberships && res.memberships.length > 1) {
        setPendingMemberships(res.memberships);
        setShowSelectTenantModal(true);
        return;
      }

      // Single gym unlocked
      if (res.memberships && res.memberships.length === 1) {
        if (typeof window !== 'undefined') {
          localStorage.setItem('gym_id', res.memberships[0].gym_id);
          localStorage.setItem('gym_name', res.memberships[0].gym_name || 'Gym');
        }
        router.push('/members');
        return;
      }

      // Platform super admin with no specific gym membership
      if (res.user.isPlatformAdmin) {
        router.push('/platform/tenants');
        return;
      }

      router.push('/members');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectTenant = (membership: GymMembershipItem) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gym_id', membership.gym_id);
      localStorage.setItem('gym_name', membership.gym_name || 'Gym');
    }
    setShowSelectTenantModal(false);
    router.push('/members');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-emerald-500 font-extrabold text-black text-xl mb-3 shadow-lg shadow-emerald-950/60">
            GYM
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sign in to GymOS</h1>
          <p className="text-xs text-neutral-400 mt-1">
            Access your multi-tenant gym management portal
          </p>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label htmlFor="identifier" className="block text-xs font-semibold text-neutral-300 mb-1">
              Phone Number or Email Address
            </label>
            <input
              id="identifier"
              type="text"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="+91... or staff@gym.com"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-xs font-semibold text-neutral-300 mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer mt-2"
          >
            {isLoading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>



        <div className="mt-5 text-center text-xs text-neutral-500">
          <Link href="/members" className="text-emerald-400 hover:underline">
            ← Back to Members Directory
          </Link>
        </div>
      </div>

      {/* SELECT GYM TENANT MODAL (Displayed when res.memberships.length > 1) */}
      {showSelectTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="text-center space-y-1.5 pb-2 border-b border-neutral-800">
              <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 mb-1">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 21h16.5M4.5 3h15M5.25 3v18m13.5-18v18M9 6.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-6H15m-1.5 3H15m-1.5 3H15M9 21v-3.375c0-.621.504-1.125 1.125-1.125h3.75c.621 0 1.125.504 1.125 1.125V21" />
                </svg>
              </div>
              <h2 className="text-xl font-extrabold text-white tracking-tight">Select Gym Tenant</h2>
              <p className="text-xs text-neutral-400 max-w-md mx-auto">
                Your credentials unlocked access to <strong className="text-white">{pendingMemberships.length}</strong> gym locations. Choose a gym to launch:
              </p>
            </div>

            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {pendingMemberships.map((m) => (
                <button
                  key={m.gym_id}
                  type="button"
                  onClick={() => handleSelectTenant(m)}
                  className="w-full p-4 rounded-xl bg-neutral-950/70 hover:bg-neutral-800/80 border border-neutral-800 hover:border-emerald-500/60 text-left transition group cursor-pointer flex items-center justify-between shadow-sm"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white group-hover:text-emerald-400 transition">
                        {m.gym_name || 'Gym Tenant'}
                      </span>
                      <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800">
                        {m.role}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 font-mono">
                      {m.gym_slug ? `${m.gym_slug}.gymos.local` : m.gym_id}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400 group-hover:translate-x-1 transition">
                    <span>Launch</span>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            <div className="pt-2 border-t border-neutral-800 text-center">
              <p className="text-[11px] text-neutral-500">
                You can switch between these gym tenants anytime using the gym selector in the top header.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
