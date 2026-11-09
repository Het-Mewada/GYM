'use client';

import React from 'react';
import { useLenis } from './hooks/useLenis';
import { HomeNav } from './components/HomeNav';
import { HeroSection } from './components/HeroSection';
import { ParallaxAthleteSection } from './components/ParallaxAthleteSection';
import { KineticTypography } from './components/KineticTypography';
import { BarbellExplodedSection } from './components/BarbellExplodedSection';
import { StickyStorySection } from './components/StickyStorySection';
import { MaskRevealSection } from './components/MaskRevealSection';
import { HorizontalGallerySection } from './components/HorizontalGallerySection';
import { LiftSequenceSection } from './components/LiftSequenceSection';
import { TrustSection } from './components/TrustSection';
import { FeatureGridSection } from './components/FeatureGridSection';
import { CtaFooterSection } from './components/CtaFooterSection';
import styles from './home.module.css';

export function HomePageClient() {
  const { scrollTo } = useLenis();

  return (
    <div className={styles.homeContainer}>
      {/* Effect 8: Subtle film grain overlay and cinematic vignette */}
      <div className={styles.filmGrain} aria-hidden="true" />
      <div className={styles.vignette} aria-hidden="true" />

      {/* 0. Glassmorphism Navigation with Auto-Hide/Show */}
      <HomeNav onScrollTo={scrollTo} />

      {/* 1. Cinematic Full-Screen Hero Reveal */}
      <HeroSection onScrollTo={scrollTo} />

      {/* 2. Pinned Athlete Parallax & 3 Owner Pain Beats */}
      <ParallaxAthleteSection />

      {/* 3. Kinetic Typography Band (OWN. TRACK. SCALE.) */}
      <KineticTypography />

      {/* 4. 3D Exploded Barbell Platform Architecture */}
      <BarbellExplodedSection />

      {/* 5. Sticky Split-Screen Storytelling (6 Operational Scenes) */}
      <StickyStorySection />

      {/* 6. Image Mask Reveal (Circle-to-Fullscreen Expansion) */}
      <MaskRevealSection />

      {/* 7. Horizontal Scroll Gallery with Live Operational Mockups */}
      <HorizontalGallerySection />

      {/* 8. Scroll-Scrubbed 3D Barbell Lift Sequence & Metric Counters */}
      <LiftSequenceSection />

      {/* 9. Data Integrity & Tenant Isolation Trust Section */}
      <TrustSection />

      {/* 10. Complete 23-Feature Platform Capability Grid */}
      <FeatureGridSection />

      {/* 11. Final CTA Demo Request Form & Global Footer */}
      <CtaFooterSection />
    </div>
  );
}
