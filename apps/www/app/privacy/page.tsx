import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Privacy Policy - IronScout',
  description: 'IronScout privacy policy and data handling practices.',
};

export default function Privacy() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold mb-8">Privacy Policy</h1>
        
        <div className="prose prose-invert prose-iron max-w-none space-y-6 text-iron-300">
          <p className="text-lg">Last updated: January 2026</p>
          
          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Information We Collect</h2>
            <p>
              IronScout collects minimal information necessary to provide our ammunition 
              search service. This includes:
            </p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Search queries and preferences</li>
              <li>Account information (email) if you create an account</li>
              <li>Usage analytics to improve our service</li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">How We Use Your Information</h2>
            <p>
              We use collected information to provide and improve our search service. 
              We do not sell your personal information to third parties.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Contact</h2>
            <p>
              Questions about this policy? Contact us at{' '}
              <a href="mailto:privacy@ironscout.ai" className="text-brass-400 hover:text-brass-300">
                privacy@ironscout.ai
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
