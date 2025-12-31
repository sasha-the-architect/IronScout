'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2 } from 'lucide-react';
import { createAffiliateFeedWithSource } from './actions';

type Transport = 'FTP' | 'SFTP';

export function CreateFeedForm() {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    // Source info
    sourceName: '',
    retailerName: '',
    websiteUrl: '',
    // Connection
    transport: 'SFTP' as Transport,
    host: '',
    port: 22,
    path: '',
    username: '',
    password: '',
    // Schedule
    scheduleFrequencyHours: 24,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createAffiliateFeedWithSource({
        sourceName: formData.sourceName,
        retailerName: formData.retailerName,
        websiteUrl: formData.websiteUrl || undefined,
        transport: formData.transport,
        host: formData.host,
        port: formData.port,
        path: formData.path,
        username: formData.username,
        password: formData.password,
        scheduleFrequencyHours: formData.scheduleFrequencyHours,
      });

      if (result.success) {
        router.push('/affiliate-feeds');
      } else {
        setError(result.error || 'Failed to create feed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Source Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Source Information</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Source Name *
            </label>
            <input
              type="text"
              required
              value={formData.sourceName}
              onChange={(e) => updateField('sourceName', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., Palmetto State Armory - Impact Feed"
            />
            <p className="mt-1 text-xs text-gray-500">
              Internal name for this feed source
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Retailer Name *
            </label>
            <input
              type="text"
              required
              value={formData.retailerName}
              onChange={(e) => updateField('retailerName', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., Palmetto State Armory"
            />
            <p className="mt-1 text-xs text-gray-500">
              Display name shown to users
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Website URL *
            </label>
            <input
              type="url"
              required
              value={formData.websiteUrl}
              onChange={(e) => updateField('websiteUrl', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., https://palmettostatearmory.com"
            />
          </div>
        </div>
      </div>

      {/* Connection Settings */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Connection Settings</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Transport Protocol *
            </label>
            <select
              value={formData.transport}
              onChange={(e) => {
                const transport = e.target.value as Transport;
                updateField('transport', transport);
                updateField('port', transport === 'SFTP' ? 22 : 21);
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              <option value="SFTP">SFTP (Recommended)</option>
              <option value="FTP">FTP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Host *
            </label>
            <input
              type="text"
              required
              value={formData.host}
              onChange={(e) => updateField('host', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., ftp.impactradius.com"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Port *
            </label>
            <input
              type="number"
              required
              value={formData.port}
              onChange={(e) => updateField('port', parseInt(e.target.value) || 22)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Remote Path *
            </label>
            <input
              type="text"
              required
              value={formData.path}
              onChange={(e) => updateField('path', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., /outgoing/products.csv"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Username *
            </label>
            <input
              type="text"
              required
              value={formData.username}
              onChange={(e) => updateField('username', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password *
            </label>
            <input
              type="password"
              required
              value={formData.password}
              onChange={(e) => updateField('password', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            />
            <p className="mt-1 text-xs text-gray-500">
              Credentials are encrypted at rest using AES-256-GCM
            </p>
          </div>
        </div>
      </div>

      {/* Schedule */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Schedule</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Run every (hours)
          </label>
          <input
            type="number"
            min={1}
            max={168}
            value={formData.scheduleFrequencyHours}
            onChange={(e) => updateField('scheduleFrequencyHours', parseInt(e.target.value) || 24)}
            className="mt-1 block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Feed will be created in DRAFT status. Enable it after verifying the connection works.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Link
          href="/affiliate-feeds"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
        >
          Cancel
        </Link>
        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Save className="h-4 w-4" />
          )}
          Create Feed
        </button>
      </div>
    </form>
  );
}
