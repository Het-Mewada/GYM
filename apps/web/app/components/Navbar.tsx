'use client';

import React, { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { fetchPlatformTenants, switchGymTenant } from '../lib/api';

export interface AccessibleGym {
  id: string;
  name: string;
  slug?: string;
  role?: string;
  requiresPassword?: boolean;
}

export interface NavbarProps {
  activePage?: 'overview' | 'members' | 'plans' | 'payments' | 'attendance' | 'superadmin';
  currentGymId?: string;
  currentGymName?: string;
  onGymChange?: (gymId: string, gymName: string) => void;
}

export function Navbar({
  activePage,
  currentGymId: propGymId,
  currentGymName: propGymName,
  onGymChange
}: NavbarProps) {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [gymId, setGymId] = useState<string | null>(propGymId || null);
  const [gymName, setGymName] = useState<string | null>(propGymName || null);
  const [accessibleGyms, setAccessibleGyms] = useState<AccessibleGym[]>([]);

  const [isGymDropdownOpen, setIsGymDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Switch password modal state
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [targetSwitchGym, setTargetSwitchGym] = useState<AccessibleGym | null>(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [isSwitching, setIsSwitching] = useState(false);

  // Sync prop changes
  useEffect(() => {
    if (propGymId) setGymId(propGymId);
    if (propGymName) setGymName(propGymName);
  }, [propGymId, propGymName]);

  // Load auth & gym state from localStorage and platform
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('access_token');
    const isSuper = localStorage.getItem('is_platform_admin') === 'true';
    const storedName = localStorage.getItem('user_name');
    const storedGymId = propGymId || localStorage.getItem('gym_id');
    const storedGymName = propGymName || localStorage.getItem('gym_name');
    const storedMemberships = localStorage.getItem('gym_memberships');

    if (token) {
      setIsAuthenticated(true);
      setIsSuperAdmin(isSuper);
      if (storedName) setUserName(storedName);
      if (storedGymId) setGymId(storedGymId);
      if (storedGymName) setGymName(storedGymName);

      let initialGyms: AccessibleGym[] = [];
      if (storedMemberships) {
        try {
          const parsed = JSON.parse(storedMemberships);
          if (Array.isArray(parsed)) {
            initialGyms = parsed.map((m: { gym_id?: string; id?: string; gym_name?: string; name?: string; gym_slug?: string; slug?: string; role?: string; isUnlocked?: boolean }) => ({
              id: m.gym_id || m.id || '',
              name: m.gym_name || m.name || 'Gym Tenant',
              slug: m.gym_slug || m.slug,
              role: m.role,
              requiresPassword: m.isUnlocked !== undefined ? !m.isUnlocked : false
            }));
          }
        } catch {
          // ignore
        }
      }

      if (initialGyms.length > 0) {
        setAccessibleGyms(initialGyms);
      }

      // Fetch fresh list of gyms from platform
      fetchPlatformTenants(token)
        .then((res) => {
          if (res && Array.isArray(res.tenants)) {
            setAccessibleGyms((prev) => {
              const map = new Map<string, AccessibleGym>();
              prev.forEach((g) => map.set(g.id, g));
              res.tenants.forEach((t) => {
                if (!map.has(t.id)) {
                  map.set(t.id, {
                    id: t.id,
                    name: t.name,
                    slug: t.slug,
                    role: (t as unknown as { role?: string }).role,
                    requiresPassword: false
                  });
                } else {
                  const existing = map.get(t.id)!;
                  map.set(t.id, { ...existing, name: t.name, slug: t.slug });
                }
              });
              return Array.from(map.values());
            });
          }
        })
        .catch(() => {
          // fallback to local list
        });
    } else {
      setIsAuthenticated(false);
      setIsSuperAdmin(false);
    }
  }, [propGymId, propGymName]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsGymDropdownOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsGymDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user_name');
      localStorage.removeItem('user_email');
      localStorage.removeItem('user_role');
      localStorage.removeItem('is_platform_admin');
      localStorage.removeItem('gym_id');
      localStorage.removeItem('gym_name');
      localStorage.removeItem('gym_memberships');
      window.location.href = '/login';
    }
  };

  const performSwitchGym = (newGymId: string, newGymName: string) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('gym_id', newGymId);
      localStorage.setItem('gym_name', newGymName);
      // Dispatch custom event for any listeners
      window.dispatchEvent(new CustomEvent('gym-changed', { detail: { gymId: newGymId, gymName: newGymName } }));
    }
    setGymId(newGymId);
    setGymName(newGymName);
    setIsGymDropdownOpen(false);

    if (onGymChange) {
      onGymChange(newGymId, newGymName);
    } else {
      // Reload current route so components refresh for new tenant
      window.location.reload();
    }
  };

  const handleGymSelect = (gym: AccessibleGym) => {
    if (gym.id === gymId) {
      setIsGymDropdownOpen(false);
      return;
    }

    if (gym.requiresPassword) {
      setTargetSwitchGym(gym);
      setSwitchPassword('');
      setSwitchError(null);
      setIsPasswordModalOpen(true);
      setIsGymDropdownOpen(false);
      return;
    }

    performSwitchGym(gym.id, gym.name);
  };

  const handleConfirmSwitchPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetSwitchGym) return;
    setIsSwitching(true);
    setSwitchError(null);
    try {
      await switchGymTenant(targetSwitchGym.id, switchPassword);
      setAccessibleGyms((prev) =>
        prev.map((g) => (g.id === targetSwitchGym.id ? { ...g, requiresPassword: false } : g))
      );
      performSwitchGym(targetSwitchGym.id, targetSwitchGym.name);
      setIsPasswordModalOpen(false);
      setTargetSwitchGym(null);
      setSwitchPassword('');
    } catch (err: unknown) {
      setSwitchError(err instanceof Error ? err.message : 'Incorrect password for this gym');
    } finally {
      setIsSwitching(false);
    }
  };

  const displayGymName = gymName || (accessibleGyms.length > 0 ? accessibleGyms[0].name : (isAuthenticated ? 'Active Gym Pod' : 'Preview Mode'));

  return (
    <>
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-40 px-6 py-4 w-full">
        <div className="w-full flex items-center justify-between">
          {/* Left: Brand & Gym Switcher */}
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2 group">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500 font-bold text-black text-sm group-hover:bg-emerald-400 transition">
                GYM
              </span>
              <span className="font-extrabold text-lg tracking-tight text-white group-hover:text-neutral-100 transition">
                GymOS
              </span>
            </Link>

            <span className="text-neutral-600">/</span>

            {/* Gym Selector Dropdown */}
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                data-testid="navbar-gym-selector-button"
                onClick={() => setIsGymDropdownOpen((prev) => !prev)}
                className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium bg-neutral-900 hover:bg-neutral-800/90 text-neutral-200 border border-neutral-700/80 hover:border-emerald-500/50 transition cursor-pointer shadow-sm group"
                title="Switch active gym tenant"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
                <span className="font-semibold text-emerald-400 group-hover:text-emerald-300 transition">
                  {displayGymName}
                </span>
                {isSuperAdmin && (
                  <span className="text-[10px] text-neutral-400 font-normal border-l border-neutral-700 pl-1.5">
                    Super Admin
                  </span>
                )}
                <svg
                  className={`w-3.5 h-3.5 text-neutral-400 transition-transform duration-150 ${isGymDropdownOpen ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                </svg>
              </button>

              {/* Dropdown Menu */}
              {isGymDropdownOpen && (
                <div
                  data-testid="navbar-gym-dropdown"
                  className="absolute left-0 mt-2 w-72 rounded-xl bg-neutral-900 border border-neutral-800 shadow-2xl p-2 z-50 animate-in fade-in zoom-in-95 duration-100"
                >
                  <div className="px-3 py-2 border-b border-neutral-800 flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                      Switch Gym Tenant
                    </span>
                    <span className="text-[10px] text-emerald-400 font-semibold font-mono">
                      {accessibleGyms.length} Location{accessibleGyms.length === 1 ? '' : 's'}
                    </span>
                  </div>

                  <div className="py-1 max-h-60 overflow-y-auto space-y-1">
                    {accessibleGyms.length === 0 ? (
                      <div className="px-3 py-3 text-center text-xs text-neutral-500">
                        {isAuthenticated ? 'No additional gyms found.' : 'Sign in to access gym tenants.'}
                      </div>
                    ) : (
                      accessibleGyms.map((gym) => {
                        const isActive = gym.id === gymId;
                        return (
                          <button
                            key={gym.id}
                            type="button"
                            onClick={() => handleGymSelect(gym)}
                            className={`w-full px-3 py-2 rounded-lg text-left text-xs flex items-center justify-between transition cursor-pointer ${
                              isActive
                                ? 'bg-emerald-950/70 text-emerald-300 font-semibold border border-emerald-800/80 shadow-sm'
                                : 'text-neutral-300 hover:bg-neutral-800/90 hover:text-white'
                            }`}
                          >
                            <div className="truncate pr-2">
                              <div className="font-medium text-white truncate flex items-center gap-1.5">
                                {gym.name}
                                {isActive && (
                                  <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-900/80 text-emerald-300 border border-emerald-700">
                                    Active
                                  </span>
                                )}
                              </div>
                              <div className="text-[10px] text-neutral-500 font-mono truncate">
                                {gym.slug ? `${gym.slug}.gymos.local` : gym.id.slice(0, 8)}
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {gym.role && (
                                <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-neutral-800 text-neutral-400 border border-neutral-700">
                                  {gym.role}
                                </span>
                              )}
                              {gym.requiresPassword && !isActive && (
                                <span title="Distinct password required for this gym" className="text-amber-400 text-xs">
                                  🔒
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>

                  {isSuperAdmin && (
                    <div className="pt-2 mt-1 border-t border-neutral-800">
                      <Link
                        href="/platform/tenants"
                        onClick={() => setIsGymDropdownOpen(false)}
                        className="flex items-center justify-between px-3 py-2 rounded-lg text-xs text-neutral-300 hover:text-emerald-400 hover:bg-neutral-800/80 transition"
                      >
                        <span className="font-medium">Platform Super Admin</span>
                        <span className="text-emerald-400 font-semibold">Manage →</span>
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Nav Links + User Auth Status */}
          <div className="flex items-center space-x-6">
            <nav className="flex items-center space-x-4 text-sm font-medium">
              <Link
                href="/"
                className={
                  activePage === 'overview'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1'
                    : 'text-neutral-400 hover:text-white transition'
                }
              >
                Overview
              </Link>
              <Link
                href="/members"
                className={
                  activePage === 'members'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1'
                    : 'text-neutral-400 hover:text-white transition'
                }
              >
                Members
              </Link>
              <Link
                href="/plans"
                className={
                  activePage === 'plans'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1'
                    : 'text-neutral-400 hover:text-white transition'
                }
              >
                Plans
              </Link>
              <Link
                href="/payments"
                className={
                  activePage === 'payments'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1'
                    : 'text-neutral-400 hover:text-white transition'
                }
              >
                Payments
              </Link>
              <Link
                href="/attendance"
                className={
                  activePage === 'attendance'
                    ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1'
                    : 'text-neutral-400 hover:text-white transition'
                }
              >
                Attendance
              </Link>
              {isSuperAdmin && (
                <Link
                  href="/platform/tenants"
                  className={
                    activePage === 'superadmin'
                      ? 'text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1'
                      : 'text-neutral-400 hover:text-neutral-100 transition'
                  }
                >
                  Super Admin
                </Link>
              )}
            </nav>

            <div className="flex items-center pl-4 border-l border-neutral-800">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {userName || (isSuperAdmin ? 'Super Admin' : 'Staff')}
                  </span>
                  <button
                    type="button"
                    onClick={handleLogout}
                    className="text-xs text-neutral-400 hover:text-white transition px-2.5 py-1 rounded-lg border border-neutral-800 hover:bg-neutral-800 cursor-pointer"
                  >
                    Sign Out
                  </button>
                </div>
              ) : (
                <Link
                  href="/login"
                  className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition shadow-md shadow-emerald-950/40"
                >
                  Sign In
                </Link>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Switch Gym Password Modal */}
      {isPasswordModalOpen && targetSwitchGym && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>🔒</span> Enter Gym Password
              </h3>
              <p className="text-xs text-neutral-400 mt-1">
                You have an account in <strong className="text-white">{targetSwitchGym.name}</strong>, but a distinct staff password is required to switch.
              </p>
            </div>

            {switchError && (
              <div className="p-2.5 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs">
                {switchError}
              </div>
            )}

            <form onSubmit={handleConfirmSwitchPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Password for {targetSwitchGym.name}
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={switchPassword}
                  onChange={(e) => setSwitchPassword(e.target.value)}
                  placeholder="Enter gym-specific password"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsPasswordModalOpen(false);
                    setTargetSwitchGym(null);
                    setSwitchPassword('');
                  }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-white transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSwitching}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition disabled:opacity-50"
                >
                  {isSwitching ? 'Verifying...' : 'Unlock & Switch'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
