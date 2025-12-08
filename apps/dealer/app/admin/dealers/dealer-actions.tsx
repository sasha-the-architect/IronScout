'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { Dealer, DealerStatus } from '@ironscout/db';

interface DealerActionsProps {
  dealer: Dealer;
}

export function DealerActions({ dealer }: DealerActionsProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);

  const handleAction = async (action: 'approve' | 'suspend' | 'reactivate') => {
    if (!confirm(`Are you sure you want to ${action} ${dealer.businessName}?`)) {
      return;
    }

    setIsLoading(true);
    try {
      const res = await fetch(`/api/admin/dealers/${dealer.id}/${action}`, {
        method: 'POST',
      });

      if (!res.ok) {
        const data = await res.json();
        alert(data.error || `Failed to ${action} dealer`);
        return;
      }

      router.refresh();
    } catch (error) {
      alert(`Failed to ${action} dealer`);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      {dealer.status === 'PENDING' && (
        <button
          onClick={() => handleAction('approve')}
          disabled={isLoading}
          className="inline-flex items-center rounded-md bg-green-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
        >
          Approve
        </button>
      )}
      
      {dealer.status === 'ACTIVE' && (
        <button
          onClick={() => handleAction('suspend')}
          disabled={isLoading}
          className="inline-flex items-center rounded-md bg-red-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-50"
        >
          Suspend
        </button>
      )}
      
      {dealer.status === 'SUSPENDED' && (
        <button
          onClick={() => handleAction('reactivate')}
          disabled={isLoading}
          className="inline-flex items-center rounded-md bg-blue-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          Reactivate
        </button>
      )}
      
      <a
        href={`/admin/dealers/${dealer.id}`}
        className="inline-flex items-center rounded-md bg-gray-100 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-200"
      >
        View
      </a>
    </div>
  );
}
