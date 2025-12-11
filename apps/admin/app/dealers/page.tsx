import { prisma } from '@ironscout/db';
import { formatDateTime } from '@/lib/utils';
import { DealerActions } from './dealer-actions';
import { Users, Clock, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

export const dynamic = 'force-dynamic';

const statusConfig = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  SUSPENDED: { label: 'Suspended', color: 'bg-red-100 text-red-700', icon: XCircle },
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
                SKUs
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Registered
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
                        Email not verified
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {dealer._count.skus.toLocaleString()}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDateTime(dealer.createdAt)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right">
                    <DealerActions dealer={dealer} />
                  </td>
                </tr>
              );
            })}
            
            {dealers.length === 0 && (
              <tr>
                <td colSpan={6} className="px-6 py-12 text-center text-gray-500">
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
