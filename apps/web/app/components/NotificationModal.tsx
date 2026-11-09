'use client';

import React, { useState, useEffect } from 'react';
import {
  type Member,
  type NotificationLogItem,
  sendMemberNotification,
  fetchMemberNotifications
} from '../lib/api';
import { useToast } from './Toast';

interface NotificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  gymId: string;
  member: Member | null;
  defaultTemplate?: 'welcome_enrollment' | 'payment_receipt' | 'expiry_reminder' | 'renewal_confirmation' | 'membership_approved';
  extraContext?: {
    receiptNumber?: string;
    amountCents?: number;
    planName?: string;
  };
}

export function NotificationModal({
  isOpen,
  onClose,
  gymId,
  member,
  defaultTemplate = 'welcome_enrollment',
  extraContext
}: NotificationModalProps) {
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'send' | 'history'>('send');
  const [channel, setChannel] = useState<'whatsapp_click' | 'email'>('whatsapp_click');
  const [template, setTemplate] = useState<'welcome_enrollment' | 'payment_receipt' | 'expiry_reminder' | 'renewal_confirmation' | 'membership_approved'>(defaultTemplate);
  const [customMessage, setCustomMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // History state
  const [historyItems, setHistoryItems] = useState<NotificationLogItem[]>([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTemplate(defaultTemplate);
      setCustomMessage('');
      setActiveTab('send');
      if (member?.email) {
        setChannel('email');
      } else {
        setChannel('whatsapp_click');
      }
    }
  }, [isOpen, defaultTemplate, member]);

  useEffect(() => {
    if (isOpen && activeTab === 'history' && member && gymId) {
      loadHistory();
    }
  }, [isOpen, activeTab, member, gymId]);

  const loadHistory = async () => {
    if (!member || !gymId) return;
    setIsLoadingHistory(true);
    try {
      const res = await fetchMemberNotifications(gymId, member.id);
      setHistoryItems(res.notifications || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to load communications history');
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!member || !gymId) return;

    if (channel === 'email' && !member.email) {
      toast.error('This member does not have an email address on file.');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await sendMemberNotification(gymId, member.id, {
        channel,
        template,
        customMessage: customMessage.trim() || null,
        receiptNumber: extraContext?.receiptNumber,
        amountCents: extraContext?.amountCents,
        planName: extraContext?.planName
      });

      if (channel === 'whatsapp_click' && res.url) {
        // Open WhatsApp link in new tab
        window.open(res.url, '_blank', 'noopener,noreferrer');
        toast.success('WhatsApp link opened and communication logged.');
      } else if (channel === 'email') {
        toast.success(`Transactional email dispatched to ${member.email}.`);
      }

      onClose();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to send notification');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen || !member) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-neutral-800 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
              <span>Send Notification</span>
              <span className="font-mono text-xs px-2 py-0.5 rounded bg-neutral-800 text-emerald-400 border border-neutral-700">
                {member.memberNumber}
              </span>
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Recipient: <strong className="text-neutral-200">{member.firstName} {member.lastName || ''}</strong> • {member.phone}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-neutral-400 hover:text-white hover:bg-neutral-800 transition cursor-pointer"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Selector */}
        <div className="flex items-center gap-2 px-5 pt-3 border-b border-neutral-800 bg-neutral-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('send')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 cursor-pointer ${
              activeTab === 'send'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            Compose Message
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 text-xs font-semibold rounded-t-lg transition border-b-2 cursor-pointer ${
              activeTab === 'history'
                ? 'border-emerald-500 text-emerald-400 bg-neutral-900'
                : 'border-transparent text-neutral-400 hover:text-neutral-200'
            }`}
          >
            History & Audit
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4">
          {activeTab === 'send' ? (
            <form onSubmit={handleSend} className="space-y-4" id="notify-form">
              {/* Channel Selector */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-2">
                  Delivery Channel
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setChannel('whatsapp_click')}
                    className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer ${
                      channel === 'whatsapp_click'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 hover:border-neutral-700 bg-neutral-950/60 text-neutral-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91C2.13 13.66 2.59 15.36 3.45 16.86L2.05 22L7.3 20.62C8.75 21.41 10.38 21.83 12.04 21.83C17.5 21.83 21.95 17.38 21.95 11.92C21.95 9.27 20.92 6.78 19.05 4.91C17.18 3.03 14.69 2 12.04 2M12.05 3.67C14.25 3.67 16.31 4.53 17.87 6.09C19.42 7.65 20.28 9.72 20.28 11.92C20.28 16.46 16.58 20.15 12.04 20.15C10.56 20.15 9.11 19.76 7.85 19L7.55 18.83L4.43 19.65L5.26 16.61L5.06 16.29C4.24 14.99 3.81 13.47 3.81 11.91C3.81 7.37 7.5 3.67 12.05 3.67Z" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">WhatsApp</div>
                      <div className="text-[11px] text-neutral-400">Direct click link</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    disabled={!member.email}
                    onClick={() => setChannel('email')}
                    className={`p-3 rounded-xl border text-left transition flex items-center gap-3 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                      channel === 'email'
                        ? 'border-emerald-500 bg-emerald-500/10 text-emerald-400'
                        : 'border-neutral-800 hover:border-neutral-700 bg-neutral-950/60 text-neutral-300'
                    }`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/20 flex items-center justify-center text-emerald-400 shrink-0">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                      </svg>
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white">Resend Email</div>
                      <div className="text-[11px] text-neutral-400">
                        {member.email ? 'Transactional HTML' : 'No email address'}
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Template Selector */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                  Notification Template
                </label>
                <select
                  value={template}
                  onChange={(e) => setTemplate(e.target.value as typeof template)}
                  className="w-full px-3 py-2.5 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-white focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                >
                  <option value="welcome_enrollment">Welcome & Enrollment Credentials</option>
                  <option value="payment_receipt">Payment Receipt / Tax Invoice</option>
                  <option value="expiry_reminder">Subscription Expiry Reminder</option>
                  <option value="renewal_confirmation">Renewal Confirmation</option>
                  <option value="membership_approved">Registration Approved</option>
                </select>
              </div>

              {/* Custom Message Field */}
              <div>
                <label className="block text-xs font-semibold text-neutral-300 uppercase tracking-wider mb-1.5">
                  Custom Note / Remarks <span className="text-neutral-500 font-normal lowercase">(optional)</span>
                </label>
                <textarea
                  rows={3}
                  value={customMessage}
                  onChange={(e) => setCustomMessage(e.target.value)}
                  placeholder="e.g. Please bring clean indoor training shoes. Locker keys available at desk."
                  className="w-full px-3 py-2 rounded-xl bg-neutral-950 border border-neutral-800 text-xs text-white placeholder-neutral-600 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              {/* Info Banner */}
              <div className="p-3 rounded-xl bg-neutral-950/80 border border-neutral-800/80 text-[11px] text-neutral-400 space-y-1">
                <div className="font-semibold text-neutral-300">Automatic Telemetry Logging:</div>
                <p>
                  Every sent email and clicked WhatsApp link is automatically captured in the tenant's append-only notification ledger for dispute resolution.
                </p>
              </div>
            </form>
          ) : (
            /* History View */
            <div>
              {isLoadingHistory ? (
                <p className="text-xs text-neutral-500 text-center py-8">Loading communications history...</p>
              ) : historyItems.length === 0 ? (
                <div className="text-center py-8 border border-neutral-800/80 rounded-xl bg-neutral-950/30">
                  <p className="text-xs text-neutral-400 font-medium">No previous notifications found</p>
                  <p className="text-[11px] text-neutral-600 mt-1">Dispatched notifications will appear in this audit log.</p>
                </div>
              ) : (
                <div className="border border-neutral-800 rounded-xl overflow-hidden bg-neutral-950/60 max-h-64 overflow-y-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-neutral-900 border-b border-neutral-800 text-neutral-400 uppercase font-semibold sticky top-0">
                      <tr>
                        <th className="py-2.5 px-3">Date</th>
                        <th className="py-2.5 px-3">Channel</th>
                        <th className="py-2.5 px-3">Template</th>
                        <th className="py-2.5 px-3 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800 text-neutral-300">
                      {historyItems.map((item) => (
                        <tr key={item.id} className="hover:bg-neutral-900/40">
                          <td className="py-2.5 px-3 text-neutral-400 font-mono text-[11px]">
                            {new Date(item.sentAt).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 capitalize font-medium text-white">
                            {item.channel.replace('_', ' ')}
                          </td>
                          <td className="py-2.5 px-3 text-neutral-300 font-mono text-[11px]">
                            {item.template}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase ${
                                item.status === 'sent' || item.status === 'clicked'
                                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}
                            >
                              {item.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-neutral-800 bg-neutral-950/40 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg bg-neutral-800 text-neutral-300 hover:bg-neutral-700 transition cursor-pointer"
          >
            Cancel
          </button>
          {activeTab === 'send' && (
            <button
              type="submit"
              form="notify-form"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black transition disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-lg shadow-emerald-950/40"
            >
              {isSubmitting ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
                  Sending...
                </>
              ) : channel === 'whatsapp_click' ? (
                'Open WhatsApp'
              ) : (
                'Send Email'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
