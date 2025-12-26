import type { Metadata, Viewport } from 'next'
import { Outfit, JetBrains_Mono } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'
import { Toaster } from 'sonner'

// Outfit: Modern geometric sans with personality - sharp but approachable
const outfit = Outfit({
  subsets: ['latin'],
  variable: '--font-display',
})

// JetBrains Mono: Technical precision for data/numbers
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: 'IronScout - AI-Powered Ammo Search',
  description: 'AI-powered ammunition search and price comparison. Find the best deals on ammo with natural language search.',
  keywords: 'ammunition, ammo, price comparison, ammo deals, AI search, gun ammunition, bulk ammo, ammo alerts',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'IronScout',
  },
  formatDetection: {
    telephone: false,
  },
  openGraph: {
    title: 'IronScout - AI-Powered Ammo Search',
    description: 'AI-powered ammunition search and price comparison. Find the best deals on ammo with natural language search.',
    url: 'https://ironscout.ai',
    siteName: 'IronScout',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'IronScout - AI-Powered Ammo Search',
    description: 'AI-powered ammunition search and price comparison.',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
  userScalable: true,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F9FA' },
    { media: '(prefers-color-scheme: dark)', color: '#121418' },
  ],
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning className={`${outfit.variable} ${jetbrainsMono.variable}`}>
      <head>
        {/* Google Analytics */}
        <script async src="https://www.googletagmanager.com/gtag/js?id=G-1CDJQS6N90" />
        <script
          dangerouslySetInnerHTML={{
            __html: `
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              gtag('js', new Date());
              gtag('config', 'G-1CDJQS6N90');
            `,
          }}
        />

        {/* PWA Meta Tags */}
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="152x152" href="/icons/icon-152x152.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/icons/icon-192x192.png" />
        <link rel="apple-touch-icon" sizes="167x167" href="/icons/icon-192x192.png" />
        
        {/* Apple Splash Screens */}
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-splash-2048-2732.png"
          media="(device-width: 1024px) and (device-height: 1366px) and (-webkit-device-pixel-ratio: 2) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-splash-1170-2532.png"
          media="(device-width: 390px) and (device-height: 844px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        <link
          rel="apple-touch-startup-image"
          href="/splash/apple-splash-1125-2436.png"
          media="(device-width: 375px) and (device-height: 812px) and (-webkit-device-pixel-ratio: 3) and (orientation: portrait)"
        />
        
        {/* Favicon */}
        <link rel="icon" type="image/png" sizes="32x32" href="/icons/icon-32x32.png" />
        <link rel="icon" type="image/png" sizes="16x16" href="/icons/icon-16x16.png" />
        
        {/* Microsoft Tiles */}
        <meta name="msapplication-TileColor" content="#121418" />
        <meta name="msapplication-TileImage" content="/icons/icon-144x144.png" />
        
        {/* Third-party Scripts */}
        <script
          type="text/javascript"
          src="https://classic.avantlink.com/affiliate_app_confirm.php?mode=js&authResponse=83b35735960abca5c62924f3fbe01e4e919343a3"
        />
      </head>
      <body className="font-display antialiased">
        <Providers>
          <div className="min-h-screen flex flex-col safe-area-inset">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </div>
          <Toaster richColors position="top-right" />
        </Providers>
      </body>
    </html>
  )
}
