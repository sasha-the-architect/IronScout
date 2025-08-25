'use client'

import { useState } from 'react'
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
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [selectedBrands, setSelectedBrands] = useState<string[]>([])
  const [priceRange, setPriceRange] = useState([0, 1000])
  const [showMobileFilters, setShowMobileFilters] = useState(false)

  const toggleCategory = (category: string) => {
    setSelectedCategories(prev =>
      prev.includes(category)
        ? prev.filter(c => c !== category)
        : [...prev, category]
    )
  }

  const toggleBrand = (brand: string) => {
    setSelectedBrands(prev =>
      prev.includes(brand)
        ? prev.filter(b => b !== brand)
        : [...prev, brand]
    )
  }

  const clearFilters = () => {
    setSelectedCategories([])
    setSelectedBrands([])
    setPriceRange([0, 1000])
  }

  const FilterContent = () => (
    <div className="space-y-6">
      {/* Active Filters */}
      {(selectedCategories.length > 0 || selectedBrands.length > 0) && (
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-sm">Active Filters</h3>
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear All
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedCategories.map(category => (
              <Badge key={category} variant="secondary" className="flex items-center gap-1">
                {category}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => toggleCategory(category)}
                />
              </Badge>
            ))}
            {selectedBrands.map(brand => (
              <Badge key={brand} variant="secondary" className="flex items-center gap-1">
                {brand}
                <X
                  className="h-3 w-3 cursor-pointer"
                  onClick={() => toggleBrand(brand)}
                />
              </Badge>
            ))}
          </div>
        </div>
      )}

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

      {/* Categories */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Categories</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {categories.map(category => (
              <label key={category} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedCategories.includes(category)}
                  onChange={() => toggleCategory(category)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{category}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Brands */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Brands</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {brands.map(brand => (
              <label key={brand} className="flex items-center space-x-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selectedBrands.includes(brand)}
                  onChange={() => toggleBrand(brand)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm">{brand}</span>
              </label>
            ))}
          </div>
        </CardContent>
      </Card>
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
