'use client';

import { useState } from 'react';

const APP_URL = 'https://app.ironscout.ai';

const exampleQueries = [
  '9mm hollow point',
  'bulk .223 brass case',
  '.308 match grade',
  '5.56 green tip',
  '300 blackout subsonic',
];

export default function Home() {
  const [query, setQuery] = useState('');
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      window.location.href = `${APP_URL}/search?q=${encodeURIComponent(query)}`;
    }
  };

  const handleExampleClick = (example: string) => {
    window.location.href = `${APP_URL}/search?q=${encodeURIComponent(example)}`;
  };

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;
    
    setStatus('loading');
    
    // TODO: Connect to your waitlist API
    await new Promise(resolve => setTimeout(resolve, 1000));
    setStatus('success');
    setEmail('');
  };

  return (
    <div className="relative">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-iron-950/80 backdrop-blur-md border-b border-iron-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brass-500 rounded flex items-center justify-center">
                <svg className="w-5 h-5 text-iron-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <span className="font-display text-xl font-semibold tracking-tight">
                Iron<span className="text-brass-400">Scout</span>
              </span>
            </div>
            
            <div className="flex items-center gap-6">
              <a 
                href="/about"
                className="text-iron-400 hover:text-white text-sm font-medium transition-colors hidden sm:block"
              >
                About
              </a>
              <a 
                href="/retailers"
                className="text-iron-400 hover:text-white text-sm font-medium transition-colors hidden sm:block"
              >
                For Retailers
              </a>
              <a 
                href={`${APP_URL}/login`}
                className="text-iron-300 hover:text-white text-sm font-medium transition-colors"
              >
                Sign In
              </a>
              <a 
                href={`${APP_URL}/register`}
                className="btn-primary text-sm py-2"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center pt-16">
        {/* Background decoration */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-1/4 -right-64 w-[600px] h-[600px] bg-brass-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 -left-64 w-[500px] h-[500px] bg-gunmetal-500/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-24">
          <div className="max-w-4xl mx-auto text-center">
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-brass-500/10 border border-brass-500/20 rounded-full mb-6">
              <span className="w-2 h-2 bg-brass-400 rounded-full animate-pulse-slow" />
              <span className="text-brass-400 text-sm font-medium">Now in Beta</span>
            </div>

            {/* Headline */}
            <h1 className="font-display text-5xl md:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.1] mb-4">
              Intent-aware ammo search
            </h1>
            <p className="text-2xl md:text-3xl text-iron-400 font-display mb-6">
              with real price history
            </p>
            
            <p className="text-lg md:text-xl text-iron-300 max-w-2xl mx-auto mb-4">
              IronScout uses AI to understand ammo listings across retailers, helping you 
              search by intent, compare prices over time, and spot deals that stand out from recent history.
            </p>

            <p className="text-lg md:text-xl font-semibold text-iron-100 mb-10">
              Track prices. See context. Miss fewer deals.
            </p>

            {/* Search Box */}
            <form onSubmit={handleSearch} className="max-w-2xl mx-auto mb-6">
              <div className="relative flex items-center">
                <div className="absolute left-4 flex items-center">
                  <svg className="w-5 h-5 text-iron-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by caliber, brand, or use case..."
                  className="w-full pl-12 pr-32 py-4 text-lg bg-iron-900 border-2 border-iron-700 rounded-2xl 
                           focus:border-brass-500 focus:ring-4 focus:ring-brass-500/20 
                           transition-all text-iron-100 placeholder:text-iron-500"
                />
                <button
                  type="submit"
                  className="absolute right-2 px-6 py-2.5 bg-brass-500 hover:bg-brass-400 
                           text-iron-950 font-semibold rounded-xl transition-all
                           flex items-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                  Search
                </button>
              </div>
            </form>

            {/* Example Queries */}
            <div className="mb-10">
              <p className="text-sm text-iron-500 mb-3">Try:</p>
              <div className="flex flex-wrap justify-center gap-2">
                {exampleQueries.map((example, i) => (
                  <button
                    key={i}
                    onClick={() => handleExampleClick(example)}
                    className="text-sm px-3 py-1.5 rounded-full border border-iron-700 
                             hover:border-brass-500 hover:bg-brass-500/10 
                             transition-colors text-iron-400 hover:text-brass-400"
                  >
                    {example}
                  </button>
                ))}
              </div>
            </div>

            {/* CTAs */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <a href={`${APP_URL}/dashboard`} className="btn-primary text-lg px-8 py-4">
                <svg className="w-5 h-5 mr-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
                Start Tracking Prices
              </a>
              <a href={`${APP_URL}/search`} className="btn-secondary text-lg px-8 py-4">
                Explore Current Deals
                <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>
            </div>

            {/* Social proof */}
            <div className="flex items-center justify-center gap-6 pt-12">
              <div className="flex -space-x-2">
                {[...Array(4)].map((_, i) => (
                  <div 
                    key={i} 
                    className="w-10 h-10 rounded-full bg-iron-700 border-2 border-iron-950 flex items-center justify-center"
                  >
                    <span className="text-xs font-medium text-iron-400">
                      {['JD', 'MK', 'TR', 'AS'][i]}
                    </span>
                  </div>
                ))}
              </div>
              <div className="text-sm text-iron-400">
                <span className="text-iron-100 font-semibold">500+</span> shooters searching daily
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 border-t border-iron-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-heading mb-4">
              Not Your Average<br />
              <span className="text-gradient">Ammo Search</span>
            </h2>
            <p className="text-iron-400 text-lg max-w-2xl mx-auto">
              Built by shooters, for shooters. We combine AI technology with deep ammunition 
              knowledge to help you find exactly what you need.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                  </svg>
                ),
                title: 'AI-Powered Search',
                description: 'Natural language queries understand context. Search "quiet 9mm for suppressor" and get subsonic results.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                ),
                title: 'Real-Time Prices',
                description: 'Prices updated continuously from 50+ retailers. See cost-per-round, shipping estimates, and stock status.',
              },
              {
                icon: (
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                ),
                title: 'Ballistic Data',
                description: 'Velocity, energy, trajectory data integrated. Compare performance characteristics, not just prices.',
              },
            ].map((feature, i) => (
              <div key={i} className="card group hover:border-iron-600 transition-colors">
                <div className="w-12 h-12 bg-brass-500/10 rounded-lg flex items-center justify-center text-brass-400 mb-4 group-hover:bg-brass-500/20 transition-colors">
                  {feature.icon}
                </div>
                <h3 className="font-display text-xl font-semibold mb-2">{feature.title}</h3>
                <p className="text-iron-400 leading-relaxed">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Comparison Section */}
      <section className="py-24 bg-iron-900/30 border-y border-iron-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-heading mb-4">
              Why <span className="text-gradient">IronScout</span>?
            </h2>
            <p className="text-iron-400 text-lg max-w-2xl mx-auto">
              We built what we wished existed. Here's how we compare to the alternatives.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-iron-700">
                  <th className="text-left py-4 px-4 font-display text-lg">Feature</th>
                  <th className="text-center py-4 px-4 font-display text-lg text-brass-400">IronScout</th>
                  <th className="text-center py-4 px-4 font-display text-lg text-iron-500">Others</th>
                </tr>
              </thead>
              <tbody className="text-iron-300">
                {[
                  { feature: 'AI-powered natural language search', ironscout: true, others: false },
                  { feature: 'Price history & trends', ironscout: true, others: 'Limited' },
                  { feature: 'Intent-based filtering (defense, match, plinking)', ironscout: true, others: false },
                  { feature: 'Ballistic data integration', ironscout: true, others: false },
                  { feature: 'Real-time stock alerts', ironscout: true, others: true },
                  { feature: 'Cost-per-round calculation', ironscout: true, others: true },
                  { feature: 'No ads or sponsored listings', ironscout: true, others: false },
                ].map((row, i) => (
                  <tr key={i} className="border-b border-iron-800/50">
                    <td className="py-4 px-4">{row.feature}</td>
                    <td className="text-center py-4 px-4">
                      {row.ironscout === true ? (
                        <svg className="w-6 h-6 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : (
                        <span className="text-iron-500">{row.ironscout}</span>
                      )}
                    </td>
                    <td className="text-center py-4 px-4">
                      {row.others === true ? (
                        <svg className="w-6 h-6 text-green-400 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      ) : row.others === false ? (
                        <svg className="w-6 h-6 text-iron-600 mx-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      ) : (
                        <span className="text-iron-500">{row.others}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="section-heading mb-4">How It Works</h2>
            <p className="text-iron-400 text-lg max-w-2xl mx-auto">
              Three steps to finding the best deals
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: '01',
                title: 'Search',
                description: 'Enter what you need — caliber, brand, use case. Our AI understands shooter terminology.',
              },
              {
                step: '02',
                title: 'Compare',
                description: 'See real-time prices from 50+ retailers. Filter by brand, price, stock, and shipping.',
              },
              {
                step: '03',
                title: 'Buy',
                description: 'Click through to the retailer and complete your purchase. No middleman, no markup.',
              },
            ].map((item, i) => (
              <div key={i} className="relative">
                <div className="absolute -top-6 left-0 font-display text-6xl font-bold text-iron-800/50">
                  {item.step}
                </div>
                <div className="relative pt-8">
                  <h3 className="font-display text-xl font-semibold mb-2">{item.title}</h3>
                  <p className="text-iron-400 leading-relaxed">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 border-t border-iron-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="section-heading mb-4">
            Ready to Find<br />
            <span className="text-gradient">Better Deals?</span>
          </h2>
          <p className="text-iron-400 text-lg mb-8 max-w-2xl mx-auto">
            Join hundreds of shooters already using IronScout to find the best 
            ammunition prices. Free to use, no account required to search.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a href={`${APP_URL}/search`} className="btn-primary text-lg px-8 py-4">
              Start Searching
              <svg className="w-5 h-5 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </a>
            <a href={`${APP_URL}/register`} className="btn-secondary text-lg px-8 py-4">
              Create Free Account
            </a>
          </div>

          {/* Waitlist form - for premium features */}
          <div className="mt-12 pt-12 border-t border-iron-800/50">
            <p className="text-iron-400 text-sm mb-4">
              Want early access to premium features like price alerts and deal sniping? Join the waitlist.
            </p>
            <form onSubmit={handleWaitlist} className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto">
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input-field flex-1"
                disabled={status === 'loading' || status === 'success'}
              />
              <button 
                type="submit" 
                className="btn-secondary whitespace-nowrap"
                disabled={status === 'loading' || status === 'success'}
              >
                {status === 'loading' ? 'Joining...' : status === 'success' ? 'You\'re In!' : 'Join Waitlist'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-iron-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-8">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brass-500 rounded flex items-center justify-center">
                <svg className="w-5 h-5 text-iron-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <span className="font-display text-xl font-semibold tracking-tight">
                Iron<span className="text-brass-400">Scout</span>
              </span>
            </div>

            <div className="flex items-center gap-8 text-sm text-iron-400">
              <a href="/about" className="hover:text-white transition-colors">About</a>
              <a href="/retailers" className="hover:text-white transition-colors">For Retailers</a>
              <a href={`${APP_URL}/search`} className="hover:text-white transition-colors">Search</a>
              <a href="mailto:hello@ironscout.ai" className="hover:text-white transition-colors">Contact</a>
              <a href="/privacy" className="hover:text-white transition-colors">Privacy</a>
              <a href="/terms" className="hover:text-white transition-colors">Terms</a>
            </div>

            <div className="text-sm text-iron-500">
              © {new Date().getFullYear()} IronScout. All rights reserved.
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
