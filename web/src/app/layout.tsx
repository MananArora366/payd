import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { PaydProvider } from '@/lib/store/PaydContext';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Payd | Voice-First Expense & Group Tracker',
  description: 'Splitwise-style splitting, personal budgeting, and deterministic financial intelligence powered by Gemini',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors`}>
        <PaydProvider>{children}</PaydProvider>
      </body>
    </html>
  );
}
