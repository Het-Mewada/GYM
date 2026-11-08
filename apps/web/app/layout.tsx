import type { Metadata } from 'next';
import './globals.css';
import { ToastProvider } from './components/Toast';

export const metadata: Metadata = {
  title: 'Gym Management SaaS',
  description: 'Multi-Tenant Gym Operations Platform'
};

export default function RootLayout({
  children
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="bg-neutral-950 text-neutral-100 antialiased min-h-screen">
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  );
}
