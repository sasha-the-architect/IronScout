import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@ironscout/db';
import Link from 'next/link';
import {
  Rss,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Clock,
  RefreshCw,
  AlertOctagon,
  PauseCircle,
} from 'lucide-react';
import { FeedConfigForm } from './feed-config-form';
import { FeedRunsTable } from './feed-runs-table';
import { FeedStatusActions } from './feed-status-actions';

export default async function FeedPage() {
  const session = await getSession();
  const isE2E = process.env.E2E_TEST_MODE === 'true';

  if (!session || session.type !== 'merchant') {
    redirect('/login');
  }

  const merchantId = session.merchantId;

  let feed: {
    id: string;
    accessType: 'URL' | 'AUTH_URL' | 'FTP' | 'SFTP' | 'UPLOAD';
    formatType: 'AMMOSEEK_V1' | 'GUNENGINE_V2';
    url: string | null;
    username: string | null;
    password: string | null;
    scheduleMinutes: number;
    status: 'PENDING' | 'HEALTHY' | 'WARNING' | 'FAILED';
    enabled: boolean;
    lastSuccessAt: Date | null;
    lastError: string | null;
  } | null = null;
  let recentRuns: Array<{
    id: string;
    status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'WARNING' | 'FAILURE' | 'SKIPPED';
    startedAt: Date;
    duration: number | null;
    rowCount: number;
    indexedCount: number;
    quarantinedCount: number;
    rejectedCount: number;
  }> = [];
  let quarantineCount = 0;

  if (isE2E) {
    feed = {
      id: 'e2e-feed',
      accessType: 'URL',
      formatType: 'AMMOSEEK_V1',
      url: 'https://e2e.example/feed.csv',
      username: null,
      password: null,
      scheduleMinutes: 60,
      status: 'HEALTHY',
      enabled: true,
      lastSuccessAt: new Date(),
      lastError: null,
    };
    recentRuns = [
      {
        id: 'e2e-run-1',
        status: 'SUCCESS',
        startedAt: new Date(),
        duration: 120000,
        rowCount: 120,
        indexedCount: 118,
        quarantinedCount: 2,
        rejectedCount: 0,
      },
    ];
    quarantineCount = 0;
  } else {
    // Look up retailerId via merchant_retailers
    const merchantRetailer = await prisma.merchant_retailers.findFirst({
      where: { merchantId },
      select: { retailerId: true }
    });
    const retailerId = merchantRetailer?.retailerId;

    // Get feed, recent runs, and quarantine count
    const [feedRow, runRows, quarantine] = await Promise.all([
      retailerId ? prisma.retailer_feeds.findFirst({
        where: { retailerId },
      }) : Promise.resolve(null),
      retailerId ? prisma.retailer_feed_runs.findMany({
        where: { retailerId },
        orderBy: { startedAt: 'desc' },
        take: 10,
      }) : Promise.resolve([]),
      retailerId ? prisma.quarantined_records.count({
        where: {
          retailerId,
          status: 'QUARANTINED',
        },
      }) : Promise.resolve(0),
    ]);

    feed = feedRow;
    recentRuns = runRows;
    quarantineCount = quarantine;
  }

  // Status configuration matching affiliate feeds pattern
  const statusConfig = {
    PENDING: { icon: Clock, color: 'bg-gray-100 text-gray-700', label: 'Pending' },
    HEALTHY: { icon: CheckCircle, color: 'bg-green-100 text-green-700', label: 'Healthy' },
    WARNING: { icon: AlertTriangle, color: 'bg-yellow-100 text-yellow-700', label: 'Warning' },
    FAILED: { icon: XCircle, color: 'bg-red-100 text-red-700', label: 'Failed' },
  };

  const status = feed ? statusConfig[feed.status] : null;
  const StatusIcon = status?.icon;

  return (
    <div className="space-y-6">
      {/* Header - matching affiliate feeds pattern */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900">Feed Configuration</h1>
              {feed && status && StatusIcon && (
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${feed.enabled ? status.color : 'bg-gray-100 text-gray-600'}`}>
                  {feed.enabled ? (
                    <StatusIcon className="h-4 w-4" />
                  ) : (
                    <PauseCircle className="h-4 w-4" />
                  )}
                  {feed.enabled ? status.label : 'Paused'}
                </span>
              )}
            </div>
            <p className="mt-1 text-sm text-gray-500">
              Configure how IronScout imports your product catalog
            </p>
          </div>
        </div>

        {feed && (
          <FeedStatusActions feedId={feed.id} enabled={feed.enabled} status={feed.status} />
        )}
      </div>

      {/* Last Run Info - simplified to match affiliate feeds */}
      {feed && (feed.lastSuccessAt || feed.lastError) && (
        <div className="rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {feed.status === 'FAILED' || feed.lastError ? (
                  <XCircle className="h-5 w-5 text-red-500" />
                ) : (
                  <CheckCircle className="h-5 w-5 text-green-500" />
                )}
                <div>
                  {feed.lastSuccessAt && (
                    <p className="text-sm text-gray-900">
                      Last successful run: {new Date(feed.lastSuccessAt).toLocaleString()}
                    </p>
                  )}
                  {feed.lastError && (
                    <p className="text-sm text-red-600 mt-1">
                      Error: {feed.lastError}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Quarantine Alert */}
      {quarantineCount > 0 && (
        <Link
          href="/feed/quarantine"
          className="block rounded-lg bg-amber-50 border border-amber-200 p-4 hover:bg-amber-100 transition-colors"
        >
          <div className="flex items-center gap-3">
            <AlertOctagon className="h-5 w-5 text-amber-600" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-amber-800">
                {quarantineCount} record{quarantineCount > 1 ? 's' : ''} in quarantine
              </h4>
              <p className="text-sm text-amber-600">
                These products could not be indexed due to missing UPC or other issues.
                Click to review and fix.
              </p>
            </div>
            <span className="text-amber-600">&rarr;</span>
          </div>
        </Link>
      )}

      {/* Configuration Form */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <h3 className="text-base font-semibold leading-6 text-gray-900 mb-4 flex items-center gap-2">
            <Rss className="h-5 w-5 text-gray-400" />
            {feed ? 'Update Feed Configuration' : 'Set Up Your Feed'}
          </h3>
          
          <FeedConfigForm
            initialData={feed ? {
              id: feed.id,
              accessType: feed.accessType,
              formatType: feed.formatType,
              url: feed.url || '',
              username: feed.username || '',
              password: '', // Don't expose password
              scheduleMinutes: feed.scheduleMinutes,
            } : undefined}
          />
        </div>
      </div>

      {/* Recent Runs */}
      {recentRuns.length > 0 && (
        <div className="rounded-lg bg-white shadow">
          <div className="px-4 py-5 sm:p-6">
            <h3 className="text-base font-semibold leading-6 text-gray-900 mb-4 flex items-center gap-2">
              <RefreshCw className="h-5 w-5 text-gray-400" />
              Recent Feed Runs
            </h3>
            
            <FeedRunsTable runs={recentRuns} />
          </div>
        </div>
      )}

      {/* Help */}
      <div className="rounded-lg bg-blue-50 p-4">
        <h4 className="text-sm font-medium text-blue-800">Feed Format Requirements</h4>
        <ul className="mt-2 text-sm text-blue-700 list-disc list-inside space-y-1">
          <li>CSV, XML, or JSON format supported</li>
          <li>Required fields: title, price, in_stock, url</li>
          <li>Recommended fields: upc, caliber, grain, pack_size, brand, image_url</li>
          <li>Prices should be in USD without currency symbols</li>
        </ul>
      </div>
    </div>
  );
}
