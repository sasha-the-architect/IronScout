'use client'

import { useState, useEffect } from 'react'
import { X, Download, Smartphone } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { createLogger } from '@/lib/logger'
import { BRAND_NAME } from '@/lib/brand'

const logger = createLogger('components:pwa:install-prompt')

const PWA_DISMISS_KEY = 'pwa-prompt-dismissed'
const PWA_DISMISS_PERMANENT = 'permanent'
const PWA_DISMISS_COOLDOWN_DAYS = 7

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [isIOS, setIsIOS] = useState(false)
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    // Check if already installed (standalone mode)
    const standalone = window.matchMedia('(display-mode: standalone)').matches
    setIsStandalone(standalone)
    
    if (standalone) return // Don't show prompt if already installed

    // Check if iOS
    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent)
    setIsIOS(ios)

    // Check if we've already dismissed
    const dismissed = localStorage.getItem(PWA_DISMISS_KEY)

    // Permanently dismissed - never show again
    if (dismissed === PWA_DISMISS_PERMANENT) return

    // Temporarily dismissed - check cooldown
    if (dismissed) {
      const dismissedTime = parseInt(dismissed)
      const daysSinceDismissed = (Date.now() - dismissedTime) / (1000 * 60 * 60 * 24)
      if (daysSinceDismissed < PWA_DISMISS_COOLDOWN_DAYS) return
    }

    // Listen for the beforeinstallprompt event (Chrome, Edge, etc.)
    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      // Show prompt after a delay (don't be too aggressive)
      setTimeout(() => setShowPrompt(true), 3000)
    }

    window.addEventListener('beforeinstallprompt', handler)

    // For iOS, show manual instructions after delay
    if (ios && !standalone) {
      setTimeout(() => setShowPrompt(true), 5000)
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handler)
    }
  }, [])

  const handleInstall = async () => {
    if (!deferredPrompt) return

    // Show the install prompt
    await deferredPrompt.prompt()
    
    // Wait for the user's choice
    const { outcome } = await deferredPrompt.userChoice

    if (outcome === 'accepted') {
      logger.info('User accepted the install prompt')
    }
    
    // Clear the prompt
    setDeferredPrompt(null)
    setShowPrompt(false)
  }

  const handleDismiss = (permanent = false) => {
    setShowPrompt(false)
    if (permanent) {
      localStorage.setItem(PWA_DISMISS_KEY, PWA_DISMISS_PERMANENT)
      logger.info('User permanently dismissed the install prompt')
    } else {
      localStorage.setItem(PWA_DISMISS_KEY, Date.now().toString())
    }
  }

  // Don't render if already installed or shouldn't show
  if (isStandalone || !showPrompt) return null

  // iOS-specific instructions
  if (isIOS) {
    return (
      <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-card border-t border-border shadow-lg safe-area-bottom animate-in slide-in-from-bottom duration-300">
        <div className="flex items-start gap-3 max-w-lg mx-auto">
          <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
            <Smartphone className="h-6 w-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-sm">Install {BRAND_NAME}</h3>
            <p className="text-xs text-muted-foreground mt-1">
              Tap the share button <span className="inline-block px-1">
                <svg className="inline h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/>
                  <polyline points="16 6 12 2 8 6"/>
                  <line x1="12" y1="2" x2="12" y2="15"/>
                </svg>
              </span> then &quot;Add to Home Screen&quot;
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => handleDismiss(true)}
              className="flex-shrink-0 p-1 hover:bg-muted rounded text-xs text-muted-foreground"
              aria-label="Don't show again"
              title="Don't show again"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Standard install prompt (Chrome, Edge, etc.)
  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 p-4 bg-card border-t border-border shadow-lg safe-area-bottom animate-in slide-in-from-bottom duration-300">
      <div className="flex items-center gap-3 max-w-lg mx-auto">
        <div className="flex-shrink-0 p-2 bg-primary/10 rounded-lg">
          <Download className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold text-sm">Install {BRAND_NAME}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Add to your home screen for quick access
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleDismiss(false)}
            className="text-xs"
          >
            Not now
          </Button>
          <Button
            size="sm"
            onClick={handleInstall}
            className="text-xs"
          >
            Install
          </Button>
        </div>
      </div>
    </div>
  )
}
