import type { Metadata } from 'next';
import { HomePageClient } from './home/HomePageClient';
import { bigShouldersDisplay, interTight, jetbrainsMono } from './home/fonts';

export const metadata: Metadata = {
  metadataBase: new URL('https://gymos.io'),
  title: 'GymOS — Enterprise Multi-Tenant Gym Operations & Telemetry',
  description: 'Multi-tenant operational platform for high-volume gym chains. Real-time attendance tracking, automated subscription renewals, front-desk cash ledger, and cryptographic tenant isolation.',
  openGraph: {
    title: 'GymOS — Enterprise Multi-Tenant Gym Operations',
    description: 'Run every branch like it\'s your only one. Unified attendance, automated renewals, and immutable audit logs.',
    url: 'https://gymos.io',
    siteName: 'GymOS',
    type: 'website',
    images: [
      {
        url: '/assets/home/hero-athlete_1920.webp',
        width: 1920,
        height: 1080,
        alt: 'GymOS Multi-Branch Gym Management'
      }
    ]
  },
  twitter: {
    card: 'summary_large_image',
    title: 'GymOS — Enterprise Multi-Tenant Gym Operations',
    description: 'Run every branch like it\'s your only one.'
  }
};

export default function RootHomePage() {
  return (
    <div
      className={`${bigShouldersDisplay.variable} ${interTight.variable} ${jetbrainsMono.variable} min-h-screen bg-[#0A0A0B] text-[#F4F1EA]`}
    >
      <HomePageClient />
    </div>
  );
}
