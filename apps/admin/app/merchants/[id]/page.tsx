import { prisma } from '@ironscout/db';
import { notFound } from 'next/navigation';
import { formatDateTime } from '@/lib/utils';
import Link from 'next/link';
import {
  ArrowLeft,
  Mail,
  Phone,
  Globe,
  Calendar,
  Package,
  Rss,
  MousePointerClick,
  User,
} from 'lucide-react';
import { EditMerchantForm } from './edit-form';
import { ContactsSection } from './contacts-section';
import { AdminActions } from './admin-actions';
import { SubscriptionSection } from './subscription-section';
import { PaymentSection } from './payment-section';
import { RetailersSection } from './retailers-section';

export const dynamic = 'force-dynamic';

const statusConfig = {
  PENDING: { label: 'Pending', color: 'bg-yellow-100 text-yellow-700' },
  ACTIVE: { label: 'Active', color: 'bg-green-100 text-green-700' },
  SUSPENDED: { label: 'Suspended', color: 'bg-red-100 text-red-700' },
};

export default async function MerchantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const merchant = await prisma.merchants.findUnique({
    where: { id },
    include: {
      merchant_users: {
        where: { role: 'OWNER' },
        take: 1,
      },
      merchant_contacts: {
        where: { isActive: true },
        orderBy: [
          { isAccountOwner: 'desc' },
          { createdAt: 'asc' },
        ],
      },
      _count: {
        select: {
          click_events: true,
          pixel_events: true,
        },
      },
    },
  });

  if (!merchant) {
    notFound();
  }

  // Get retailer data for this merchant (V1: 1:1 relationship)
  const merchantRetailer = await prisma.merchant_retailers.findFirst({
    where: { merchantId: id },
    select: { retailerId: true }
  });

  const retailerId = merchantRetailer?.retailerId;

  // Get SKU and feed counts from the retailer (both legacy and affiliate systems)
  const [legacySkuCount, legacyFeedCount, affiliateFeedCount, sourceProductCount] = await Promise.all([
    retailerId
      ? prisma.retailer_skus.count({ where: { retailerId } })
      : Promise.resolve(0),
    retailerId
      ? prisma.retailer_feeds.count({ where: { retailerId } })
      : Promise.resolve(0),
    // Count affiliate feeds via sources
    retailerId
      ? prisma.affiliate_feeds.count({ where: { sources: { retailerId } } })
      : Promise.resolve(0),
    // Count source products via sources
    retailerId
      ? prisma.source_products.count({ where: { sources: { retailerId } } })
      : Promise.resolve(0),
  ]);

  // Combined totals (legacy + affiliate systems)
  const skuCount = legacySkuCount + sourceProductCount;
  const feedCount = legacyFeedCount + affiliateFeedCount;

  const status = statusConfig[merchant.status];
  const ownerUser = merchant.merchant_users[0];
  const mainContactName = `${merchant.contactFirstName} ${merchant.contactLastName}`.trim();

  // Serialize contacts to plain objects for client component
  const contacts = merchant.merchant_contacts.map(contact => ({
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

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/merchants"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Merchants
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{merchant.businessName}</h1>
          <p className="mt-1 text-sm text-gray-500">Merchant ID: {merchant.id}</p>
        </div>
        <div className="flex items-center gap-3">
          <EditMerchantForm merchant={{
            id: merchant.id,
            businessName: merchant.businessName,
            contactFirstName: merchant.contactFirstName,
            contactLastName: merchant.contactLastName,
            ownerEmail: ownerUser?.email || null,
            phone: merchant.phone,
            websiteUrl: merchant.websiteUrl,
            tier: merchant.tier,
            storeType: merchant.storeType,
            status: merchant.status,
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
            {merchant.phone && (
              <div className="flex items-start gap-3">
                <Phone className="h-5 w-5 text-gray-400 mt-0.5" />
                <div>
                  <dt className="text-sm font-medium text-gray-500">Phone</dt>
                  <dd className="text-sm text-gray-900">{merchant.phone}</dd>
                </div>
              </div>
            )}
            <div className="flex items-start gap-3">
              <Globe className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Website</dt>
                <dd className="text-sm text-gray-900">
                  <a
                    href={merchant.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:underline"
                  >
                    {merchant.websiteUrl}
                  </a>
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Calendar className="h-5 w-5 text-gray-400 mt-0.5" />
              <div>
                <dt className="text-sm font-medium text-gray-500">Registered</dt>
                <dd className="text-sm text-gray-900">{formatDateTime(merchant.createdAt)}</dd>
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
                {skuCount.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Rss className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Feeds</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {feedCount}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <MousePointerClick className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Clicks</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {merchant._count.click_events.toLocaleString()}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2">
                <Package className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-500">Conversions</span>
              </div>
              <p className="mt-2 text-2xl font-semibold text-gray-900">
                {merchant._count.pixel_events.toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Admin Actions */}
      <AdminActions
        merchantId={merchant.id}
        businessName={merchant.businessName}
        ownerEmail={ownerUser?.email || null}
        emailVerified={ownerUser?.emailVerified || false}
      />

      {/* Subscription Management */}
      <SubscriptionSection
        merchantId={merchant.id}
        businessName={merchant.businessName}
        tier={merchant.tier}
        subscriptionStatus={merchant.subscriptionStatus}
        subscriptionExpiresAt={merchant.subscriptionExpiresAt}
        subscriptionGraceDays={merchant.subscriptionGraceDays}
      />

      {/* Payment Details */}
      <PaymentSection
        merchantId={merchant.id}
        merchantBusinessName={merchant.businessName}
        merchantEmail={ownerUser?.email || ''}
        paymentMethod={merchant.paymentMethod}
        stripeCustomerId={merchant.stripeCustomerId}
        stripeSubscriptionId={merchant.stripeSubscriptionId}
        autoRenew={merchant.autoRenew}
      />

      {/* Contacts Section */}
      <ContactsSection
        merchantId={merchant.id}
        contacts={contacts}
      />

      {/* Retailers Section */}
      <RetailersSection
        merchantId={merchant.id}
        subscriptionStatus={merchant.subscriptionStatus}
      />

      {/* Account Details */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Account Details</h2>
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div>
            <dt className="text-sm font-medium text-gray-500">Tier</dt>
            <dd className="mt-1 text-sm text-gray-900">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                {merchant.tier}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Store Type</dt>
            <dd className="mt-1 text-sm text-gray-900">{merchant.storeType.replace(/_/g, ' ')}</dd>
          </div>
          <div>
            <dt className="text-sm font-medium text-gray-500">Pixel Tracking</dt>
            <dd className="mt-1 text-sm text-gray-900">
              {merchant.pixelEnabled ? (
                <span className="text-green-600">Enabled</span>
              ) : (
                <span className="text-gray-500">Not configured</span>
              )}
            </dd>
          </div>
        </dl>
      </div>

    </div>
  );
}
