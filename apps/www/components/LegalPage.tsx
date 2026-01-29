import Markdown from 'react-markdown'
import Link from 'next/link'

interface LegalPageProps {
  content: string
  lastUpdated?: string
}

export function LegalPage({ content, lastUpdated }: LegalPageProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b border-iron-800">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <Link
            href="/"
            className="text-brass-500 hover:text-brass-400 transition-colors"
          >
            &larr; Back to IronScout
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-12">
        <article className="prose prose-invert prose-iron max-w-none">
          <Markdown
            components={{
              h1: ({ children }) => (
                <h1 className="text-3xl md:text-4xl font-bold text-iron-100 mb-2" style={{ fontFamily: 'var(--font-display)' }}>
                  {children}
                </h1>
              ),
              h2: ({ children }) => (
                <h2 className="text-xl md:text-2xl font-semibold text-iron-200 mt-10 mb-4 border-b border-iron-800 pb-2">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="text-lg font-semibold text-iron-300 mt-6 mb-3">
                  {children}
                </h3>
              ),
              p: ({ children }) => (
                <p className="text-iron-400 leading-relaxed mb-4">
                  {children}
                </p>
              ),
              ul: ({ children }) => (
                <ul className="list-disc list-inside text-iron-400 mb-4 space-y-1">
                  {children}
                </ul>
              ),
              li: ({ children }) => (
                <li className="text-iron-400">
                  {children}
                </li>
              ),
              strong: ({ children }) => (
                <strong className="text-iron-200 font-semibold">
                  {children}
                </strong>
              ),
              a: ({ href, children }) => (
                <a
                  href={href}
                  className="text-brass-500 hover:text-brass-400 underline transition-colors"
                >
                  {children}
                </a>
              ),
            }}
          >
            {content}
          </Markdown>
        </article>

        {lastUpdated && (
          <p className="text-iron-600 text-sm mt-12">
            Last updated: {lastUpdated}
          </p>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-iron-800 mt-12">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex flex-wrap gap-6 text-sm text-iron-500">
            <Link href="/privacy" className="hover:text-iron-300 transition-colors">
              Privacy Policy
            </Link>
            <Link href="/terms" className="hover:text-iron-300 transition-colors">
              Terms of Service
            </Link>
            <Link href="/" className="hover:text-iron-300 transition-colors">
              Home
            </Link>
          </div>
          <p className="text-iron-600 text-sm mt-4">
            &copy; {new Date().getFullYear()} IronScout. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  )
}
