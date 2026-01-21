import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'IronScout - AI-Powered Ammunition Search',
  description: 'Find the best ammunition deals across the web. AI-powered search, real-time price tracking, and ballistic data — all in one place.',
  keywords: ['ammunition', 'ammo search', 'ammo deals', 'bullet prices', 'ammunition comparison'],
  authors: [{ name: 'IronScout' }],
  openGraph: {
    title: 'IronScout - AI-Powered Ammunition Search',
    description: 'Find the best ammunition deals across the web. AI-powered search, real-time price tracking, and ballistic data.',
    url: 'https://www.ironscout.ai',
    siteName: 'IronScout',
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IronScout - AI-Powered Ammunition Search',
    description: 'Find the best ammunition deals across the web.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Google Fonts - Oswald for display, Source Sans for body */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link 
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=Oswald:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" 
          rel="stylesheet" 
        />
      </head>
      <body className="min-h-screen grid-bg">
        <div className="noise-overlay" />
        {children}
      </body>
    </html>
  );
}
