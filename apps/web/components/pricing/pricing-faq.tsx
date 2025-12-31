'use client'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

const faqs = [
  {
  question: 'What does your search do?',
    answer: 'IronScout uses AI to understand ammo listings and normalize messy product data across retailers. This helps you search by intent (like "9mm for home defense" or "bulk .223 brass case") rather than relying solely on exact keywords or filters.'
  },
  {
    question: 'What\'s the difference between Free and Premium?',
  answer: 'Free gives you full intent-aware search, current prices, and basic alerts. Premium adds historical price charts, faster alerts, advanced filters, clear explanations for why deals stand out, and expanded watchlist limits. Premium provides more context — not guarantees.'
  },
  {
    question: 'What do price history charts show?',
    answer: 'Premium price history shows how a product\'s price has changed over 30, 90, or 365 days. This context helps you understand whether today\'s price looks typical, higher than usual, or lower than recent averages. It does not predict future prices.'
  },
  {
    question: 'How are Free alerts different from Premium alerts?',
    answer: 'Free alerts are delayed and have lower limits. Premium alerts are faster, support product-level tracking (not just caliber-level), and allow more active alerts. Premium alerts help you act sooner when prices or availability change.'
  },
  {
    question: 'Can I still use filters with AI search?',
    answer: 'Yes. You can type natural language queries, use specific filters, or combine both. The AI respects your filters and works within your constraints.'
  },
  {
    question: 'What payment methods do you accept?',
    answer: 'We accept major credit cards (Visa, Mastercard, American Express, Discover) through Stripe. Your payment information is never stored on our servers.'
  },
  {
    question: 'Can I cancel my subscription anytime?',
    answer: 'Yes. You can cancel Premium anytime from your account settings. You\'ll keep Premium access until the end of your billing period. No cancellation fees.'
  },
  {
    question: 'Is there a free trial?',
    answer: 'We don\'t offer a traditional trial, but the Free tier is always available. You can use Free indefinitely and upgrade when the added context feels valuable.'
  },
  {
    question: 'What happens to my alerts if I downgrade?',
    answer: 'If you downgrade from Premium to Free, your alerts will continue but with delays and lower limits. Alerts over the Free limit will remain but you won\'t be able to create new ones until you\'re under the limit.'
  },
  {
    question: 'Do you sell ammunition?',
    answer: 'No. IronScout is a search and comparison tool only. All purchases happen directly with retailers. We may earn affiliate commissions on some purchases, which helps keep the Free tier free.'
  },
]

export function PricingFAQ() {
  return (
    <div className="max-w-3xl mx-auto mt-16">
      <h2 className="text-2xl font-bold text-center mb-8">
        Frequently Asked Questions
      </h2>

      <Accordion type="single" collapsible className="w-full">
        {faqs.map((faq, index) => (
          <AccordionItem key={index} value={`item-${index}`}>
            <AccordionTrigger className="text-left">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}
