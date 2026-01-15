import { prisma } from '@ironscout/db';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  Clock,
} from 'lucide-react';
import { RawDataPanel } from './raw-data-panel';
import { NormalizedFieldsPanel } from './normalized-fields-panel';
import { IdentityPanel } from './identity-panel';
import { ErrorsPanel } from './errors-panel';
import { QuarantineActions } from './quarantine-actions';

export const dynamic = 'force-dynamic';

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

interface BlockingError {
  code: string;
  message: string;
}

/**
 * Parse identity from matchKey format.
 * Formats: URL_HASH:<hash>, NETWORK_ITEM_ID:<id>, SKU:<id>, UPC:<code>
 */
function parseIdentityFromMatchKey(matchKey: string): { type: string; value: string } {
  const colonIndex = matchKey.indexOf(':');
  if (colonIndex === -1) {
    return { type: 'unknown', value: matchKey };
  }
  const type = matchKey.substring(0, colonIndex);
  const value = matchKey.substring(colonIndex + 1);
  return { type, value };
}

/**
 * Get primary reason code from blocking errors
 */
function getPrimaryReasonCode(errors: BlockingError[]): string {
  if (!errors || errors.length === 0) {
    return 'UNKNOWN';
  }
  return errors[0].code;
}

export default async function QuarantineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // Fetch the quarantine record
  const record = await prisma.quarantined_records.findUnique({
    where: { id },
  });

  if (!record) {
    notFound();
  }

  const rawData = record.rawData as Record<string, unknown>;
  const parsedFields = record.parsedFields as ParsedFields | null;
  const blockingErrors = ((record.blockingErrors as unknown) as BlockingError[]) || [];
  const reasonCode = getPrimaryReasonCode(blockingErrors);
  const identity = parseIdentityFromMatchKey(record.matchKey);

  // Status-based styling
  const statusConfig = {
    QUARANTINED: {
      badge: 'bg-amber-100 text-amber-700 border-amber-200',
      icon: <AlertTriangle className="h-4 w-4" />,
    },
    RESOLVED: {
      badge: 'bg-green-100 text-green-700 border-green-200',
      icon: <CheckCircle className="h-4 w-4" />,
    },
    DISMISSED: {
      badge: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <CheckCircle className="h-4 w-4" />,
    },
  };

  const statusStyle = statusConfig[record.status as keyof typeof statusConfig] || statusConfig.QUARANTINED;

  // Extract raw brand for alias suggestion
  const rawBrand = (rawData.brand as string) || (rawData.manufacturer as string) || undefined;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <Link
            href="/quarantine"
            className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Quarantine Queue
          </Link>
          <h1 className="mt-2 text-xl font-semibold text-gray-900 truncate max-w-lg">
            {(rawData.name as string) || (rawData.title as string) || 'Quarantined Record'}
          </h1>
          <div className="mt-1 flex items-center gap-3 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {new Date(record.createdAt).toLocaleString()}
            </span>
            <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
              record.feedType === 'AFFILIATE'
                ? 'bg-purple-100 text-purple-700'
                : 'bg-blue-100 text-blue-700'
            }`}>
              {record.feedType}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium border ${statusStyle.badge}`}
          >
            {statusStyle.icon}
            {record.status}
          </span>
          {reasonCode !== 'UNKNOWN' && (
            <span className="px-3 py-1.5 rounded-md text-sm font-medium bg-red-100 text-red-700 border border-red-200">
              {reasonCode}
            </span>
          )}
        </div>
      </div>

      {/* Main 2-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column - Errors, Identity, Actions */}
        <div className="lg:col-span-4 space-y-4">
          {/* Errors Panel */}
          <ErrorsPanel errors={blockingErrors} reasonCode={reasonCode} />

          {/* Identity Panel */}
          <IdentityPanel
            matchKey={record.matchKey}
            identity={identity}
            feedType={record.feedType as 'RETAILER' | 'AFFILIATE'}
            feedId={record.feedId}
            runId={record.runId}
            retailerId={record.retailerId}
            sourceId={record.sourceId}
          />

          {/* Actions Panel - Sticky on desktop */}
          <div className="lg:sticky lg:top-4">
            <QuarantineActions
              recordId={record.id}
              status={record.status as 'QUARANTINED' | 'RESOLVED' | 'DISMISSED'}
              feedType={record.feedType as 'RETAILER' | 'AFFILIATE'}
              rawBrand={rawBrand}
            />
          </div>
        </div>

        {/* Right Column - Data panels */}
        <div className="lg:col-span-8 space-y-4">
          {/* Normalized Fields Panel */}
          <NormalizedFieldsPanel
            parsedFields={parsedFields}
            rawData={rawData}
          />

          {/* Raw Data Panel */}
          <RawDataPanel rawData={rawData} />
        </div>
      </div>
    </div>
  );
}
