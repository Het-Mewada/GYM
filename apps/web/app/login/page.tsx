'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginUser } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      const res = await loginUser(phone, password);
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', res.accessToken);
        localStorage.setItem('user_name', res.user.fullName);
        if (res.user.isPlatformAdmin) {
          localStorage.setItem('is_platform_admin', 'true');
        } else {
          localStorage.removeItem('is_platform_admin');
        }
        if (res.memberships && res.memberships.length > 0) {
          localStorage.setItem('gym_id', res.memberships[0].gym_id);
        }
      }
      if (res.user.isPlatformAdmin) {
        router.push('/platform/tenants');
      } else {
        router.push('/members');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
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
            <label htmlFor="phone" className="block text-xs font-semibold text-neutral-300 mb-1">
              Registered Phone Number
            </label>
            <input
              id="phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91..."
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

        <div className="mt-5 pt-4 border-t border-neutral-800">
          <p className="text-[11px] text-neutral-400 text-center mb-2 font-medium">Quick Credentials for Testing</p>
          <button
            type="button"
            onClick={() => {
              setPhone('+919999900000');
              setPassword('Password123!');
            }}
            className="w-full py-2 px-3 rounded-lg bg-neutral-950 hover:bg-neutral-800 border border-neutral-800 hover:border-neutral-700 text-xs text-neutral-300 flex items-center justify-between transition cursor-pointer"
          >
            <span className="font-semibold text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              Super Admin (Platform)
            </span>
            <span className="font-mono text-[11px] text-neutral-400">+919999900000</span>
          </button>
        </div>

        <div className="mt-5 text-center text-xs text-neutral-500">
          <Link href="/members" className="text-emerald-400 hover:underline">
            ← Back to Members Directory
          </Link>
        </div>
      </div>
    </div>
  );
}
