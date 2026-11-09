'use client';

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { PhoneInput } from '../../components/PhoneInput';
import { fetchPublicGymInfo, submitPublicRegistration, type PublicGymInfo } from '../../lib/api';

export default function PublicRegistrationPage() {
  const params = useParams();
  const slug = (params?.slug as string) || '';

  const [gymInfo, setGymInfo] = useState<PublicGymInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form State
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'other' | 'unspecified'>('unspecified');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [emergencyContactName, setEmergencyContactName] = useState('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState('');
  const [notes, setNotes] = useState('');

  // Submission State
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  useEffect(() => {
    if (!slug) return;
    setLoading(true);
    setLoadError(null);

    fetchPublicGymInfo(slug)
      .then((info) => {
        setGymInfo(info);
      })
      .catch((err: unknown) => {
        setLoadError((err as Error).message || 'Unable to load gym details. Please check the QR code or link.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, [slug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    if (!firstName.trim()) {
      setSubmitError('First name is required.');
      return;
    }

    if (!phone || phone.trim().length < 8) {
      setSubmitError('Please enter a valid 10-digit phone number with country code.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await submitPublicRegistration(slug, {
        firstName: firstName.trim(),
        lastName: lastName.trim() || null,
        phone: phone.trim(),
        email: email.trim() || null,
        gender,
        dateOfBirth: dateOfBirth || null,
        emergencyContactName: emergencyContactName.trim() || null,
        emergencyContactPhone: emergencyContactPhone.trim() || null,
        notes: notes.trim() || null
      });

      setSubmitted(true);
      setSuccessMessage(res.message);
    } catch (err: unknown) {
      setSubmitError((err as Error).message || 'Failed to submit registration request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFirstName('');
    setLastName('');
    setPhone('');
    setEmail('');
    setGender('unspecified');
    setDateOfBirth('');
    setEmergencyContactName('');
    setEmergencyContactPhone('');
    setNotes('');
    setSubmitted(false);
    setSubmitError(null);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white">
        <div className="h-10 w-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-neutral-400 text-sm">Loading gym registration portal...</p>
      </div>
    );
  }

  if (loadError || !gymInfo) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center shadow-2xl">
          <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">Gym Not Found</h1>
          <p className="text-sm text-neutral-400 mb-6">
            {loadError || 'The gym link or QR code you followed appears to be invalid or no longer active.'}
          </p>
          <a
            href="/login"
            className="inline-block px-5 py-2.5 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
          >
            Go to GymOS
          </a>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white">
        <div className="max-w-md w-full bg-neutral-900 border border-emerald-500/30 rounded-2xl p-8 text-center shadow-2xl animate-in zoom-in-95 duration-200">
          <div className="w-20 h-20 rounded-full bg-emerald-500/20 border border-emerald-500/40 text-emerald-400 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/20">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <div className="text-xs uppercase tracking-widest text-emerald-400 font-bold mb-1">
            Request Received
          </div>
          <h1 className="text-2xl font-extrabold text-white mb-2">{gymInfo.name}</h1>
          <p className="text-sm text-neutral-300 leading-relaxed mb-6">
            {successMessage ||
              'Your registration details have been submitted to the front desk. An owner or manager will approve your membership shortly.'}
          </p>

          <div className="bg-neutral-950 border border-neutral-800 rounded-xl p-4 text-xs text-neutral-400 mb-6 text-left space-y-1.5">
            <div><span className="text-neutral-500">Applicant:</span> <strong className="text-white">{firstName} {lastName}</strong></div>
            <div><span className="text-neutral-500">Phone:</span> <strong className="text-white font-mono">{phone}</strong></div>
            {email && <div><span className="text-neutral-500">Email:</span> <strong className="text-white">{email}</strong></div>}
            <div><span className="text-neutral-500">Status:</span> <strong className="text-amber-400">Pending Review</strong></div>
          </div>

          <button
            onClick={handleReset}
            className="w-full py-3 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-white text-xs font-semibold transition"
          >
            Submit Another Registration
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white flex flex-col justify-between p-4 sm:p-6 md:p-8">
      <div className="max-w-xl mx-auto w-full my-auto">
        {/* Header Branding */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-semibold mb-3">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            Walk-In Self-Registration
          </div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight">{gymInfo.name}</h1>
          <p className="text-neutral-400 text-xs sm:text-sm mt-1.5 max-w-md mx-auto">
            Please fill in your details below to request membership enrollment.
          </p>
        </div>

        {/* Main Form Card */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {submitError && (
            <div className="mb-6 rounded-xl bg-rose-500/10 border border-rose-500/30 p-4 text-xs text-rose-400 flex items-start gap-3">
              <svg className="w-5 h-5 shrink-0 text-rose-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <div>
                <strong className="block font-semibold">Submission Failed</strong>
                {submitError}
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name Fields */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  First Name <span className="text-emerald-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  maxLength={50}
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="e.g. Het"
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Last Name <span className="text-neutral-500 text-[11px]">(Optional)</span>
                </label>
                <input
                  type="text"
                  maxLength={50}
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="e.g. Mewada"
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            {/* Phone Input (Exact 10 digits + country code picker) */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Phone Number <span className="text-emerald-400">*</span>
              </label>
              <PhoneInput
                value={phone}
                onChange={(fullPhone) => setPhone(fullPhone)}
                countryCode="+91"
                placeholder="9876543210"
                required
              />
            </div>

            {/* Email Address */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Email Address <span className="text-neutral-500 text-[11px]">(Optional)</span>
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. member@example.com"
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>

            {/* Gender and Date of Birth */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">Gender</label>
                <select
                  value={gender}
                  onChange={(e) => setGender(e.target.value as 'male' | 'female' | 'other' | 'unspecified')}
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                >
                  <option value="unspecified">Select Gender</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Date of Birth <span className="text-neutral-500 text-[11px]">(Optional)</span>
                </label>
                <input
                  type="date"
                  value={dateOfBirth}
                  onChange={(e) => setDateOfBirth(e.target.value)}
                  className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 text-sm text-white focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                />
              </div>
            </div>

            {/* Emergency Contact */}
            <div className="pt-2 border-t border-neutral-800/80">
              <span className="block text-xs font-semibold text-neutral-400 mb-3 uppercase tracking-wider">
                Emergency Contact (Optional)
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Contact Name</label>
                  <input
                    type="text"
                    maxLength={100}
                    value={emergencyContactName}
                    onChange={(e) => setEmergencyContactName(e.target.value)}
                    placeholder="Parent / Spouse / Friend"
                    className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">Contact Phone</label>
                  <PhoneInput
                    value={emergencyContactPhone}
                    onChange={(fullPhone) => setEmergencyContactPhone(fullPhone)}
                    countryCode="+91"
                    placeholder="9876543210"
                  />
                </div>
              </div>
            </div>

            {/* Notes / Fitness Goals */}
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Health Notes or Fitness Goals <span className="text-neutral-500 text-[11px]">(Optional)</span>
              </label>
              <textarea
                rows={2}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Any injuries, medical conditions, or specific training goals..."
                className="w-full rounded-xl bg-neutral-950 border border-neutral-800 px-3.5 py-2.5 text-sm text-white placeholder-neutral-600 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 transition"
              />
            </div>

            {/* Submit Button */}
            <div className="pt-4">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm tracking-wide shadow-lg shadow-emerald-900/40 hover:shadow-emerald-900/60 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {submitting ? (
                  <>
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Submitting Registration...
                  </>
                ) : (
                  <>
                    <span>Submit Registration Request</span>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-[11px] text-neutral-600 mt-6">
          Powered by <strong className="text-neutral-400">GymOS</strong> • High-performance Multi-Tenant Gym Architecture
        </p>
      </div>
    </div>
  );
}
