'use client';

import { useState } from 'react';
import { Pencil, X, Check, Loader2 } from 'lucide-react';
import { updateDealer, UpdateDealerData } from './actions';

interface DealerData {
  id: string;
  businessName: string;
  contactFirstName: string;
  contactLastName: string;
  phone: string | null;
  websiteUrl: string;
  tier: string;
  storeType: string;
  status: string;
}

interface EditDealerFormProps {
  dealer: DealerData;
}

export function EditDealerForm({ dealer }: EditDealerFormProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    businessName: dealer.businessName,
    contactFirstName: dealer.contactFirstName,
    contactLastName: dealer.contactLastName,
    phone: dealer.phone || '',
    websiteUrl: dealer.websiteUrl,
    tier: dealer.tier,
    storeType: dealer.storeType,
    status: dealer.status,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const result = await updateDealer(dealer.id, formData as UpdateDealerData);
      
      if (result.success) {
        setIsOpen(false);
      } else {
        setError(result.error || 'Failed to save changes');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      businessName: dealer.businessName,
      contactFirstName: dealer.contactFirstName,
      contactLastName: dealer.contactLastName,
      phone: dealer.phone || '',
      websiteUrl: dealer.websiteUrl,
      tier: dealer.tier,
      storeType: dealer.storeType,
      status: dealer.status,
    });
    setIsOpen(false);
    setError(null);
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
      >
        <Pencil className="h-4 w-4" />
        Edit
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 overflow-y-auto">
          {/* Backdrop */}
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
            onClick={handleCancel}
          />
          
          {/* Modal */}
          <div className="flex min-h-full items-center justify-center p-4">
            <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-medium text-gray-900">Edit Dealer Information</h2>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  {/* Business Name */}
                  <div className="sm:col-span-2">
                    <label htmlFor="businessName" className="block text-sm font-medium text-gray-700">
                      Business Name
                    </label>
                    <input
                      type="text"
                      id="businessName"
                      value={formData.businessName}
                      onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      required
                    />
                  </div>

                  {/* Main Contact First Name */}
                  <div>
                    <label htmlFor="contactFirstName" className="block text-sm font-medium text-gray-700">
                      Main Contact First Name
                    </label>
                    <input
                      type="text"
                      id="contactFirstName"
                      value={formData.contactFirstName}
                      onChange={(e) => setFormData({ ...formData, contactFirstName: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      required
                    />
                  </div>

                  {/* Main Contact Last Name */}
                  <div>
                    <label htmlFor="contactLastName" className="block text-sm font-medium text-gray-700">
                      Main Contact Last Name
                    </label>
                    <input
                      type="text"
                      id="contactLastName"
                      value={formData.contactLastName}
                      onChange={(e) => setFormData({ ...formData, contactLastName: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      required
                    />
                  </div>

                  {/* Phone */}
                  <div>
                    <label htmlFor="phone" className="block text-sm font-medium text-gray-700">
                      Phone
                    </label>
                    <input
                      type="tel"
                      id="phone"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                    />
                  </div>

                  {/* Website URL */}
                  <div>
                    <label htmlFor="websiteUrl" className="block text-sm font-medium text-gray-700">
                      Website URL
                    </label>
                    <input
                      type="url"
                      id="websiteUrl"
                      value={formData.websiteUrl}
                      onChange={(e) => setFormData({ ...formData, websiteUrl: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      required
                    />
                  </div>

                  {/* Status */}
                  <div>
                    <label htmlFor="status" className="block text-sm font-medium text-gray-700">
                      Status
                    </label>
                    <select
                      id="status"
                      value={formData.status}
                      onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                    >
                      <option value="PENDING">Pending</option>
                      <option value="ACTIVE">Active</option>
                      <option value="SUSPENDED">Suspended</option>
                    </select>
                  </div>

                  {/* Tier */}
                  <div>
                    <label htmlFor="tier" className="block text-sm font-medium text-gray-700">
                      Tier
                    </label>
                    <select
                      id="tier"
                      value={formData.tier}
                      onChange={(e) => setFormData({ ...formData, tier: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                    >
                      <option value="FOUNDING">Founding (Free 12-month)</option>
                      <option value="BASIC">Basic</option>
                      <option value="PRO">Pro</option>
                      <option value="ENTERPRISE">Enterprise</option>
                    </select>
                  </div>

                  {/* Store Type */}
                  <div className="sm:col-span-2">
                    <label htmlFor="storeType" className="block text-sm font-medium text-gray-700">
                      Store Type
                    </label>
                    <select
                      id="storeType"
                      value={formData.storeType}
                      onChange={(e) => setFormData({ ...formData, storeType: e.target.value })}
                      className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                    >
                      <option value="ONLINE_ONLY">Online Only</option>
                      <option value="RETAIL_AND_ONLINE">Retail & Online</option>
                    </select>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-4 border-t">
                  <button
                    type="button"
                    onClick={handleCancel}
                    disabled={isSaving}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Save Changes
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
