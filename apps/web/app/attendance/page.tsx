'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  type Member,
  type AttendanceLogItem,
  fetchMembers,
  fetchAttendance,
  recordCheckIn,
  voidAttendance
} from '../lib/api';
import { Navbar } from '../components/Navbar';
import { useToast } from '../components/Toast';

export default function AttendancePage() {
  const toast = useToast();
  const [gymId, setGymId] = useState<string>('');
  const [gymName, setGymName] = useState<string | null>(null);

  const [attendance, setAttendance] = useState<AttendanceLogItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter state
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);

  // Modals state
  const [isCheckInModalOpen, setIsCheckInModalOpen] = useState<boolean>(false);
  const [voidTarget, setVoidTarget] = useState<AttendanceLogItem | null>(null);

  // Check-In Form state
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [checkInMethod, setCheckInMethod] = useState<'staff_manual' | 'qr_kiosk'>('staff_manual');
  const [wasOverride, setWasOverride] = useState<boolean>(false);
  const [overrideReason, setOverrideReason] = useState<string>('forgot_wallet');
  const [checkInSubmitting, setCheckInSubmitting] = useState<boolean>(false);
  const [checkInError, setCheckInError] = useState<string | null>(null);

  // Void Form state
  const [voidReason, setVoidReason] = useState<string>('');
  const [voidSubmitting, setVoidSubmitting] = useState<boolean>(false);
  const [voidError, setVoidError] = useState<string | null>(null);

  const loadData = useCallback(async (activeGymId: string, token: string, date: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [attRes, memRes] = await Promise.all([
        fetchAttendance(activeGymId, { date, limit: 100 }, token),
        fetchMembers(activeGymId, { limit: 100 }, token)
      ]);
      setAttendance(attRes.attendance);
      setMembers(memRes.members);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load attendance logs');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const storedGymId = localStorage.getItem('gym_id');
      const storedGymName = localStorage.getItem('gym_name');

      if (token) {
        if (storedGymId) setGymId(storedGymId);
        if (storedGymName) setGymName(storedGymName);

        if (storedGymId) {
          loadData(storedGymId, token, selectedDate);
        } else {
          setIsLoading(false);
        }
      } else {
        // Standalone preview mode
        setIsLoading(false);

        const localMembersStr = localStorage.getItem('local_preview_members');
        if (localMembersStr) {
          try {
            setMembers(JSON.parse(localMembersStr));
          } catch { /* ignore */ }
        } else {
          setMembers([
            {
              id: 'mem-preview-1',
              gymId: 'local-gym',
              memberNumber: 'MEM-00001',
              firstName: 'Aarav',
              lastName: 'Sharma',
              phone: '+919988112233',
              email: 'aarav@example.com',
              gender: 'male',
              dateOfBirth: null,
              emergencyContactName: null,
              emergencyContactPhone: null,
              status: 'active',
              joinedDate: new Date().toISOString().split('T')[0],
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString()
            }
          ]);
        }
      }
    }
  }, [loadData, selectedDate]);

  const handleOpenCheckInModal = () => {
    setSelectedMemberId(members[0]?.id || '');
    setCheckInMethod('staff_manual');
    setWasOverride(false);
    setOverrideReason('forgot_wallet');
    setCheckInError(null);
    setIsCheckInModalOpen(true);
  };

  const handleSubmitCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMemberId) {
      setCheckInError('Please select a member');
      return;
    }

    setCheckInSubmitting(true);
    setCheckInError(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;

      if (token && gymId) {
        await recordCheckIn(
          gymId,
          {
            memberId: selectedMemberId,
            method: checkInMethod,
            wasOverride,
            overrideReason: wasOverride ? overrideReason : null
          },
          token
        );
        setIsCheckInModalOpen(false);
        toast.success('Check-in recorded successfully!');
        await loadData(gymId, token, selectedDate);
      } else {
        // Preview mode check-in simulation
        const alreadyCheckedIn = attendance.some(
          a => a.memberId === selectedMemberId && a.attendanceDate === selectedDate && !a.isVoided
        );
        if (alreadyCheckedIn) {
          throw new Error('Member has already checked in today');
        }

        const member = members.find(m => m.id === selectedMemberId) || members[0];
        const previewItem: AttendanceLogItem = {
          id: `att-${Date.now()}`,
          gymId: gymId || 'local-gym',
          memberId: selectedMemberId,
          attendanceDate: selectedDate,
          checkInTime: new Date().toISOString(),
          method: checkInMethod,
          recordedByUserId: 'local-user',
          wasOverride,
          overrideReason: wasOverride ? (overrideReason as AttendanceLogItem['overrideReason']) : null,
          isVoided: false,
          voidedAt: null,
          voidedByUserId: null,
          voidReason: null,
          createdAt: new Date().toISOString(),
          memberFirstName: member?.firstName || 'Member',
          memberLastName: member?.lastName || '',
          memberNumber: member?.memberNumber || 'MEM-00001',
          memberPhone: member?.phone || ''
        };

        setAttendance(prev => [previewItem, ...prev]);
        setIsCheckInModalOpen(false);
      }
    } catch (err: unknown) {
      setCheckInError(err instanceof Error ? err.message : 'Failed to record check-in');
    } finally {
      setCheckInSubmitting(false);
    }
  };

  const handleOpenVoidModal = (item: AttendanceLogItem) => {
    setVoidTarget(item);
    setVoidReason('');
    setVoidError(null);
  };

  const handleSubmitVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;

    if (!voidReason.trim() || voidReason.trim().length < 3) {
      setVoidError('Void reason must be at least 3 characters');
      return;
    }

    setVoidSubmitting(true);
    setVoidError(null);

    try {
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;

      if (token && gymId) {
        await voidAttendance(gymId, voidTarget.id, { voidReason: voidReason.trim() }, token);
        setVoidTarget(null);
        toast.success('Attendance record voided successfully.');
        await loadData(gymId, token, selectedDate);
      } else {
        // Preview mode void simulation
        setAttendance(prev =>
          prev.map(a =>
            a.id === voidTarget.id
              ? {
                  ...a,
                  isVoided: true,
                  voidReason: voidReason.trim(),
                  voidedAt: new Date().toISOString()
                }
              : a
          )
        );
        setVoidTarget(null);
      }
    } catch (err: unknown) {
      setVoidError(err instanceof Error ? err.message : 'Failed to void attendance');
    } finally {
      setVoidSubmitting(false);
    }
  };

  useEffect(() => {
    if (error) {
      toast.error(error);
      setError(null);
    }
  }, [error, toast]);

  const activeCheckIns = attendance.filter(a => !a.isVoided).length;
  const voidedCheckIns = attendance.filter(a => a.isVoided).length;
  const overrideCount = attendance.filter(a => a.wasOverride && !a.isVoided).length;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-emerald-500 selection:text-black flex flex-col">
      <Navbar
        activePage="attendance"
        currentGymId={gymId}
        currentGymName={gymName || undefined}
        onGymChange={(newGymId, newGymName) => {
          setGymId(newGymId);
          setGymName(newGymName);
        }}
      />

      <main className="w-full px-6 py-8 flex-1 space-y-6">
        {/* Title and Desk Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Attendance Tracking & Desk Check-in</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Real-time member check-in verification, active subscription validation, and audit controls.
            </p>
          </div>
          <button
            onClick={handleOpenCheckInModal}
            data-testid="check-in-button"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-950/50 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            Desk Check-in
          </button>
        </div>

        {/* Attendance Statistics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Check-ins Today</span>
            <div className="text-2xl font-bold text-emerald-400 mt-2" data-testid="check-ins-count">
              {activeCheckIns}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Active verified entries</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Overrides</span>
            <div className="text-2xl font-bold text-amber-400 mt-2" data-testid="overrides-count">
              {overrideCount}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Special permission entries</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Voided Records</span>
            <div className="text-2xl font-bold text-rose-400 mt-2" data-testid="voided-count">
              {voidedCheckIns}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Cancelled check-in entries</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Total Entries</span>
            <div className="text-2xl font-bold text-neutral-200 mt-2">
              {attendance.length}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Total recorded attempts</p>
          </div>
        </div>

        {/* Date Filter Bar */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="text-xs font-medium text-neutral-400">Attendance Date:</label>
            <input
              type="date"
              data-testid="attendance-date-filter"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            />
          </div>
          {selectedDate !== new Date().toISOString().split('T')[0] && (
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
              className="text-xs text-emerald-400 hover:text-emerald-300 underline cursor-pointer"
            >
              Reset to Today
            </button>
          )}
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-sm">
            {error}
          </div>
        )}

        {/* Attendance Log Table */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl shadow-black/40">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider">
              Daily Attendance Log ({selectedDate})
            </h2>
            <span className="text-xs text-neutral-500">Auto-synced with PostgreSQL</span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-sm text-neutral-500">Loading attendance logs...</div>
          ) : attendance.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 space-y-2">
              <svg className="w-10 h-10 mx-auto text-neutral-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="font-medium text-neutral-300">No member check-ins recorded for {selectedDate}.</p>
              <p className="text-xs">Click &quot;Desk Check-in&quot; above to check in a member.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="attendance-table">
                <thead className="bg-neutral-950/50 text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="px-6 py-3.5 font-medium">Member</th>
                    <th className="px-6 py-3.5 font-medium">Time</th>
                    <th className="px-6 py-3.5 font-medium">Method</th>
                    <th className="px-6 py-3.5 font-medium">Status</th>
                    <th className="px-6 py-3.5 font-medium">Override</th>
                    <th className="px-6 py-3.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {attendance.map((att) => {
                    const timeStr = att.checkInTime.includes('T')
                      ? att.checkInTime.split('T')[1].substring(0, 8)
                      : att.checkInTime;

                    return (
                      <tr key={att.id} className="hover:bg-neutral-800/30 transition">
                        <td className="px-6 py-4">
                          <div className="font-medium text-neutral-200">
                            {att.memberFirstName || 'Member'} {att.memberLastName || ''}
                          </div>
                          <div className="text-xs text-neutral-500 font-mono">
                            {att.memberNumber || att.memberPhone}
                          </div>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-neutral-300">
                          {timeStr}
                        </td>
                        <td className="px-6 py-4">
                          <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-neutral-800 text-neutral-300 border border-neutral-700">
                            {att.method.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4">
                          {att.isVoided ? (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-rose-950/80 text-rose-400 border border-rose-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                              Voided
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold uppercase tracking-wide bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              Present
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-xs">
                          {att.wasOverride ? (
                            <span className="text-amber-400 font-medium">
                              Override ({att.overrideReason?.replace(/_/g, ' ') || 'approved'})
                            </span>
                          ) : (
                            <span className="text-neutral-500">—</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          {!att.isVoided && (
                            <button
                              onClick={() => handleOpenVoidModal(att)}
                              data-testid="void-attendance-button"
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800 text-rose-300 transition cursor-pointer"
                            >
                              Void
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </main>

      {/* Desk Check-in Modal */}
      {isCheckInModalOpen && (
        <div
          data-testid="check-in-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-white">Desk Check-in</h3>
              <button
                onClick={() => setIsCheckInModalOpen(false)}
                className="text-neutral-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {checkInError && (
              <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
                {checkInError}
              </div>
            )}

            <form onSubmit={handleSubmitCheckIn} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Select Member <span className="text-rose-400">*</span>
                </label>
                <select
                  data-testid="check-in-member-select"
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  required
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Choose Member</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName || ''} ({m.memberNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Check-in Method</label>
                <select
                  data-testid="check-in-method-select"
                  value={checkInMethod}
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setCheckInMethod(e.target.value as 'staff_manual' | 'qr_kiosk')}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="staff_manual">Staff Manual Check-in</option>
                  <option value="qr_kiosk">QR Self Kiosk</option>
                </select>
              </div>

              <div className="pt-2 border-t border-neutral-800/80 space-y-3">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="wasOverrideCheckbox"
                    data-testid="override-checkbox"
                    checked={wasOverride}
                    onChange={(e) => setWasOverride(e.target.checked)}
                    className="rounded bg-neutral-800 border-neutral-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="wasOverrideCheckbox" className="text-xs text-neutral-300 font-medium">
                    Override check-in requirement (e.g. pending pass/forgot wallet)
                  </label>
                </div>

                {wasOverride && (
                  <div>
                    <label className="block text-xs font-medium text-neutral-300 mb-1">
                      Override Reason <span className="text-rose-400">*</span>
                    </label>
                    <select
                      data-testid="override-reason-select"
                      value={overrideReason}
                      onChange={(e) => setOverrideReason(e.target.value)}
                      className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="forgot_wallet">Forgot Wallet / Card</option>
                      <option value="payment_promised_today">Payment Promised Today</option>
                      <option value="guest_pass">Guest Pass</option>
                      <option value="medical_clearance_pending">Medical Clearance Pending</option>
                      <option value="other_owner_approved">Other Owner Approved</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="pt-3 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCheckInModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-700 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={checkInSubmitting}
                  data-testid="submit-checkin-button"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition cursor-pointer disabled:opacity-50"
                >
                  {checkInSubmitting ? 'Checking In...' : 'Confirm Check-in'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Void Modal */}
      {voidTarget && (
        <div
          data-testid="void-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-white">Void Attendance Record</h3>
              <button
                onClick={() => setVoidTarget(null)}
                className="text-neutral-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-400">
              Voiding an attendance record cancels the check-in and frees the member to re-check-in today. Requires owner or manager privileges.
            </p>

            {voidError && (
              <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
                {voidError}
              </div>
            )}

            <form onSubmit={handleSubmitVoid} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Reason for Voiding <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  data-testid="void-reason-input"
                  placeholder="e.g. Accidental double check-in"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  required
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setVoidTarget(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-700 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={voidSubmitting}
                  data-testid="submit-void-button"
                  className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold text-sm transition cursor-pointer disabled:opacity-50"
                >
                  {voidSubmitting ? 'Voiding...' : 'Confirm Void'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
