'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { fetchPlatformTenants, createTenantWithAdmin, type TenantListItem, type CreateTenantInput } from '../../lib/api';
import { useToast } from '../../components/Toast';

export default function PlatformTenantsPage() {
  const router = useRouter();
  const toast = useToast();

  // Authentication & Session State
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);
  const [userName, setUserName] = useState<string | null>(null);

  // Tenant Data State
  const [tenants, setTenants] = useState<TenantListItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal & Form State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [successInfo, setSuccessInfo] = useState<{
    gymId: string;
    name: string;
    slug: string;
    adminName: string;
    adminPhone: string;
  } | null>(null);

  // Form Fields
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [country, setCountry] = useState('IN');
  const [timezone, setTimezone] = useState('Asia/Kolkata');
  const [currency, setCurrency] = useState('INR');
  const [taxPercent, setTaxPercent] = useState('18');

  // Initial Admin (1st User) Fields
  const [adminFullName, setAdminFullName] = useState('');
  const [adminPhone, setAdminPhone] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminEmail, setAdminEmail] = useState('');

  // Auto-slugify on name change if slug hasn't been manually diverged
  const handleNameChange = (val: string) => {
    setName(val);
    const generated = val
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    setSlug(generated);
  };

  // Check auth session on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const adminFlag = localStorage.getItem('is_platform_admin') === 'true';
      const storedName = localStorage.getItem('user_name');

      if (!token || !adminFlag) {
        setIsAuthenticated(false);
        setIsSuperAdmin(false);
        router.replace('/');
        return;
      }

      setIsAuthenticated(true);
      setIsSuperAdmin(true);
      setUserName(storedName || 'Super Admin');
      setIsLoading(false);
    }
  }, [router]);

  // Fetch all tenants
  const loadTenants = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access_token');
    if (!token) return;

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchPlatformTenants(token);
      setTenants(res.tenants || []);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch platform tenants');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSuperAdmin) {
      loadTenants();
    }
  }, [isSuperAdmin, loadTenants]);

  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }
  }, [error, toast]);

  // Sign out handler
  const handleSignOut = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_name');
      localStorage.removeItem('is_platform_admin');
      localStorage.removeItem('gym_id');
      localStorage.removeItem('gym_name');
    }
    router.replace('/');
  };

  // Launch into tenant members view
  const handleLaunchTenant = (tenant: { id?: string; gymId?: string; name: string }) => {
    const targetId = tenant.id || tenant.gymId;
    if (targetId && typeof window !== 'undefined') {
      localStorage.setItem('gym_id', targetId);
      localStorage.setItem('gym_name', tenant.name);
    }
    router.push('/members');
  };

  // Create tenant submit handler
  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!name.trim() || !slug.trim()) {
      setFormError('Tenant Name and Slug are required.');
      return;
    }
    if (!adminFullName.trim() || !adminPhone.trim() || !adminPassword.trim()) {
      setFormError('Primary Admin Name, Mobile Phone, and Password are required.');
      return;
    }

    const taxBp = Math.round((parseFloat(taxPercent) || 0) * 100);

    const payload: CreateTenantInput = {
      name: name.trim(),
      slug: slug.trim().toLowerCase(),
      country,
      timezone,
      currency,
      taxRateBasisPoints: taxBp,
      adminFullName: adminFullName.trim(),
      adminPhone: adminPhone.trim(),
      adminPassword: adminPassword.trim(),
      adminEmail: adminEmail.trim() ? adminEmail.trim() : undefined
    };

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem('access_token') || undefined;
      const res = await createTenantWithAdmin(payload, token);

      toast.success(`Tenant "${res.name}" provisioned successfully!`);

      setSuccessInfo({
        gymId: res.gymId,
        name: res.name,
        slug: res.slug,
        adminName: res.adminUser.fullName,
        adminPhone: res.adminUser.phone
      });

      // Reset form fields
      setName('');
      setSlug('');
      setAdminFullName('');
      setAdminPhone('');
      setAdminPassword('');
      setAdminEmail('');
      setIsModalOpen(false);

      // Refresh list
      await loadTenants();
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to provision tenant.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered tenants
  const filteredTenants = tenants.filter((t) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      t.name.toLowerCase().includes(q) ||
      t.slug.toLowerCase().includes(q) ||
      (t.admin_name && t.admin_name.toLowerCase().includes(q)) ||
      (t.admin_phone && t.admin_phone.toLowerCase().includes(q))
    );
  });

  // Guard: Unauthorized View - redirect to "/" and show loading state
  if (!isAuthenticated || !isSuperAdmin) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center space-y-4">
        <div className="w-8 h-8 rounded-full border-2 border-emerald-500 border-t-transparent animate-spin" />
        <p className="text-xs text-neutral-400 font-medium">Checking authorization...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-neutral-950 text-neutral-100 p-6 md:p-8">
      <div className="w-full space-y-6">

        {/* Top Navigation & Status */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950 border border-emerald-800 text-emerald-400 tracking-wider uppercase">
                Platform Super Admin
              </span>
              <span className="text-xs text-neutral-500 font-mono">PostgreSQL RLS Pods</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">Tenant Management</h1>
            <p className="text-xs text-neutral-400 mt-1">
              Provision isolated multi-tenant gym environments and seed initial admin credentials.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create New Tenant
            </button>

            <button
              onClick={handleSignOut}
              className="px-3.5 py-2 rounded-lg bg-red-950/40 hover:bg-red-900/60 border border-red-800/80 text-xs text-red-300 font-medium transition cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </header>

        {/* Success Announcement Banner */}
        {successInfo && (
          <div className="p-4 rounded-xl bg-emerald-950/80 border border-emerald-700/80 text-emerald-100 flex flex-col md:flex-row md:items-center justify-between gap-3 shadow-xl">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm text-emerald-300">Tenant Successfully Provisioned!</span>
                <span className="text-xs px-2 py-0.5 rounded bg-emerald-900 text-emerald-200 font-mono">
                  {successInfo.slug}
                </span>
              </div>
              <p className="text-xs text-emerald-300/90">
                Created gym <span className="font-semibold text-white">{successInfo.name}</span>. Primary Admin{' '}
                <span className="font-semibold text-white">{successInfo.adminName}</span> can now sign in using{' '}
                <span className="font-mono text-white font-bold">{successInfo.adminPhone}</span>.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => handleLaunchTenant(successInfo)}
                className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-semibold transition cursor-pointer"
              >
                Launch Tenant
              </button>
              <button
                onClick={() => setSuccessInfo(null)}
                className="px-2 py-1.5 text-xs text-emerald-400 hover:text-emerald-200 transition"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Search & Overview Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Total Tenants</span>
            <p className="text-2xl font-bold text-white mt-1">{tenants.length}</p>
          </div>
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Default Region</span>
            <p className="text-2xl font-bold text-white mt-1">India (IST / INR)</p>
          </div>
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Isolation Mode</span>
            <p className="text-2xl font-bold text-emerald-400 mt-1">Row-Level Security</p>
          </div>
          <div className="p-4 rounded-xl bg-neutral-900 border border-neutral-800">
            <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Current Admin</span>
            <p className="text-sm font-bold text-neutral-200 mt-2 truncate">{userName || 'Platform Operator'}</p>
          </div>
        </div>

        {/* Search Bar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by gym name, slug, or admin details..."
              className="w-full px-4 py-2.5 rounded-xl bg-neutral-900 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
          </div>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="px-3 py-2 text-xs text-neutral-400 hover:text-neutral-200 transition"
            >
              Clear
            </button>
          )}
        </div>

        {/* Tenant List Table */}
        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/60 shadow-xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 uppercase tracking-wider font-semibold">
                <tr>
                  <th className="py-3 px-4">Gym Tenant</th>
                  <th className="py-3 px-4">Slug / Subdomain</th>
                  <th className="py-3 px-4">Primary Admin (Owner)</th>
                  <th className="py-3 px-4">Timezone & Tax</th>
                  <th className="py-3 px-4">Created Date</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/80">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-500">
                      Loading tenant infrastructure records...
                    </td>
                  </tr>
                ) : filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-neutral-500">
                      {searchQuery ? 'No tenants match your search filter.' : 'No tenants found. Click "Create New Tenant" above to provision one.'}
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-neutral-800/30 transition">
                      <td className="py-3.5 px-4 font-semibold text-neutral-100">
                        {tenant.name}
                        <div className="text-[10px] text-neutral-500 font-mono mt-0.5 truncate max-w-[200px]">
                          {tenant.id}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-neutral-300 border border-neutral-700">
                          {tenant.slug}
                        </span>
                      </td>
                      <td className="py-3.5 px-4">
                        <div className="font-medium text-neutral-200">
                          {tenant.admin_name || 'No Owner Linked'}
                        </div>
                        <div className="text-[11px] text-neutral-400 font-mono mt-0.5">
                          {tenant.admin_phone || '—'}
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-300">
                        <div>{tenant.timezone}</div>
                        <div className="text-[11px] text-neutral-500 mt-0.5">
                          {tenant.currency} • {(Number(tenant.tax_rate_basis_points || 0) / 100).toFixed(1)}% Tax
                        </div>
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400">
                        {tenant.created_at ? new Date(tenant.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => handleLaunchTenant(tenant)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-emerald-400 text-xs font-semibold transition border border-neutral-700 cursor-pointer"
                        >
                          Launch Tenant →
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* CREATE TENANT MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-2xl bg-neutral-900 border border-neutral-800 rounded-2xl p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-center justify-between border-b border-neutral-800 pb-4">
              <div>
                <h2 className="text-lg font-bold text-white">Create New Gym Tenant</h2>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Provisions a multi-tenant PostgreSQL pod and registers the initial admin user.
                </p>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 rounded-lg text-neutral-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateTenant} className="space-y-5">
              {/* SECTION 1: GYM INFORMATION */}
              <div className="space-y-3">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                  1. Organization Details
                </span>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Gym Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => handleNameChange(e.target.value)}
                      placeholder="e.g. Iron Paradise Gym"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Unique Tenant Slug *
                    </label>
                    <input
                      type="text"
                      required
                      value={slug}
                      onChange={(e) => setSlug(e.target.value.toLowerCase())}
                      placeholder="e.g. iron-paradise"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Country
                    </label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="IN">IN (India)</option>
                      <option value="US">US (United States)</option>
                      <option value="GB">GB (United Kingdom)</option>
                      <option value="AE">AE (UAE)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Timezone
                    </label>
                    <select
                      value={timezone}
                      onChange={(e) => setTimezone(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="Asia/Kolkata">Asia/Kolkata (IST)</option>
                      <option value="America/New_York">America/New_York (EST)</option>
                      <option value="Europe/London">Europe/London (GMT)</option>
                      <option value="Asia/Dubai">Asia/Dubai (GST)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500 transition"
                    >
                      <option value="INR">INR (₹)</option>
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="AED">AED (د.إ)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Tax Rate (%)
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      value={taxPercent}
                      onChange={(e) => setTaxPercent(e.target.value)}
                      placeholder="18"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* SECTION 2: INITIAL ADMIN USER */}
              <div className="space-y-3 pt-3 border-t border-neutral-800">
                <div>
                  <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider block">
                    2. Primary Administrator (1st User)
                  </span>
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    This user will receive the <code className="text-emerald-300">owner</code> role and can later invite staff members.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Admin Full Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={adminFullName}
                      onChange={(e) => setAdminFullName(e.target.value)}
                      placeholder="e.g. Vikram Malhotra"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Admin Mobile Phone * (E.164)
                    </label>
                    <input
                      type="tel"
                      required
                      value={adminPhone}
                      onChange={(e) => setAdminPhone(e.target.value)}
                      placeholder="e.g. +919876543210"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Admin Initial Password *
                    </label>
                    <input
                      type="password"
                      required
                      value={adminPassword}
                      onChange={(e) => setAdminPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-neutral-300 mb-1">
                      Admin Email (Optional)
                    </label>
                    <input
                      type="email"
                      value={adminEmail}
                      onChange={(e) => setAdminEmail(e.target.value)}
                      placeholder="e.g. admin@paradise.com"
                      className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-xs text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500 transition"
                    />
                  </div>
                </div>
              </div>

              {/* ACTIONS */}
              <div className="flex items-center justify-end gap-3 pt-3 border-t border-neutral-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-xs font-medium text-neutral-300 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Provisioning Tenant...' : 'Provision Tenant'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
