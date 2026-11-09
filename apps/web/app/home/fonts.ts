import { Big_Shoulders, Inter_Tight, JetBrains_Mono } from 'next/font/google';

export const bigShouldersDisplay = Big_Shoulders({
  subsets: ['latin'],
  weight: ['400', '600', '700', '800', '900'],
  variable: '--font-big-shoulders',
  display: 'swap',
});

export const interTight = Inter_Tight({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter-tight',
  display: 'swap',
});

export const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});
