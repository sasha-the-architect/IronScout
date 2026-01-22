'use client'

import { useState } from 'react'
import { useSession } from 'next-auth/react'
import Link from 'next/link'
import Image from 'next/image'
import { ArrowLeft, Info, TrendingDown, TrendingUp, Minus, AlertCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  checkPrice,
  CALIBERS,
  type CaliberValue,
  type PriceCheckResult,
  type PriceClassification,
} from '@/lib/api'

/**
 * Price Check Page
 *
 * Per mobile_price_check_v1_spec.md:
 * - Mobile-first route for instant price sanity checks
 * - Answers: "Is this price normal, high, or unusually low right now?"
 * - No verdicts or recommendations (BUY/WAIT/SKIP)
 */
export default function PriceCheckPage() {
  const { data: session } = useSession()
  const [caliber, setCaliber] = useState<CaliberValue | ''>('')
  const [price, setPrice] = useState('')
  const [brand, setBrand] = useState('')
  const [grain, setGrain] = useState('')
  const [result, setResult] = useState<PriceCheckResult | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Extract token from session
  const token = (session as any)?.accessToken as string | undefined

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!caliber || !price) return

    setIsLoading(true)
    setError(null)
    setResult(null)

    try {
      const pricePerRound = parseFloat(price)
      if (isNaN(pricePerRound) || pricePerRound <= 0) {
        throw new Error('Please enter a valid price')
      }

      const response = await checkPrice(
        {
          caliber: caliber as CaliberValue,
          pricePerRound,
          brand: brand || undefined,
          grain: grain ? parseInt(grain) : undefined,
        },
        token
      )

      setResult(response)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to check price')
    } finally {
      setIsLoading(false)
    }
  }

  const handleReset = () => {
    setResult(null)
    setError(null)
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-50">
        <div className="container flex items-center h-14 px-4">
          <Link href="/" className="flex items-center gap-2 mr-4">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo-dark.svg"
              alt="IronScout"
              width={20}
              height={20}
              className="flex-shrink-0"
            />
            <span className="font-semibold">Price Check</span>
          </Link>
        </div>
      </header>

      <main className="container max-w-md mx-auto px-4 py-6">
        {result ? (
          <PriceCheckResultDisplay result={result} onReset={handleReset} />
        ) : (
          <PriceCheckForm
            caliber={caliber}
            setCaliber={setCaliber}
            price={price}
            setPrice={setPrice}
            brand={brand}
            setBrand={setBrand}
            grain={grain}
            setGrain={setGrain}
            onSubmit={handleSubmit}
            isLoading={isLoading}
            error={error}
          />
        )}
      </main>
    </div>
  )
}

/**
 * Price Check Form
 */
function PriceCheckForm({
  caliber,
  setCaliber,
  price,
  setPrice,
  brand,
  setBrand,
  grain,
  setGrain,
  onSubmit,
  isLoading,
  error,
}: {
  caliber: CaliberValue | ''
  setCaliber: (v: CaliberValue | '') => void
  price: string
  setPrice: (v: string) => void
  brand: string
  setBrand: (v: string) => void
  grain: string
  setGrain: (v: string) => void
  onSubmit: (e: React.FormEvent) => void
  isLoading: boolean
  error: string | null
}) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-xl font-semibold">Is this price normal?</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Enter the price you're seeing to compare with recent online prices.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        {/* Caliber - Required */}
        <div className="space-y-2">
          <Label htmlFor="caliber">Caliber *</Label>
          <Select
            value={caliber}
            onValueChange={(v) => setCaliber(v as CaliberValue)}
          >
            <SelectTrigger id="caliber">
              <SelectValue placeholder="Select caliber" />
            </SelectTrigger>
            <SelectContent>
              {CALIBERS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Price - Required */}
        <div className="space-y-2">
          <Label htmlFor="price">Price per round *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="price"
              type="number"
              step="0.01"
              min="0.01"
              max="10"
              placeholder="0.30"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="pl-7"
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Enter the price per round (e.g., $0.30 for 30 cents/rd)
          </p>
        </div>

        {/* Optional: Brand */}
        <div className="space-y-2">
          <Label htmlFor="brand">Brand (optional)</Label>
          <Input
            id="brand"
            placeholder="e.g., Federal, Winchester"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
          />
        </div>

        {/* Optional: Grain */}
        <div className="space-y-2">
          <Label htmlFor="grain">Grain weight (optional)</Label>
          <Input
            id="grain"
            type="number"
            min="1"
            max="1000"
            placeholder="e.g., 115, 124, 147"
            value={grain}
            onChange={(e) => setGrain(e.target.value)}
          />
        </div>

        {error && (
          <div className="flex items-center gap-2 text-destructive text-sm">
            <AlertCircle className="h-4 w-4" />
            {error}
          </div>
        )}

        <Button
          type="submit"
          className="w-full"
          disabled={!caliber || !price || isLoading}
        >
          {isLoading ? 'Checking...' : 'Check Price'}
        </Button>
      </form>

      <p className="text-xs text-center text-muted-foreground">
        Prices compared against recent online deals from major retailers.
        <br />
        This is not financial advice.
      </p>
    </div>
  )
}

/**
 * Price Check Result Display
 */
function PriceCheckResultDisplay({
  result,
  onReset,
}: {
  result: PriceCheckResult
  onReset: () => void
}) {
  const { classification, message, context, freshnessIndicator, caliber, enteredPricePerRound } =
    result

  return (
    <div className="space-y-6">
      {/* Classification Result */}
      <Card className={getClassificationCardClass(classification)}>
        <CardContent className="pt-6">
          <div className="text-center">
            <ClassificationIcon classification={classification} />
            <h2 className="text-2xl font-bold mt-3">{message}</h2>
            <p className="text-lg mt-1">
              ${enteredPricePerRound.toFixed(2)}/rd for{' '}
              {CALIBERS.find((c) => c.value === caliber)?.label || caliber}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Context Information */}
      {context.pricePointCount > 0 && (
        <Card>
          <CardContent className="pt-6">
            <h3 className="font-medium mb-3">Recent Online Range</h3>
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Low</span>
              <span className="text-muted-foreground">High</span>
            </div>
            <div className="relative h-3 bg-muted rounded-full mt-1 mb-2">
              {/* Range bar */}
              <div className="absolute inset-y-0 bg-primary/30 rounded-full"
                   style={{ left: '0%', right: '0%' }} />
              {/* Position indicator */}
              {context.minPrice !== null && context.maxPrice !== null && (
                <div
                  className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-primary rounded-full border-2 border-background"
                  style={{
                    left: `${getPositionPercent(enteredPricePerRound, context.minPrice, context.maxPrice)}%`,
                    transform: 'translate(-50%, -50%)',
                  }}
                />
              )}
            </div>
            <div className="flex items-center justify-between text-sm font-medium">
              <span>${context.minPrice?.toFixed(2) || '—'}/rd</span>
              <span>${context.maxPrice?.toFixed(2) || '—'}/rd</span>
            </div>

            {/* Freshness indicator */}
            <p className="text-xs text-muted-foreground mt-4 flex items-center gap-1">
              <Info className="h-3 w-3" />
              {freshnessIndicator}
            </p>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <div className="space-y-3">
        <Button onClick={onReset} className="w-full">
          Check Another Price
        </Button>

        {!result._meta.hasGunLocker && (
          <Link href="/dashboard/gun-locker">
            <Button variant="outline" className="w-full">
              <Plus className="h-4 w-4 mr-2" />
              Add to Gun Locker for personalized deals
            </Button>
          </Link>
        )}
      </div>

      <p className="text-xs text-center text-muted-foreground">
        Price data is for informational purposes only. No guarantees.
      </p>
    </div>
  )
}

function ClassificationIcon({ classification }: { classification: PriceClassification }) {
  switch (classification) {
    case 'LOWER':
      return (
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30">
          <TrendingDown className="h-8 w-8 text-green-600 dark:text-green-400" />
        </div>
      )
    case 'HIGHER':
      return (
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30">
          <TrendingUp className="h-8 w-8 text-red-600 dark:text-red-400" />
        </div>
      )
    case 'TYPICAL':
      return (
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-900/30">
          <Minus className="h-8 w-8 text-blue-600 dark:text-blue-400" />
        </div>
      )
    case 'INSUFFICIENT_DATA':
      return (
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30">
          <AlertCircle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
        </div>
      )
  }
}

function getClassificationCardClass(classification: PriceClassification): string {
  switch (classification) {
    case 'LOWER':
      return 'border-green-200 dark:border-green-800 bg-green-50/50 dark:bg-green-950/20'
    case 'HIGHER':
      return 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/20'
    case 'TYPICAL':
      return 'border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-950/20'
    case 'INSUFFICIENT_DATA':
      return 'border-amber-200 dark:border-amber-800 bg-amber-50/50 dark:bg-amber-950/20'
  }
}

function getPositionPercent(value: number, min: number, max: number): number {
  if (max === min) return 50
  const position = ((value - min) / (max - min)) * 100
  return Math.max(0, Math.min(100, position))
}
