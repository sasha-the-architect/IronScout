'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Zap, VolumeX, Eye, Gauge, Target, Crosshair, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { BulletType, PressureRating, BULLET_TYPE_LABELS, PRESSURE_RATING_LABELS } from '@/lib/api'

// Bullet type options grouped by category
const BULLET_TYPE_OPTIONS = [
  { category: 'Defensive', options: [
    { value: 'JHP', label: 'JHP - Jacketed Hollow Point' },
    { value: 'HP', label: 'HP - Hollow Point' },
    { value: 'BJHP', label: 'BJHP - Bonded JHP' },
    { value: 'HST', label: 'HST - Federal HST' },
    { value: 'GDHP', label: 'GDHP - Gold Dot HP' },
    { value: 'XTP', label: 'XTP - Hornady XTP' },
  ]},
  { category: 'Training', options: [
    { value: 'FMJ', label: 'FMJ - Full Metal Jacket' },
    { value: 'TMJ', label: 'TMJ - Total Metal Jacket' },
    { value: 'BALL', label: 'Ball' },
  ]},
  { category: 'Hunting', options: [
    { value: 'SP', label: 'SP - Soft Point' },
    { value: 'JSP', label: 'JSP - Jacketed Soft Point' },
    { value: 'VMAX', label: 'V-Max' },
  ]},
  { category: 'Specialty', options: [
    { value: 'FRANGIBLE', label: 'Frangible' },
    { value: 'WADCUTTER', label: 'Wadcutter' },
  ]},
]

const PRESSURE_OPTIONS = [
  { value: 'STANDARD', label: 'Standard' },
  { value: 'PLUS_P', label: '+P (Higher Velocity)' },
  { value: 'PLUS_P_PLUS', label: '+P+ (Maximum)' },
  { value: 'NATO', label: 'NATO Spec' },
]

interface PremiumFiltersProps {
  isPremium: boolean
  className?: string
}

export function PremiumFilters({ isPremium: _isPremium, className }: PremiumFiltersProps) {
  const router = useRouter()
  const searchParams = useSearchParams()

  // Get current Premium filter values from URL
  const getFiltersFromUrl = () => ({
    bulletType: searchParams.get('bulletType') || '',
    pressureRating: searchParams.get('pressureRating') || '',
    isSubsonic: searchParams.get('isSubsonic') === 'true',
    shortBarrelOptimized: searchParams.get('shortBarrelOptimized') === 'true',
    suppressorSafe: searchParams.get('suppressorSafe') === 'true',
    lowFlash: searchParams.get('lowFlash') === 'true',
    lowRecoil: searchParams.get('lowRecoil') === 'true',
    matchGrade: searchParams.get('matchGrade') === 'true',
    minVelocity: searchParams.get('minVelocity') || '',
    maxVelocity: searchParams.get('maxVelocity') || '',
  })

  const [filters, setFilters] = useState(getFiltersFromUrl())

  // Count active Premium filters
  const activeFilterCount = Object.entries(filters).filter(([key, value]) => {
    if (typeof value === 'boolean') return value === true
    return value !== ''
  }).length

  // Sync filters with URL
  useEffect(() => {
    setFilters(getFiltersFromUrl())
  }, [searchParams])

  // Apply filter changes
  const applyFilter = (key: string, value: string | boolean) => {
    const params = new URLSearchParams(searchParams.toString())
    
    if (value === '' || value === false) {
      params.delete(key)
    } else {
      params.set(key, String(value))
    }
    
    params.delete('page')
    router.push(`/search?${params.toString()}`)
  }

  // Clear all Premium filters
  const clearPremiumFilters = () => {
    const params = new URLSearchParams(searchParams.toString())
    
    // Remove all Premium filter params
    const premiumParams = [
      'bulletType', 'pressureRating', 'isSubsonic',
      'shortBarrelOptimized', 'suppressorSafe', 'lowFlash',
      'lowRecoil', 'matchGrade', 'minVelocity', 'maxVelocity'
    ]
    premiumParams.forEach(p => params.delete(p))
    params.delete('page')
    
    router.push(`/search?${params.toString()}`)
  }

  const FilterWrapper = ({ children }: { children: React.ReactNode; label: string }) => (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{children}</div>
        </TooltipTrigger>
        <TooltipContent>
          <p className="text-sm">Filter option</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )

  return (
    <div className={className}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">Performance Filters</h3>
          {activeFilterCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {activeFilterCount} active
            </Badge>
          )}
        </div>
        {activeFilterCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearPremiumFilters}
            className="h-7 text-xs"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Clear
          </Button>
        )}
      </div>

      <div className="space-y-4">
        {/* Bullet Type */}
        <FilterWrapper label="bullet type filter">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Bullet Type
            </Label>
            <Select
              value={filters.bulletType || '_all'}
              onValueChange={(value) => applyFilter('bulletType', value === '_all' ? '' : value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All types</SelectItem>
                {BULLET_TYPE_OPTIONS.map((group) => (
                  <div key={group.category}>
                    <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted">
                      {group.category}
                    </div>
                    {group.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </div>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FilterWrapper>

        {/* Pressure Rating */}
        <FilterWrapper label="pressure rating filter">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Pressure Rating
            </Label>
            <Select
              value={filters.pressureRating || '_all'}
              onValueChange={(value) => applyFilter('pressureRating', value === '_all' ? '' : value)}
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="All pressures" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">All pressures</SelectItem>
                {PRESSURE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FilterWrapper>

        {/* Performance Toggles */}
        <div className="space-y-3 pt-2">
          <Label className="text-xs text-muted-foreground">Performance Characteristics</Label>
          
          <FilterWrapper label="subsonic filter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VolumeX className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Subsonic</span>
              </div>
              <Switch
                checked={filters.isSubsonic}
                onCheckedChange={(checked) => applyFilter('isSubsonic', checked)}
              />
            </div>
          </FilterWrapper>

          <FilterWrapper label="short barrel filter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Short Barrel Optimized</span>
              </div>
              <Switch
                checked={filters.shortBarrelOptimized}
                onCheckedChange={(checked) => applyFilter('shortBarrelOptimized', checked)}
              />
            </div>
          </FilterWrapper>

          <FilterWrapper label="suppressor safe filter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <VolumeX className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Suppressor Safe</span>
              </div>
              <Switch
                checked={filters.suppressorSafe}
                onCheckedChange={(checked) => applyFilter('suppressorSafe', checked)}
              />
            </div>
          </FilterWrapper>

          <FilterWrapper label="low flash filter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Low Flash</span>
              </div>
              <Switch
                checked={filters.lowFlash}
                onCheckedChange={(checked) => applyFilter('lowFlash', checked)}
              />
            </div>
          </FilterWrapper>

          <FilterWrapper label="low recoil filter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Target className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Low Recoil</span>
              </div>
              <Switch
                checked={filters.lowRecoil}
                onCheckedChange={(checked) => applyFilter('lowRecoil', checked)}
              />
            </div>
          </FilterWrapper>

          <FilterWrapper label="match grade filter">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Crosshair className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Match Grade</span>
              </div>
              <Switch
                checked={filters.matchGrade}
                onCheckedChange={(checked) => applyFilter('matchGrade', checked)}
              />
            </div>
          </FilterWrapper>
        </div>

        {/* Velocity Range - Future enhancement */}
        {/* <FilterWrapper label="velocity range filter">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">
              Muzzle Velocity (fps)
            </Label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                placeholder="Min"
                value={filters.minVelocity}
                onChange={(e) => applyFilter('minVelocity', e.target.value)}
                
                className="w-full h-9 px-3 text-sm border rounded-md"
              />
              <span className="text-muted-foreground">-</span>
              <input
                type="number"
                placeholder="Max"
                value={filters.maxVelocity}
                onChange={(e) => applyFilter('maxVelocity', e.target.value)}
                
                className="w-full h-9 px-3 text-sm border rounded-md"
              />
            </div>
          </div>
        </FilterWrapper> */}
      </div>
    </div>
  )
}
