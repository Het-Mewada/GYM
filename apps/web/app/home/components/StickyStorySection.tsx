'use client';

import React, { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { STORY_SCENES } from '../config';
import { ProgressiveImage } from './ProgressiveImage';
import styles from '../home.module.css';

export function StickyStorySection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const pinWrapperRef = useRef<HTMLDivElement>(null);
  const [activeSceneIndex, setActiveSceneIndex] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return;

    const ctx = gsap.context(() => {
      if (!containerRef.current || !pinWrapperRef.current) return;

      ScrollTrigger.create({
        trigger: containerRef.current,
        start: 'top top',
        end: '+=300%',
        pin: pinWrapperRef.current,
        scrub: 0.5,
        anticipatePin: 1,
        onUpdate: (self) => {
          // Map progress 0..1 to scene indices 0..5
          const index = Math.min(
            STORY_SCENES.length - 1,
            Math.floor(self.progress * STORY_SCENES.length)
          );
          setActiveSceneIndex(index);
        }
      });
    }, containerRef);

    return () => ctx.revert();
  }, []);

  const activeScene = STORY_SCENES[activeSceneIndex] || STORY_SCENES[0];

  return (
    <section
      id="story"
      ref={containerRef}
      className="relative w-full bg-[#0A0A0B] border-b border-white/5"
    >
      {/* 100vh Pinned Viewport Container */}
      <div
        ref={pinWrapperRef}
        className="relative w-full h-screen min-h-[700px] flex flex-col justify-between py-8 sm:py-12 px-6 overflow-hidden"
      >
        {/* Section Header Top Bar */}
        <div className="relative z-20 flex flex-col sm:flex-row items-center justify-between gap-4 max-w-7xl mx-auto w-full border-b border-white/5 pb-4">
          <div className="flex items-center gap-3">
            <span className="w-2 h-2 rounded-full bg-[#C6FF3D] shadow-[0_0_8px_#C6FF3D]" />
            <span className="text-xs uppercase font-mono tracking-widest text-[#C6FF3D] font-bold">
              OPERATIONAL STORY
            </span>
            <span className="text-neutral-500 font-mono text-xs hidden sm:inline">•</span>
            <span className="text-neutral-400 font-mono text-xs hidden sm:inline">
              Multi-Branch Architecture in Action
            </span>
          </div>

          {/* Scene Progress Indicators (01 to 06) */}
          <div className="flex items-center gap-2">
            {STORY_SCENES.map((scene, idx) => (
              <button
                key={scene.id}
                type="button"
                onClick={() => setActiveSceneIndex(idx)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-mono transition-all duration-300 ${
                  activeSceneIndex === idx
                    ? 'bg-[#C6FF3D] text-black font-bold shadow-[0_0_12px_rgba(198,255,61,0.4)]'
                    : 'bg-white/5 text-neutral-400 hover:text-white hover:bg-white/10'
                }`}
              >
                <span>0{idx + 1}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 100vh Main Split Area: Left Image Fixed, Right Story Content Card */}
        <div className="relative z-10 max-w-7xl mx-auto w-full flex-1 grid grid-cols-1 md:grid-cols-12 gap-8 items-center py-6">
          
          {/* Left Stable Image Frame (5 Cols) */}
          <div className="md:col-span-6 lg:col-span-5 h-[340px] sm:h-[450px] md:h-[520px] w-full rounded-3xl overflow-hidden border border-white/10 shadow-2xl relative bg-[#111114]">
            {STORY_SCENES.map((scene, idx) => (
              <div
                key={scene.id}
                className={`absolute inset-0 w-full h-full transition-opacity duration-700 ease-in-out ${
                  activeSceneIndex === idx ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                <ProgressiveImage
                  assetId={scene.assetId}
                  className="w-full h-full"
                  imgClassName="w-full h-full object-cover filter brightness-[0.92] contrast-[1.05]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0A0A0B]/60 via-transparent to-transparent" />
                
                {/* Scene tag badge */}
                <div className="absolute bottom-5 left-5 right-5 z-20 flex items-center justify-between">
                  <span className="text-[11px] font-mono font-bold px-3 py-1.5 rounded-lg bg-black/75 border border-white/15 text-[#C6FF3D] backdrop-blur-md">
                    Scene 0{idx + 1} // {scene.tag}
                  </span>
                  <span className="text-[11px] font-mono text-neutral-300 bg-black/60 px-2 py-1 rounded">
                    {idx + 1} of {STORY_SCENES.length}
                  </span>
                </div>
              </div>
            ))}
          </div>

          {/* Right Dynamic Narrative Card (7 Cols) */}
          <div className="md:col-span-6 lg:col-span-7 flex flex-col justify-center">
            <div className="p-8 sm:p-12 rounded-3xl border border-white/10 bg-[#111114]/90 backdrop-blur-2xl shadow-2xl transition-all duration-300">
              
              <div className="flex items-center gap-3 mb-4">
                <span className="text-xs font-mono font-bold text-[#C6FF3D] px-2.5 py-1 rounded-md bg-[#C6FF3D]/10 border border-[#C6FF3D]/25">
                  0{activeSceneIndex + 1} / 0{STORY_SCENES.length}
                </span>
                <span className="text-xs uppercase font-mono tracking-wider text-neutral-400 font-semibold">
                  {activeScene.tag}
                </span>
              </div>

              <h3 className={`text-3xl sm:text-5xl font-black uppercase text-[#F4F1EA] tracking-tight leading-tight mb-4 ${styles.headlineFont}`}>
                {activeScene.title}
              </h3>

              <p className="text-neutral-300 text-sm sm:text-base leading-relaxed mb-8">
                {activeScene.subtitle}
              </p>

              {/* Real Feature Bullets */}
              <div className="space-y-3 border-t border-white/10 pt-6">
                <span className="text-[11px] font-mono uppercase tracking-widest text-[#C6FF3D] block font-bold">
                  Verified Platform Capabilities
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                  {activeScene.features.map((feat, fIdx) => (
                    <div key={fIdx} className="flex items-center gap-2.5 text-xs sm:text-sm text-neutral-200 bg-white/5 px-3 py-2 rounded-xl border border-white/5">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#C6FF3D] shrink-0" />
                      <span className="truncate">{feat}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

        </div>

        {/* Bottom Ticker */}
        <div className="relative z-20 max-w-7xl mx-auto w-full flex items-center justify-between text-neutral-500 text-xs font-mono pt-3 border-t border-white/5">
          <span>Scroll to cycle through operational outcomes</span>
          <span className="text-[#C6FF3D]">100% Data Isolation Active</span>
        </div>
      </div>
    </section>
  );
}
