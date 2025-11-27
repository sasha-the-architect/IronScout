'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import { Filter, X } from 'lucide-react'

const categories = [
  'Electronics',
  'Home & Garden',
  'Fashion',
  'Sports & Outdoors',
  'Books',
  'Health & Beauty',
  'Automotive',
  'Toys & Games',
]

const brands = [
  'Apple',
  'Samsung',
  'Nike',
  'Adidas',
  'Sony',
  'LG',
  'Canon',
  'Dell',
]

export function SearchFilters() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [selectedBrand, setSelectedBrand] = useState<string>('')
  const [priceRange, setPriceRange] = useState([0, 1000])
  const [inStockOnly, setInStockOnly] = useState(false)
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  // Initialize from URL params
  useEffect(() => {
    const category = searchParams.get('category') || ''
    const brand = searchParams.get('brand') || ''
    const minPrice = searchParams.get('minPrice')
    const maxPrice = searchParams.get('maxPrice')
    const inStock = searchParams.get('inStock') === 'true'

    setSelectedCategory(category)
    setSelectedBrand(brand)
    if (minPrice || maxPrice) {
      setPriceRange([
        minPrice ? parseInt(minPrice) : 0,
        maxPrice ? parseInt(maxPrice) : 1000
      ])
    }
    setInStockOnly(inStock)
  }, [searchParams])

  const applyFilters = () => {
    const params = new URLSearchParams(searchParams.toString())

    // Preserve search query
    const query = searchParams.get('q')
    if (query) params.set('q', query)

    // Apply filters
    if (selectedCategory) {
      params.set('category', selectedCategory)
    } else {
      params.delete('category')
    }

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

    // Reset to page 1 when filters change
    params.delete('page')

    router.push(`/search?${params.toString()}`)
  }

  const clearFilters = () => {
    const params = new URLSearchParams()
    const query = searchParams.get('q')
    if (query) params.set('q', query)

    setSelectedCategory('')
    setSelectedBrand('')
    setPriceRange([0, 1000])
    setInStockOnly(false)

    router.push(`/search?${params.toString()}`)
  }

  const hasActiveFilters = selectedCategory || selectedBrand || priceRange[0] > 0 || priceRange[1] < 1000 || inStockOnly

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
            {selectedCategory && (
              <Badge variant="secondary" className="flex items-center gap-1">
                {selectedCategory}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => setSelectedCategory('')}
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

      {/* Price Range */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Price Range</CardTitle>
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

      {/* Category */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Category</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All Categories</option>
            {categories.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </CardContent>
      </Card>

      {/* Brand */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Brand</CardTitle>
        </CardHeader>
        <CardContent>
          <select
            value={selectedBrand}
            onChange={(e) => setSelectedBrand(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background px-3 py-1 text-sm"
          >
            <option value="">All Brands</option>
            {brands.map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
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
