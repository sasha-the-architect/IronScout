'use client';

import { Fingerprint, Hash, Link as LinkIcon, Package, Barcode } from 'lucide-react';
import { CopyableValue } from './copy-button';

interface IdentityPanelProps {
  matchKey: string;
  identity: {
    type: string;
    value: string;
  };
  feedType: 'RETAILER' | 'AFFILIATE';
  feedId: string;
  runId: string | null;
  retailerId: string | null;
  sourceId: string | null;
}

function getIdentityIcon(type: string) {
  switch (type.toUpperCase()) {
    case 'URL_HASH':
      return <Hash className="h-4 w-4" />;
    case 'UPC':
    case 'EAN':
    case 'GTIN':
      return <Barcode className="h-4 w-4" />;
    case 'SKU':
    case 'MERCHANT_SKU':
      return <Package className="h-4 w-4" />;
    case 'NETWORK_ITEM_ID':
      return <LinkIcon className="h-4 w-4" />;
    default:
      return <Fingerprint className="h-4 w-4" />;
  }
}

function getIdentityLabel(type: string): string {
  switch (type.toUpperCase()) {
    case 'URL_HASH':
      return 'URL Hash';
    case 'UPC':
      return 'UPC Code';
    case 'EAN':
      return 'EAN Code';
    case 'GTIN':
      return 'GTIN';
    case 'SKU':
      return 'SKU';
    case 'MERCHANT_SKU':
      return 'Merchant SKU';
    case 'NETWORK_ITEM_ID':
      return 'Network Item ID';
    default:
      return type;
  }
}

export function IdentityPanel({
  matchKey,
  identity,
  feedType,
  feedId,
  runId,
  retailerId,
  sourceId,
}: IdentityPanelProps) {
  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Identity & Provenance
          </h3>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Primary Identity */}
        <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            {getIdentityIcon(identity.type)}
            <span className="text-xs font-medium text-purple-700 uppercase">
              {getIdentityLabel(identity.type)}
            </span>
          </div>
          <CopyableValue
            value={identity.value}
            label="identity value"
            truncate={identity.value.length > 40}
          />
        </div>

        {/* Match Key */}
        <div>
          <span className="text-xs font-medium text-gray-500 uppercase">Match Key</span>
          <div className="mt-1">
            <CopyableValue value={matchKey} label="match key" truncate />
          </div>
        </div>

        {/* Feed Details */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase">Feed Type</span>
            <div className="mt-1">
              <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                feedType === 'AFFILIATE'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-blue-100 text-blue-700'
              }`}>
                {feedType}
              </span>
            </div>
          </div>
          <div>
            <span className="text-xs font-medium text-gray-500 uppercase">Feed ID</span>
            <div className="mt-1">
              <CopyableValue value={feedId} label="feed ID" truncate />
            </div>
          </div>
        </div>

        {/* Run and Source */}
        <div className="grid grid-cols-2 gap-4">
          {runId && (
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Run ID</span>
              <div className="mt-1">
                <CopyableValue value={runId} label="run ID" truncate />
              </div>
            </div>
          )}
          {feedType === 'RETAILER' && retailerId && (
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Retailer ID</span>
              <div className="mt-1">
                <CopyableValue value={retailerId} label="retailer ID" truncate />
              </div>
            </div>
          )}
          {feedType === 'AFFILIATE' && sourceId && (
            <div>
              <span className="text-xs font-medium text-gray-500 uppercase">Source ID</span>
              <div className="mt-1">
                <CopyableValue value={sourceId} label="source ID" truncate />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
