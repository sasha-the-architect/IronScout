import { prisma } from '@ironscout/db';
import { DealerActions } from './dealer-actions';
import { Users, Clock, CheckCircle, AlertTriangle, XCircle, Rss, CreditCard } from 'lucide-react';

export const dynamic = 'force-dynamic';

const statusConfig = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  SUSPENDED: { label: 'Suspended', color: 'bg-red-100 text-red-700', icon: XCircle },
};

const tierConfig: Record<string, { label: string; color: string }> = {
  FOUNDING: { label: 'Founding', color: 'bg-purple-100 text-purple-700' },
  STANDARD: { label: 'Standard', color: 'bg-gray-100 text-gray-700' },
  PRO: { label: 'Pro', color: 'bg-blue-100 text-blue-700' },
  ENTERPRISE: { label: 'Enterprise', color: 'bg-indigo-100 text-indigo-700' },
};

const feedStatusConfig: Record<string, { label: string; color: string }> = {
  PENDING: { label: 'Pending', color: 'text-gray-500' },
  HEALTHY: { label: 'Healthy', color: 'text-green-600' },
  WARNING: { label: 'Warning', color: 'text-yellow-600' },
  FAILED: { label: 'Failed', color: 'text-red-600' },
};

export default async function DealersPage() {
  const dealers = await prisma.dealer.findMany({
    orderBy: [
      { status: 'asc' }, // PENDING first
      { createdAt: 'desc' },
    ],
    include: {
      users: {
        where: { role: 'OWNER' },
        take: 1,
      },
      feeds: {
        take: 1,
        orderBy: { createdAt: 'desc' },
      },
      _count: {
        select: {
          skus: true,
          feeds: true,
        },
      },
    },
  });

  const pendingCount = dealers.filter(d => d.status === 'PENDING').length;
  const activeCount = dealers.filter(d => d.status === 'ACTIVE').length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dealers</h1>
          <p className="mt-1 text-sm text-gray-500">
            Manage dealer accounts and approvals
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <Users className="h-6 w-6 text-gray-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Dealers</dt>
                  <dd className="text-lg font-semibold text-gray-900">{dealers.length}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <AlertTriangle className="h-6 w-6 text-yellow-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Pending Approval</dt>
                  <dd className="text-lg font-semibold text-gray-900">{pendingCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white overflow-hidden shadow rounded-lg">
          <div className="p-5">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <CheckCircle className="h-6 w-6 text-green-400" />
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Active Dealers</dt>
                  <dd className="text-lg font-semibold text-gray-900">{activeCount}</dd>
                </dl>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Pending Approvals Alert */}
      {pendingCount > 0 && (
        <div className="rounded-md bg-yellow-50 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                {pendingCount} dealer{pendingCount !== 1 ? 's' : ''} awaiting approval
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Review and approve new dealer registrations below.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Dealers Table */}
      <div className="bg-white shadow rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Business
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Plan
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Expires
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Payment
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Feed
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                SKUs
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {dealers.map((dealer) => {
              const status = statusConfig[dealer.status];
              const StatusIcon = status.icon;
              const ownerUser = dealer.users[0];
              const tier = tierConfig[dealer.tier] || tierConfig.STANDARD;
              const feed = dealer.feeds[0];
              const feedStatus = feed ? feedStatusConfig[feed.status] : null;

              // Calculate expiration display
              const expiresAt = dealer.subscriptionExpiresAt;
              let expiresDisplay = '—';
              let expiresColor = 'text-gray-500';
              if (expiresAt) {
                const now = new Date();
                const daysUntil = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
                if (daysUntil < 0) {
                  expiresDisplay = `${Math.abs(daysUntil)}d overdue`;
                  expiresColor = 'text-red-600 font-medium';
                } else if (daysUntil <= 7) {
                  expiresDisplay = `${daysUntil}d`;
                  expiresColor = 'text-yellow-600 font-medium';
                } else if (daysUntil <= 30) {
                  expiresDisplay = `${daysUntil}d`;
                  expiresColor = 'text-gray-600';
                } else {
                  expiresDisplay = expiresAt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                }
              }

              return (
                <tr key={dealer.id} className={dealer.status === 'PENDING' ? 'bg-yellow-50' : ''}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm font-medium text-gray-900">
                        {dealer.businessName}
                      </div>
                      <a
                        href={dealer.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {dealer.websiteUrl.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div>
                      <div className="text-sm text-gray-900">{dealer.contactFirstName} {dealer.contactLastName}</div>
                      <div className="text-sm text-gray-500">{ownerUser?.email || 'No owner'}</div>
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    {ownerUser && !ownerUser.emailVerified && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
                        Unverified
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${tier.color}`}>
                      {tier.label}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`text-sm ${expiresColor}`}>
                      {expiresDisplay}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {dealer.paymentMethod === 'STRIPE' ? (
                      <span className="inline-flex items-center gap-1 text-sm text-purple-600">
                        <CreditCard className="h-3.5 w-3.5" />
                        Stripe
                      </span>
                    ) : dealer.paymentMethod === 'PURCHASE_ORDER' ? (
                      <span className="text-sm text-blue-600">PO</span>
                    ) : (
                      <span className="text-sm text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {feed ? (
                      <span className={`inline-flex items-center gap-1 text-sm ${feedStatus?.color || 'text-gray-500'}`}>
                        <Rss className="h-3.5 w-3.5" />
                        {feedStatus?.label}
                      </span>
                    ) : (
                      <span className="text-sm text-gray-400">No feed</span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {dealer._count.skus.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <DealerActions dealer={dealer} />
                  </td>
                </tr>
              );
            })}
            
            {dealers.length === 0 && (
              <tr>
                <td colSpan={9} className="px-6 py-12 text-center text-gray-500">
                  No dealers registered yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
