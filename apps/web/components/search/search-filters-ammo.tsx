'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Filter, X } from 'lucide-react'

// Ammo-specific filter options
const calibers = [
  '9mm',
  '.45 ACP',
  '.40 S&W',
  '.38 Special',
  '.357 Magnum',
  '10mm Auto',
  '.380 ACP',
  '5.56 NATO',
  '.223 Remington',
  '.22 LR',
  '7.62x39mm',
  '.308 Winchester',
  '.30-06 Springfield',
  '.300 Blackout',
  '6.5 Creedmoor',
  '12 Gauge',
  '20 Gauge',
]

const grainWeights = ['55', '62', '77', '115', '124', '147', '150', '165', '168', '175', '180', '230']

const caseMaterials = ['Brass', 'Steel', 'Aluminum', 'Nickel-Plated', 'Polymer']

const purposes = ['Target', 'Defense', 'Hunting', 'Precision', 'Training']

export function SearchFiltersAmmo() {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Standard filters
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [priceRange, setPriceRange] = useState([0, 1000])
  const [inStockOnly, setInStockOnly] = useState(false)

  // Ammo-specific filters
  const [selectedCaliber, setSelectedCaliber] = useState<string>('')
  const [selectedGrainWeight, setSelectedGrainWeight] = useState<string>('')
  const [selectedCaseMaterial, setSelectedCaseMaterial] = useState<string>('')
  const [selectedPurpose, setSelectedPurpose] = useState<string>('')
  const [roundsRange, setRoundsRange] = useState([0, 1000])

  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Initialize from URL params
  useEffect(() => {
    const brand = searchParams.get('brand') || ''
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const inStock = searchParams.get('inStock') === 'true'

    // Ammo params
    const caliber = searchParams.get('caliber') || ''
    const grainWeight = searchParams.get('grainWeight') || ''
    const caseMaterial = searchParams.get('caseMaterial') || ''
    const purpose = searchParams.get('purpose') || ''
    const minRounds = searchParams.get('minRounds')
    const maxRounds = searchParams.get('maxRounds')

    setSelectedBrand(brand)
    if (minPrice || maxPrice) {
      setPriceRange([
        minPrice ? parseInt(minPrice) : 0,
        maxPrice ? parseInt(maxPrice) : 1000
      ])
    }
    setInStockOnly(inStock)

    setSelectedCaliber(caliber)
    setSelectedGrainWeight(grainWeight)
    setSelectedCaseMaterial(caseMaterial)
    setSelectedPurpose(purpose)
    if (minRounds || maxRounds) {
      setRoundsRange([
        minRounds ? parseInt(minRounds) : 0,
        maxRounds ? parseInt(maxRounds) : 1000
      ])
    }
  }, [searchParams])

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString())

    // Preserve search query
    const query = searchParams.get('q')
    if (query) params.set('q', query)

    // Standard filters
    if (selectedBrand) {
      params.set('brand', selectedBrand)
    } else {
      params.delete('brand')
    }

    if (priceRange[0] > 0) {
      params.set('minPrice', priceRange[0].toString())
    } else {
      params.delete('minPrice')
    }

    if (priceRange[1] < 1000) {
      params.set('maxPrice', priceRange[1].toString())
    } else {
      params.delete('maxPrice')
    }

    if (inStockOnly) {
      params.set('inStock', 'true')
    } else {
      params.delete('inStock')
    }

    // Ammo-specific filters
    if (selectedCaliber) {
      params.set('caliber', selectedCaliber)
    } else {
      params.delete('caliber')
    }

    if (selectedGrainWeight) {
      params.set('grainWeight', selectedGrainWeight)
    } else {
      params.delete('grainWeight')
    }

    if (selectedCaseMaterial) {
      params.set('caseMaterial', selectedCaseMaterial)
    } else {
      params.delete('caseMaterial')
    }

    if (selectedPurpose) {
      params.set('purpose', selectedPurpose)
    } else {
      params.delete('purpose')
    }

    if (roundsRange[0] > 0) {
      params.set('minRounds', roundsRange[0].toString())
    } else {
      params.delete('minRounds')
    }

    if (roundsRange[1] < 1000) {
      params.set('maxRounds', roundsRange[1].toString())
    } else {
      params.delete('maxRounds')
    }

    // Reset to page 1 when filters change
    params.delete('page')

    router.push(`/search?${params.toString()}`)
  }

  const clearFilters = () => {
    const params = new URLSearchParams()
    const query = searchParams.get('q')
    if (query) params.set('q', query)

    setSelectedBrand('')
    setPriceRange([0, 1000])
    setInStockOnly(false)
    setSelectedCaliber('')
    setSelectedGrainWeight('')
    setSelectedCaseMaterial('')
    setSelectedPurpose('')
    setRoundsRange([0, 1000])

    router.push(`/search?${params.toString()}`)
  }

  const hasActiveFilters =
    selectedBrand ||
    priceRange[0] > 0 ||
    priceRange[1] < 1000 ||
    inStockOnly ||
    selectedCaliber ||
    selectedGrainWeight ||
    selectedCaseMaterial ||
    selectedPurpose ||
    roundsRange[0] > 0 ||
    roundsRange[1] < 1000

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Active Filters */}
      {hasActiveFilters && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Active Filters</h3>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCaliber && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedCaliber}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSelectedCaliber('')}
                />
              </Badge>
            )}
            {selectedGrainWeight && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedGrainWeight}gr
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSelectedGrainWeight('')}
                />
              </Badge>
            )}
            {selectedCaseMaterial && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedCaseMaterial}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSelectedCaseMaterial('')}
                />
              </Badge>
            )}
            {selectedPurpose && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedPurpose}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSelectedPurpose('')}
                />
              </Badge>
            )}
            {selectedBrand && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedBrand}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSelectedBrand('')}
                />
              </Badge>
            )}
            {inStockOnly && (
              <Badge variant="secondary" className="flex items-center gap-1">
                In Stock
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setInStockOnly(false)}
                />
              </Badge>
            )}
          </div>
        </div>
      )}

      {/* Availability */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Availability</CardTitle>
        </CardHeader>
        <CardContent>
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={inStockOnly}
              onChange={(e) => setInStockOnly(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span className="text-sm">In Stock Only</span>
          </label>
        </CardContent>
      </Card>

      {/* Caliber */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Caliber</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={selectedCaliber}
            onChange={(e) => setSelectedCaliber(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All Calibers</option>
            {calibers.map(caliber => (
              <option key={caliber} value={caliber}>{caliber}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Grain Weight */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Grain Weight</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={selectedGrainWeight}
            onChange={(e) => setSelectedGrainWeight(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All Weights</option>
            {grainWeights.map(weight => (
              <option key={weight} value={weight}>{weight} gr</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Case Material */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Case Material</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={selectedCaseMaterial}
            onChange={(e) => setSelectedCaseMaterial(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All Materials</option>
            {caseMaterials.map(material => (
              <option key={material} value={material}>{material}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Purpose */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Purpose</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {purposes.map(purpose => (
            <label key={purpose} className="flex items-center space-x-2 cursor-pointer">
              <input
                type="radio"
                name="purpose"
                checked={selectedPurpose === purpose}
                onChange={() => setSelectedPurpose(purpose)}
                className="rounded-full border-gray-300"
              />
              <span className="text-sm">{purpose}</span>
            </label>
          ))}
          {selectedPurpose && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSelectedPurpose('')}
              className="w-full mt-2"
            >
              Clear Purpose
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Total Price */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Total Price</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Slider
            value={priceRange}
            onValueChange={setPriceRange}
            max={1000}
            step={10}
            className="w-full"
          />
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              placeholder="Min"
              value={priceRange[0]}
              onChange={(e) => setPriceRange([parseInt(e.target.value) || 0, priceRange[1]])}
              className="h-8"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="number"
              placeholder="Max"
              value={priceRange[1]}
              onChange={(e) => setPriceRange([priceRange[0], parseInt(e.target.value) || 1000])}
              className="h-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Round Count */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Rounds per Box</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Slider
            value={roundsRange}
            onValueChange={setRoundsRange}
            max={1000}
            step={10}
            className="w-full"
          />
          <div className="flex items-center space-x-2">
            <Input
              type="number"
              placeholder="Min"
              value={roundsRange[0]}
              onChange={(e) => setRoundsRange([parseInt(e.target.value) || 0, roundsRange[1]])}
              className="h-8"
            />
            <span className="text-muted-foreground">to</span>
            <Input
              type="number"
              placeholder="Max"
              value={roundsRange[1]}
              onChange={(e) => setRoundsRange([roundsRange[0], parseInt(e.target.value) || 1000])}
              className="h-8"
            />
          </div>
        </CardContent>
      </Card>

      {/* Brand */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Brand</CardTitle>
        </CardHeader>
        <CardContent>
          <Input
            type="text"
            placeholder="Enter brand name..."
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="h-9"
          />
        </CardContent>
      </Card>

      {/* Apply Button */}
      <Button onClick={applyFilters} className="w-full">
        Apply Filters
      </Button>
    </div>
  )

  return (
    <>
      {/* Mobile Filter Toggle */}
      <div className="lg:hidden mb-4">
        <Button
          variant="outline"
          onClick={() => setShowMobileFilters(!showMobileFilters)}
          className="w-full flex items-center justify-center gap-2"
        >
          <Filter className="h-4 w-4" />
          Filters
        </Button>
      </div>

      {/* Desktop Filters */}
      <div className="hidden lg:block">
        <FilterContent />
      </div>

      {/* Mobile Filters */}
      {showMobileFilters && (
        <div className="lg:hidden mb-6 p-4 border rounded-lg bg-background">
          <FilterContent />
        </div>
      )}
    </>
  )
}
