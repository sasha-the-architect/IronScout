'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Building, Link2, Unlink, Plus, Loader2 } from 'lucide-react';
import {
  getAvailableMerchants,
  linkMerchantToRetailer,
  unlinkMerchantFromRetailer,
} from '../actions';

interface MerchantLinkSectionProps {
  retailerId: string;
  linkedMerchant: {
    id: string;
    businessName: string;
    status: string;
  } | null;
}

export function MerchantLinkSection({ retailerId, linkedMerchant }: MerchantLinkSectionProps) {
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [isUnlinkDialogOpen, setIsUnlinkDialogOpen] = useState(false);
  const [availableMerchants, setAvailableMerchants] = useState<
    Array<{ id: string; businessName: string; status: string }>
  >([]);
  const [selectedMerchantId, setSelectedMerchantId] = useState('');
  const [listImmediately, setListImmediately] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load available merchants when dialog opens
  useEffect(() => {
    if (isLinkDialogOpen) {
      loadAvailableMerchants();
    }
  }, [isLinkDialogOpen]);

  async function loadAvailableMerchants() {
    const result = await getAvailableMerchants();
    if (result.success && result.data) {
      setAvailableMerchants(result.data);
      if (result.data.length > 0) {
        setSelectedMerchantId(result.data[0].id);
      }
    }
  }

  async function handleLink() {
    if (!selectedMerchantId) return;

    setIsLoading(true);
    setError(null);

    const result = await linkMerchantToRetailer(retailerId, selectedMerchantId, listImmediately);

    if (result.success) {
      setIsLinkDialogOpen(false);
      setSelectedMerchantId('');
    } else {
      setError(result.error || 'Failed to link merchant');
    }

    setIsLoading(false);
  }

  async function handleUnlink() {
    if (!linkedMerchant) return;

    setIsLoading(true);
    setError(null);

    const result = await unlinkMerchantFromRetailer(retailerId, linkedMerchant.id);

    if (result.success) {
      setIsUnlinkDialogOpen(false);
    } else {
      setError(result.error || 'Failed to unlink merchant');
    }

    setIsLoading(false);
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-medium text-gray-900">Linked Merchant</h2>
        {linkedMerchant ? (
          <button
            onClick={() => setIsUnlinkDialogOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-md hover:bg-red-100"
          >
            <Unlink className="h-4 w-4" />
            Unlink
          </button>
        ) : (
          <button
            onClick={() => setIsLinkDialogOpen(true)}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-sm font-medium text-blue-600 bg-blue-50 rounded-md hover:bg-blue-100"
          >
            <Plus className="h-4 w-4" />
            Link Merchant
          </button>
        )}
      </div>

      {linkedMerchant ? (
        <div className="flex items-center gap-3">
          <Building className="h-10 w-10 text-gray-400" />
          <div>
            <Link
              href={`/merchants/${linkedMerchant.id}`}
              className="text-blue-600 hover:underline font-medium"
            >
              {linkedMerchant.businessName}
            </Link>
            <p className="text-sm text-gray-500">Status: {linkedMerchant.status}</p>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-500">No merchant linked to this retailer.</p>
      )}

      {/* Link Dialog */}
      {isLinkDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setIsLinkDialogOpen(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Link Merchant to Retailer
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}

            {availableMerchants.length === 0 ? (
              <p className="text-sm text-gray-500 mb-4">
                No available merchants to link. All merchants are already linked to retailers.
              </p>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Select Merchant
                  </label>
                  <select
                    value={selectedMerchantId}
                    onChange={(e) => setSelectedMerchantId(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {availableMerchants.map((merchant) => (
                      <option key={merchant.id} value={merchant.id}>
                        {merchant.businessName} ({merchant.status})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-6">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={listImmediately}
                      onChange={(e) => setListImmediately(e.target.checked)}
                      className="h-4 w-4 text-blue-600 rounded border-gray-300"
                    />
                    <span className="text-sm text-gray-700">
                      List immediately (set status to LISTED + ACTIVE)
                    </span>
                  </label>
                </div>
              </>
            )}

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsLinkDialogOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              {availableMerchants.length > 0 && (
                <button
                  onClick={handleLink}
                  disabled={isLoading || !selectedMerchantId}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Linking...
                    </>
                  ) : (
                    <>
                      <Link2 className="h-4 w-4" />
                      Link Merchant
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Unlink Confirmation Dialog */}
      {isUnlinkDialogOpen && linkedMerchant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="fixed inset-0 bg-black/50"
            onClick={() => setIsUnlinkDialogOpen(false)}
          />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Unlink Merchant
            </h3>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
                {error}
              </div>
            )}

            <p className="text-sm text-gray-600 mb-6">
              Are you sure you want to unlink <strong>{linkedMerchant.businessName}</strong> from
              this retailer? This will remove the merchant-retailer relationship but will not
              delete any data.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setIsUnlinkDialogOpen(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
              >
                Cancel
              </button>
              <button
                onClick={handleUnlink}
                disabled={isLoading}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Unlinking...
                  </>
                ) : (
                  <>
                    <Unlink className="h-4 w-4" />
                    Unlink Merchant
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
