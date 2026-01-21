import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Terms of Service - IronScout',
  description: 'IronScout terms of service and usage guidelines.',
};

export default function Terms() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold mb-8">Terms of Service</h1>
        
        <div className="prose prose-invert prose-iron max-w-none space-y-6 text-iron-300">
          <p className="text-lg">Last updated: January 2026</p>
          
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Service Description</h2>
            <p>
              IronScout provides an ammunition search and price comparison service. 
              We aggregate pricing information from third-party retailers and display 
              it for informational purposes.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Disclaimer</h2>
            <p>
              IronScout is not a retailer and does not sell ammunition. All purchases 
              are made directly through third-party retailers. We make no guarantees 
              about price accuracy, product availability, or retailer reliability.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">User Responsibilities</h2>
            <p>
              Users are responsible for complying with all applicable federal, state, 
              and local laws regarding ammunition purchase and possession. IronScout 
              does not verify user eligibility to purchase ammunition.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Contact</h2>
            <p>
              Questions about these terms? Contact us at{' '}
              <a href="mailto:legal@ironscout.ai" className="text-brass-400 hover:text-brass-300">
                legal@ironscout.ai
              </a>
            </p>
          </section>
        </div>

        <div className="mt-12 pt-8 border-t border-iron-800">
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
      </div>
    </div>
  );
}
