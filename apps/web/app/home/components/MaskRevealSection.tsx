'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { ProgressiveImage } from './ProgressiveImage';
import styles from '../home.module.css';

export function MaskRevealSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinWrapperRef = useRef<HTMLDivElement>(null);
  const maskLayerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (!containerRef.current || !pinWrapperRef.current || !maskLayerRef.current) return;

      const tl = gsap.timeline({
        scrollTrigger: {
          trigger: containerRef.current,
          start: 'top top',
          end: '+=180%',
          pin: pinWrapperRef.current,
          scrub: 0.6,
          anticipatePin: 1
        }
      });

      // Expand clip-path from small circle (inset 35% round 50%) to full screen (inset 0% round 0px)
      tl.fromTo(
        maskLayerRef.current,
        {
          clipPath: 'circle(12% at 50% 50%)'
        },
        {
          clipPath: 'circle(85% at 50% 50%)',
          duration: 2,
          ease: 'power2.inOut'
        }
      );
    }, containerRef);

    return () => ctx.revert();
  }, []);

  return (
    <section ref={containerRef} className="relative w-full bg-[#0A0A0B] overflow-hidden">
      <div
        ref={pinWrapperRef}
        className="relative w-full h-screen min-h-[600px] flex items-center justify-center overflow-hidden"
      >
        {/* Layer 1: Text BEHIND the image (Outlined) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-10 px-6 select-none pointer-events-none">
          <span className="text-xs uppercase font-mono tracking-widest text-[#C6FF3D]/60 mb-2">
            ONBOARDING ENGINE
          </span>
          <h2
            className={`text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black uppercase tracking-tighter ${styles.headlineFont} ${styles.textOutline} leading-none max-w-5xl`}
          >
            Invite Your Team In Minutes
          </h2>
          <p className="text-neutral-500 text-sm sm:text-lg max-w-xl mt-4 font-mono">
            Zero training curves. Direct mobile portal links.
          </p>
        </div>

        {/* Layer 2: Masked Image (Clip-Path expands from circle to fullscreen) */}
        <div
          ref={maskLayerRef}
          className="absolute inset-0 w-full h-full z-20 will-change-[clip-path]"
          style={{ clipPath: 'circle(12% at 50% 50%)' }}
        >
          <ProgressiveImage
            assetId="mask-reveal"
            className="w-full h-full"
            imgClassName="w-full h-full object-cover filter brightness-[0.92] contrast-[1.05]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B]/80 via-transparent to-[#0A0A0B]/80" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_40%,rgba(10,10,11,0.85)_100%)]" />
        </div>

        {/* Layer 3: Text OVER the image (Solid Crisp Foreground) */}
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center z-30 px-6 pointer-events-none">
          <div className="p-6 sm:p-10 rounded-3xl border border-white/10 bg-[#0A0A0B]/70 backdrop-blur-md max-w-3xl shadow-2xl">
            <span className="inline-block text-xs uppercase font-mono tracking-widest text-[#C6FF3D] font-bold mb-3 px-3 py-1 rounded-full bg-[#C6FF3D]/10 border border-[#C6FF3D]/25">
              Rapid Staff & Member Provisioning
            </span>
            <h2
              className={`text-4xl sm:text-6xl md:text-7xl font-black uppercase tracking-tight text-[#F4F1EA] ${styles.headlineFont} leading-tight mb-4`}
            >
              Invite Your Team In Minutes
            </h2>
            <p className="text-neutral-300 text-sm sm:text-base leading-relaxed max-w-xl mx-auto">
              Send direct invite links for branch managers, personal trainers, and members. Native mobile-responsive interface requires no app store installation.
            </p>
          </div>
        </div>

      </div>
    </section>
  );
}
