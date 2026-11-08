'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { type Member, type CreateMemberInput, fetchMembers, createMember } from '../lib/api';

const DEFAULT_DEMO_GYM_ID = '00000000-0000-0000-0000-000000000001';

// Seed members for preview demonstration
const INITIAL_DEMO_MEMBERS: Member[] = [
  {
    id: 'mem-001',
    gymId: DEFAULT_DEMO_GYM_ID,
    memberNumber: 'MEM-00001',
    firstName: 'Suresh',
    lastName: null,
    phone: '+919876543210',
    email: 'suresh@example.com',
    gender: 'male',
    dateOfBirth: '1992-05-14',
    emergencyContactName: 'Mahesh',
    emergencyContactPhone: '+919876543299',
    status: 'active',
    joinedDate: '2026-01-10',
    createdAt: '2026-01-10T09:00:00Z',
    updatedAt: '2026-01-10T09:00:00Z'
  },
  {
    id: 'mem-002',
    gymId: DEFAULT_DEMO_GYM_ID,
    memberNumber: 'MEM-00002',
    firstName: 'Priya',
    lastName: 'Sharma',
    phone: '+919876500002',
    email: 'priya.sharma@example.com',
    gender: 'female',
    dateOfBirth: '1995-08-22',
    emergencyContactName: 'Sunil Sharma',
    emergencyContactPhone: '+919876500099',
    status: 'active',
    joinedDate: '2026-02-01',
    createdAt: '2026-02-01T10:30:00Z',
    updatedAt: '2026-02-01T10:30:00Z'
  },
  {
    id: 'mem-003',
    gymId: DEFAULT_DEMO_GYM_ID,
    memberNumber: 'MEM-00003',
    firstName: 'Ramesh',
    lastName: 'Patel',
    phone: '+919876500003',
    email: 'ramesh.p@example.com',
    gender: 'male',
    dateOfBirth: '1988-11-03',
    emergencyContactName: 'Anil Patel',
    emergencyContactPhone: '+919876500088',
    status: 'inactive',
    joinedDate: '2025-11-15',
    createdAt: '2025-11-15T08:15:00Z',
    updatedAt: '2026-03-01T12:00:00Z'
  }
];

export default function MembersPage() {
  const [gymId, setGymId] = useState<string>(DEFAULT_DEMO_GYM_ID);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [members, setMembers] = useState<Member[]>(INITIAL_DEMO_MEMBERS);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Form Fields
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState('unspecified');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');

  // Check auth session on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const storedGymId = localStorage.getItem('gym_id');
      const storedName = localStorage.getItem('user_name');
      if (token) {
        setIsAuthenticated(true);
        if (storedName) setUserName(storedName);
        if (storedGymId) setGymId(storedGymId);
      } else {
        setIsAuthenticated(false);
      }
    }
  }, []);

  // Fetch members from live backend only when authenticated
  const loadMembers = useCallback(async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('access_token');

    // In unauthenticated preview mode, do not fire network request to avoid 401
    if (!token) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchMembers(gymId, { q: searchQuery, status: statusFilter }, token);
      if (res && Array.isArray(res.members)) {
        setMembers(res.members);
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to fetch members from server');
    } finally {
      setIsLoading(false);
    }
  }, [gymId, searchQuery, statusFilter]);

  useEffect(() => {
    if (isAuthenticated) {
      const timer = setTimeout(() => {
        loadMembers();
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, loadMembers]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_name');
      localStorage.removeItem('gym_id');
    }
    setIsAuthenticated(false);
    setUserName(null);
    setGymId(DEFAULT_DEMO_GYM_ID);
    setMembers(INITIAL_DEMO_MEMBERS);
  };

  // Handle Form Submission
  const handleCreateMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!firstName.trim()) {
      setFormError('First Name is required');
      return;
    }
    if (!phone.trim()) {
      setFormError('Phone number is required');
      return;
    }

    // Validate duplicate phone or email in this gym
    const duplicatePhone = members.find((m) => m.phone === phone.trim());
    if (duplicatePhone) {
      setFormError(`A member with phone number "${phone.trim()}" is already registered (${duplicatePhone.firstName} ${duplicatePhone.lastName || ''}).`);
      return;
    }

    if (email.trim()) {
      const duplicateEmail = members.find((m) => m.email && m.email.toLowerCase() === email.trim().toLowerCase());
      if (duplicateEmail) {
        setFormError(`A member with email "${email.trim()}" is already registered (${duplicateEmail.firstName} ${duplicateEmail.lastName || ''}).`);
        return;
      }
    }

    setIsSubmitting(true);
    const input: CreateMemberInput = {
      firstName: firstName.trim(),
      lastName: lastName.trim() ? lastName.trim() : undefined,
      phone: phone.trim(),
      email: email.trim() ? email.trim() : undefined,
      gender,
      dateOfBirth: dateOfBirth || undefined,
      emergencyContactName: emergencyContactName.trim() ? emergencyContactName.trim() : undefined,
      emergencyContactPhone: emergencyContactPhone.trim() ? emergencyContactPhone.trim() : undefined
    };

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;

      if (token) {
        // Authenticated live mode: write to Postgres via Fastify
        const res = await createMember(gymId, input, token);
        if (res && res.member) {
          setMembers((prev) => [res.member, ...prev]);
        }
      } else {
        // Client preview mode: generate local member
        const newSeq = (members.length + 1).toString().padStart(5, '0');
        const localMember: Member = {
          id: `mem-${Date.now()}`,
          gymId,
          memberNumber: `MEM-${newSeq}`,
          firstName: input.firstName,
          lastName: input.lastName || null,
          phone: input.phone,
          email: input.email || null,
          gender: input.gender || 'unspecified',
          dateOfBirth: input.dateOfBirth || null,
          emergencyContactName: input.emergencyContactName || null,
          emergencyContactPhone: input.emergencyContactPhone || null,
          status: 'active',
          joinedDate: new Date().toISOString().split('T')[0],
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };
        setMembers((prev) => [localMember, ...prev]);
      }

      // Reset form and close modal
      setFirstName('');
      setLastName('');
      setPhone('');
      setEmail('');
      setGender('unspecified');
      setDateOfBirth('');
      setEmergencyContactName('');
      setEmergencyContactPhone('');
      setIsModalOpen(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Failed to create member');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered members list
  const displayedMembers = useMemo(() => {
    if (isAuthenticated) {
      // Backend handles search and status filtering via SQL
      return members;
    }
    // Preview mode: filter in-memory
    return members.filter((m) => {
      if (statusFilter !== 'all' && m.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const fullName = `${m.firstName} ${m.lastName || ''}`.toLowerCase();
      const phoneMatch = m.phone.toLowerCase().includes(q);
      const numMatch = m.memberNumber.toLowerCase().includes(q);
      const nameMatch = fullName.includes(q);
      return nameMatch || phoneMatch || numMatch;
    });
  }, [isAuthenticated, members, searchQuery, statusFilter]);

  const activeCount = useMemo(() => {
    return members.filter((m) => m.status === 'active').length;
  }, [members]);

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
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-neutral-800 text-neutral-300 border border-neutral-700">
              {isAuthenticated ? 'Live Multi-Tenant Pod' : 'Preview Pod'}
            </span>
          </div>

          <div className="flex items-center space-x-6">
            <nav className="flex items-center space-x-4 text-sm font-medium">
              <Link href="/" className="text-neutral-400 hover:text-white transition">
                Overview
              </Link>
              <Link href="/members" className="text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1">
                Members
              </Link>
            </nav>

            <div className="flex items-center pl-4 border-l border-neutral-800">
              {isAuthenticated ? (
                <div className="flex items-center space-x-3">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    {userName || 'Gym Staff'}
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
        {/* Preview Mode Notice Banner */}
        {!isAuthenticated && (
          <div data-testid="preview-mode-banner" className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-emerald-900/60 bg-emerald-950/20 text-emerald-200 text-xs">
            <div className="flex items-center gap-2.5">
              <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>
                <strong>Preview Mode:</strong> Viewing local mock data. Sign in with your gym staff account to sync with the PostgreSQL cloud database.
              </span>
            </div>
            <Link
              href="/login"
              className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-xs transition whitespace-nowrap"
            >
              Sign In (Demo Account Available)
            </Link>
          </div>
        )}

        {/* Header Title & Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
              Members Directory
              <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
                {members.length} Total
              </span>
            </h1>
            <p className="text-sm text-neutral-400 mt-1">
              Manage member profiles, view contact info, and issue new gym enrollments.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              data-testid="add-member-button"
              onClick={() => setIsModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-950/40 cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add Member
            </button>
          </div>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Quick Stats Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="border border-neutral-800/80 bg-neutral-900/40 p-4 rounded-xl">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Total Members</div>
            <div className="text-2xl font-bold text-white mt-1">{members.length}</div>
          </div>
          <div className="border border-neutral-800/80 bg-neutral-900/40 p-4 rounded-xl">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Active Status</div>
            <div className="text-2xl font-bold text-emerald-400 mt-1">{activeCount}</div>
          </div>
          <div className="border border-neutral-800/80 bg-neutral-900/40 p-4 rounded-xl">
            <div className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Current Search Match</div>
            <div className="text-2xl font-bold text-neutral-200 mt-1">{displayedMembers.length}</div>
          </div>
        </div>

        {/* Search & Filter Controls */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 p-4 rounded-xl border border-neutral-800 bg-neutral-900/60">
          {/* Search Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-500">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
              </svg>
            </div>
            <input
              type="text"
              data-testid="member-search-input"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name, phone (+91...), or member # (MEM-...)"
              className="w-full pl-9 pr-9 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
            />
            {searchQuery && (
              <button
                type="button"
                data-testid="clear-search-button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-neutral-400 hover:text-white"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Status Filter */}
          <div className="flex items-center space-x-2">
            <label htmlFor="status-filter" className="text-xs font-medium text-neutral-400 whitespace-nowrap">
              Filter:
            </label>
            <select
              id="status-filter"
              data-testid="status-filter"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'inactive')}
              className="py-2 px-3 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500 transition"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active Only</option>
              <option value="inactive">Inactive Only</option>
            </select>
          </div>
        </div>

        {/* Members Table */}
        <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-900/30">
          <div className="overflow-x-auto">
            <table data-testid="members-table" className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 bg-neutral-900/80 text-xs font-semibold uppercase tracking-wider text-neutral-400">
                  <th scope="col" className="px-6 py-3.5">Member #</th>
                  <th scope="col" className="px-6 py-3.5">Member Name</th>
                  <th scope="col" className="px-6 py-3.5">Phone Number</th>
                  <th scope="col" className="px-6 py-3.5">Email</th>
                  <th scope="col" className="px-6 py-3.5">Status</th>
                  <th scope="col" className="px-6 py-3.5">Joined Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60">
                {isLoading ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-neutral-500">
                      Loading members directory...
                    </td>
                  </tr>
                ) : displayedMembers.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-16 text-center" data-testid="empty-state">
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="w-12 h-12 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-500">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                          </svg>
                        </div>
                        <div className="text-base font-semibold text-neutral-300">
                          No members found
                        </div>
                        <p className="text-xs text-neutral-500 max-w-sm">
                          {searchQuery
                            ? `No members matched your search for "${searchQuery}". Check the spelling or try searching by phone number.`
                            : 'No members have been enrolled yet. Click "+ Add Member" above to create your first member.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  displayedMembers.map((member) => (
                    <tr
                      key={member.id}
                      data-testid={`member-row-${member.id}`}
                      className="hover:bg-neutral-900/50 transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs font-medium text-emerald-400">
                        {member.memberNumber}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="font-semibold text-white">
                          {member.firstName} {member.lastName || ''}
                        </div>
                        {member.gender && member.gender !== 'unspecified' && (
                          <div className="text-xs text-neutral-500 capitalize">
                            {member.gender}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap font-mono text-xs text-neutral-300">
                        {member.phone}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-neutral-400 text-xs">
                        {member.email || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                            member.status === 'active'
                              ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-800/80'
                              : 'bg-neutral-800 text-neutral-400 border border-neutral-700'
                          }`}
                        >
                          {member.status === 'active' ? '● Active' : '○ Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-xs text-neutral-400">
                        {member.joinedDate}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </main>

      {/* Add Member Modal */}
      {isModalOpen && (
        <div
          data-testid="add-member-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm"
        >
          <div className="w-full max-w-lg bg-neutral-900 border border-neutral-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="px-6 py-5 border-b border-neutral-800 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white">Add New Member</h3>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Single-name members are fully supported (Last Name is optional).
                </p>
              </div>
              <button
                type="button"
                data-testid="close-modal-button"
                onClick={() => setIsModalOpen(false)}
                className="text-neutral-400 hover:text-white p-1 rounded-lg hover:bg-neutral-800 transition"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form data-testid="add-member-form" onSubmit={handleCreateMember} className="p-6 space-y-4">
              {formError && (
                <div
                  data-testid="form-error"
                  className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-200 text-xs font-medium"
                >
                  {formError}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="first-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    First Name <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    id="first-name-input"
                    type="text"
                    data-testid="first-name-input"
                    required
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    placeholder="e.g. Suresh"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="last-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Last Name <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="last-name-input"
                    type="text"
                    data-testid="last-name-input"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    placeholder="e.g. Patel (or leave blank)"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="phone-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Phone Number <span className="text-emerald-400">*</span>
                  </label>
                  <input
                    id="phone-input"
                    type="tel"
                    data-testid="phone-input"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="+919876543210"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="email-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Email Address <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="email-input"
                    type="email"
                    data-testid="email-input"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="member@example.com"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="gender-select" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Gender
                  </label>
                  <select
                    id="gender-select"
                    data-testid="gender-select"
                    value={gender}
                    onChange={(e) => setGender(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-200 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="unspecified">Unspecified</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="dob-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Date of Birth <span className="text-neutral-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    id="dob-input"
                    type="date"
                    data-testid="dob-input"
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-neutral-800/80">
                <div>
                  <label htmlFor="emergency-name-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Emergency Contact Name
                  </label>
                  <input
                    id="emergency-name-input"
                    type="text"
                    data-testid="emergency-contact-name-input"
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder="Guardian or spouse"
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label htmlFor="emergency-phone-input" className="block text-xs font-semibold text-neutral-300 mb-1">
                    Emergency Contact Phone
                  </label>
                  <input
                    id="emergency-phone-input"
                    type="tel"
                    data-testid="emergency-contact-phone-input"
                    value={emergencyContactPhone}
                    onChange={(e) => setEmergencyContactPhone(e.target.value)}
                    placeholder="+91..."
                    className="w-full px-3 py-2 rounded-lg bg-neutral-950 border border-neutral-800 text-sm font-mono text-neutral-100 placeholder-neutral-600 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-neutral-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  data-testid="cancel-button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  data-testid="save-member-button"
                  disabled={isSubmitting}
                  className="px-4 py-2 rounded-lg text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-black transition shadow-lg shadow-emerald-950/40 disabled:opacity-50 cursor-pointer"
                >
                  {isSubmitting ? 'Saving...' : 'Save Member'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
