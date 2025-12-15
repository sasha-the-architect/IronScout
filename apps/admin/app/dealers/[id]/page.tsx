import { prisma } from '@ironscout/db';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  Globe,
  Calendar,
  Package,
  Rss,
  MousePointerClick,
  User,
  CreditCard
} from 'lucide-react';
import { EditDealerForm } from './edit-form';
import { ContactsSection } from './contacts-section';
import { AdminActions } from './admin-actions';
import { FeedsSection } from './feeds-section';

export const dynamic = 'force-dynamic';

const statusConfig = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700' },
  SUSPENDED: { label: 'Suspended', color: 'bg-red-100 text-red-700' },
};

export default async function DealerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const dealer = await prisma.dealer.findUnique({
    where: { id },
    include: {
      users: {
        where: { role: 'OWNER' },
        take: 1,
      },
      contacts: {
        where: { isActive: true },
        orderBy: [
          { isAccountOwner: 'desc' },
          { createdAt: 'asc' },
        ],
      },
      feeds: {
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      _count: {
        select: {
          skus: true,
          feeds: true,
          clickEvents: true,
          pixelEvents: true,
        },
      },
    },
  });

  if (!dealer) {
    notFound();
  }

  const status = statusConfig[dealer.status];
  const ownerUser = dealer.users[0];
  const mainContactName = `${dealer.contactFirstName} ${dealer.contactLastName}`.trim();

  // Serialize contacts to plain objects for client component
  const contacts = dealer.contacts.map(contact => ({
    id: contact.id,
    firstName: contact.firstName,
    lastName: contact.lastName,
    email: contact.email,
    phone: contact.phone,
    roles: contact.roles,
    marketingOptIn: contact.marketingOptIn,
    communicationOptIn: contact.communicationOptIn,
    isAccountOwner: contact.isAccountOwner,
    isActive: contact.isActive,
  }));

  // Serialize feeds for client component
  const feeds = dealer.feeds.map(feed => ({
    id: feed.id,
    name: feed.name,
    accessType: feed.accessType,
    formatType: feed.formatType,
    url: feed.url,
    status: feed.status,
    enabled: feed.enabled,
    lastSuccessAt: feed.lastSuccessAt,
    lastFailureAt: feed.lastFailureAt,
    lastError: feed.lastError,
    createdAt: feed.createdAt,
  }));

  // Get subscription status (with fallback for dealers without the new field)
  const subscriptionStatus = (dealer as { subscriptionStatus?: string }).subscriptionStatus || 'ACTIVE';

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/dealers"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Dealers
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{dealer.businessName}</h1>
          <p className="mt-1 text-sm text-gray-500">Dealer ID: {dealer.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <EditDealerForm dealer={{
            id: dealer.id,
            businessName: dealer.businessName,
            contactFirstName: dealer.contactFirstName,
            contactLastName: dealer.contactLastName,
            ownerEmail: ownerUser?.email || null,
            phone: dealer.phone,
            websiteUrl: dealer.websiteUrl,
            tier: dealer.tier,
            storeType: dealer.storeType,
            status: dealer.status,
          }} />
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${status.color}`}>
            {status.label}
          </span>
        </div>
      </div>

      {/* Info Cards */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Business Info */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Business Information</h2>
          <dl className="space-y-4">
            <div className="flex items-start gap-3">
              <User className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Main Contact</dt>
                <dd className="text-sm text-gray-900">{mainContactName}</dd>
              </div>
            </div>
            {ownerUser && (
              <div className="flex items-start gap-3">
                <Mail className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <dt className="text-sm font-medium text-gray-500">Portal Login Email</dt>
                  <dd className="text-sm text-gray-900">
                    <a href={`mailto:${ownerUser.email}`} className="text-blue-600 hover:underline">
                      {ownerUser.email}
                    </a>
                    {ownerUser.emailVerified && (
                      <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
                        Verified
                      </span>
                    )}
                  </dd>
                </div>
              </div>
            )}
            {dealer.phone && (
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd className="text-sm text-gray-900">{dealer.phone}</dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Website</dt>
                <dd className="text-sm text-gray-900">
                  <a
                    href={dealer.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {dealer.websiteUrl}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Registered</dt>
                <dd className="text-sm text-gray-900">{formatDateTime(dealer.createdAt)}</dd>
              </div>
            </div>
          </dl>
        </div>

        {/* Stats */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Statistics</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">SKUs</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dealer._count.skus.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Rss className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Feeds</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dealer._count.feeds}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Clicks</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dealer._count.clickEvents.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Conversions</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {dealer._count.pixelEvents.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <AdminActions 
        dealerId={dealer.id}
        businessName={dealer.businessName}
        ownerEmail={ownerUser?.email || null}
        emailVerified={ownerUser?.emailVerified || false}
      />

      {/* Contacts Section */}
      <ContactsSection 
        dealerId={dealer.id} 
        contacts={contacts}
      />

      {/* Account Details */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Account Details</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-gray-500">Tier</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                {dealer.tier}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Store Type</dt>
            <dd className="mt-1 text-sm text-gray-900">{dealer.storeType.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Pixel Tracking</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {dealer.pixelEnabled ? (
                <span className="text-green-600">Enabled</span>
              ) : (
                <span className="text-gray-500">Not configured</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

      {/* Feeds Section with Manual Trigger */}
      <FeedsSection
        dealerId={dealer.id}
        feeds={feeds}
        subscriptionStatus={subscriptionStatus}
      />
    </div>
  );
}
