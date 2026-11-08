'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type MembershipPlan,
  type CreateMembershipPlanInput,
  fetchMembershipPlans,
  createMembershipPlan
} from '../lib/api';

export default function PlansPage() {
  const router = useRouter();

  const [gymId, setGymId] = useState<string>('');
  const [gymName, setGymName] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);

  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Create Plan Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [planName, setPlanName] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [priceInr, setPriceInr] = useState('3000');

  // Check auth session on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      const storedGymId = localStorage.getItem('gym_id');
      const storedGymName = localStorage.getItem('gym_name');
      const storedName = localStorage.getItem('user_name');
      const adminFlag = localStorage.getItem('is_platform_admin') === 'true';

      setIsAuthenticated(true);
      setIsSuperAdmin(adminFlag);
      if (storedName) setUserName(storedName);
      if (storedGymId) setGymId(storedGymId);
      if (storedGymName) setGymName(storedGymName);

      if (storedGymId) {
        setIsLoading(true);
        fetchMembershipPlans(storedGymId, undefined, token)
          .then((res) => {
            if (res && Array.isArray(res.plans)) {
              setPlans(res.plans);
            }
          })
          .catch((err: unknown) => {
            setError(err instanceof Error ? err.message : 'Failed to fetch membership plans');
          })
          .finally(() => {
            setIsLoading(false);
          });
      } else {
        setIsLoading(false);
      }
    }
  }, []);



  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_name');
      localStorage.removeItem('gym_id');
      localStorage.removeItem('gym_name');
      localStorage.removeItem('is_platform_admin');
    }
    setIsAuthenticated(false);
    setUserName(null);
    setGymId('');
    router.replace('/');
  };

  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!planName.trim()) {
      setFormError('Plan Name is required');
      return;
    }
    const days = parseInt(durationDays, 10);
    if (isNaN(days) || days <= 0) {
      setFormError('Duration must be a positive number of days');
      return;
    }
    const priceNum = parseFloat(priceInr);
    if (isNaN(priceNum) || priceNum < 0) {
      setFormError('Price must be a non-negative number');
      return;
    }

    const priceCents = Math.round(priceNum * 100);
    const input: CreateMembershipPlanInput = {
      name: planName.trim(),
      durationDays: days,
      priceCents
    };

    setIsSubmitting(true);
    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;

      if (token && gymId) {
        const res = await createMembershipPlan(gymId, input, token);
        if (res && res.plan) {
          setPlans((prev) => [res.plan, ...prev]);
        }
      } else {
        // Local preview simulation
        const localPlan: MembershipPlan = {
          id: `plan-${Date.now()}`,
          gymId: gymId || 'local-gym',
          name: input.name,
          durationDays: input.durationDays,
          priceCents: input.priceCents,
          isActive: true,
          createdAt: new Date().toISOString()
        };
        setPlans((prev) => [localPlan, ...prev]);
      }

      setPlanName('');
      setDurationDays('30');
      setPriceInr('3000');
      setIsModalOpen(false);
      setSuccessMessage('Membership plan created successfully!');
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create membership plan');
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (successMessage) {
      const timer = setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [successMessage]);

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased flex flex-col">
      {/* Top Navigation */}
      <header className="border-b border-neutral-800 bg-neutral-900/80 backdrop-blur-md sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link href="/" className="flex items-center space-x-2">
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-500 font-bold text-black text-sm">
                GYM
              </span>
              <span className="font-extrabold text-lg tracking-tight text-white">
                GymOS
              </span>
            </Link>
            <span className="text-neutral-600">/</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              {gymName ? gymName : isAuthenticated ? 'Active Gym Pod' : 'Preview Mode'}
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <nav className="hidden md:flex items-center space-x-4 text-sm font-medium">
              <Link href="/" className="text-neutral-400 hover:text-white transition">
                Overview
              </Link>
              <Link href="/members" className="text-neutral-400 hover:text-white transition">
                Members
              </Link>
              <Link href="/plans" className="text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1">
                Plans
              </Link>
              {isSuperAdmin && (
                <Link href="/platform/tenants" className="text-neutral-400 hover:text-neutral-100 transition">
                  Super Admin
                </Link>
              )}
            </nav>

            <div className="flex items-center pl-4 border-l border-neutral-800">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {userName || 'Staff'}
                  </span>
                  <button
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

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-6 py-8 flex-1 w-full space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Membership Plans
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                {plans.length} Total
              </span>
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Configure subscription tiers, durations, and pricing catalogs for this gym.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="add-plan-button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Plan
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Success Alert */}
        {successMessage && (
          <div
            data-testid="success-banner"
            className="p-3 rounded-lg bg-emerald-950/80 border border-emerald-800 text-emerald-300 text-xs font-medium flex items-center justify-between"
          >
            <span>{successMessage}</span>
            <button
              onClick={() => setSuccessMessage(null)}
              className="text-emerald-400 hover:text-emerald-200 font-bold ml-2 cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}

        {/* Plans Grid */}
        {isLoading ? (
          <div className="py-20 text-center space-y-3">
            <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin mx-auto" />
            <p className="text-xs text-neutral-400">Loading membership plans...</p>
          </div>
        ) : plans.length === 0 ? (
          <div data-testid="empty-plans-state" className="py-20 text-center border border-neutral-800 rounded-2xl bg-neutral-900/30">
            <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center mx-auto text-neutral-500 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-white">No membership plans created yet</h3>
            <p className="text-xs text-neutral-400 max-w-sm mx-auto mt-1 mb-4">
              Create your first plan (e.g. Monthly, Quarterly, or Annual) to begin assigning subscriptions to gym members.
            </p>
            <button
              onClick={() => setIsModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition"
            >
              + Create First Plan
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {plans.map((plan) => {
              const priceInrVal = (plan.priceCents / 100).toLocaleString('en-IN', {
                style: 'currency',
                currency: 'INR',
                maximumFractionDigits: 0
              });
              const dailyRate = Math.round((plan.priceCents / 100) / plan.durationDays);

              return (
                <div
                  key={plan.id}
                  data-testid={`plan-card-${plan.id}`}
                  className="p-6 rounded-2xl border border-neutral-800 bg-neutral-900/60 hover:border-neutral-700 transition flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                        {plan.isActive ? 'Active Plan' : 'Archived'}
                      </span>
                      <span className="text-xs font-mono text-neutral-400">
                        {plan.durationDays} Days
                      </span>
                    </div>

                    <h3 className="text-xl font-bold text-white mb-2">{plan.name}</h3>
                    <div className="flex items-baseline gap-1 mb-4">
                      <span className="text-3xl font-extrabold text-white">{priceInrVal}</span>
                      <span className="text-xs text-neutral-400">/ {plan.durationDays} days</span>
                    </div>

                    <div className="text-xs text-neutral-400 border-t border-neutral-800/80 pt-3">
                      Approx. <strong className="text-neutral-200">₹{dailyRate}</strong> per day
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-neutral-800 flex items-center justify-between text-xs text-neutral-500">
                    <span>Created {new Date(plan.createdAt).toLocaleDateString()}</span>
                    <Link
                      href="/members"
                      className="text-emerald-400 hover:text-emerald-300 font-medium"
                    >
                      Assign to Member →
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Create Plan Modal */}
      {isModalOpen && (
        <div
          data-testid="add-plan-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Create Membership Plan</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Define subscription length and price in INR.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreatePlan} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Plan Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  data-testid="plan-name-input"
                  required
                  value={planName}
                  onChange={(e) => setPlanName(e.target.value)}
                  placeholder="e.g. Quarterly Gold Membership"
                  className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Duration (Days) <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="number"
                    data-testid="plan-duration-input"
                    required
                    min={1}
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    {[30, 90, 180, 365].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setDurationDays(String(d))}
                        className={`text-[10px] px-2 py-0.5 rounded border transition cursor-pointer ${
                          durationDays === String(d)
                            ? 'bg-emerald-950 border-emerald-800 text-emerald-400 font-semibold'
                            : 'bg-neutral-800 border-neutral-700 text-neutral-400 hover:text-white'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-300 mb-1">
                    Price (INR ₹) <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    type="number"
                    data-testid="plan-price-input"
                    required
                    min={0}
                    step={1}
                    value={priceInr}
                    onChange={(e) => setPriceInr(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-plan-button"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition shadow-lg shadow-emerald-950/50 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving Plan...' : 'Create Plan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
