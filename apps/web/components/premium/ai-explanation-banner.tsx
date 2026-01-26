'use client'

import { Sparkles, Info, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import type { SearchIntent } from '@/lib/api'

interface AIExplanationBannerProps {
  intent: SearchIntent
  processingTimeMs?: number
}

export function AIExplanationBanner({ intent, processingTimeMs }: AIExplanationBannerProps) {
  const [dismissed, setDismissed] = useState(false)
  
  if (dismissed) return null
  
  const premiumIntent = intent.premiumIntent
  const hasExplanation = !!premiumIntent?.explanation
  const hasBasicSignals = !!intent.purposeDetected || (intent.calibers?.length ?? 0) > 0 || (intent.grainWeights?.length ?? 0) > 0

  if (!hasExplanation && !hasBasicSignals) return null
  
  return (
    <div className="bg-muted/30 border border-border rounded-xl p-4 mb-6">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-primary/10 rounded-lg flex-shrink-0">
          <Sparkles className="h-4 w-4 text-primary" />
        </div>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-foreground">
              AI Search Analysis
            </span>
            {processingTimeMs && (
              <span className="text-xs text-muted-foreground">
                {processingTimeMs}ms
              </span>
            )}
          </div>
          
          {hasExplanation && (
            <p className="text-sm text-foreground/90 leading-relaxed">
              {premiumIntent.explanation}
            </p>
          )}

          {hasBasicSignals && (
            <p className="text-sm text-muted-foreground mt-2">
              {intent.purposeDetected && (
                <>Detected purpose: <strong>{intent.purposeDetected}</strong>. </>
              )}
              {intent.calibers?.length && (
                <>Searching {intent.calibers.join(', ')}. </>
              )}
              {intent.grainWeights?.length && (
                <>Detected weights: {intent.grainWeights.join('/')}&nbsp;gr. </>
              )}
            </p>
          )}
          
          {/* Reasoning details */}
          {premiumIntent?.reasoning && Object.keys(premiumIntent.reasoning).length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {premiumIntent.environment && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                  <Info className="h-3 w-3" />
                  {premiumIntent.environment === 'indoor' ? 'Indoor use' : 
                   premiumIntent.environment === 'outdoor' ? 'Outdoor use' : 'Indoor/Outdoor'}
                </span>
              )}
              
              {premiumIntent.barrelLength && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                  {premiumIntent.barrelLength === 'short' ? 'Short barrel' :
                   premiumIntent.barrelLength === 'long' ? 'Long barrel' : 'Standard barrel'}
                </span>
              )}
              
              {premiumIntent.suppressorUse && (
                <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                  Suppressor use
                </span>
              )}
              
              {premiumIntent.safetyConstraints?.map(constraint => (
                <span 
                  key={constraint}
                  className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-muted text-foreground"
                >
                  {constraint.replace(/-/g, ' ')}
                </span>
              ))}
              
              {premiumIntent.priorityFocus && (
                <span className="inline-flex items-center text-xs px-2 py-1 rounded-full bg-muted text-foreground">
                  Priority: {premiumIntent.priorityFocus}
                </span>
              )}
            </div>
          )}
          
          {/* Preferred bullet types */}
          {premiumIntent?.preferredBulletTypes && premiumIntent.preferredBulletTypes.length > 0 && (
            <div className="mt-2 text-xs text-muted-foreground">
              <span className="opacity-70">Matching types: </span>
              <span className="font-medium">{premiumIntent.preferredBulletTypes.join(', ')}</span>
            </div>
          )}
        </div>
        
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
    </div>
  )
}
