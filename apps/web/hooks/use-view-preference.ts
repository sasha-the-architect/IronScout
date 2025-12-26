'use client'

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import type { ViewMode } from '@/components/results/view-toggle'

const STORAGE_KEY = 'ironscout:view-preference'

// Subscribers for cross-component sync
let listeners: Array<() => void> = []

function subscribe(listener: () => void) {
  listeners = [...listeners, listener]
  return () => {
    listeners = listeners.filter(l => l !== listener)
  }
}

function getSnapshot(): ViewMode {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'card' || stored === 'grid') {
    return stored
  }
  return 'card'
}

function getServerSnapshot(): ViewMode {
  return 'card'
}

function setViewPreference(mode: ViewMode) {
  localStorage.setItem(STORAGE_KEY, mode)
  // Notify all subscribers
  listeners.forEach(listener => listener())
}

/**
 * Hook to persist view preference in localStorage
 * Uses useSyncExternalStore for cross-component reactivity
 */
export function useViewPreference(defaultValue: ViewMode = 'card'): [ViewMode, (mode: ViewMode) => void] {
  const viewMode = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  return [viewMode, setViewPreference]
}
