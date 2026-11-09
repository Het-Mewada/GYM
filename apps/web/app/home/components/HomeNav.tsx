'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { BRAND, NAV_LINKS, PRIMARY_CTA } from '../config';
import styles from '../home.module.css';

interface HomeNavProps {
  onScrollTo?: (target: string) => void;
}

export function HomeNav({ onScrollTo }: HomeNavProps) {
  const [isVisible, setIsVisible] = useState(true);
  const [isScrolled, setIsScrolled] = useState(false);
  const [lastScrollY, setLastScrollY] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY;

      // Auto hide on scroll down (after 100px), return on scroll up
      if (currentScrollY > 100) {
        setIsScrolled(true);
        if (currentScrollY > lastScrollY + 5) {
          setIsVisible(false);
        } else if (currentScrollY < lastScrollY - 5) {
          setIsVisible(true);
        }
      } else {
        setIsScrolled(false);
        setIsVisible(true);
      }
      setLastScrollY(currentScrollY);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [lastScrollY]);

  const handleLinkClick = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    if (href.startsWith('#')) {
      e.preventDefault();
      setMobileMenuOpen(false);
      if (onScrollTo) {
        onScrollTo(href);
      } else {
        const el = document.querySelector(href);
        if (el) el.scrollIntoView({ behavior: 'smooth' });
      }
    }
  };

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out ${
        isVisible ? 'translate-y-0 opacity-100' : '-translate-y-full opacity-0 pointer-events-none'
      } ${isScrolled ? 'py-3' : 'py-5'}`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <nav
          className={`flex items-center justify-between px-5 py-3 rounded-full border border-white/10 ${styles.glassSurface} shadow-2xl backdrop-blur-xl`}
          aria-label="Main Navigation"
        >
          {/* Brand Logo */}
          <Link
            href="/"
            className="flex items-center gap-3 group focus:outline-none focus:ring-2 focus:ring-[#C6FF3D] rounded-lg"
          >
            <div className="w-8 h-8 rounded-lg bg-[#C6FF3D] flex items-center justify-center font-black text-black text-xs tracking-tighter shadow-[0_0_15px_rgba(198,255,61,0.4)]">
              GYM
            </div>
            <span className={`text-xl font-bold tracking-tight text-[#F4F1EA] ${styles.headlineFont}`}>
              {BRAND}
            </span>
            <span className="hidden sm:inline-block px-2 py-0.5 text-[10px] uppercase font-mono tracking-wider rounded-full border border-white/10 text-neutral-400 bg-white/5">
              Enterprise SaaS
            </span>
          </Link>

          {/* Desktop Nav Links */}
          <div className="hidden md:flex items-center gap-7">
            {NAV_LINKS.map((link) =>
              link.href.startsWith('/') ? (
                <Link
                  key={link.label}
                  href={link.href}
                  data-testid={link.testId}
                  className="text-xs uppercase font-medium tracking-wider text-neutral-300 hover:text-[#C6FF3D] transition-colors duration-200"
                >
                  {link.label}
                </Link>
              ) : (
                <a
                  key={link.label}
                  href={link.href}
                  data-testid={link.testId}
                  onClick={(e) => handleLinkClick(e, link.href)}
                  className="text-xs uppercase font-medium tracking-wider text-neutral-300 hover:text-[#C6FF3D] transition-colors duration-200"
                >
                  {link.label}
                </a>
              )
            )}
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-3">
            <a
              href={PRIMARY_CTA.href}
              onClick={(e) => handleLinkClick(e, PRIMARY_CTA.href)}
              className={`px-5 py-2 rounded-full text-xs uppercase tracking-wider font-bold ${styles.voltButton}`}
            >
              {PRIMARY_CTA.label}
            </a>

            {/* Mobile Hamburger */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-neutral-400 hover:text-white rounded-lg focus:outline-none"
              aria-label="Toggle mobile menu"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileMenuOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16m-7 6h7" />
                )}
              </svg>
            </button>
          </div>
        </nav>

        {/* Mobile Dropdown */}
        {mobileMenuOpen && (
          <div className={`mt-2 p-4 rounded-2xl border border-white/10 ${styles.glassSurface} md:hidden flex flex-col gap-3 shadow-2xl`}>
            {NAV_LINKS.map((link) => (
              <a
                key={link.label}
                href={link.href}
                data-testid={link.testId}
                onClick={(e) => handleLinkClick(e, link.href)}
                className="text-sm font-medium py-2 px-3 rounded-lg text-neutral-200 hover:text-[#C6FF3D] hover:bg-white/5 transition"
              >
                {link.label}
              </a>
            ))}
            <Link
              href="/login"
              className="text-sm font-medium py-2 px-3 rounded-lg text-neutral-400 hover:text-white hover:bg-white/5 transition"
            >
              Operator Sign In
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}
