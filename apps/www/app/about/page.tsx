import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About - IronScout',
  description: 'IronScout is building the next generation of ammunition search and price intelligence.',
};

const APP_URL = 'https://app.ironscout.ai';

export default function About() {
  return (
    <div className="min-h-screen pt-24 pb-16">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h1 className="font-display text-4xl font-bold mb-8">About IronScout</h1>
        
        <div className="space-y-8 text-iron-300">
          <section className="space-y-4">
            <p className="text-lg leading-relaxed">
              IronScout is an ammunition search and price intelligence platform built by 
              shooters, for shooters. We're on a mission to bring transparency and 
              intelligence to ammunition pricing.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">The Problem</h2>
            <p className="leading-relaxed">
              Finding the right ammunition at the right price shouldn't be hard. But today's 
              options force you to wade through dozens of retailer sites, decipher inconsistent 
              product titles, and guess whether a price is actually good or just marketed that way.
            </p>
            <p className="leading-relaxed">
              Existing aggregators list prices, but they don't tell you if a deal is 
              actually a deal. They don't understand that "subsonic 9mm" and "quiet 9mm 
              for suppressor" mean the same thing. They don't track price history so you 
              can see trends.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Our Approach</h2>
            <p className="leading-relaxed">
              IronScout uses modern technology to understand ammunition listings the way 
              a knowledgeable shooter would. Our system normalizes messy retailer data into 
              clean, comparable products. It understands intent — so searching for "home 
              defense 9mm" returns defensive hollow points, not range ammo.
            </p>
            <p className="leading-relaxed">
              We track prices over time, so you can see whether today's "sale" is actually 
              below recent averages. We're building the tools we wished existed when we 
              were hunting for deals ourselves.
            </p>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">What We're Building</h2>
            <ul className="space-y-3">
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-brass-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong className="text-iron-100">Intent-aware search</strong> that understands shooter terminology and use cases</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-brass-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong className="text-iron-100">Price history and trends</strong> so you know if a deal is actually good</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-brass-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong className="text-iron-100">Smart alerts</strong> that notify you when prices drop on products you care about</span>
              </li>
              <li className="flex items-start gap-3">
                <svg className="w-5 h-5 text-brass-400 mt-1 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span><strong className="text-iron-100">Ballistic data integration</strong> to compare performance, not just price</span>
              </li>
            </ul>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-2xl font-semibold text-iron-100">Contact</h2>
            <p className="leading-relaxed">
              Questions, feedback, or partnership inquiries? Reach out at{' '}
              <a href="mailto:hello@ironscout.ai" className="text-brass-400 hover:text-brass-300">
                hello@ironscout.ai
              </a>
            </p>
          </section>

          <section className="pt-8 border-t border-iron-800">
            <div className="flex flex-col sm:flex-row gap-4">
              <a href={APP_URL} className="btn-primary">
                Try IronScout
                <svg className="w-4 h-4 ml-2" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                </svg>
              </a>
              <a href="/" className="btn-secondary">
                Back to Home
              </a>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
