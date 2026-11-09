'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { BRAND } from '../config';
import styles from '../home.module.css';

export function CtaFooterSection() {
  const [formData, setFormData] = useState({
    name: '',
    gymName: '',
    branches: '1',
    phoneOrEmail: ''
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  const validate = () => {
    const newErrors: Record<string, string> = {};
    if (!formData.name.trim()) newErrors.name = 'Full name is required';
    if (!formData.gymName.trim()) newErrors.gymName = 'Gym/Brand name is required';
    if (!formData.phoneOrEmail.trim()) {
      newErrors.phoneOrEmail = 'Phone number or email is required';
    } else {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const phoneDigits = formData.phoneOrEmail.replace(/\D/g, '');
      if (!emailRegex.test(formData.phoneOrEmail) && phoneDigits.length < 10) {
        newErrors.phoneOrEmail = 'Enter a valid email address or 10-digit phone number';
      }
    }
    return newErrors;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validationErrors = validate();
    if (Object.keys(validationErrors).length > 0) {
      setErrors(validationErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    // Stubbed UI-only submission with 800ms simulated network delay
    setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
    }, 800);
  };

  return (
    <section id="demo" className="relative w-full bg-[#0A0A0B] overflow-hidden">
      {/* Volumetric glow accent */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[radial-gradient(ellipse_at_top,rgba(198,255,61,0.08)_0%,transparent_70%)] pointer-events-none" />

      {/* Main CTA Section */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-24 pb-20">
        <div className="text-center mb-12">
          <span className="text-[11px] uppercase font-mono tracking-widest text-[#C6FF3D] font-bold px-3 py-1 rounded-full bg-[#C6FF3D]/10 border border-[#C6FF3D]/25 inline-block mb-4">
            TAKE OPERATIONAL CONTROL
          </span>
          <h2 className={`text-4xl sm:text-6xl md:text-7xl font-black uppercase text-[#F4F1EA] tracking-tight leading-tight mb-4 ${styles.headlineFont}`}>
            Run Every Branch Under One Command
          </h2>
          <p className="text-neutral-400 text-sm sm:text-base max-w-xl mx-auto">
            Book an interactive architectural walkthrough with our product engineers. See multi-tenant member synchronization and front-desk workflows live.
          </p>
        </div>

        {/* Demo Request Form Box */}
        <div className={`p-8 sm:p-12 rounded-3xl border border-white/10 ${styles.glassSurface} shadow-2xl backdrop-blur-2xl`}>
          {submitted ? (
            <div className="py-8 text-center space-y-4">
              <div className="w-14 h-14 rounded-full bg-[#C6FF3D]/20 border border-[#C6FF3D]/40 text-[#C6FF3D] flex items-center justify-center mx-auto text-2xl">
                ✓
              </div>
              <h3 className={`text-2xl sm:text-3xl font-extrabold uppercase text-[#F4F1EA] ${styles.headlineFont}`}>
                Demo Request Received
              </h3>
              <p className="text-neutral-300 text-sm max-w-md mx-auto">
                Thank you, <span className="text-white font-semibold">{formData.name}</span>. A senior implementation architect will contact you within 24 hours to schedule your live multi-branch demo for <span className="text-white font-semibold">{formData.gymName}</span>.
              </p>
              <button
                type="button"
                onClick={() => {
                  setSubmitted(false);
                  setFormData({ name: '', gymName: '', branches: '1', phoneOrEmail: '' });
                }}
                className="mt-4 px-6 py-2 rounded-full text-xs font-mono uppercase text-neutral-400 hover:text-white border border-white/10 hover:border-white/30 transition"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-mono uppercase text-neutral-300 tracking-wider mb-2">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="e.g. Alex Mercer"
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-[#C6FF3D] transition text-sm font-sans"
                  />
                  {errors.name && <p className="text-xs text-rose-400 mt-1 font-mono">{errors.name}</p>}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-neutral-300 tracking-wider mb-2">
                    Gym / Brand Name *
                  </label>
                  <input
                    type="text"
                    value={formData.gymName}
                    onChange={(e) => setFormData({ ...formData, gymName: e.target.value })}
                    placeholder="e.g. Apex Performance Labs"
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-[#C6FF3D] transition text-sm font-sans"
                  />
                  {errors.gymName && <p className="text-xs text-rose-400 mt-1 font-mono">{errors.gymName}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-mono uppercase text-neutral-300 tracking-wider mb-2">
                    Number of Branches
                  </label>
                  <select
                    value={formData.branches}
                    onChange={(e) => setFormData({ ...formData, branches: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl bg-[#0A0A0B] border border-white/10 text-white focus:outline-none focus:border-[#C6FF3D] transition text-sm font-sans cursor-pointer"
                  >
                    <option value="1">1 Facility (Single Box)</option>
                    <option value="2-5">2 to 5 Locations</option>
                    <option value="6-15">6 to 15 Locations</option>
                    <option value="16+">16+ Regional Multi-Branch Chain</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-neutral-300 tracking-wider mb-2">
                    Email or Phone *
                  </label>
                  <input
                    type="text"
                    value={formData.phoneOrEmail}
                    onChange={(e) => setFormData({ ...formData, phoneOrEmail: e.target.value })}
                    placeholder="alex@apexperformance.com or +1..."
                    className="w-full px-4 py-3 rounded-xl bg-black/50 border border-white/10 text-white placeholder-neutral-600 focus:outline-none focus:border-[#C6FF3D] transition text-sm font-sans"
                  />
                  {errors.phoneOrEmail && <p className="text-xs text-rose-400 mt-1 font-mono">{errors.phoneOrEmail}</p>}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className={`w-full py-4 rounded-xl text-sm uppercase tracking-wider font-extrabold flex items-center justify-center gap-2 shadow-[0_0_25px_rgba(198,255,61,0.3)] ${styles.voltButton} ${
                  loading ? 'opacity-70 cursor-wait' : 'cursor-pointer'
                }`}
              >
                {loading ? 'Submitting Request...' : 'Schedule Platform Demo'}
              </button>

              <p className="text-[11px] font-mono text-center text-neutral-500 pt-1">
                Zero commitment • Instant confidential response • No card required
              </p>
            </form>
          )}
        </div>
      </div>

      {/* Global Footer */}
      <footer className="border-t border-white/5 py-12 px-6 max-w-7xl mx-auto">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-lg bg-[#C6FF3D] flex items-center justify-center font-black text-black text-xs">
              GYM
            </div>
            <span className={`text-lg font-bold text-[#F4F1EA] ${styles.headlineFont}`}>
              {BRAND}
            </span>
            <span className="text-neutral-500 text-xs font-mono">
              © {new Date().getFullYear()} GymOS Technologies Inc. All rights reserved.
            </span>
          </div>

          <div className="flex items-center gap-6 text-xs text-neutral-400 font-mono">
            <Link href="/members" className="hover:text-white transition">
              Members Directory
            </Link>
            <Link href="/login" className="hover:text-white transition">
              Staff Portal
            </Link>
            <span className="text-neutral-600">|</span>
            <span className="text-neutral-500 cursor-default">Privacy Policy</span>
            <span className="text-neutral-500 cursor-default">Security Isolation</span>
          </div>
        </div>
      </footer>
    </section>
  );
}
