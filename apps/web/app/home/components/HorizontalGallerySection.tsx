'use client';

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { GALLERY_PANELS } from '../config';
import { ProgressiveImage } from './ProgressiveImage';
import styles from '../home.module.css';

export function HorizontalGallerySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [scrollProgress, setScrollProgress] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // Mobile check: horizontal swipeable scroll naturally
    if (window.innerWidth < 768 || prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const track = trackRef.current;
      const container = containerRef.current;
      if (!track || !container) return;

      // Exact pixel translation: total scrollWidth minus 1 viewport width
      const getScrollAmount = () => -(track.scrollWidth - window.innerWidth);

      gsap.to(track, {
        x: getScrollAmount,
        ease: 'none',
        scrollTrigger: {
          trigger: container,
          start: 'top top',
          end: () => `+=${track.scrollWidth - window.innerWidth}`,
          pin: true,
          scrub: 0.6,
          invalidateOnRefresh: true,
          anticipatePin: 1,
          onUpdate: (self) => {
            setScrollProgress(self.progress);
          }
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  // Floating HTML/CSS UI Mockup renderer for each panel
  const renderMockup = (type: string) => {
    switch (type) {
      case 'checkin':
        return (
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111114]/95 backdrop-blur-2xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <span className="text-[10px] uppercase font-mono tracking-wider text-neutral-400">Live Turnstile Stream</span>
              <span className="text-[10px] font-mono px-2.5 py-0.5 rounded bg-[#C6FF3D]/10 text-[#C6FF3D] border border-[#C6FF3D]/30 font-bold">
                ACTIVE
              </span>
            </div>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-neutral-800 flex items-center justify-center font-bold text-xs text-[#C6FF3D] border border-white/10">
                JD
              </div>
              <div>
                <p className="text-sm font-bold text-white leading-tight">John Davis</p>
                <p className="text-[11px] text-neutral-400 font-mono">MEM-00481 • Annual Pro</p>
              </div>
            </div>
            <div className="text-[11px] font-mono text-emerald-400 bg-emerald-950/60 p-2.5 rounded-lg border border-emerald-800/40 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              Check-In Authorized (Front Gate 01)
            </div>
          </div>
        );

      case 'capacity':
        return (
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111114]/95 backdrop-blur-2xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <span className="text-[10px] uppercase font-mono text-neutral-400">Floor Density Telemetry</span>
              <span className="text-xs font-mono font-bold text-[#C6FF3D]">68% Capacity</span>
            </div>
            <div className="space-y-2.5 text-xs">
              <div className="flex justify-between text-neutral-300">
                <span>Free Weights & Cages</span>
                <span className="font-mono text-white font-bold">42 / 50</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-[#C6FF3D] w-[84%]" />
              </div>
              <div className="flex justify-between text-neutral-300 pt-1">
                <span>Cardio Mezzanine</span>
                <span className="font-mono text-white font-bold">18 / 40</span>
              </div>
              <div className="w-full h-1.5 bg-neutral-800 rounded-full overflow-hidden">
                <div className="h-full bg-emerald-500 w-[45%]" />
              </div>
            </div>
          </div>
        );

      case 'analytics':
        return (
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111114]/95 backdrop-blur-2xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <span className="text-[10px] uppercase font-mono text-neutral-400">Executive Ledger</span>
              <span className="text-[10px] font-mono text-emerald-400 font-bold">+14.2% MoM</span>
            </div>
            <div className="text-2xl font-black text-white font-mono mb-1">$84,320.00</div>
            <p className="text-[11px] text-neutral-400 mb-3">Net Collected Revenue Across 4 Branches</p>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-neutral-500 block">Active Roster</span>
                <span className="text-white font-bold">1,492 Members</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5">
                <span className="text-neutral-500 block">Auto-Renewals</span>
                <span className="text-[#C6FF3D] font-bold">94.8% Retained</span>
              </div>
            </div>
          </div>
        );

      case 'ledger':
        return (
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111114]/95 backdrop-blur-2xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-2">
              <span className="text-[10px] uppercase font-mono text-neutral-400">Front Desk Cash Intake</span>
              <span className="text-[10px] font-mono text-[#C6FF3D] font-bold">Cash + POS</span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <div>
                  <p className="font-semibold text-white">Annual Membership</p>
                  <p className="text-[10px] text-neutral-500 font-mono">Cash Entry • Rec #8921</p>
                </div>
                <span className="font-mono text-emerald-400 font-bold">+$1,200.00</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-white/5">
                <div>
                  <p className="font-semibold text-white">Personal Training 10-Pack</p>
                  <p className="text-[10px] text-neutral-500 font-mono">Card Terminal • Rec #8920</p>
                </div>
                <span className="font-mono text-emerald-400 font-bold">+$650.00</span>
              </div>
            </div>
          </div>
        );

      case 'exports':
        return (
          <div className="p-6 rounded-2xl border border-white/10 bg-[#111114]/95 backdrop-blur-2xl shadow-2xl max-w-sm w-full">
            <div className="flex items-center justify-between pb-3 border-b border-white/10 mb-3">
              <span className="text-[10px] uppercase font-mono text-neutral-400">Automated Dispatch</span>
              <span className="text-[10px] font-mono text-[#C6FF3D] font-bold">Scheduled</span>
            </div>
            <div className="space-y-2.5 text-xs mb-3">
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-neutral-300">WhatsApp 3-Day Expiry Alerts</span>
                <span className="text-[#C6FF3D] font-mono font-bold">Sent (42)</span>
              </div>
              <div className="p-2.5 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between">
                <span className="text-neutral-300">Monthly Tax Invoice Export</span>
                <span className="text-neutral-400 font-mono">CSV / PDF Ready</span>
              </div>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <section
      id="gallery"
      ref={containerRef}
      className="relative w-full bg-[#0A0A0B] overflow-hidden border-b border-white/5"
    >
      {/* Mobile Horizontal Scrollable View / Desktop Scrubbed Track */}
      <div
        ref={trackRef}
        className="flex flex-col md:flex-row w-full md:w-max h-auto md:h-screen will-change-transform"
      >
        {GALLERY_PANELS.map((panel, index) => (
          <div
            key={panel.id}
            className="w-full md:w-screen h-[700px] md:h-screen relative flex items-center justify-center overflow-hidden p-6 sm:p-12 shrink-0 border-b md:border-b-0 md:border-r border-white/5"
          >
            {/* Background Fullscreen Asset (Clear & Unblurred) */}
            <div className="absolute inset-0 w-full h-full pointer-events-none">
              <ProgressiveImage
                assetId={panel.assetId}
                className="w-full h-full"
                imgClassName="w-full h-full object-cover filter brightness-[0.88] contrast-[1.05]"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B]/80 via-transparent to-[#0A0A0B]/60" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0B]/85 via-transparent to-transparent" />
            </div>

            {/* Foreground Content: Title on Left, Floating Mockup on Right */}
            <div className="relative z-10 max-w-6xl w-full mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8 items-center">
              <div>
                <span className="text-xs uppercase font-mono tracking-widest text-[#C6FF3D] font-bold px-3 py-1 rounded-full bg-[#C6FF3D]/10 border border-[#C6FF3D]/25 inline-block mb-3">
                  GALLERY 0{index + 1} // REAL-WORLD OPERATIONS
                </span>
                <h3 className={`text-3xl sm:text-5xl font-black uppercase text-[#F4F1EA] tracking-tight mb-3 ${styles.headlineFont}`}>
                  {panel.title}
                </h3>
                <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-lg">
                  {panel.subtitle}
                </p>
              </div>

              {/* Floating HTML/CSS Mockup */}
              <div className="flex justify-start lg:justify-end">
                {renderMockup(panel.mockupType)}
              </div>
            </div>

            {/* Panel Index Indicator at Bottom */}
            <div className="absolute bottom-8 left-8 right-8 z-20 hidden md:flex items-center justify-between text-neutral-400 font-mono text-xs">
              <span>PRODUCT CONTEXT // SCENE 0{index + 1}</span>
              <span className="text-[#C6FF3D] font-bold">0{index + 1} / 0{GALLERY_PANELS.length}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Fixed Horizontal Gallery Progress Bar (Desktop) */}
      <div className="hidden md:block absolute bottom-4 left-1/2 -translate-x-1/2 z-30 w-64 h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-[#C6FF3D] transition-all duration-75"
          style={{ width: `${Math.round(scrollProgress * 100)}%` }}
        />
      </div>
    </section>
  );
}
