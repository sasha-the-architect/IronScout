import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { prisma } from '@ironscout/db';
import { Settings, User, Code, Bell, Truck, Users, CreditCard } from 'lucide-react';
import Link from 'next/link';

export default async function SettingsPage() {
  const session = await getSession();
  
  if (!session || session.type !== 'dealer') {
    redirect('/login');
  }
  
  const dealer = await prisma.dealer.findUnique({
    where: { id: session.dealerId },
    include: {
      notificationPref: true,
      _count: {
        select: { contacts: { where: { isActive: true } } },
      },
    },
  });

  if (!dealer) {
    redirect('/login');
  }

  // Determine billing status
  const getBillingStatus = () => {
    if (dealer.subscriptionStatus === 'ACTIVE') return 'Active';
    if (dealer.subscriptionStatus === 'EXPIRED') return 'Expired';
    if (dealer.subscriptionStatus === 'CANCELLED') return 'Cancelled';
    if (dealer.subscriptionStatus === 'SUSPENDED') return 'Suspended';
    return 'Not Set';
  };

  const settingsSections = [
    {
      title: 'Account',
      description: 'Manage your business information and credentials',
      icon: User,
      href: '/settings/account',
      status: 'Complete',
    },
    {
      title: 'Billing',
      description: 'Manage your subscription and payment information',
      icon: CreditCard,
      href: '/settings/billing',
      status: getBillingStatus(),
    },
    {
      title: 'Contacts',
      description: 'Manage contacts who receive communications from IronScout',
      icon: Users,
      href: '/settings/contacts',
      status: dealer._count?.contacts > 0 ? `${dealer._count.contacts} contact${dealer._count.contacts !== 1 ? 's' : ''}` : 'Not Set',
    },
    {
      title: 'Shipping',
      description: 'Configure your shipping rates for accurate price comparisons',
      icon: Truck,
      href: '/settings/shipping',
      status: dealer.shippingType === 'UNKNOWN' ? 'Not Set' : 'Complete',
    },
    {
      title: 'Pixel Setup',
      description: 'Set up revenue tracking on your checkout page',
      icon: Code,
      href: '/settings/pixel',
      status: dealer.pixelEnabled ? 'Active' : 'Not Set',
    },
    {
      title: 'Notifications',
      description: 'Configure email alerts and weekly reports',
      icon: Bell,
      href: '/settings/notifications',
      status: 'Complete',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Manage your dealer account settings
        </p>
      </div>

      {/* Account Overview */}
      <div className="rounded-lg bg-white shadow">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{dealer.businessName}</h3>
              <p className="text-sm text-gray-500">{session.email}</p>
              <div className="mt-2 flex items-center gap-2">
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  dealer.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                  dealer.status === 'PENDING' ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  {dealer.status}
                </span>
                <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  dealer.tier === 'FOUNDING' ? 'bg-purple-100 text-purple-700' :
                  dealer.tier === 'PRO' ? 'bg-blue-100 text-blue-700' :
                  'bg-gray-100 text-gray-700'
                }`}>
                  {dealer.tier}
                </span>
              </div>
            </div>
            <div className="text-right text-sm text-gray-500">
              <p>Member since</p>
              <p className="font-medium text-gray-900">
                {new Date(dealer.createdAt).toLocaleDateString()}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Sections */}
      <div className="grid gap-4 sm:grid-cols-2">
        {settingsSections.map((section) => (
          <Link
            key={section.title}
            href={section.href}
            className="rounded-lg bg-white shadow hover:shadow-md transition-shadow p-6"
          >
            <div className="flex items-start gap-4">
              <div className="rounded-lg bg-gray-100 p-3">
                <section.icon className="h-6 w-6 text-gray-600" />
              </div>
              <div className="flex-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900">{section.title}</h3>
                  <span className={`text-xs font-medium ${
                    section.status === 'Complete' || section.status === 'Active' 
                      ? 'text-green-600' 
                      : 'text-yellow-600'
                  }`}>
                    {section.status}
                  </span>
                </div>
                <p className="mt-1 text-sm text-gray-500">{section.description}</p>
              </div>
            </div>
          </Link>
        ))}
      </div>

      {/* Danger Zone */}
      <div className="rounded-lg border border-red-200 bg-red-50 p-6">
        <h3 className="text-lg font-semibold text-red-900">Danger Zone</h3>
        <p className="mt-1 text-sm text-red-700">
          Actions here are irreversible. Please be careful.
        </p>
        <div className="mt-4 flex gap-4">
          <button
            disabled
            className="inline-flex items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 opacity-50 cursor-not-allowed"
          >
            Export All Data
          </button>
          <button
            disabled
            className="inline-flex items-center rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 opacity-50 cursor-not-allowed"
          >
            Delete Account
          </button>
        </div>
        <p className="mt-2 text-xs text-red-600">
          Contact support@ironscout.ai for account deletion or data export requests.
        </p>
      </div>
    </div>
  );
}
