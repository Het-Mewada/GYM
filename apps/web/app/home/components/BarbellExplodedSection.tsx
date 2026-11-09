'use client';

import React, { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { PLATFORM_COMPONENTS } from '../config';
import styles from '../home.module.css';

// Lazy-load the Three.js 3D chunk with ssr: false for instant LCP
const Barbell3DScene = dynamic(
  () => import('./Barbell3DScene').then((mod) => mod.Barbell3DScene),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-full flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-2 border-[#C6FF3D]/20 border-t-[#C6FF3D] animate-spin" />
      </div>
    )
  }
);

export function BarbellExplodedSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinWrapperRef = useRef<HTMLDivElement>(null);
  const [explodeProgress, setExplodeProgress] = useState(0);
  const [activeComponent, setActiveComponent] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) {
      setExplodeProgress(0.5);
      return;
    }

    const ctx = gsap.context(() => {
      if (!containerRef.current || !pinWrapperRef.current) return;

      ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        end: '+=280%',
        pin: pinWrapperRef.current,
        scrub: 0.6,
        anticipatePin: 1,
        onUpdate: (self) => {
          const progress = self.progress;
          setExplodeProgress(progress);

          // Update active component card
          const compIdx = Math.min(3, Math.floor(progress * 4));
          setActiveComponent(compIdx);
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      id="platform"
      ref={containerRef}
      className="relative w-full bg-[#0A0A0B] border-b border-white/5"
    >
      <div
        ref={pinWrapperRef}
        className="relative w-full h-screen min-h-[680px] flex flex-col items-center justify-between py-10 px-6 overflow-hidden"
      >
        {/* Top Header */}
        <div className="relative z-20 text-center max-w-3xl mx-auto pt-2">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 mb-2.5">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D]" />
            <span className="text-[11px] uppercase font-mono tracking-widest text-[#C6FF3D] font-bold">
              PLATFORM ARCHITECTURE
            </span>
          </div>
          <h2
            className={`text-3xl sm:text-5xl font-black uppercase text-[#F4F1EA] tracking-tight ${styles.headlineFont}`}
          >
            Engineered For Zero Shared Failure
          </h2>
          <p className="text-neutral-400 text-xs sm:text-sm mt-1.5 max-w-xl mx-auto">
            Disassembles into isolated multi-tenant modules and locks back into a high-throughput unified system.
          </p>
        </div>

        {/* Center: 3D Procedural Realistic Rotating Barbell Canvas with 3D Lifter (Full Width) */}
        <div className="absolute inset-0 w-full h-full z-10 flex items-center justify-center pointer-events-auto">
          <div className="w-full h-full">
            <Barbell3DScene
              explodeProgress={explodeProgress}
              liftProgress={0}
              mode="exploded"
            />
          </div>
        </div>

        {/* Floating Labels Overlay: Positioned around exploded parts */}
        <div className="relative z-20 w-full max-w-6xl mx-auto grid grid-cols-2 lg:grid-cols-4 gap-4 px-4 pb-4">
          {PLATFORM_COMPONENTS.map((item, idx) => {
            const isActive = activeComponent === idx;
            return (
              <div
                key={item.id}
                className={`p-4 sm:p-5 rounded-2xl border transition-all duration-300 ${
                  isActive
                    ? 'border-[#C6FF3D]/50 bg-[#111114]/95 shadow-[0_0_25px_rgba(198,255,61,0.15)] scale-[1.02]'
                    : 'border-white/5 bg-[#111114]/60 opacity-60'
                } backdrop-blur-xl`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-[#C6FF3D]">
                    Part 0{idx + 1}
                  </span>
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-[#C6FF3D] animate-ping' : 'bg-white/20'}`} />
                </div>
                <h3 className={`text-base sm:text-lg font-bold uppercase text-[#F4F1EA] ${styles.headlineFont}`}>
                  {item.name}
                </h3>
                <p className="text-xs font-semibold text-[#C6FF3D] mt-0.5">
                  {item.subtitle}
                </p>
                <p className="text-[11px] text-neutral-400 leading-relaxed mt-2">
                  {item.description}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
