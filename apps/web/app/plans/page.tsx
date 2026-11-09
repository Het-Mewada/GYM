'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type MembershipPlan,
  type CreateMembershipPlanInput,
  type UpdateMembershipPlanInput,
  fetchPlatformTenants,
  fetchMembershipPlans,
  createMembershipPlan,
  updateMembershipPlan,
  deleteMembershipPlan
} from '../lib/api';
import { useToast } from '../components/Toast';
import { Navbar } from '../components/Navbar';

export default function PlansPage() {
  const router = useRouter();
  const toast = useToast();

  const [gymId, setGymId] = useState<string>('');
  const [gymName, setGymName] = useState<string | null>(null);

  const [isCheckingAuth, setIsCheckingAuth] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isInitialLoadDone, setIsInitialLoadDone] = useState<boolean>(false);
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // User role & permission check
  const [canManagePlans, setCanManagePlans] = useState<boolean>(true);

  // Create Plan Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Create Form Fields
  const [planName, setPlanName] = useState('');
  const [durationDays, setDurationDays] = useState('30');
  const [priceInr, setPriceInr] = useState('3000');

  // Edit Plan Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<MembershipPlan | null>(null);
  const [editPlanName, setEditPlanName] = useState('');
  const [editDurationDays, setEditDurationDays] = useState('30');
  const [editPriceInr, setEditPriceInr] = useState('3000');
  const [editIsActive, setEditIsActive] = useState(true);
  const [isEditingSubmitting, setIsEditingSubmitting] = useState(false);
  const [editFormError, setEditFormError] = useState<string | null>(null);

  // Delete Plan Modal State
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [deletingPlan, setDeletingPlan] = useState<MembershipPlan | null>(null);
  const [isDeletingSubmitting, setIsDeletingSubmitting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const checkPermissions = useCallback((activeGymId?: string) => {
    if (typeof window === 'undefined') return;

    const token = localStorage.getItem('access_token');
    const isSuper = localStorage.getItem('is_platform_admin') === 'true';

    if (!token) {
      // Preview mode: allow full control
      setCanManagePlans(true);
      return;
    }

    if (isSuper) {
      setCanManagePlans(true);
      return;
    }

    const currentGym = activeGymId || gymId;
    let role = localStorage.getItem('user_role');

    const storedMemberships = localStorage.getItem('user_memberships') || localStorage.getItem('gym_memberships');
    if (storedMemberships) {
      try {
        const parsed = JSON.parse(storedMemberships);
        if (Array.isArray(parsed)) {
          const match = parsed.find((m: { gym_id?: string; id?: string; role?: string }) => (m.gym_id || m.id) === currentGym);
          if (match?.role) {
            role = match.role;
          }
        }
      } catch { /* ignore */ }
    }

    const allowed = role === 'owner' || role === 'manager';
    setCanManagePlans(allowed);
  }, [gymId]);

  const loadPlans = useCallback((id: string, token?: string) => {
    setIsLoading(true);
    fetchMembershipPlans(id, undefined, token)
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
        setIsInitialLoadDone(true);
      });
  }, []);

  // Check auth session on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      if (!token) {
        setIsAuthenticated(false);
        setIsCheckingAuth(false);
        setIsLoading(false);
        setIsInitialLoadDone(true);
        checkPermissions();
        router.replace('/');
        return;
      }

      setIsAuthenticated(true);
      setIsCheckingAuth(false);

      const storedGymId = localStorage.getItem('gym_id');
      const storedGymName = localStorage.getItem('gym_name');

      if (storedGymId) setGymId(storedGymId);
      if (storedGymName) setGymName(storedGymName);

      checkPermissions(storedGymId || undefined);

      if (storedGymId) {
        loadPlans(storedGymId, token);
      } else {
        // Automatically fetch and bind default tenant when gym_id is not yet in storage
        setIsLoading(true);
        fetchPlatformTenants(token)
          .then((res) => {
            if (res && Array.isArray(res.tenants) && res.tenants.length > 0) {
              const defaultTenant = res.tenants[0];
              localStorage.setItem('gym_id', defaultTenant.id);
              localStorage.setItem('gym_name', defaultTenant.name);
              const isSuper = localStorage.getItem('is_platform_admin') === 'true';
              const tRole = (defaultTenant as unknown as { role?: string }).role || (isSuper ? 'owner' : undefined);
              if (tRole) localStorage.setItem('user_role', tRole);
              setGymId(defaultTenant.id);
              setGymName(defaultTenant.name);
              checkPermissions(defaultTenant.id);
              loadPlans(defaultTenant.id, token);
            } else {
              setIsLoading(false);
              setIsInitialLoadDone(true);
            }
          })
          .catch(() => {
            setIsLoading(false);
            setIsInitialLoadDone(true);
          });
      }

      // Also listen to gym-changed event dispatched by Navbar
      const handleGymChangeEvent = (e: Event) => {
        const customEvent = e as CustomEvent<{ gymId: string; gymName: string }>;
        if (customEvent.detail?.gymId) {
          const newGymId = customEvent.detail.gymId;
          const newGymName = customEvent.detail.gymName;
          setGymId(newGymId);
          setGymName(newGymName);
          checkPermissions(newGymId);
          const activeToken = localStorage.getItem('access_token') || undefined;
          loadPlans(newGymId, activeToken);
        }
      };

      window.addEventListener('gym-changed', handleGymChangeEvent);
      return () => window.removeEventListener('gym-changed', handleGymChangeEvent);
    }
  }, [loadPlans, checkPermissions]);

  // Create Plan Handler
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

    const activeToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
    const activeGymId = gymId || (typeof window !== 'undefined' ? localStorage.getItem('gym_id') || undefined : undefined);

    if (activeToken) {
      if (!activeGymId) {
        setFormError('No active gym tenant selected. Please select a gym from the top navigation bar.');
        return;
      }

      setIsSubmitting(true);
      try {
        const res = await createMembershipPlan(activeGymId, input, activeToken);
        if (res && res.plan) {
          setPlans((prev) => [res.plan, ...prev]);
        }
        setPlanName('');
        setDurationDays('30');
        setPriceInr('3000');
        setIsModalOpen(false);
        setSuccessMessage(`Membership plan "${input.name}" created successfully!`);
      } catch (err: unknown) {
        setFormError(err instanceof Error ? err.message : 'Failed to create membership plan');
      } finally {
        setIsSubmitting(false);
      }
    } else {
      // Local preview simulation ONLY when unauthenticated
      const localPlan: MembershipPlan = {
        id: `plan-${Date.now()}`,
        gymId: 'local-gym',
        name: input.name,
        durationDays: input.durationDays,
        priceCents: input.priceCents,
        isActive: true,
        createdAt: new Date().toISOString()
      };
      setPlans((prev) => [localPlan, ...prev]);
      setPlanName('');
      setDurationDays('30');
      setPriceInr('3000');
      setIsModalOpen(false);
      setSuccessMessage('Membership plan created in preview mode!');
    }
  };

  // Open Edit Modal
  const handleOpenEditModal = (plan: MembershipPlan) => {
    setEditingPlan(plan);
    setEditPlanName(plan.name);
    setEditDurationDays(String(plan.durationDays));
    setEditPriceInr(String(Math.round(plan.priceCents / 100)));
    setEditIsActive(plan.isActive);
    setEditFormError(null);
    setIsEditModalOpen(true);
  };

  // Submit Edit Plan
  const handleUpdatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPlan) return;
    setEditFormError(null);

    if (!editPlanName.trim()) {
      setEditFormError('Plan Name is required');
      return;
    }
    const days = parseInt(editDurationDays, 10);
    if (isNaN(days) || days <= 0) {
      setEditFormError('Duration must be a positive number of days');
      return;
    }
    const priceNum = parseFloat(editPriceInr);
    if (isNaN(priceNum) || priceNum < 0) {
      setEditFormError('Price must be a non-negative number');
      return;
    }

    const priceCents = Math.round(priceNum * 100);
    const updateInput: UpdateMembershipPlanInput = {
      name: editPlanName.trim(),
      durationDays: days,
      priceCents,
      isActive: editIsActive
    };

    const activeToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
    const activeGymId = gymId || (typeof window !== 'undefined' ? localStorage.getItem('gym_id') || undefined : undefined);

    if (activeToken) {
      if (!activeGymId) {
        setEditFormError('No active gym tenant selected. Please select a gym from the top navigation bar.');
        return;
      }

      setIsEditingSubmitting(true);
      try {
        const res = await updateMembershipPlan(activeGymId, editingPlan.id, updateInput, activeToken);
        if (res && res.plan) {
          setPlans((prev) => prev.map((p) => (p.id === editingPlan.id ? res.plan : p)));
        }
        setIsEditModalOpen(false);
        const updatedName = updateInput.name || editingPlan.name;
        setEditingPlan(null);
        setSuccessMessage(`Plan "${updatedName}" updated successfully!`);
      } catch (err: unknown) {
        setEditFormError(err instanceof Error ? err.message : 'Failed to update membership plan');
      } finally {
        setIsEditingSubmitting(false);
      }
    } else {
      // Local preview fallback
      setPlans((prev) =>
        prev.map((p) =>
          p.id === editingPlan.id
            ? {
                ...p,
                name: updateInput.name || p.name,
                durationDays: updateInput.durationDays || p.durationDays,
                priceCents: updateInput.priceCents || p.priceCents,
                isActive: updateInput.isActive !== undefined ? updateInput.isActive : p.isActive
              }
            : p
        )
      );
      setIsEditModalOpen(false);
      const updatedName = updateInput.name || editingPlan.name;
      setEditingPlan(null);
      setSuccessMessage(`Plan "${updatedName}" updated in preview mode!`);
    }
  };

  // Open Delete Modal
  const handleOpenDeleteModal = (plan: MembershipPlan) => {
    setDeletingPlan(plan);
    setDeleteError(null);
    setIsDeleteModalOpen(true);
  };

  // Confirm Delete Plan
  const handleConfirmDelete = async () => {
    if (!deletingPlan) return;

    const activeToken = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;
    const activeGymId = gymId || (typeof window !== 'undefined' ? localStorage.getItem('gym_id') || undefined : undefined);

    if (activeToken) {
      if (!activeGymId) {
        setDeleteError('No active gym tenant selected. Please select a gym from the top navigation bar.');
        return;
      }

      setIsDeletingSubmitting(true);
      setDeleteError(null);
      try {
        const res = await deleteMembershipPlan(activeGymId, deletingPlan.id, activeToken);
        setPlans((prev) => prev.filter((p) => p.id !== deletingPlan.id));
        setIsDeleteModalOpen(false);
        const name = deletingPlan.name;
        setDeletingPlan(null);
        setSuccessMessage(res.message || `Plan "${name}" removed successfully!`);
      } catch (err: unknown) {
        setDeleteError(err instanceof Error ? err.message : 'Failed to delete membership plan');
      } finally {
        setIsDeletingSubmitting(false);
      }
    } else {
      // Local preview fallback
      setPlans((prev) => prev.filter((p) => p.id !== deletingPlan.id));
      setIsDeleteModalOpen(false);
      const name = deletingPlan.name;
      setDeletingPlan(null);
      setSuccessMessage(`Plan "${name}" deleted in preview mode!`);
    }
  };

  useEffect(() => {
    if (successMessage) {
      toast.success(successMessage);
      setSuccessMessage(null);
    }
  }, [successMessage, toast]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }
  }, [error, toast]);

  if (isCheckingAuth || !isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <p className="text-xs text-neutral-400 font-medium">Checking authentication...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 antialiased flex flex-col">
      <Navbar
        activePage="plans"
        currentGymId={gymId}
        currentGymName={gymName || undefined}
        onGymChange={(newGymId, newGymName) => {
          setGymId(newGymId);
          setGymName(newGymName);
          checkPermissions(newGymId);
          loadPlans(newGymId);
        }}
      />

      {/* Main Content Area */}
      <main className="w-full px-6 py-8 flex-1 space-y-6">
        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Membership Plans
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                {!isInitialLoadDone ? (
                  <span className="inline-flex items-center gap-1.5 text-neutral-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Loading...
                  </span>
                ) : (
                  `${plans.length} Total`
                )}
              </span>
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Configure subscription tiers, durations, and pricing catalogs for this gym.
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canManagePlans && (
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
            )}
          </div>
        </div>

        {/* Plans Grid */}
        {(isLoading || !isInitialLoadDone) ? (
          <div className="py-20 text-center space-y-3" data-testid="loading-state">
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
            {canManagePlans && (
              <button
                onClick={() => setIsModalOpen(true)}
                className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition"
              >
                + Create First Plan
              </button>
            )}
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
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold border ${
                        plan.isActive
                          ? 'bg-emerald-950/80 text-emerald-400 border-emerald-800'
                          : 'bg-neutral-800/80 text-neutral-400 border-neutral-700'
                      }`}>
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
                    
                    <div className="flex items-center gap-2">
                      {canManagePlans && (
                        <>
                          <button
                            type="button"
                            data-testid={`edit-plan-button-${plan.id}`}
                            onClick={() => handleOpenEditModal(plan)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-300 hover:text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 transition cursor-pointer"
                            title="Edit Plan"
                          >
                            <svg className="w-3.5 h-3.5 text-neutral-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10" />
                            </svg>
                            Edit
                          </button>
                          <button
                            type="button"
                            data-testid={`delete-plan-button-${plan.id}`}
                            onClick={() => handleOpenDeleteModal(plan)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-red-400 hover:text-red-300 bg-red-950/40 hover:bg-red-950/80 border border-red-900/60 transition cursor-pointer"
                            title="Delete Plan"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                            </svg>
                            Delete
                          </button>
                        </>
                      )}
                      <Link
                        href="/members"
                        className="text-emerald-400 hover:text-emerald-300 font-medium ml-1"
                      >
                        Assign to Member →
                      </Link>
                    </div>
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

      {/* Edit Plan Modal */}
      {isEditModalOpen && editingPlan && (
        <div
          data-testid="edit-plan-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Edit Membership Plan</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Update plan pricing, duration, or active availability.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsEditModalOpen(false);
                  setEditingPlan(null);
                }}
                className="text-neutral-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdatePlan} className="p-6 space-y-4">
              {editFormError && (
                <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium">
                  {editFormError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1">
                  Plan Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  data-testid="edit-plan-name-input"
                  required
                  value={editPlanName}
                  onChange={(e) => setEditPlanName(e.target.value)}
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
                    data-testid="edit-plan-duration-input"
                    required
                    min={1}
                    value={editDurationDays}
                    onChange={(e) => setEditDurationDays(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                  />
                  <div className="flex gap-1.5 mt-1.5">
                    {[30, 90, 180, 365].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setEditDurationDays(String(d))}
                        className={`text-[10px] px-2 py-0.5 rounded border transition cursor-pointer ${
                          editDurationDays === String(d)
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
                    data-testid="edit-plan-price-input"
                    required
                    min={0}
                    step={1}
                    value={editPriceInr}
                    onChange={(e) => setEditPriceInr(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-white placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-300 mb-1.5">
                  Plan Catalog Status
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setEditIsActive(true)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition cursor-pointer ${
                      editIsActive
                        ? 'bg-emerald-950/80 border-emerald-500 text-emerald-300 shadow-sm'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${editIsActive ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
                    Active Plan
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditIsActive(false)}
                    className={`px-3 py-2 rounded-lg text-xs font-medium border flex items-center justify-center gap-2 transition cursor-pointer ${
                      !editIsActive
                        ? 'bg-amber-950/60 border-amber-500 text-amber-300 shadow-sm'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-neutral-200'
                    }`}
                  >
                    <span className={`w-2 h-2 rounded-full ${!editIsActive ? 'bg-amber-400' : 'bg-neutral-600'}`} />
                    Archived
                  </button>
                </div>
                <p className="text-[11px] text-neutral-500 mt-1">
                  {editIsActive
                    ? 'Active plans appear in the subscription enrollment selector.'
                    : 'Archived plans cannot be assigned to new subscriptions.'}
                </p>
              </div>

              <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsEditModalOpen(false);
                    setEditingPlan(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="update-plan-button"
                  disabled={isEditingSubmitting}
                  className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition shadow-lg shadow-emerald-950/50 disabled:opacity-50 cursor-pointer"
                >
                  {isEditingSubmitting ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Plan Confirmation Modal */}
      {isDeleteModalOpen && deletingPlan && (
        <div
          data-testid="delete-plan-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-md bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-red-950/80 border border-red-800/80 flex items-center justify-center text-red-400">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Delete Membership Plan</h3>
                  <p className="text-xs text-neutral-400">Confirmation required</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsDeleteModalOpen(false);
                  setDeletingPlan(null);
                }}
                className="text-neutral-400 hover:text-white text-lg font-bold p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-4">
              {deleteError && (
                <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium">
                  {deleteError}
                </div>
              )}

              <p className="text-sm text-neutral-300">
                Are you sure you want to delete <strong className="text-white">&quot;{deletingPlan.name}&quot;</strong>?
              </p>

              <div className="p-3.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-neutral-400 space-y-1.5">
                <div className="flex items-center gap-2 text-neutral-300 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                  Protection & Audit Policy:
                </div>
                <p>
                  If members have active or past subscriptions under this tier, the plan will be safely archived to preserve financial records and member renewal histories. Unreferenced plans will be permanently purged.
                </p>
              </div>

              <div className="pt-3 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setIsDeleteModalOpen(false);
                    setDeletingPlan(null);
                  }}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  data-testid="confirm-delete-plan-button"
                  onClick={handleConfirmDelete}
                  disabled={isDeletingSubmitting}
                  className="px-5 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-white font-semibold text-xs transition shadow-lg shadow-red-950/50 disabled:opacity-50 cursor-pointer flex items-center gap-2"
                >
                  {isDeletingSubmitting ? (
                    <>
                      <div className="w-3.5 h-3.5 rounded-full border-2 border-white border-t-transparent animate-spin" />
                      Deleting...
                    </>
                  ) : (
                    'Delete Plan'
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
