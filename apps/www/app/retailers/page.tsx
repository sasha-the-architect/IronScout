import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'For Retailers - IronScout',
  description: 'IronScout is an indexing and intelligence layer for ammunition. We do not sell ammo, intermediate checkout, or compete with retailers.',
};

const APP_URL = 'https://app.ironscout.ai';

export default function Retailers() {
  return (
    <div className="relative">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-iron-950/80 backdrop-blur-md border-b border-iron-800/50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <a href="/" className="flex items-center gap-2">
              <div className="w-8 h-8 bg-brass-500 rounded flex items-center justify-center">
                <svg className="w-5 h-5 text-iron-950" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <span className="font-display text-xl font-semibold tracking-tight">
                Iron<span className="text-brass-400">Scout</span>
              </span>
            </a>

            <div className="flex items-center gap-6">
              <a
                href="/about"
                className="text-iron-400 hover:text-white text-sm font-medium transition-colors hidden sm:block"
              >
                About
              </a>
              <a
                href="/retailers"
                className="text-white text-sm font-medium transition-colors hidden sm:block"
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
      <section className="relative pt-32 pb-16">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-0 -left-64 w-[600px] h-[600px] bg-gunmetal-500/5 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h1 className="font-display text-4xl sm:text-5xl font-bold mb-4">
            For Retailers
          </h1>
          <p className="text-xl sm:text-2xl text-iron-400 font-medium mb-8">
            A Neutral Index and Intelligence Layer
          </p>
          <div className="space-y-6 text-iron-300 max-w-3xl">
            <p className="text-lg leading-relaxed">
              <span className="text-iron-100 font-medium">IronScout is not a marketplace.</span>
            </p>
            <p className="leading-relaxed">
              We do not sell ammunition, intermediate checkout, or compete with retailers.
              IronScout functions as an indexing and intelligence layer that helps shooters
              understand available products and market context before choosing where to buy.
            </p>
            <p className="leading-relaxed">
              Our goal is to surface information accurately and consistently, without forcing
              retailers into price-only competition or distorting how products are represented.
            </p>
          </div>
        </div>
      </section>

      {/* How Products Appear */}
      <section className="py-16 border-t border-iron-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            How Products Appear on IronScout
          </h2>
          <div className="space-y-6 text-iron-300">
            <p className="leading-relaxed">
              IronScout ingests publicly available product data from standard industry sources,
              including structured feeds and affiliate-based feeds where available.
            </p>
            <p className="leading-relaxed">
              Products appear on IronScout because they are accessible through these normal
              distribution channels. We do not scrape private systems, bypass access controls,
              or modify retailer sites without permission.
            </p>
            <p className="text-iron-200">
              Listings link directly to the retailer for purchase. IronScout does not
              intermediate the transaction.
            </p>
          </div>
        </div>
      </section>

      {/* Pricing and Availability */}
      <section className="py-16 border-t border-iron-800/50 bg-iron-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            How Pricing and Availability Are Displayed
          </h2>
          <div className="space-y-6 text-iron-300">
            <p className="leading-relaxed">
              IronScout displays pricing and availability as provided by the underlying data sources.
            </p>
            <p className="leading-relaxed">
              Prices are not rewritten, discounted, or optimized for click-through. When possible,
              prices are normalized to reflect real cost—such as cost per round and shipping
              considerations—so users can make fair comparisons.
            </p>
            <p className="leading-relaxed">
              Search results are ordered using consistent, explainable logic designed around
              user intent and context, not solely by lowest price.
            </p>
            <div className="border-l-2 border-iron-700 pl-6 mt-6">
              <p className="text-iron-400 italic">
                IronScout does not issue purchase recommendations or verdicts.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* What IronScout Does Not Do */}
      <section className="py-16 border-t border-iron-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            What IronScout Does Not Do
          </h2>
          <p className="text-iron-300 mb-6">To avoid ambiguity, IronScout does not:</p>
          <div className="space-y-3">
            {[
              'Process or intermediate checkout',
              'Recommend what users should buy',
              'Reorder products arbitrarily to force price competition',
              'Sell preferential placement disguised as relevance',
              'Share retailer-specific competitive intelligence with other retailers',
            ].map((item) => (
              <div key={item} className="flex items-start gap-3 text-iron-400">
                <svg className="w-5 h-5 text-iron-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>{item}</span>
              </div>
            ))}
          </div>
          <p className="text-iron-300 mt-8">
            Our role is to provide context, not pressure.
          </p>
        </div>
      </section>

      {/* Data Accuracy */}
      <section className="py-16 border-t border-iron-800/50 bg-iron-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            Data Accuracy and Corrections
          </h2>
          <div className="space-y-6 text-iron-300">
            <p className="leading-relaxed">
              IronScout makes reasonable efforts to display current and accurate pricing and availability.
            </p>
            <p className="leading-relaxed">
              If a listing appears incorrect, retailers may report the issue. IronScout maintains
              a formal correction process for legitimate errors and does not require a partnership
              or commercial agreement to address data accuracy concerns.
            </p>
            <p className="text-iron-200">
              Accuracy benefits both retailers and users, and corrections are treated as an
              operational matter, not a sales conversation.
            </p>
          </div>
        </div>
      </section>

      {/* Direct Feeds */}
      <section className="py-16 border-t border-iron-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            Optional: Direct or Structured Feeds
          </h2>
          <div className="space-y-6 text-iron-300">
            <p className="leading-relaxed">
              Some retailers choose to provide structured or direct data feeds to improve
              freshness and accuracy.
            </p>
            <div className="bg-iron-900/50 border border-iron-800 rounded-lg p-6">
              <p className="text-iron-200 leading-relaxed">
                This is entirely optional.
              </p>
              <p className="text-iron-400 mt-4 leading-relaxed">
                Providing a direct feed does not affect how existing listings are ordered
                or displayed relative to other retailers.
              </p>
            </div>
            <p className="text-iron-300">
              IronScout does not penalize or deprioritize retailers who choose not to participate.
            </p>
          </div>
        </div>
      </section>

      {/* What We Don't Track */}
      <section className="py-16 border-t border-iron-800/50 bg-iron-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            What IronScout Does Not Track
          </h2>
          <p className="text-iron-300 mb-6">IronScout does not track:</p>
          <ul className="space-y-3 text-iron-400">
            {[
              'Individual user purchases',
              'Inventory levels or ownership',
              'Firearms, serial numbers, or regulated data',
              'Retailer-specific performance analytics shared with competitors',
            ].map((item) => (
              <li key={item} className="flex items-start gap-3">
                <svg className="w-5 h-5 text-iron-600 mt-0.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="text-iron-300 mt-6">
            User activity is handled in aggregate and used only to improve relevance and system behavior.
          </p>
        </div>
      </section>

      {/* Transparency */}
      <section className="py-16 border-t border-iron-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            Transparency and Sustainability
          </h2>
          <div className="space-y-6 text-iron-300">
            <p className="leading-relaxed">
              IronScout is designed to operate sustainably over time.
            </p>
            <p className="leading-relaxed">
              As the platform evolves, additional features or commercial relationships may be
              introduced. When something is promoted or paid, it will be clearly labeled and
              separated from organic results.
            </p>
            <p className="text-iron-200 font-medium">
              Relevance, transparency, and accuracy take priority over short-term monetization.
            </p>
          </div>
        </div>
      </section>

      {/* Contact */}
      <section className="py-16 border-t border-iron-800/50 bg-iron-900/30">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-display text-2xl sm:text-3xl font-semibold text-iron-100 mb-6">
            Questions
          </h2>
          <div className="space-y-6 text-iron-300">
            <p className="leading-relaxed">
              If you have questions about how your products appear, data accuracy, or
              available data interfaces, you can reach us at{' '}
              <a href="mailto:retailers@ironscout.ai" className="text-brass-400 hover:text-brass-300">
                retailers@ironscout.ai
              </a>
            </p>
            <p className="text-iron-400">
              We aim to keep these conversations factual, operational, and low-pressure.
            </p>
          </div>
        </div>
      </section>

      {/* Back link */}
      <section className="py-12 border-t border-iron-800/50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <a
            href="/"
            className="text-iron-400 hover:text-white transition-colors inline-flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Home
          </a>
        </div>
      </section>

      {/* Footer spacing */}
      <div className="h-8" />
    </div>
  );
}
