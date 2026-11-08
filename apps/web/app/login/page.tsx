'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginUser } from '../lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+919999999999');
  const [password, setPassword] = useState('Password123!');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const res = await loginUser(phone, password);
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', res.accessToken);
        localStorage.setItem('user_name', res.user.fullName);
        if (res.memberships && res.memberships.length > 0) {
          localStorage.setItem('gym_id', res.memberships[0].gym_id);
        }
      }
      router.push('/members');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Login failed. Please check your credentials.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDemoSignIn = async () => {
    setPhone('+919999999999');
    setPassword('Password123!');
    setError(null);
    setIsLoading(true);

    try {
      const res = await loginUser('+919999999999', 'Password123!');
      if (typeof window !== 'undefined') {
        localStorage.setItem('access_token', res.accessToken);
        localStorage.setItem('user_name', res.user.fullName);
        if (res.memberships && res.memberships.length > 0) {
          localStorage.setItem('gym_id', res.memberships[0].gym_id);
        }
      }
      router.push('/members');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Demo login failed');
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

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-neutral-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-neutral-900 px-2 text-neutral-500">Quick Testing</span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleDemoSignIn}
          disabled={isLoading}
          className="w-full py-2.5 rounded-lg border border-neutral-700 bg-neutral-800/80 hover:bg-neutral-800 text-neutral-200 font-medium text-xs transition flex items-center justify-center gap-2 cursor-pointer"
        >
          <svg className="w-4 h-4 text-emerald-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
          </svg>
          1-Click Demo Owner Sign-In (+919999999999)
        </button>

        <div className="mt-6 text-center text-xs text-neutral-500">
          <Link href="/members" className="text-emerald-400 hover:underline">
            ← Back to Members Directory Preview
          </Link>
        </div>
      </div>
    </div>
  );
}
