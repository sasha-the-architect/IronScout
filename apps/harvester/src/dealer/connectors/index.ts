/**
 * Feed Connector Factory
 *
 * Provides the correct connector based on feed format type
 * or attempts auto-detection from content.
 */

import type { FeedFormatType } from '@ironscout/db'
import type { FeedConnector } from './types'
import { GenericConnector } from './generic-connector'
import { AmmoSeekConnector } from './ammoseek-connector'
import { GunEngineConnector } from './gunengine-connector'
import { ImpactConnector } from './impact-connector'

// Export types
export * from './types'

// Export connectors
export { GenericConnector } from './generic-connector'
export { AmmoSeekConnector } from './ammoseek-connector'
export { GunEngineConnector } from './gunengine-connector'
export { ImpactConnector } from './impact-connector'

// Export utilities
export {
  detectContentFormat,
  parseCSV,
  parseJSON,
  parseXML,
  parseContent,
  validateUPC,
} from './base-connector'

// ============================================================================
// CONNECTOR REGISTRY
// ============================================================================

const connectorRegistry: Map<FeedFormatType, FeedConnector> = new Map()

// Register default connectors
connectorRegistry.set('GENERIC', new GenericConnector())
connectorRegistry.set('AMMOSEEK_V1', new AmmoSeekConnector())
connectorRegistry.set('GUNENGINE_V2', new GunEngineConnector())
connectorRegistry.set('IMPACT', new ImpactConnector())

/**
 * Get connector for a specific format type
 */
export function getConnector(formatType: FeedFormatType): FeedConnector {
  const connector = connectorRegistry.get(formatType)
  if (!connector) {
    // Fall back to generic connector
    return connectorRegistry.get('GENERIC')!
  }
  return connector
}

/**
 * Auto-detect the best connector for given content
 * Tries specific connectors first, falls back to generic
 */
export function detectConnector(content: string): FeedConnector {
  // Try specific connectors in order of specificity
  const specificConnectors: FeedConnector[] = [
    connectorRegistry.get('GUNENGINE_V2')!,
    connectorRegistry.get('AMMOSEEK_V1')!,
    connectorRegistry.get('IMPACT')!,
  ]

  for (const connector of specificConnectors) {
    if (connector.canHandle(content)) {
      return connector
    }
  }

  // Fall back to generic
  return connectorRegistry.get('GENERIC')!
}

/**
 * Register a custom connector
 * Allows extending with additional format types
 */
export function registerConnector(connector: FeedConnector): void {
  connectorRegistry.set(connector.formatType, connector)
}

/**
 * Get all registered connectors
 */
export function getAllConnectors(): FeedConnector[] {
  return Array.from(connectorRegistry.values())
}

/**
 * Get connector names for UI display
 */
export function getConnectorOptions(): Array<{ value: FeedFormatType; label: string; description: string }> {
  return [
    {
      value: 'GENERIC',
      label: 'Auto-Detect',
      description: 'Automatically detect CSV, XML, or JSON format',
    },
    {
      value: 'AMMOSEEK_V1',
      label: 'AmmoSeek Compatible',
      description: 'AmmoSeek-compatible feed format',
    },
    {
      value: 'GUNENGINE_V2',
      label: 'GunEngine V2',
      description: 'GunEngine Offer Feed V2 format',
    },
    {
      value: 'IMPACT',
      label: 'Impact Affiliate',
      description: 'Impact Radius affiliate feed format',
    },
  ]
}
