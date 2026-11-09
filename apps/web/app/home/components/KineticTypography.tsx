'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import styles from '../home.module.css';

export function KineticTypography() {
  const containerRef = useRef<HTMLDivElement>(null);
  const layerOutlineRef = useRef<HTMLDivElement>(null);
  const layerSolidRef = useRef<HTMLDivElement>(null);
  const layerVoltRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (!containerRef.current) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top 80%',
          end: 'bottom 20%',
          scrub: 0.8
        }
      });

      // Layer 1: Outline layer moves slowly upward
      if (layerOutlineRef.current) {
        tl.to(
          layerOutlineRef.current,
          {
            yPercent: -25,
            opacity: 0.4,
            ease: 'none'
          },
          0
        );
      }

      // Layer 2: Solid text moves at medium speed
      if (layerSolidRef.current) {
        tl.to(
          layerSolidRef.current,
          {
            yPercent: -45,
            ease: 'none'
          },
          0
        );
      }

      // Layer 3: Volt accent layer moves fast and expands glow
      if (layerVoltRef.current) {
        tl.to(
          layerVoltRef.current,
          {
            yPercent: -70,
            opacity: 0.9,
            scale: 1.05,
            ease: 'none'
          },
          0
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={containerRef}
      className="relative w-full py-28 sm:py-40 bg-[#0A0A0B] overflow-hidden flex flex-col items-center justify-center border-y border-white/5"
    >
      {/* Background Volumetric Glow */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(198,255,61,0.06)_0%,transparent_70%)] pointer-events-none" />

      {/* Kinetic Typography Stack */}
      <div className="relative w-full max-w-7xl mx-auto px-4 flex flex-col items-center justify-center text-center select-none">
        
        {/* Layer 1: Outlined letters */}
        <div
          ref={layerOutlineRef}
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center text-6xl sm:text-8xl md:text-9xl lg:text-[11rem] font-black uppercase tracking-tighter ${styles.headlineFont} ${styles.textOutline} will-change-transform pointer-events-none opacity-30`}
        >
          OWN. TRACK. SCALE.
        </div>

        {/* Layer 2: Main Solid Text */}
        <div
          ref={layerSolidRef}
          className={`relative z-10 text-6xl sm:text-8xl md:text-9xl lg:text-[11rem] font-black uppercase tracking-tighter text-[#F4F1EA] ${styles.headlineFont} will-change-transform leading-none`}
        >
          OWN. TRACK. SCALE.
        </div>

        {/* Layer 3: Volt Glow Accent */}
        <div
          ref={layerVoltRef}
          aria-hidden="true"
          className={`absolute inset-0 flex items-center justify-center text-6xl sm:text-8xl md:text-9xl lg:text-[11rem] font-black uppercase tracking-tighter ${styles.headlineFont} ${styles.textOutlineVolt} will-change-transform pointer-events-none opacity-40`}
        >
          OWN. TRACK. SCALE.
        </div>
      </div>

      {/* Transform Transition to Next Section */}
      <div className="relative z-10 mt-12 text-center max-w-xl mx-auto px-6">
        <span className="text-xs uppercase font-mono tracking-widest text-[#C6FF3D] font-bold">
          The Anatomy of Platform Control
        </span>
        <p className="text-neutral-400 text-sm mt-2 leading-relaxed">
          How modular software architecture replaces fragile spreadsheets with unbreakable operational isolation.
        </p>
      </div>
    </section>
  );
}
