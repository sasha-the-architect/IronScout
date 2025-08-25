import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, Receipt } from 'lucide-react'

const mockPayments = [
  {
    id: 'inv_001',
    date: '2024-01-25',
    amount: 9.99,
    status: 'paid',
    description: 'Premium Plan - Monthly'
  },
  {
    id: 'inv_002',
    date: '2023-12-25',
    amount: 9.99,
    status: 'paid',
    description: 'Premium Plan - Monthly'
  },
  {
    id: 'inv_003',
    date: '2023-11-25',
    amount: 9.99,
    status: 'paid',
    description: 'Premium Plan - Monthly'
  },
  {
    id: 'inv_004',
    date: '2023-10-25',
    amount: 9.99,
    status: 'paid',
    description: 'Premium Plan - Monthly'
  }
]

export function PaymentHistory() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Receipt className="h-5 w-5" />
          Payment History
        </CardTitle>
        <CardDescription>
          Your recent billing transactions and invoices
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {mockPayments.map((payment) => (
            <div key={payment.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-medium">{payment.description}</span>
                  <Badge variant="secondary">
                    {payment.status}
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {new Date(payment.date).toLocaleDateString()} • Invoice #{payment.id}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold">${payment.amount}</span>
                <Button size="sm" variant="outline">
                  <Download className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button variant="outline" className="w-full mt-4">
          View All Transactions
        </Button>
      </CardContent>
    </Card>
  )
}
