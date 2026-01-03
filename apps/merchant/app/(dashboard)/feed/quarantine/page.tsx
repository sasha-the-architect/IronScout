import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { redirect } from 'next/navigation';
import { QuarantineTable } from './quarantine-table';
import Link from 'next/link';

export const metadata = {
  title: 'Quarantine Queue - IronScout Merchant',
  description: 'Manage quarantined records from your feed',
};

export default async function QuarantinePage() {
  const session = await getSession();

  if (!session || session.type !== 'merchant') {
    redirect('/auth/login');
  }

  // Look up retailerId via merchant_retailers
  const merchantRetailer = await prisma.merchant_retailers.findFirst({
    where: { merchantId: session.merchantId },
    select: { retailerId: true }
  });
  const retailerId = merchantRetailer?.retailerId;

  const feed = retailerId ? await prisma.retailer_feeds.findFirst({
    where: { retailerId },
  }) : null;

  if (!feed) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mb-6">
          <Link
            href="/feed"
            className="text-sm text-gray-600 hover:text-gray-900"
          >
            &larr; Back to Feed
          </Link>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
          <h2 className="text-lg font-medium text-gray-900">No Feed Configured</h2>
          <p className="mt-2 text-gray-600">
            You need to configure a product feed before viewing quarantined records.
          </p>
          <Link
            href="/feed"
            className="mt-4 inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Configure Feed
          </Link>
        </div>
      </div>
    );
  }

  // Get initial quarantine data
  const [records, total, statusCounts] = await Promise.all([
    prisma.quarantined_records.findMany({
      where: { feedId: feed.id, status: 'QUARANTINED' },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        feed_corrections: {
          orderBy: { createdAt: 'desc' },
          take: 3,
        },
      },
    }),
    prisma.quarantined_records.count({
      where: { feedId: feed.id, status: 'QUARANTINED' },
    }),
    prisma.quarantined_records.groupBy({
      by: ['status'],
      where: { feedId: feed.id },
      _count: true,
    }),
  ]);

  const counts = {
    QUARANTINED: 0,
    RESOLVED: 0,
    DISMISSED: 0,
  };
  for (const item of statusCounts) {
    counts[item.status] = item._count;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6">
        <Link
          href="/feed"
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          &larr; Back to Feed
        </Link>
      </div>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Quarantine Queue</h1>
        <p className="mt-1 text-gray-600">
          Records that could not be indexed due to missing or invalid data.
          Add corrections to fix issues and reprocess records.
        </p>
      </div>

      {/* Status Tabs */}
      <div className="mb-6 flex gap-2 border-b border-gray-200">
        <StatusTab
          status="QUARANTINED"
          count={counts.QUARANTINED}
          active={true}
          label="Pending"
        />
        <StatusTab
          status="RESOLVED"
          count={counts.RESOLVED}
          active={false}
          label="Resolved"
        />
        <StatusTab
          status="DISMISSED"
          count={counts.DISMISSED}
          active={false}
          label="Dismissed"
        />
      </div>

      <QuarantineTable
        initialRecords={records as unknown as Parameters<typeof QuarantineTable>[0]['initialRecords']}
        initialTotal={total}
        counts={counts}
      />
    </div>
  );
}

function StatusTab({
  status,
  count,
  active,
  label,
}: {
  status: string;
  count: number;
  active: boolean;
  label: string;
}) {
  return (
    <button
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
        active
          ? 'border-gray-900 text-gray-900'
          : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
      }`}
    >
      {label}
      <span
        className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
          active ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600'
        }`}
      >
        {count}
      </span>
    </button>
  );
}
