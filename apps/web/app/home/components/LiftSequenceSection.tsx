'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SOCIAL_PROOF_PLACEHOLDERS } from '../config';
import styles from '../home.module.css';

// Procedural 3D barbell lift scene
const Barbell3DScene = dynamic(
  () => import('./Barbell3DScene').then((mod) => mod.Barbell3DScene),
  { ssr: false }
);

export function LiftSequenceSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinWrapperRef = useRef<HTMLDivElement>(null);
  const [liftProgress, setLiftProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setLiftProgress(1);
      return;
    }

    const ctx = gsap.context(() => {
      if (!containerRef.current || !pinWrapperRef.current) return;

      ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        end: '+=250%',
        pin: pinWrapperRef.current,
        scrub: 0.5,
        anticipatePin: 1,
        onUpdate: (self) => {
          setLiftProgress(self.progress);
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative w-full bg-[#0A0A0B] border-b border-white/5 overflow-hidden"
    >
      <div
        ref={pinWrapperRef}
        className="relative w-full h-screen min-h-[700px] flex flex-col justify-between items-center py-12 px-6 overflow-hidden"
      >
        {/* Dynamic Animated Gradient and Lighting Shift driven by scroll */}
        <div
          className="absolute inset-0 pointer-events-none transition-all duration-300"
          style={{
            background: `radial-gradient(circle at 50% ${70 - liftProgress * 40}%, rgba(198,255,61,${0.05 + liftProgress * 0.12}) 0%, transparent 70%)`
          }}
        />

        {/* Section Header */}
        <div className="relative z-20 text-center max-w-2xl mx-auto">
          <span className="text-[11px] uppercase font-mono tracking-widest text-[#C6FF3D] font-bold px-3 py-1 rounded-full bg-[#C6FF3D]/10 border border-[#C6FF3D]/25 inline-block mb-3">
            PRECISION TELEMETRY
          </span>
          <h2 className={`text-4xl sm:text-6xl font-black uppercase text-[#F4F1EA] tracking-tight ${styles.headlineFont}`}>
            Every Rep. Every Renewal. Counted.
          </h2>
          <p className="text-neutral-400 text-xs sm:text-sm mt-2 max-w-lg mx-auto">
            Real-time attendance history, continuous membership expiry tracking, and automated renewal triggers across all facility gates.
          </p>
        </div>

        {/* 3D Barbell Procedural Deadlift Lift Canvas */}
        <div className="absolute inset-0 w-full h-full z-10 flex items-center justify-center pointer-events-none">
          <div className="w-full max-w-5xl h-full max-h-[700px]">
            <Barbell3DScene
              explodeProgress={0}
              liftProgress={liftProgress}
              mode="lift"
            />
          </div>
        </div>

        {/* 3 Count-Up Number Placeholders from Config */}
        <div className="relative z-20 w-full max-w-4xl mx-auto grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-5 rounded-2xl border border-white/10 bg-[#111114]/80 backdrop-blur-xl text-center shadow-xl">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block mb-1">
              Active Member Profiles
            </span>
            <div className="text-2xl sm:text-3xl font-black text-[#C6FF3D] font-mono">
              {SOCIAL_PROOF_PLACEHOLDERS.activeBranches}
            </div>
            <span className="text-[11px] text-neutral-500 mt-1 block">Live across network</span>
          </div>

          <div className="p-5 rounded-2xl border border-white/10 bg-[#111114]/80 backdrop-blur-xl text-center shadow-xl">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block mb-1">
              Daily Check-Ins Logged
            </span>
            <div className="text-2xl sm:text-3xl font-black text-[#F4F1EA] font-mono">
              {SOCIAL_PROOF_PLACEHOLDERS.dailyCheckins}
            </div>
            <span className="text-[11px] text-neutral-500 mt-1 block">Sub-second gate verification</span>
          </div>

          <div className="p-5 rounded-2xl border border-white/10 bg-[#111114]/80 backdrop-blur-xl text-center shadow-xl">
            <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-400 block mb-1">
              Renewal Conversion Lift
            </span>
            <div className="text-2xl sm:text-3xl font-black text-[#C6FF3D] font-mono">
              {SOCIAL_PROOF_PLACEHOLDERS.retentionLift}
            </div>
            <span className="text-[11px] text-neutral-500 mt-1 block">Zero spreadsheet leaks</span>
          </div>
        </div>

        {/* Lift Height Tracker */}
        <div className="relative z-20 flex items-center gap-2 text-xs font-mono text-neutral-400">
          <span>FLOOR</span>
          <div className="w-32 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#C6FF3D] transition-all duration-75"
              style={{ width: `${Math.round(liftProgress * 100)}%` }}
            />
          </div>
          <span className="text-[#C6FF3D]">LOCKOUT ({Math.round(liftProgress * 100)}%)</span>
        </div>
      </div>
    </section>
  );
}
