import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'For Retailers - IronScout',
  description: 'Partner with IronScout to reach more ammunition buyers. List your inventory and grow your sales.',
};

export default function Retailers() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold mb-4">Partner With IronScout</h1>
        <p className="text-xl text-iron-400 mb-12">
          Reach thousands of ammunition buyers actively searching for products like yours.
        </p>
        
        <div className="space-y-12 text-iron-300">
          <section className="space-y-6">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Why List With Us</h2>
            
            <div className="grid gap-6">
              {[
                {
                  title: 'Qualified Traffic',
                  description: 'Our users are actively searching for ammunition with intent to buy. No casual browsers — these are buyers comparing prices and ready to purchase.',
                },
                {
                  title: 'Easy Integration',
                  description: 'Already have a product feed for other aggregators? We support standard feed formats including those used by AmmoSeek and WikiArms. No additional work required.',
                },
                {
                  title: 'Fair Presentation',
                  description: 'No sponsored listings or pay-to-play positioning. Products are ranked by relevance and value, giving every retailer a fair shot at visibility.',
                },
                {
                  title: 'Performance Tracking',
                  description: 'See how your listings perform with detailed analytics on impressions, clicks, and conversion attribution.',
                },
              ].map((item, i) => (
                <div key={i} className="card">
                  <h3 className="font-display text-lg font-semibold text-iron-100 mb-2">{item.title}</h3>
                  <p className="text-iron-400">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="font-display text-2xl font-semibold text-iron-100">How It Works</h2>
            
            <div className="space-y-4">
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-brass-500/20 rounded-full flex items-center justify-center">
                  <span className="text-brass-400 font-semibold">1</span>
                </div>
                <div>
                  <h3 className="font-semibold text-iron-100">Submit Your Feed</h3>
                  <p className="text-iron-400">Send us your existing product feed URL or upload a CSV. We handle the rest.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-brass-500/20 rounded-full flex items-center justify-center">
                  <span className="text-brass-400 font-semibold">2</span>
                </div>
                <div>
                  <h3 className="font-semibold text-iron-100">We Normalize & Index</h3>
                  <p className="text-iron-400">Our system automatically categorizes your products and makes them searchable.</p>
                </div>
              </div>
              
              <div className="flex gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-brass-500/20 rounded-full flex items-center justify-center">
                  <span className="text-brass-400 font-semibold">3</span>
                </div>
                <div>
                  <h3 className="font-semibold text-iron-100">Buyers Find You</h3>
                  <p className="text-iron-400">Your inventory appears in search results. Users click through to your site to complete purchases.</p>
                </div>
              </div>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Feed Requirements</h2>
            
            <div className="card">
              <p className="mb-4">We accept standard product feeds with the following information:</p>
              <ul className="space-y-2 text-iron-400">
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-brass-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Product title and description
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-brass-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Price and quantity (for cost-per-round calculation)
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-brass-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Product URL (where to buy)
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-brass-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Stock status (in stock / out of stock)
                </li>
                <li className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-iron-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                  </svg>
                  <span className="text-iron-500">Optional: UPC, brand, caliber, grain weight, case material</span>
                </li>
              </ul>
              <p className="mt-4 text-sm text-iron-500">
                Already have an AmmoSeek or WikiArms feed? That format works perfectly.
              </p>
            </div>
          </section>

          <section className="space-y-6">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Get Started</h2>
            
            <p className="leading-relaxed">
              Ready to list your inventory on IronScout? Contact our partnerships team 
              to get set up. We typically have new retailers live within 48 hours.
            </p>

            <div className="card border-brass-500/30 bg-brass-500/5">
              <div className="flex flex-col sm:flex-row gap-6 items-start sm:items-center justify-between">
                <div>
                  <h3 className="font-display text-lg font-semibold text-iron-100 mb-1">Contact Partnerships</h3>
                  <p className="text-iron-400">Email us your feed URL or questions</p>
                </div>
                <a 
                  href="mailto:dealers@ironscout.ai" 
                  className="btn-primary whitespace-nowrap"
                >
                  dealers@ironscout.ai
                </a>
              </div>
            </div>
          </section>

          <section className="pt-8 border-t border-iron-800">
            <a 
              href="/" 
              className="text-iron-400 hover:text-white transition-colors inline-flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to Home
            </a>
          </section>
        </div>
      </div>
    </div>
  );
}
