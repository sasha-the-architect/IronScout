import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Providers } from './providers'
import { Header } from '@/components/layout/header'
import { Footer } from '@/components/layout/footer'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'IronScout.ai - AI-Powered Shopping Assistant',
  description: 'Your proactive, personalized purchasing assistant. Find the best deals with AI-powered insights.',
  keywords: 'shopping, deals, AI, price comparison, alerts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <script
          type="text/javascript"
          src="https://classic.avantlink.com/affiliate_app_confirm.php?mode=js&authResponse=83b35735960abca5c62924f3fbe01e4e919343a3"
        />
      </head>
      <body className={inter.className}>
        <Providers>
          <div className="min-h-screen flex flex-col">
            <Header />
            <main className="flex-1">
              {children}
            </main>
            <Footer />
          </div>
        </Providers>
      </body>
    </html>
  )
}
