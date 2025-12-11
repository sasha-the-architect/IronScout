'use client';

import { useEffect, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ImpersonationData {
  adminEmail: string;
  dealerName: string;
  startedAt: string;
}

export function ImpersonationBanner() {
  const [impersonation, setImpersonation] = useState<ImpersonationData | null>(null);

  useEffect(() => {
    // Check for impersonation cookie
    const cookieValue = document.cookie
      .split('; ')
      .find(row => row.startsWith('dealer-impersonation='))
      ?.split('=')[1];

    if (cookieValue) {
      try {
        const data = JSON.parse(decodeURIComponent(cookieValue));
        setImpersonation(data);
      } catch {
        // Invalid cookie data
      }
    }
  }, []);

  const handleEndImpersonation = async () => {
    // Clear the cookies
    document.cookie = 'dealer-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.ironscout.ai';
    document.cookie = 'dealer-impersonation=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; domain=.ironscout.ai';
    document.cookie = 'dealer-session=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    document.cookie = 'dealer-impersonation=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    
    // Redirect to admin portal or close window
    window.location.href = '/login';
  };

  if (!impersonation) {
    return null;
  }

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-orange-500 text-white px-4 py-2">
      <div className="max-w-7xl mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="h-5 w-5" />
          <span className="text-sm font-medium">
            Admin Impersonation Mode: You are viewing as <strong>{impersonation.dealerName}</strong>
          </span>
          <span className="text-xs opacity-75">
            (by {impersonation.adminEmail})
          </span>
        </div>
        <button
          onClick={handleEndImpersonation}
          className="flex items-center gap-1 px-3 py-1 text-sm font-medium bg-orange-600 hover:bg-orange-700 rounded"
        >
          <X className="h-4 w-4" />
          End Session
        </button>
      </div>
    </div>
  );
}
