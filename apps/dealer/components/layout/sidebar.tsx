'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Rss,
  Package,
  Lightbulb,
  BarChart3,
  Settings,
  FileDown,
  Users,
  LogOut,
  Activity
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Session } from '@/lib/auth';

interface SidebarProps {
  session: Session;
}

const dealerNavigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Feed Setup', href: '/feed', icon: Rss },
  { name: 'SKUs', href: '/skus', icon: Package },
  { name: 'Market Context', href: '/insights', icon: Lightbulb },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Export', href: '/export', icon: FileDown },
  { name: 'Settings', href: '/settings', icon: Settings },
];

const adminNavigation = [
  { name: 'All Dealers', href: '/admin/dealers', icon: Users },
  { name: 'System Status', href: '/admin/status', icon: Activity },
];

export function Sidebar({ session }: SidebarProps) {
  const pathname = usePathname();
  const isAdmin = session.type === 'admin';
  
  return (
    <div className="hidden lg:fixed lg:inset-y-0 lg:z-50 lg:flex lg:w-64 lg:flex-col">
      <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r border-gray-200 bg-white px-6 pb-4">
        {/* Logo */}
        <div className="flex h-16 shrink-0 items-center">
          <Link href={isAdmin ? '/admin/dealers' : '/dashboard'} className="flex items-center gap-2">
            <Image
              src="/logo-dark.svg"
              alt="IronScout"
              width={32}
              height={32}
              className="flex-shrink-0"
            />
            <span className="font-semibold text-gray-900">Dealer Portal</span>
          </Link>
        </div>
        
        {/* Session info */}
        <div className="px-3 py-2 bg-gray-50 rounded-lg">
          {isAdmin ? (
            <div>
              <p className="text-xs text-orange-600 font-semibold uppercase tracking-wider">Admin Mode</p>
              <p className="text-sm font-medium text-gray-900 truncate">{session.email}</p>
            </div>
          ) : (
            <div>
              <p className="text-sm font-medium text-gray-900 truncate">{session.businessName}</p>
              <p className="text-xs text-gray-500 truncate">{session.email}</p>
              <span className={cn(
                'mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
                session.tier === 'FOUNDING' ? 'bg-purple-100 text-purple-700' :
                session.tier === 'PRO' ? 'bg-blue-100 text-blue-700' :
                'bg-gray-100 text-gray-700'
              )}>
                {session.tier}
              </span>
            </div>
          )}
        </div>
        
        <nav className="flex flex-1 flex-col">
          <ul role="list" className="flex flex-1 flex-col gap-y-7">
            {/* Dealer Navigation */}
            {!isAdmin && (
              <li>
                <ul role="list" className="-mx-2 space-y-1">
                  {dealerNavigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cn(
                            'group flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6',
                            isActive
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                          )}
                        >
                          <item.icon
                            className={cn(
                              'h-5 w-5 shrink-0',
                              isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900'
                            )}
                          />
                          {item.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
            
            {/* Admin Navigation */}
            {isAdmin && (
              <li>
                <div className="text-xs font-semibold leading-6 text-gray-400 uppercase tracking-wider">
                  Admin
                </div>
                <ul role="list" className="-mx-2 mt-2 space-y-1">
                  {adminNavigation.map((item) => {
                    const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
                    return (
                      <li key={item.name}>
                        <Link
                          href={item.href}
                          className={cn(
                            'group flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6',
                            isActive
                              ? 'bg-gray-100 text-gray-900'
                              : 'text-gray-700 hover:text-gray-900 hover:bg-gray-50'
                          )}
                        >
                          <item.icon
                            className={cn(
                              'h-5 w-5 shrink-0',
                              isActive ? 'text-gray-900' : 'text-gray-400 group-hover:text-gray-900'
                            )}
                          />
                          {item.name}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </li>
            )}
            
            {/* Logout */}
            <li className="mt-auto">
              <Link
                href="/api/auth/logout"
                className="group -mx-2 flex gap-x-3 rounded-md p-2 text-sm font-medium leading-6 text-gray-700 hover:bg-gray-50 hover:text-gray-900 w-full"
              >
                <LogOut className="h-5 w-5 shrink-0 text-gray-400 group-hover:text-gray-900" />
                Sign out
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </div>
  );
}
