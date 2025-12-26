/**
 * Analytics Event Tracking
 *
 * Centralized analytics utility for tracking user interactions.
 * Events are structured for easy consumption by analytics platforms.
 */

import { createLogger } from './logger'

const logger = createLogger('analytics')

export type AnalyticsEvent =
  | AffiliateClickEvent
  | TrackToggleEvent
  | DetailsToggleEvent

export interface AffiliateClickEvent {
  event: 'affiliate_click'
  id: string
  retailer: string
  pricePerRound: number
  placement: 'search' | 'for_you' | 'product_detail'
}

export interface TrackToggleEvent {
  event: 'track_toggle'
  id: string
  nextState: boolean
}

export interface DetailsToggleEvent {
  event: 'details_toggle'
  id: string
  expanded: boolean
}

/**
 * Track an analytics event
 *
 * Currently logs to console in development.
 * Extend this function to integrate with your analytics platform
 * (Google Analytics, PostHog, Amplitude, etc.)
 */
export function trackEvent(event: AnalyticsEvent): void {
  // Development logging
  if (process.env.NODE_ENV === 'development') {
    logger.debug('Track event', { event })
  }

  // Google Analytics 4 integration (if available)
  if (typeof window !== 'undefined' && (window as any).gtag) {
    const { event: eventName, ...params } = event
    ;(window as any).gtag('event', eventName, params)
  }

  // PostHog integration (if available)
  if (typeof window !== 'undefined' && (window as any).posthog) {
    const { event: eventName, ...params } = event
    ;(window as any).posthog.capture(eventName, params)
  }

  // Datadog RUM integration (if available)
  if (typeof window !== 'undefined' && (window as any).DD_RUM) {
    const { event: eventName, ...params } = event
    ;(window as any).DD_RUM.addAction(eventName, params)
  }
}

/**
 * Track affiliate click event
 */
export function trackAffiliateClick(
  id: string,
  retailer: string,
  pricePerRound: number,
  placement: AffiliateClickEvent['placement']
): void {
  trackEvent({
    event: 'affiliate_click',
    id,
    retailer,
    pricePerRound,
    placement,
  })
}

/**
 * Track price tracking toggle
 */
export function trackTrackToggle(id: string, nextState: boolean): void {
  trackEvent({
    event: 'track_toggle',
    id,
    nextState,
  })
}

/**
 * Track details expansion toggle
 */
export function trackDetailsToggle(id: string, expanded: boolean): void {
  trackEvent({
    event: 'details_toggle',
    id,
    expanded,
  })
}
