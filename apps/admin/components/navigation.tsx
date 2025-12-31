'use client';

import Link from 'next/link';
import Image from 'next/image';
import { usePathname } from 'next/navigation';
import {
  Users,
  BarChart3,
  Settings,
  LogOut,
  Rss,
} from 'lucide-react';
import type { AdminSession } from '@/lib/auth';

interface NavigationProps {
  admin: AdminSession;
}

const navItems = [
  { name: 'Dealers', href: '/dealers', icon: Users },
  { name: 'Affiliate Feeds', href: '/affiliate-feeds', icon: Rss },
  { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Navigation({ admin }: NavigationProps) {
  const pathname = usePathname();
  
  return (
    <div className="w-64 bg-gray-900 text-white flex flex-col">
      {/* Logo */}
      <div className="p-4 border-b border-gray-800">
        <Link href="/" className="flex items-center gap-2">
          <Image
            src="/logo-dark.svg"
            alt="IronScout"
            width={32}
            height={32}
            className="flex-shrink-0"
          />
          <div>
            <h1 className="text-lg font-bold">IronScout</h1>
            <p className="text-xs text-gray-400">Admin Portal</p>
          </div>
        </Link>
      </div>
      
      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname === item.href || 
            (item.href !== '/' && pathname.startsWith(item.href));
          
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 text-sm rounded-md transition-colors ${
                isActive
                  ? 'bg-gray-800 text-white'
                  : 'text-gray-300 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <item.icon className="h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>
      
      {/* User info */}
      <div className="p-4 border-t border-gray-800">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
            <span className="text-sm font-medium">
              {admin.name?.charAt(0) || admin.email.charAt(0).toUpperCase()}
            </span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium truncate">
              {admin.name || 'Admin'}
            </p>
            <p className="text-xs text-gray-400 truncate">
              {admin.email}
            </p>
          </div>
        </div>
        
        <a
          href="/api/auth/logout"
          className="mt-3 flex items-center gap-2 text-sm text-gray-400 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </a>
      </div>
    </div>
  );
}
