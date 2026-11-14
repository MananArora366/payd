import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PaydProvider } from '@/lib/store/PaydContext';

export const viewport: Viewport = {
  // Matches the app background and public/manifest.json theme_color.
  themeColor: '#09090b',
  width: 'device-width',
  initialScale: 1,
};

export const metadata: Metadata = {
  title: 'Payd | Voice-First Expense & Group Tracker',
  description: 'Split bills with friends, track your budget and settle up instantly with Careem Pay',
  manifest: '/manifest.json',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: '48x48' },
      { url: '/brand/payd-icon-192.png', type: 'image/png', sizes: '192x192' },
    ],
    apple: '/brand/payd-icon-180.png',
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
      <body className="min-h-screen bg-[#09090b] text-[#f4f4f5] font-body antialiased selection:bg-silver-600 selection:text-white">
        <PaydProvider>{children}</PaydProvider>
      </body>
    </html>
  );
}
