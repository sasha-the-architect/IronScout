import { prisma } from '@ironscout/db';
import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { CreateRetailerFeedForm } from './create-feed-form';

export const dynamic = 'force-dynamic';

export default async function CreateRetailerFeedPage({
  searchParams,
}: {
  searchParams: Promise<{ retailerId?: string }>;
}) {
  const { retailerId } = await searchParams;

  if (!retailerId) {
    redirect('/retailers');
  }

  const retailer = await prisma.retailers.findUnique({
    where: { id: retailerId },
    select: { id: true, name: true },
  });

  if (!retailer) {
    notFound();
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link
          href={`/retailers/${retailerId}`}
          className="p-2 rounded-md hover:bg-gray-100"
        >
          <ArrowLeft className="h-5 w-5 text-gray-500" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Add Retailer Feed</h1>
          <p className="mt-1 text-sm text-gray-500">
            Configure a direct product feed for {retailer.name}
          </p>
        </div>
      </div>

      <CreateRetailerFeedForm retailerId={retailer.id} retailerName={retailer.name} />
    </div>
  );
}
