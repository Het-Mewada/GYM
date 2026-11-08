'use client';

import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  type Member,
  type PaymentItem,
  fetchMembers,
  fetchPayments,
  recordPayment,
  refundPayment
} from '../lib/api';

export default function PaymentsPage() {
  const router = useRouter();

  const [gymId, setGymId] = useState<string>('');
  const [gymName, setGymName] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [userName, setUserName] = useState<string | null>(null);
  const [isSuperAdmin, setIsSuperAdmin] = useState<boolean>(false);

  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Modals state
  const [isCollectModalOpen, setIsCollectModalOpen] = useState<boolean>(false);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentItem | null>(null);
  const [refundTargetPayment, setRefundTargetPayment] = useState<PaymentItem | null>(null);

  // Collect Payment Form state
  const [payMemberId, setPayMemberId] = useState<string>('');
  const [paySubscriptionId, setPaySubscriptionId] = useState<string>('');
  const [payAmountInr, setPayAmountInr] = useState<string>('');
  const [payMethod, setPayMethod] = useState<'upi' | 'cash' | 'card_pos' | 'bank_transfer'>('upi');
  const [payRef, setPayRef] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [submittingPayment, setSubmittingPayment] = useState<boolean>(false);
  const [paymentFormError, setPaymentFormError] = useState<string | null>(null);

  // Refund Form state
  const [refundAmountInr, setRefundAmountInr] = useState<string>('');
  const [refundCancelSub, setRefundCancelSub] = useState<boolean>(false);
  const [refundNotes, setRefundNotes] = useState<string>('');
  const [submittingRefund, setSubmittingRefund] = useState<boolean>(false);
  const [refundFormError, setRefundFormError] = useState<string | null>(null);

  // Filter state
  const [filterMemberId, setFilterMemberId] = useState<string>('');

  const loadData = useCallback(async (activeGymId: string, token: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const [payRes, memRes] = await Promise.all([
        fetchPayments(activeGymId, { memberId: filterMemberId || undefined, limit: 100 }, token),
        fetchMembers(activeGymId, { limit: 100 }, token)
      ]);
      setPayments(payRes.payments);
      setMembers(memRes.members);
    } catch (err: any) {
      setError(err.message || 'Failed to load payments ledger');
    } finally {
      setIsLoading(false);
    }
  }, [filterMemberId]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('access_token');
      const storedGymId = localStorage.getItem('gym_id');
      const storedGymName = localStorage.getItem('gym_name');
      const storedName = localStorage.getItem('user_name');
      const adminFlag = localStorage.getItem('is_platform_admin') === 'true';

      if (token) {
        setIsAuthenticated(true);
        setIsSuperAdmin(adminFlag);
        if (storedName) setUserName(storedName);
        if (storedGymId) setGymId(storedGymId);
        if (storedGymName) setGymName(storedGymName);

        if (storedGymId) {
          loadData(storedGymId, token);
        } else {
          setIsLoading(false);
        }
      } else {
        // Client / preview mode
        setIsAuthenticated(false);
        setIsLoading(false);

        // Load preview members if available
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
              firstName: 'Kavita',
              lastName: 'Patel',
              phone: '+919881234567',
              email: 'kavita@example.com',
              gender: 'female',
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
  }, [loadData]);

  const handleLogout = () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('access_token');
      localStorage.removeItem('user_name');
      localStorage.removeItem('gym_id');
      localStorage.removeItem('gym_name');
      localStorage.removeItem('is_platform_admin');
    }
    setIsAuthenticated(false);
    router.push('/login');
  };

  const handleOpenCollectModal = () => {
    setPayMemberId(members[0]?.id || '');
    setPaySubscriptionId('');
    setPayAmountInr('');
    setPayMethod('upi');
    setPayRef('');
    setPayNotes('');
    setPaymentFormError(null);
    setIsCollectModalOpen(true);
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payMemberId) {
      setPaymentFormError('Please select a member');
      return;
    }
    const num = parseFloat(payAmountInr);
    if (isNaN(num) || num <= 0) {
      setPaymentFormError('Amount must be a positive number');
      return;
    }

    setSubmittingPayment(true);
    setPaymentFormError(null);

    try {
      const amountCents = Math.round(num * 100);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;

      if (token && gymId) {
        const res = await recordPayment(gymId, {
          memberId: payMemberId,
          subscriptionId: paySubscriptionId || null,
          amountCents,
          method: payMethod,
          externalReference: payRef || null,
          notes: payNotes || null
        }, token);

        setIsCollectModalOpen(false);
        setSelectedReceipt(res.payment);
        await loadData(gymId, token);
      } else {
        // Preview mode fallback
        const selectedMember = members.find(m => m.id === payMemberId) || members[0];
        const seq = (payments.length + 1).toString().padStart(6, '0');
        const ym = new Date().toISOString().slice(0, 7).replace('-', '');
        const inclusiveTaxCents = Math.round((amountCents * 1800) / 11800);

        const previewPayment: PaymentItem = {
          id: `pay-${Date.now()}`,
          gymId: gymId || 'local-gym',
          memberId: selectedMember?.id || 'mem-1',
          subscriptionId: paySubscriptionId || null,
          receiptNumber: `REC-${ym}-${seq}`,
          type: 'payment',
          method: payMethod,
          amountCents,
          taxCents: inclusiveTaxCents,
          currency: 'INR',
          effectiveDate: new Date().toISOString().split('T')[0],
          externalReference: payRef || null,
          notes: payNotes || null,
          recordedByUserId: 'local-user',
          createdAt: new Date().toISOString(),
          memberFirstName: selectedMember?.firstName || 'Member',
          memberLastName: selectedMember?.lastName || '',
          memberNumber: selectedMember?.memberNumber || 'MEM-00001'
        };

        setPayments(prev => [previewPayment, ...prev]);
        setIsCollectModalOpen(false);
        setSelectedReceipt(previewPayment);
      }
    } catch (err: any) {
      setPaymentFormError(err.message || 'Failed to record payment');
    } finally {
      setSubmittingPayment(false);
    }
  };

  const handleOpenRefundModal = (payment: PaymentItem) => {
    setRefundTargetPayment(payment);
    setRefundAmountInr((Math.abs(Number(payment.amountCents)) / 100).toFixed(2));
    setRefundCancelSub(Boolean(payment.subscriptionId));
    setRefundNotes('');
    setRefundFormError(null);
  };

  const handleSubmitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!refundTargetPayment) return;

    const num = parseFloat(refundAmountInr);
    if (isNaN(num) || num <= 0) {
      setRefundFormError('Refund amount must be a positive number');
      return;
    }

    setSubmittingRefund(true);
    setRefundFormError(null);

    try {
      const amountCents = Math.round(num * 100);
      const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') || undefined : undefined;

      if (token && gymId) {
        const res = await refundPayment(gymId, refundTargetPayment.id, {
          amountCents,
          cancelSubscription: refundCancelSub,
          notes: refundNotes || null
        }, token);

        setRefundTargetPayment(null);
        setSelectedReceipt(res.refund);
        await loadData(gymId, token);
      } else {
        // Preview mode refund fallback
        const previewRefund: PaymentItem = {
          id: `ref-${Date.now()}`,
          gymId: gymId || 'local-gym',
          memberId: refundTargetPayment.memberId,
          subscriptionId: refundTargetPayment.subscriptionId,
          receiptNumber: `${refundTargetPayment.receiptNumber}-REF`,
          type: 'refund',
          method: refundTargetPayment.method,
          amountCents: -amountCents,
          taxCents: 0,
          currency: 'INR',
          effectiveDate: new Date().toISOString().split('T')[0],
          externalReference: null,
          notes: refundNotes || 'Partial refund',
          recordedByUserId: 'local-user',
          createdAt: new Date().toISOString(),
          memberFirstName: refundTargetPayment.memberFirstName,
          memberLastName: refundTargetPayment.memberLastName,
          memberNumber: refundTargetPayment.memberNumber
        };

        setPayments(prev => [previewRefund, ...prev]);
        setRefundTargetPayment(null);
        setSelectedReceipt(previewRefund);
      }
    } catch (err: any) {
      setRefundFormError(err.message || 'Failed to issue refund');
    } finally {
      setSubmittingRefund(false);
    }
  };

  // Metrics computation
  const totalCollectedCents = payments
    .filter(p => p.type === 'payment' || p.type === 'opening_balance')
    .reduce((sum, p) => sum + Number(p.amountCents), 0);

  const totalRefundedCents = payments
    .filter(p => p.type === 'refund' || p.type === 'reversal')
    .reduce((sum, p) => sum + Math.abs(Number(p.amountCents)), 0);

  const netRevenueCents = totalCollectedCents - totalRefundedCents;

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans selection:bg-emerald-500 selection:text-black">
      {/* Top Header */}
      <header className="border-b border-neutral-800 bg-neutral-900/60 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-6">
            <Link href="/" className="flex items-center space-x-2">
              <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
                GYM OS
              </span>
            </Link>

            {gymName && (
              <div className="flex items-center space-x-2 text-sm text-neutral-400">
                <span className="text-neutral-600">/</span>
                <span className="text-xs text-neutral-300 font-medium px-2 py-1 bg-neutral-800 rounded-md border border-neutral-700">
                  {gymName}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-6">
            <nav className="flex items-center space-x-4 text-sm font-medium">
              <Link href="/" className="text-neutral-400 hover:text-white transition">
                Overview
              </Link>
              <Link href="/members" className="text-neutral-400 hover:text-white transition">
                Members
              </Link>
              <Link href="/plans" className="text-neutral-400 hover:text-white transition">
                Plans
              </Link>
              <Link href="/payments" className="text-emerald-400 font-semibold border-b-2 border-emerald-400 pb-1">
                Payments
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

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Title and Actions */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Payments & Invoicing</h1>
            <p className="text-sm text-neutral-400 mt-1">
              Append-only financial transaction ledger, GST tax receipts, and dues accounting.
            </p>
          </div>
          <button
            onClick={handleOpenCollectModal}
            data-testid="collect-payment-button"
            className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition shadow-lg shadow-emerald-950/50 cursor-pointer"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Collect Payment
          </button>
        </div>

        {/* Financial Metrics Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Total Collected</span>
            <div className="text-2xl font-bold text-emerald-400 mt-2">
              ₹{(totalCollectedCents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Gross inward receipts</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Total Refunded</span>
            <div className="text-2xl font-bold text-rose-400 mt-2">
              ₹{(totalRefundedCents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Reversals & refunds issued</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Net Revenue</span>
            <div className="text-2xl font-bold text-white mt-2">
              ₹{(netRevenueCents / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Net of GST and refunds</p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-5">
            <span className="text-xs uppercase tracking-wider text-neutral-400 font-medium">Ledger Entries</span>
            <div className="text-2xl font-bold text-neutral-200 mt-2">
              {payments.length}
            </div>
            <p className="text-xs text-neutral-500 mt-1">Immutable transactions recorded</p>
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-neutral-900/60 border border-neutral-800 rounded-2xl p-4 flex flex-col sm:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <label className="text-xs font-medium text-neutral-400">Filter by Member:</label>
            <select
              value={filterMemberId}
              onChange={(e) => setFilterMemberId(e.target.value)}
              className="bg-neutral-800 border border-neutral-700 rounded-lg px-3 py-1.5 text-xs text-neutral-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
            >
              <option value="">All Members</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.firstName} {m.lastName || ''} ({m.memberNumber})
                </option>
              ))}
            </select>
          </div>

          {filterMemberId && (
            <button
              onClick={() => setFilterMemberId('')}
              className="text-xs text-neutral-400 hover:text-white underline cursor-pointer"
            >
              Clear filter
            </button>
          )}
        </div>

        {/* Ledger Table */}
        {error && (
          <div className="p-4 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-sm">
            {error}
          </div>
        )}

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl overflow-hidden shadow-xl shadow-black/40">
          <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-neutral-200 uppercase tracking-wider">
              Immutable Payment Ledger
            </h2>
            <span className="text-xs text-neutral-500">Append-only • Non-destructive</span>
          </div>

          {isLoading ? (
            <div className="p-12 text-center text-sm text-neutral-500">Loading ledger entries...</div>
          ) : payments.length === 0 ? (
            <div className="p-12 text-center text-neutral-500 space-y-2">
              <svg className="w-10 h-10 mx-auto text-neutral-600 mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="font-medium text-neutral-300">No payment transactions recorded yet.</p>
              <p className="text-xs">Click &quot;Collect Payment&quot; above to record a new receipt.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" data-testid="payments-table">
                <thead className="bg-neutral-950/50 text-xs uppercase tracking-wider text-neutral-400 border-b border-neutral-800">
                  <tr>
                    <th className="px-6 py-3.5 font-medium">Receipt #</th>
                    <th className="px-6 py-3.5 font-medium">Member</th>
                    <th className="px-6 py-3.5 font-medium">Type</th>
                    <th className="px-6 py-3.5 font-medium">Method</th>
                    <th className="px-6 py-3.5 font-medium">Amount</th>
                    <th className="px-6 py-3.5 font-medium">GST (18%)</th>
                    <th className="px-6 py-3.5 font-medium">Date</th>
                    <th className="px-6 py-3.5 font-medium text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60">
                  {payments.map((p) => {
                    const isRefund = p.type === 'refund' || p.type === 'reversal';
                    const amountVal = Math.abs(Number(p.amountCents)) / 100;
                    const taxVal = Number(p.taxCents) / 100;

                    return (
                      <tr key={p.id} className="hover:bg-neutral-800/30 transition">
                        <td className="px-6 py-4 font-mono text-xs font-semibold text-emerald-400">
                          {p.receiptNumber}
                        </td>
                        <td className="px-6 py-4">
                          <div className="font-medium text-neutral-200">
                            {p.memberFirstName || 'Member'} {p.memberLastName || ''}
                          </div>
                          <div className="text-xs text-neutral-500 font-mono">
                            {p.memberNumber || p.memberPhone}
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide ${
                              isRefund
                                ? 'bg-rose-950/70 text-rose-400 border border-rose-800/80'
                                : 'bg-emerald-950/70 text-emerald-400 border border-emerald-800/80'
                            }`}
                          >
                            {p.type.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-xs uppercase tracking-wide text-neutral-300">
                          <span className="px-2 py-1 bg-neutral-800 rounded font-mono">
                            {p.method.toUpperCase()}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono font-bold text-sm">
                          <span className={isRefund ? 'text-rose-400' : 'text-emerald-400'}>
                            {isRefund ? '-' : '+'}₹{amountVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                          </span>
                        </td>
                        <td className="px-6 py-4 font-mono text-xs text-neutral-400">
                          ₹{taxVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-6 py-4 text-xs text-neutral-400">
                          {p.effectiveDate}
                        </td>
                        <td className="px-6 py-4 text-right space-x-2">
                          <button
                            onClick={() => setSelectedReceipt(p)}
                            data-testid="view-receipt-button"
                            className="px-2.5 py-1 text-xs font-medium rounded-lg bg-neutral-800 hover:bg-neutral-700 text-neutral-300 transition cursor-pointer"
                          >
                            Receipt
                          </button>
                          {!isRefund && (
                            <button
                              onClick={() => handleOpenRefundModal(p)}
                              data-testid="refund-payment-button"
                              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800 text-rose-300 transition cursor-pointer"
                            >
                              Refund
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

      {/* Collect Payment Modal */}
      {isCollectModalOpen && (
        <div
          data-testid="collect-payment-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-white">Record Payment</h3>
              <button
                onClick={() => setIsCollectModalOpen(false)}
                className="text-neutral-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            {paymentFormError && (
              <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
                {paymentFormError}
              </div>
            )}

            <form onSubmit={handleSubmitPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Member <span className="text-rose-400">*</span>
                </label>
                <select
                  data-testid="payment-member-select"
                  value={payMemberId}
                  onChange={(e) => setPayMemberId(e.target.value)}
                  required
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="">Select Member</option>
                  {members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.firstName} {m.lastName || ''} ({m.memberNumber})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Amount (INR ₹) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  data-testid="payment-amount-input"
                  placeholder="e.g. 5000.00"
                  value={payAmountInr}
                  onChange={(e) => setPayAmountInr(e.target.value)}
                  required
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Payment Method <span className="text-rose-400">*</span>
                </label>
                <select
                  data-testid="payment-method-select"
                  value={payMethod}
                  onChange={(e: any) => setPayMethod(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  <option value="upi">UPI (GPay / PhonePe / Paytm)</option>
                  <option value="cash">Cash</option>
                  <option value="card_pos">Card POS</option>
                  <option value="bank_transfer">Bank Transfer / NEFT / IMPS</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  External Reference / Transaction ID
                </label>
                <input
                  type="text"
                  data-testid="payment-ref-input"
                  placeholder="e.g. UPI/3284918239/HDFC"
                  value={payRef}
                  onChange={(e) => setPayRef(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Notes</label>
                <input
                  type="text"
                  data-testid="payment-notes-input"
                  placeholder="e.g. Full annual membership payment"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsCollectModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-neutral-700 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingPayment}
                  data-testid="save-payment-button"
                  className="px-5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-semibold text-sm transition cursor-pointer disabled:opacity-50"
                >
                  {submittingPayment ? 'Recording...' : 'Record Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Refund Modal */}
      {refundTargetPayment && (
        <div
          data-testid="refund-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-md w-full p-6 shadow-2xl relative space-y-5">
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-lg font-bold text-white">Issue Refund</h3>
              <button
                onClick={() => setRefundTargetPayment(null)}
                className="text-neutral-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="p-3 bg-neutral-950 rounded-xl border border-neutral-800 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-neutral-400">Original Receipt:</span>
                <span className="font-mono text-emerald-400 font-bold">{refundTargetPayment.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-400">Original Amount:</span>
                <span className="font-mono font-bold text-neutral-200">
                  ₹{(Number(refundTargetPayment.amountCents) / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {refundFormError && (
              <div className="p-3 rounded-lg bg-rose-950/70 border border-rose-800 text-rose-300 text-xs">
                {refundFormError}
              </div>
            )}

            <form onSubmit={handleSubmitRefund} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">
                  Refund Amount (INR ₹) <span className="text-rose-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  data-testid="refund-amount-input"
                  value={refundAmountInr}
                  onChange={(e) => setRefundAmountInr(e.target.value)}
                  required
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              {refundTargetPayment.subscriptionId && (
                <div className="flex items-start gap-2 pt-1">
                  <input
                    type="checkbox"
                    id="cancelSub"
                    data-testid="cancel-subscription-checkbox"
                    checked={refundCancelSub}
                    onChange={(e) => setRefundCancelSub(e.target.checked)}
                    className="mt-1 rounded bg-neutral-800 border-neutral-700 text-emerald-500 focus:ring-emerald-500"
                  />
                  <label htmlFor="cancelSub" className="text-xs text-neutral-300">
                    Cancel linked active subscription to satisfy ledger refund semantics
                  </label>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Reason / Notes</label>
                <input
                  type="text"
                  data-testid="refund-notes-input"
                  placeholder="e.g. Member relocated"
                  value={refundNotes}
                  onChange={(e) => setRefundNotes(e.target.value)}
                  className="w-full bg-neutral-800 border border-neutral-700 rounded-xl px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-2 flex justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setRefundTargetPayment(null)}
                  className="px-4 py-2 rounded-xl border border-neutral-700 text-sm font-medium text-neutral-300 hover:bg-neutral-800 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submittingRefund}
                  data-testid="submit-refund-button"
                  className="px-5 py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-semibold text-sm transition cursor-pointer disabled:opacity-50"
                >
                  {submittingRefund ? 'Processing...' : 'Confirm Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tax Receipt Modal */}
      {selectedReceipt && (
        <div
          data-testid="receipt-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 overflow-y-auto"
        >
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl max-w-lg w-full p-8 shadow-2xl relative space-y-6">
            <div className="flex items-center justify-between pb-4 border-b border-neutral-800">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight">
                  {selectedReceipt.type === 'refund' ? 'REFUND VOUCHER' : 'TAX RECEIPT'}
                </h3>
                <p className="text-xs font-mono text-emerald-400 mt-0.5">
                  {selectedReceipt.receiptNumber}
                </p>
              </div>
              <button
                onClick={() => setSelectedReceipt(null)}
                className="text-neutral-400 hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <span className="text-neutral-500 block">GYM / ISSUER</span>
                <span className="font-semibold text-neutral-200 block text-sm">{gymName || 'Gym'}</span>
                <span className="text-neutral-400 block">Tax Rate: 18% Inclusive GST</span>
              </div>
              <div className="text-right">
                <span className="text-neutral-500 block">DATE OF ISSUE</span>
                <span className="font-mono text-neutral-200 block">{selectedReceipt.effectiveDate}</span>
                <span className="text-neutral-400 block font-mono text-[10px]">
                  {selectedReceipt.createdAt.substring(0, 19).replace('T', ' ')} UTC
                </span>
              </div>
            </div>

            <div className="p-4 bg-neutral-950 rounded-xl border border-neutral-800 space-y-3">
              <div className="flex justify-between text-xs">
                <span className="text-neutral-400">Payment Mode:</span>
                <span className="font-mono uppercase font-semibold text-neutral-200">{selectedReceipt.method}</span>
              </div>
              {selectedReceipt.externalReference && (
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Reference:</span>
                  <span className="font-mono text-neutral-300">{selectedReceipt.externalReference}</span>
                </div>
              )}
              {selectedReceipt.notes && (
                <div className="flex justify-between text-xs">
                  <span className="text-neutral-400">Notes:</span>
                  <span className="text-neutral-300">{selectedReceipt.notes}</span>
                </div>
              )}
            </div>

            <div className="border-t border-neutral-800 pt-4 space-y-2 text-sm">
              <div className="flex justify-between text-neutral-400 text-xs">
                <span>Inclusive GST (18%)</span>
                <span className="font-mono">
                  ₹{(Number(selectedReceipt.taxCents) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
              <div className="flex justify-between text-base font-bold text-white pt-2 border-t border-neutral-800/60">
                <span>Total Amount</span>
                <span className={`font-mono ${selectedReceipt.type === 'refund' ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ₹{(Math.abs(Number(selectedReceipt.amountCents)) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            <div className="pt-2 flex justify-end gap-3">
              <button
                onClick={() => setSelectedReceipt(null)}
                className="px-5 py-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white font-medium text-xs transition cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
