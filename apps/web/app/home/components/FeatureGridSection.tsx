'use client';

import React, { useRef } from 'react';
import { FEATURE_GROUPS } from '../config';
import styles from '../home.module.css';

function TiltCard({ category, features, index }: { category: string; features: string[]; index: number }) {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    const rotateX = ((y - centerY) / centerY) * -7;
    const rotateY = ((x - centerX) / centerX) * 7;

    cardRef.current.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
  };

  const handleMouseLeave = () => {
    if (!cardRef.current) return;
    cardRef.current.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)';
  };

  return (
    <div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      className={`p-6 sm:p-8 rounded-3xl border border-white/10 ${styles.glassSurface} ${styles.glassSurfaceHover} transition-transform duration-200 ease-out flex flex-col justify-between`}
    >
      <div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-[11px] font-mono uppercase tracking-widest text-[#C6FF3D] font-bold">
            Group 0{index + 1}
          </span>
          <span className="w-2 h-2 rounded-full bg-[#C6FF3D]/40" />
        </div>

        <h3 className={`text-xl sm:text-2xl font-black uppercase text-[#F4F1EA] tracking-tight mb-4 ${styles.headlineFont}`}>
          {category}
        </h3>

        <ul className="space-y-2.5">
          {features.map((feature, fIdx) => (
            <li key={fIdx} className="flex items-start gap-2.5 text-xs sm:text-sm text-neutral-300">
              <span className="text-[#C6FF3D] mt-0.5">•</span>
              <span className="leading-snug">{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-6 pt-4 border-t border-white/5 flex items-center justify-between text-[10px] font-mono text-neutral-500">
        <span>{features.length} SYSTEM CAPABILITIES</span>
        <span className="text-emerald-400">VERIFIED</span>
      </div>
    </div>
  );
}

export function FeatureGridSection() {
  return (
    <section id="features" className="relative w-full py-24 sm:py-36 bg-[#0A0A0B] border-b border-white/5">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16">
          <span className="text-[11px] uppercase font-mono tracking-widest text-[#C6FF3D] font-bold px-3 py-1 rounded-full bg-[#C6FF3D]/10 border border-[#C6FF3D]/25 inline-block mb-3">
            COMPLETE FEATURE SPECIFICATION
          </span>
          <h2 className={`text-3xl sm:text-5xl md:text-6xl font-black uppercase text-[#F4F1EA] tracking-tight ${styles.headlineFont}`}>
            Every Capability You Need To Run Multiple Gyms
          </h2>
          <p className="text-neutral-400 text-xs sm:text-sm mt-3 max-w-xl mx-auto">
            All 23 core platform features categorized by operational layer. Built natively into one cohesive architecture.
          </p>
        </div>

        {/* 6 Grouped Cards Grid with 3D Tilt */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURE_GROUPS.map((group, index) => (
            <TiltCard
              key={group.category}
              category={group.category}
              features={group.features}
              index={index}
            />
          ))}
        </div>

      </div>
    </section>
  );
}
