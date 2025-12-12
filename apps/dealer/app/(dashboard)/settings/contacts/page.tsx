import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@ironscout/db';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { ContactsList } from './contacts-list';

export default async function ContactsPage() {
  const session = await getSession();
  
  if (!session || session.type !== 'dealer') {
    redirect('/login');
  }
  
  const dealer = await prisma.dealer.findUnique({
    where: { id: session.dealerId },
    include: {
      contacts: {
        where: { isActive: true },
        orderBy: [
          { isAccountOwner: 'desc' },
          { createdAt: 'asc' },
        ],
      },
    },
  });

  if (!dealer) {
    redirect('/login');
  }

  const canManage = session.role === 'OWNER' || session.role === 'ADMIN';

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link
        href="/settings"
        className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Settings
      </Link>

      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Contacts</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage contacts who receive communications from IronScout
        </p>
      </div>

      {/* Info Banner */}
      <div className="rounded-lg bg-blue-50 p-4">
        <p className="text-sm text-blue-700">
          <strong>Note:</strong> Contacts receive notifications about feed status, insights, and weekly reports 
          based on their email preferences. The account owner is the default recipient for all communications.
        </p>
      </div>

      {/* Contacts List */}
      <ContactsList 
        contacts={dealer.contacts} 
        canManage={canManage}
      />

      {!canManage && (
        <div className="rounded-lg bg-yellow-50 p-4">
          <p className="text-sm text-yellow-700">
            Only account owners and admins can manage contacts. Contact your account owner if you need to make changes.
          </p>
        </div>
      )}
    </div>
  );
}
