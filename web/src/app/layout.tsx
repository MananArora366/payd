import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { PaydProvider } from '@/lib/store/PaydContext';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#7C3AED',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'Payd | Voice-First Expense & Group Tracker',
  description: 'Splitwise-style splitting, personal budgeting, and deterministic financial intelligence powered by Gemini & Careem Pay',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Payd',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-body antialiased selection:bg-violet-600 selection:text-white">
        <PaydProvider>{children}</PaydProvider>
      </body>
    </html>
  );
}
