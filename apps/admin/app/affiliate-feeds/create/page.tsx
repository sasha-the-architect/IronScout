import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CreateFeedForm } from './create-feed-form';

export const dynamic = 'force-dynamic';

export default async function CreateAffiliateFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ retailerId?: string; retailerName?: string; retailerWebsite?: string }>;
}) {
  const { retailerId, retailerName, retailerWebsite } = await searchParams;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href="/affiliate-feeds"
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Affiliate Feed</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure a new product catalog feed from an affiliate network
          </p>
        </div>
      </div>

      <CreateFeedForm
        preselectedRetailerId={retailerId}
        preselectedRetailerName={retailerName}
        preselectedRetailerWebsite={retailerWebsite}
      />
    </div>
  );
}
