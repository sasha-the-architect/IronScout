'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2 } from 'lucide-react';
import { createRetailerFeed, type FeedAccessType, type FeedFormatType } from './actions';

const ACCESS_TYPES: { value: FeedAccessType; label: string; description: string }[] = [
  { value: 'URL', label: 'Public URL', description: 'Publicly accessible URL (no auth)' },
  { value: 'AUTH_URL', label: 'Authenticated URL', description: 'URL with basic auth' },
  { value: 'FTP', label: 'FTP', description: 'FTP server connection' },
  { value: 'SFTP', label: 'SFTP', description: 'SFTP server connection' },
  { value: 'UPLOAD', label: 'Manual Upload', description: 'Manually uploaded files' },
];

const FORMAT_TYPES: { value: FeedFormatType; label: string }[] = [
  { value: 'AMMOSEEK_V1', label: 'AmmoSeek v1' },
  { value: 'GUNENGINE_V2', label: 'GunEngine v2' },
];

interface CreateFeedFormProps {
  retailerId: string;
  retailerName: string;
}

export function CreateRetailerFeedForm({ retailerId, retailerName }: CreateFeedFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    accessType: 'URL' as FeedAccessType,
    formatType: 'AMMOSEEK_V1' as FeedFormatType,
    url: '',
    username: '',
    password: '',
    scheduleMinutes: 60,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await createRetailerFeed({
        retailerId,
        name: formData.name,
        accessType: formData.accessType,
        formatType: formData.formatType,
        url: formData.url || undefined,
        username: formData.username || undefined,
        password: formData.password || undefined,
        scheduleMinutes: formData.scheduleMinutes,
      });

      if (result.success) {
        router.push(`/retailers/${retailerId}`);
      } else {
        setError(result.error || 'Failed to create feed');
      }
    } catch (err) {
      setError('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  const updateField = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const needsAuth = ['AUTH_URL', 'FTP', 'SFTP'].includes(formData.accessType);
  const needsUrl = formData.accessType !== 'UPLOAD';

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Retailer Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-800">
          Creating feed for retailer: <strong>{retailerName}</strong>
        </p>
      </div>

      {/* Feed Information */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Feed Information</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Feed Name *
            </label>
            <input
              type="text"
              required
              value={formData.name}
              onChange={(e) => updateField('name', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., Main Product Feed"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Access Type *
            </label>
            <select
              value={formData.accessType}
              onChange={(e) => updateField('accessType', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {ACCESS_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-gray-500">
              {ACCESS_TYPES.find((t) => t.value === formData.accessType)?.description}
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Format Type *
            </label>
            <select
              value={formData.formatType}
              onChange={(e) => updateField('formatType', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {FORMAT_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Connection Settings */}
      {needsUrl && (
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Connection Settings</h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-gray-700">
                {formData.accessType === 'FTP' || formData.accessType === 'SFTP' ? 'Host/Path' : 'Feed URL'} *
              </label>
              <input
                type="text"
                required
                value={formData.url}
                onChange={(e) => updateField('url', e.target.value)}
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                placeholder={
                  formData.accessType === 'FTP' || formData.accessType === 'SFTP'
                    ? 'e.g., ftp.example.com/feeds/products.csv'
                    : 'e.g., https://example.com/feed.csv'
                }
              />
            </div>

            {needsAuth && (
              <>
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
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Schedule */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Schedule</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700">
            Run every (minutes)
          </label>
          <input
            type="number"
            min={15}
            max={1440}
            value={formData.scheduleMinutes}
            onChange={(e) => updateField('scheduleMinutes', parseInt(e.target.value) || 60)}
            className="mt-1 block w-full max-w-xs rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
          />
          <p className="mt-1 text-xs text-gray-500">
            Feed will be created disabled. Enable it after verifying the connection works.
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3">
        <Link
          href={`/retailers/${retailerId}`}
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
