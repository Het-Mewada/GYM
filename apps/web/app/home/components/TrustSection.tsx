'use client';

import React from 'react';
import { TRUST_METRICS } from '../config';
import styles from '../home.module.css';

export function TrustSection() {
  return (
    <section className="relative w-full py-24 sm:py-32 bg-[#0A0A0B] border-b border-white/5">
      <div className="max-w-6xl mx-auto px-4 sm:px-6">
        
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <span className="text-[11px] uppercase font-mono tracking-widest text-[#C6FF3D] font-bold px-3 py-1 rounded-full bg-[#C6FF3D]/10 border border-[#C6FF3D]/25 inline-block mb-3">
            DATA INTEGRITY & TRUST
          </span>
          <h2 className={`text-3xl sm:text-5xl font-black uppercase text-[#F4F1EA] tracking-tight ${styles.headlineFont}`}>
            Your Business Ledger, Uncompromised
          </h2>
          <p className="text-neutral-400 text-xs sm:text-sm mt-3">
            Every architectural decision is built around data sovereignty and tenant isolation.
          </p>
        </div>

        {/* Compact Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {TRUST_METRICS.map((item, idx) => (
            <div
              key={idx}
              className={`p-6 sm:p-8 rounded-3xl border border-white/10 ${styles.glassSurface} ${styles.glassSurfaceHover}`}
            >
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-mono font-bold text-[#C6FF3D] px-2.5 py-1 rounded bg-[#C6FF3D]/10 border border-[#C6FF3D]/25">
                  0{idx + 1}
                </span>
                <span className="text-[11px] font-mono text-neutral-400">
                  {item.spec}
                </span>
              </div>
              <h3 className={`text-xl sm:text-2xl font-bold uppercase text-[#F4F1EA] mb-2 ${styles.headlineFont}`}>
                {item.title}
              </h3>
              <p className="text-neutral-300 text-sm leading-relaxed">
                {item.body}
              </p>
            </div>
          ))}
        </div>

      </div>
    </section>
  );
}
