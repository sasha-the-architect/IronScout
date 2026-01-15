'use client';

import { CheckCircle, XCircle, MinusCircle, Layers } from 'lucide-react';
import { CopyableValue } from './copy-button';

interface ParsedFields {
  name?: string;
  brandNorm?: string;
  caliberNorm?: string;
  grain?: number;
  packCount?: number;
  upcNorm?: string;
  urlNorm?: string;
  price?: number;
  inStock?: boolean;
  identity?: {
    type: string;
    value: string;
  };
}

interface NormalizedFieldsPanelProps {
  parsedFields: ParsedFields | null;
  rawData: Record<string, unknown>;
}

interface FieldDisplay {
  label: string;
  normalizedKey: keyof ParsedFields;
  rawKey: string;
  format?: 'currency' | 'boolean' | 'number' | 'text';
}

const FIELD_CONFIG: FieldDisplay[] = [
  { label: 'Name', normalizedKey: 'name', rawKey: 'name' },
  { label: 'Brand', normalizedKey: 'brandNorm', rawKey: 'brand' },
  { label: 'Caliber', normalizedKey: 'caliberNorm', rawKey: 'caliber' },
  { label: 'Grain', normalizedKey: 'grain', rawKey: 'grainWeight', format: 'number' },
  { label: 'Pack Count', normalizedKey: 'packCount', rawKey: 'roundCount', format: 'number' },
  { label: 'UPC', normalizedKey: 'upcNorm', rawKey: 'upc' },
  { label: 'URL', normalizedKey: 'urlNorm', rawKey: 'url' },
  { label: 'Price', normalizedKey: 'price', rawKey: 'price', format: 'currency' },
  { label: 'In Stock', normalizedKey: 'inStock', rawKey: 'inStock', format: 'boolean' },
];

function formatValue(value: unknown, format?: string): string {
  if (value === undefined || value === null) return '—';

  switch (format) {
    case 'currency':
      return typeof value === 'number' ? `$${value.toFixed(2)}` : String(value);
    case 'boolean':
      return value ? 'Yes' : 'No';
    case 'number':
      return typeof value === 'number' ? value.toLocaleString() : String(value);
    default:
      return String(value);
  }
}

function FieldRow({
  label,
  rawValue,
  normalizedValue,
  format,
}: {
  label: string;
  rawValue: unknown;
  normalizedValue: unknown;
  format?: string;
}) {
  const hasRaw = rawValue !== undefined && rawValue !== null;
  const hasNormalized = normalizedValue !== undefined && normalizedValue !== null;

  // Determine status
  let status: 'match' | 'normalized' | 'missing' | 'empty' = 'empty';
  if (hasNormalized && hasRaw) {
    status = 'match';
  } else if (hasNormalized && !hasRaw) {
    status = 'normalized';
  } else if (!hasNormalized && hasRaw) {
    status = 'missing';
  }

  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-2 pr-3 text-xs text-gray-500 font-medium w-24">{label}</td>
      <td className="py-2 px-2 text-xs">
        {hasRaw ? (
          <span className="font-mono text-gray-600">{formatValue(rawValue, format)}</span>
        ) : (
          <span className="text-gray-400 italic">—</span>
        )}
      </td>
      <td className="py-2 px-2 text-xs">
        {hasNormalized ? (
          <span className="font-mono text-gray-900 font-semibold">
            {formatValue(normalizedValue, format)}
          </span>
        ) : (
          <span className="text-gray-400 italic">—</span>
        )}
      </td>
      <td className="py-2 pl-2 w-8">
        {status === 'match' && <CheckCircle className="h-4 w-4 text-green-600" />}
        {status === 'normalized' && <CheckCircle className="h-4 w-4 text-blue-500" />}
        {status === 'missing' && <XCircle className="h-4 w-4 text-amber-500" />}
        {status === 'empty' && <MinusCircle className="h-4 w-4 text-gray-300" />}
      </td>
    </tr>
  );
}

export function NormalizedFieldsPanel({ parsedFields, rawData }: NormalizedFieldsPanelProps) {
  const hasParsedFields = parsedFields && Object.keys(parsedFields).length > 0;

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center gap-2">
          <Layers className="h-4 w-4 text-gray-500" />
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
            Normalized Fields
          </h3>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Comparison of raw feed values with normalized/parsed values
        </p>
      </div>

      {/* Field comparison table */}
      <div className="p-4">
        {!hasParsedFields ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
            <p className="text-sm text-amber-700">
              <strong>No parsed fields available.</strong> Values shown are derived from raw data only.
            </p>
          </div>
        ) : null}

        <div className="mt-3 bg-gray-50 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-100">
                <th className="py-2 pr-3 text-left text-xs font-medium text-gray-500 pl-3">Field</th>
                <th className="py-2 px-2 text-left text-xs font-medium text-gray-500">Raw</th>
                <th className="py-2 px-2 text-left text-xs font-medium text-gray-500">Normalized</th>
                <th className="py-2 pl-2 pr-3 text-xs font-medium text-gray-500 w-8"></th>
              </tr>
            </thead>
            <tbody className="px-3">
              {FIELD_CONFIG.map(field => (
                <FieldRow
                  key={field.normalizedKey}
                  label={field.label}
                  rawValue={rawData[field.rawKey]}
                  normalizedValue={parsedFields?.[field.normalizedKey]}
                  format={field.format}
                />
              ))}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-green-600" /> Both present
          </span>
          <span className="flex items-center gap-1">
            <CheckCircle className="h-3 w-3 text-blue-500" /> Normalized only
          </span>
          <span className="flex items-center gap-1">
            <XCircle className="h-3 w-3 text-amber-500" /> Missing normalized
          </span>
          <span className="flex items-center gap-1">
            <MinusCircle className="h-3 w-3 text-gray-300" /> Empty
          </span>
        </div>
      </div>
    </div>
  );
}
