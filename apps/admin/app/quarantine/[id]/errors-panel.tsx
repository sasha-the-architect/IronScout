'use client';

import { AlertTriangle, XCircle, Info } from 'lucide-react';

interface BlockingError {
  code: string;
  message: string;
}

interface ErrorsPanelProps {
  errors: BlockingError[];
  reasonCode: string;
}

// Map error codes to severity and descriptions
const ERROR_INFO: Record<string, { severity: 'error' | 'warning' | 'info'; description: string }> = {
  MISSING_REQUIRED_FIELD: {
    severity: 'error',
    description: 'A required field is missing from the feed data',
  },
  INVALID_PRICE: {
    severity: 'error',
    description: 'Price value is invalid, negative, or out of expected range',
  },
  INVALID_UPC: {
    severity: 'warning',
    description: 'UPC code failed validation (wrong length or check digit)',
  },
  UNKNOWN_BRAND: {
    severity: 'warning',
    description: 'Brand could not be normalized or matched to known brands',
  },
  UNKNOWN_CALIBER: {
    severity: 'warning',
    description: 'Caliber could not be normalized or matched to known calibers',
  },
  PARSE_ERROR: {
    severity: 'error',
    description: 'Failed to parse feed row format',
  },
  VALIDATION_ERROR: {
    severity: 'error',
    description: 'Data failed validation rules',
  },
  DUPLICATE_KEY: {
    severity: 'info',
    description: 'A record with this identity already exists',
  },
  RATE_LIMITED: {
    severity: 'warning',
    description: 'Request was rate limited and queued for retry',
  },
  NETWORK_ERROR: {
    severity: 'warning',
    description: 'Network error during fetch or submission',
  },
};

function getSeverityStyles(severity: 'error' | 'warning' | 'info') {
  switch (severity) {
    case 'error':
      return {
        bg: 'bg-red-50',
        border: 'border-red-200',
        icon: <XCircle className="h-4 w-4 text-red-500" />,
        badge: 'bg-red-100 text-red-700',
      };
    case 'warning':
      return {
        bg: 'bg-amber-50',
        border: 'border-amber-200',
        icon: <AlertTriangle className="h-4 w-4 text-amber-500" />,
        badge: 'bg-amber-100 text-amber-700',
      };
    case 'info':
      return {
        bg: 'bg-blue-50',
        border: 'border-blue-200',
        icon: <Info className="h-4 w-4 text-blue-500" />,
        badge: 'bg-blue-100 text-blue-700',
      };
  }
}

export function ErrorsPanel({ errors, reasonCode }: ErrorsPanelProps) {
  if (errors.length === 0) {
    return (
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-gray-500">
          <Info className="h-4 w-4" />
          <span className="text-sm">No blocking errors recorded</span>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header with primary reason */}
      <div className="px-4 py-3 bg-red-50 border-b border-red-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-red-500" />
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
              Blocking Errors ({errors.length})
            </h3>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-red-100 text-red-700 rounded">
            {reasonCode}
          </span>
        </div>
      </div>

      {/* Error list */}
      <div className="divide-y divide-gray-100">
        {errors.map((error, index) => {
          const info = ERROR_INFO[error.code] || { severity: 'error', description: '' };
          const styles = getSeverityStyles(info.severity);

          return (
            <div key={index} className={`p-4 ${index === 0 ? styles.bg : ''}`}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5">{styles.icon}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 text-xs font-mono font-medium rounded ${styles.badge}`}>
                      {error.code}
                    </span>
                    {index === 0 && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-600 rounded">
                        Primary
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-sm text-gray-900">{error.message}</p>
                  {info.description && (
                    <p className="mt-1 text-xs text-gray-500">{info.description}</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
