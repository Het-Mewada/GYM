'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { OWNER_PAIN_BEATS } from '../config';
import { ProgressiveImage } from './ProgressiveImage';
import styles from '../home.module.css';

export function ParallaxAthleteSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinTargetRef = useRef<HTMLDivElement>(null);
  const emptyGymLayerRef = useRef<HTMLDivElement>(null);
  const beatsRef = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      const beats = beatsRef.current.filter(Boolean) as HTMLDivElement[];
      if (!pinTargetRef.current || !containerRef.current) return;

      // Pin the section while scrolling through the 3 pain points
      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          end: '+=250%',
          pin: pinTargetRef.current,
          scrub: 0.6,
          anticipatePin: 1
        }
      });

      // Animate each pain beat in and out sequentially
      beats.forEach((beat, index) => {
        const isFirst = index === 0;
        const isLast = index === beats.length - 1;

        if (!isFirst) {
          // Fade in
          tl.fromTo(
            beat,
            { opacity: 0, y: 50, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 1, ease: 'power2.out' }
          );
        } else {
          // First beat starts visible
          tl.set(beat, { opacity: 1, y: 0, scale: 1 });
        }

        // Hold beat active
        tl.to(beat, { duration: 1 });

        if (!isLast) {
          // Fade out previous beat
          tl.to(beat, {
            opacity: 0,
            y: -40,
            scale: 0.92,
            duration: 0.8,
            ease: 'power2.in'
          });
        }
      });

      // Crossfade athlete image into gym-floor-empty by the end of the pin
      if (emptyGymLayerRef.current) {
        tl.fromTo(
          emptyGymLayerRef.current,
          { opacity: 0 },
          { opacity: 1, duration: 1.5, ease: 'power1.inOut' },
          '-=1.8'
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative w-full bg-[#0A0A0B]">
      {/* Pinned Viewport Container */}
      <div
        ref={pinTargetRef}
        className="relative w-full h-screen min-h-[600px] flex items-center justify-center overflow-hidden"
      >
        {/* Layer 1: Resting Athlete Background */}
        <div className="absolute inset-0 w-full h-full">
          <ProgressiveImage
            assetId="parallax-athlete"
            className="w-full h-full"
            imgClassName="w-full h-full object-cover filter brightness-[0.88] contrast-[1.05]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B]/80 via-transparent to-[#0A0A0B]/60" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_60%,rgba(10,10,11,0.6)_100%)]" />
        </div>

        {/* Layer 2: Empty Dawn Gym Background (Crossfades in) */}
        <div
          ref={emptyGymLayerRef}
          className="absolute inset-0 w-full h-full opacity-0 will-change-opacity pointer-events-none"
        >
          <ProgressiveImage
            assetId="gym-floor-empty"
            className="w-full h-full"
            imgClassName="w-full h-full object-cover filter brightness-[0.9] contrast-[1.08]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B]/80 via-transparent to-[#0A0A0B]/60" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_60%,rgba(10,10,11,0.6)_100%)]" />
        </div>

        {/* Content Container: Centered sequential pain cards */}
        <div className="relative z-10 max-w-3xl mx-auto px-6 w-full flex items-center justify-center">
          {OWNER_PAIN_BEATS.map((beat, index) => (
            <div
              key={beat.num}
              ref={(el) => {
                beatsRef.current[index] = el;
              }}
              className={`absolute inset-x-6 max-w-2xl mx-auto p-8 sm:p-12 rounded-3xl border border-white/10 ${styles.glassSurface} shadow-[0_20px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl text-center will-change-transform ${
                index === 0 ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div className="flex items-center justify-center gap-3 mb-4">
                <span className="text-[#C6FF3D] font-mono text-xs font-bold px-2.5 py-1 rounded-md bg-[#C6FF3D]/10 border border-[#C6FF3D]/25">
                  {beat.num} / 03
                </span>
                <span className="text-neutral-400 font-mono text-xs uppercase tracking-widest font-semibold">
                  {beat.label}
                </span>
              </div>

              <h2
                className={`text-3xl sm:text-5xl font-extrabold uppercase text-[#F4F1EA] tracking-tight leading-tight mb-4 ${styles.headlineFont}`}
              >
                {beat.headline}
              </h2>

              <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-xl mx-auto">
                {beat.body}
              </p>
            </div>
          ))}
        </div>

        {/* Status ticker at bottom */}
        <div className="absolute bottom-10 left-6 sm:left-12 right-6 sm:right-12 z-20 flex justify-between items-center text-neutral-500 text-xs font-mono border-t border-white/10 pt-4">
          <span className="uppercase tracking-widest text-neutral-400">Owner Pain Points</span>
          <span className="text-[#C6FF3D]">3 Critical Operational Blindspots</span>
        </div>
      </div>
    </section>
  );
}
