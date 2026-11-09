'use client';

import React, { useEffect, useRef } from 'react';
import { gsap } from 'gsap';
import { PRIMARY_CTA, SECONDARY_CTA } from '../config';
import { ProgressiveImage } from './ProgressiveImage';
import styles from '../home.module.css';

interface HeroSectionProps {
  onScrollTo?: (target: string) => void;
}

export function HeroSection({ onScrollTo }: HeroSectionProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const bgWrapperRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const ctx = gsap.context(() => {
      // 1. Entrance animation: sleek modern blur reveal
      if (!prefersReducedMotion) {
        gsap.fromTo(
          '.hero-kicker-badge',
          { opacity: 0, y: -15, filter: 'blur(8px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power2.out', delay: 0.1 }
        );

        gsap.fromTo(
          '.hero-headline-line',
          { opacity: 0, y: 40, filter: 'blur(12px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', stagger: 0.15, duration: 1.1, ease: 'power3.out', delay: 0.25 }
        );

        gsap.fromTo(
          '.hero-sub-element',
          { opacity: 0, y: 20, filter: 'blur(6px)' },
          { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.9, stagger: 0.12, ease: 'power2.out', delay: 0.6 }
        );
      }

      // 2. Scroll-scrubbed cinematic scaling & parallax
      if (!prefersReducedMotion && containerRef.current && bgWrapperRef.current && contentRef.current) {
        // Slow background scale from 1.0 to 1.25 tied to scroll
        gsap.to(bgWrapperRef.current, {
          scale: 1.25,
          yPercent: 18,
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top top',
            end: 'bottom top',
            scrub: true
          }
        });

        // Headline parallax (-0.6x), fade, scale and blur out on scroll
        gsap.to(contentRef.current, {
          yPercent: -35,
          opacity: 0,
          scale: 0.94,
          filter: 'blur(12px)',
          ease: 'none',
          scrollTrigger: {
            trigger: containerRef.current,
            start: 'top top',
            end: '85% top',
            scrub: true
          }
        });
      }
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const handleCtaClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      if (onScrollTo) {
        onScrollTo(href);
      } else {
        const el = document.querySelector(href);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <section
      ref={containerRef}
      className="relative w-full h-screen min-h-[720px] flex items-center justify-center overflow-hidden"
    >
      {/* Background Image Container with Cinematic Gaussian Blur & Atmospheric Depth */}
      <div
        ref={bgWrapperRef}
        className="absolute inset-0 w-full h-full will-change-transform scale-100 overflow-hidden pointer-events-none"
      >
        <div className="w-full h-full scale-110 filter blur-[22px] sm:blur-[28px] md:blur-[36px] brightness-[0.48] contrast-[1.18] saturate-[1.1]">
          <ProgressiveImage
            assetId="hero-athlete"
            priority={true}
            className="w-full h-full"
            imgClassName="w-full h-full object-cover object-center"
          />
        </div>

        {/* Multi-layered cinematic vignette & atmospheric lighting */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B] via-[#0A0A0B]/60 to-[#0A0A0B]/50" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0A0A0B]/85 via-transparent to-[#0A0A0B]/85" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_40%,rgba(198,255,61,0.07)_0%,transparent_75%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_35%,rgba(10,10,11,0.9)_100%)]" />
      </div>

      {/* Floating Modern Content Layer */}
      <div
        ref={contentRef}
        className="relative z-10 max-w-5xl mx-auto px-6 text-center flex flex-col items-center justify-center pt-10"
      >
        {/* Modern Minimal Kicker Badge */}
        <div className="hero-kicker-badge inline-flex items-center gap-2.5 px-3.5 py-1.5 rounded-full border border-white/10 bg-white/[0.03] backdrop-blur-xl mb-6 shadow-sm">
          <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D] shadow-[0_0_8px_#C6FF3D] animate-pulse" />
          <span className="text-[11px] font-mono uppercase tracking-[0.2em] text-neutral-300 font-medium">
            Multi-Tenant Fitness Architecture
          </span>
        </div>

        {/* Interesting, Modern, Minimal H1 Headline */}
        <h1 className="text-4xl sm:text-6xl md:text-7xl lg:text-[5.5rem] font-semibold tracking-[-0.035em] leading-[1.08] text-balance mb-6 max-w-4xl mx-auto">
          <span className="hero-headline-line block bg-gradient-to-b from-white via-neutral-100 to-neutral-300 bg-clip-text text-transparent">
            Run every branch
          </span>
          <span className="hero-headline-line block mt-1">
            <span className="bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-300 bg-clip-text text-transparent">
              like your{' '}
            </span>
            <span className="bg-gradient-to-r from-[#F4F1EA] via-[#E4FF85] to-[#C6FF3D] bg-clip-text text-transparent font-bold">
              flagship.
            </span>
          </span>
        </h1>

        {/* Refined Subtitle: High-precision minimal summary */}
        <p className="hero-sub-element text-sm sm:text-lg md:text-xl text-neutral-400 font-light max-w-2xl mx-auto leading-relaxed mb-10 text-balance">
          Unified attendance telemetry, automated recurring renewals, and cryptographic tenant isolation — engineered for elite fitness chains.
        </p>

        {/* Modern Action Buttons */}
        <div className="hero-sub-element flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
          <a
            href={PRIMARY_CTA.href}
            onClick={(e) => handleCtaClick(e, PRIMARY_CTA.href)}
            className={`w-full sm:w-auto px-8 py-3.5 rounded-full text-xs sm:text-sm uppercase tracking-wider font-extrabold flex items-center justify-center gap-2 shadow-[0_0_35px_rgba(198,255,61,0.25)] ${styles.voltButton}`}
          >
            {PRIMARY_CTA.label}
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
            </svg>
          </a>

          <a
            href={SECONDARY_CTA.href}
            onClick={(e) => handleCtaClick(e, SECONDARY_CTA.href)}
            className="w-full sm:w-auto px-8 py-3.5 rounded-full text-xs sm:text-sm uppercase tracking-wider font-semibold text-neutral-300 hover:text-white border border-white/15 hover:border-white/40 bg-white/[0.04] hover:bg-white/[0.08] backdrop-blur-md transition-all duration-200 flex items-center justify-center"
          >
            {SECONDARY_CTA.label}
          </a>
        </div>

        {/* Minimal Enterprise Proof Strip */}
        <div className="hero-sub-element mt-12 flex flex-wrap items-center justify-center gap-6 sm:gap-8 text-[11px] sm:text-xs font-mono text-neutral-400 tracking-wider">
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.6)]" />
            Zero-Leak Tenant Pods
          </span>
          <span className="text-white/15 hidden sm:inline">•</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D] shadow-[0_0_6px_rgba(198,255,61,0.6)]" />
            Automated Renewal Engine
          </span>
          <span className="text-white/15 hidden sm:inline">•</span>
          <span className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_6px_rgba(34,211,238,0.6)]" />
            Sub-50ms Telemetry
          </span>
        </div>
      </div>
    </section>
  );
}
