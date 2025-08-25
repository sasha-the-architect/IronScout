import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

const faqs = [
  {
    question: 'How does the free trial work?',
    answer: 'You get full access to Premium features for 14 days, no credit card required. After the trial, you can choose to upgrade or continue with the free plan.'
  },
  {
    question: 'Can I change plans anytime?',
    answer: 'Yes! You can upgrade, downgrade, or cancel your subscription at any time. Changes take effect at the next billing cycle.'
  },
  {
    question: 'How accurate are the price alerts?',
    answer: 'Our AI monitors prices across thousands of retailers in real-time. Premium users get alerts within minutes of price changes.'
  },
  {
    question: 'Do you offer refunds?',
    answer: 'Yes, we offer a 30-day money-back guarantee. If you\'re not satisfied, contact us for a full refund.'
  },
  {
    question: 'Is there a limit to how many products I can track?',
    answer: 'Free users can track up to 5 products. Premium and Pro users have unlimited tracking.'
  },
  {
    question: 'How do you make money?',
    answer: 'We earn through subscriptions and affiliate commissions when you purchase through our links. We never sell your data.'
  }
]

export function PricingFAQ() {
  return (
    <div>
      <div className="text-center mb-12">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">
          Frequently Asked Questions
        </h2>
        <p className="text-muted-foreground">
          Everything you need to know about our pricing and features.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {faqs.map((faq, index) => (
          <Card key={index}>
            <CardHeader>
              <CardTitle className="text-lg">{faq.question}</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription className="text-base">
                {faq.answer}
              </CardDescription>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
