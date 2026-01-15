'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight, FileJson } from 'lucide-react';
import { CopyButton } from './copy-button';

interface RawDataPanelProps {
  rawData: Record<string, unknown>;
}

export function RawDataPanel({ rawData }: RawDataPanelProps) {
  const [expanded, setExpanded] = useState(false);

  // Extract common fields for quick view
  const quickFields = [
    { key: 'name', label: 'Name' },
    { key: 'title', label: 'Title' },
    { key: 'brand', label: 'Brand' },
    { key: 'url', label: 'URL' },
    { key: 'price', label: 'Price' },
    { key: 'sku', label: 'SKU' },
    { key: 'upc', label: 'UPC' },
    { key: 'caliber', label: 'Caliber' },
    { key: 'roundCount', label: 'Round Count' },
    { key: 'grainWeight', label: 'Grain Weight' },
    { key: 'inStock', label: 'In Stock' },
  ];

  const displayedFields = quickFields
    .filter(f => rawData[f.key] !== undefined && rawData[f.key] !== null)
    .map(f => ({
      ...f,
      value: rawData[f.key],
    }));

  const rawJson = JSON.stringify(rawData, null, 2);

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileJson className="h-4 w-4 text-gray-500" />
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Raw Feed Data
            </h3>
          </div>
          <CopyButton value={rawJson} label="raw JSON" />
        </div>
      </div>

      {/* Quick view fields */}
      <div className="p-4 space-y-2">
        {displayedFields.length > 0 ? (
          <div className="grid grid-cols-2 gap-x-4 gap-y-2">
            {displayedFields.map(field => (
              <div key={field.key} className="flex flex-col">
                <span className="text-xs text-gray-500 font-medium">{field.label}</span>
                <span className="text-sm text-gray-900 font-mono truncate" title={String(field.value)}>
                  {typeof field.value === 'boolean'
                    ? (field.value ? 'Yes' : 'No')
                    : typeof field.value === 'number'
                    ? field.value.toLocaleString()
                    : String(field.value).length > 50
                    ? `${String(field.value).substring(0, 50)}...`
                    : String(field.value)
                  }
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No recognizable fields in raw data</p>
        )}
      </div>

      {/* Expandable JSON section */}
      <div className="border-t border-gray-200">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full px-4 py-2 flex items-center justify-between text-sm text-gray-600 hover:bg-gray-50 transition-colors"
        >
          <span className="font-medium">
            {expanded ? 'Hide' : 'Show'} Full JSON
          </span>
          {expanded ? (
            <ChevronDown className="h-4 w-4" />
          ) : (
            <ChevronRight className="h-4 w-4" />
          )}
        </button>

        {expanded && (
          <div className="px-4 pb-4">
            <pre className="bg-gray-900 text-gray-100 p-3 rounded-lg text-xs overflow-x-auto max-h-96 overflow-y-auto">
              {rawJson}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
