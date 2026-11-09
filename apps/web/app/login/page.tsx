'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { loginUser, type GymMembershipItem } from '../lib/api';
import { PhoneInput } from '../components/PhoneInput';

export default function LoginPage() {
  const router = useRouter();
  const [loginMethod, setLoginMethod] = useState<'phone' | 'email'>('phone');
  const [countryCode, setCountryCode] = useState<string>('+91');
  const [phoneDigits, setPhoneDigits] = useState<string>('');
  const [emailValue, setEmailValue] = useState<string>('');
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

    let identifier = '';
    if (loginMethod === 'phone') {
      if (!phoneDigits) {
        setError('Phone number is required');
        return;
      }
      if (phoneDigits.length !== 10) {
        setError('Phone number must be exactly 10 digits');
        return;
      }
      identifier = `${countryCode}${phoneDigits}`;
    } else {
      if (!emailValue.trim()) {
        setError('Email address is required');
        return;
      }
      identifier = emailValue.trim();
    }

    if (!password) {
      setError('Password is required');
      return;
    }

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
          localStorage.setItem('user_role', res.memberships[0].role);
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
      localStorage.setItem('user_role', membership.role);
    }
    setShowSelectTenantModal(false);
    router.push('/members');
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex flex-col justify-center items-center p-6">
      <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center space-x-3 mb-6">
          <span className="flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500 font-bold text-black text-base shadow-lg shadow-emerald-500/20">
            GYM
          </span>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-white">GymOS</h1>
            <p className="text-xs text-neutral-400">Staff & Admin Authentication</p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Method Toggle Tabs */}
        <div className="flex rounded-lg bg-neutral-950 border border-neutral-800 p-1 mb-4 text-xs font-medium">
          <button
            type="button"
            onClick={() => { setLoginMethod('phone'); setError(null); }}
            className={`flex-1 py-1.5 rounded-md transition text-center cursor-pointer ${
              loginMethod === 'phone'
                ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            📱 Mobile Phone
          </button>
          <button
            type="button"
            onClick={() => { setLoginMethod('email'); setError(null); }}
            className={`flex-1 py-1.5 rounded-md transition text-center cursor-pointer ${
              loginMethod === 'email'
                ? 'bg-neutral-800 text-emerald-400 font-semibold shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            ✉️ Email Address
          </button>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          {loginMethod === 'phone' ? (
            <div>
              <label htmlFor="login-phone-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                Mobile Phone <span className="text-neutral-500 font-normal">(Exact 10 digits)</span>
              </label>
              <PhoneInput
                id="login-phone-input"
                dataTestId="phone-input"
                countryCode={countryCode}
                value={phoneDigits ? `${countryCode}${phoneDigits}` : ''}
                onChange={(_full, country, digits) => {
                  setCountryCode(country);
                  setPhoneDigits(digits);
                }}
                required
              />
            </div>
          ) : (
            <div>
              <label htmlFor="email-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                Email Address
              </label>
              <input
                id="email-input"
                type="email"
                required
                value={emailValue}
                onChange={(e) => setEmailValue(e.target.value)}
                placeholder="staff@gym.com"
                className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>
          )}

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
            ← Continue as Guest / Preview Mode
          </Link>
        </div>
      </div>

      {/* Post-Login Multi-Tenant Selector Modal */}
      {showSelectTenantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="text-center space-y-1">
              <span className="w-10 h-10 rounded-full bg-emerald-950 border border-emerald-800 flex items-center justify-center mx-auto text-emerald-400 text-lg mb-2">
                🏢
              </span>
              <h3 className="text-lg font-bold text-white">Select Gym Location</h3>
              <p className="text-xs text-neutral-400">
                Your credentials have authorized access to multiple gym locations. Choose which pod to manage:
              </p>
            </div>

            <div className="space-y-2 max-h-64 overflow-y-auto pt-2">
              {pendingMemberships.map((m) => (
                <button
                  key={m.gym_id}
                  onClick={() => handleSelectTenant(m)}
                  className="w-full p-3 rounded-xl bg-neutral-950 border border-neutral-800 hover:border-emerald-500/80 hover:bg-neutral-800/80 text-left transition flex items-center justify-between group cursor-pointer"
                >
                  <div>
                    <h4 className="text-sm font-semibold text-white group-hover:text-emerald-400 transition">
                      {m.gym_name || 'Gym Location'}
                    </h4>
                    <p className="text-xs text-neutral-500 font-mono mt-0.5">
                      {m.gym_slug ? `${m.gym_slug}.gymos.local` : m.gym_id.slice(0, 8)}
                    </p>
                  </div>
                  <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700 group-hover:border-emerald-800 group-hover:text-emerald-300">
                    {m.role}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
