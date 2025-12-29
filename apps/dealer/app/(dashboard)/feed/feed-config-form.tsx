'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FeedAccessType, FeedFormatType } from '@ironscout/db';

interface FeedFormData {
  accessType: FeedAccessType;
  formatType: FeedFormatType;
  url: string;
  username: string;
  password: string;
  scheduleMinutes: number;
}

interface FeedConfigFormProps {
  initialData?: FeedFormData & { id?: string };
  onSuccess?: () => void;
}

const ACCESS_TYPE_OPTIONS: { value: FeedAccessType; label: string; description: string }[] = [
  { value: 'URL', label: 'Public URL', description: 'HTTP/HTTPS feed URL accessible without authentication' },
  { value: 'AUTH_URL', label: 'Authenticated URL', description: 'URL requiring Basic Auth credentials' },
  { value: 'FTP', label: 'FTP', description: 'FTP server with credentials' },
  { value: 'SFTP', label: 'SFTP', description: 'Secure FTP server with credentials' },
  // TODO: Manual upload feature - implement file upload handler
  // { value: 'UPLOAD', label: 'Manual Upload', description: 'Upload CSV/XML files manually' },
];

const FORMAT_TYPE_OPTIONS: { value: FeedFormatType; label: string; description: string }[] = [
  { value: 'AMMOSEEK_V1', label: 'AmmoSeek Compatible', description: 'AmmoSeek-compatible feed format' },
  { value: 'GUNENGINE_V2', label: 'GunEngine V2', description: 'GunEngine Offer Feed V2 format' },
  // Note: GENERIC (auto-detect) reserved for admin use
  // Note: IMPACT format is for IronScout affiliate feeds, configured in admin portal
];

const SCHEDULE_OPTIONS = [
  { value: 60, label: 'Every hour' },
  { value: 120, label: 'Every 2 hours' },
  { value: 360, label: 'Every 6 hours' },
  { value: 720, label: 'Every 12 hours' },
  { value: 1440, label: 'Once daily' },
];

export function FeedConfigForm({ initialData, onSuccess }: FeedConfigFormProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; rowCount?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<FeedFormData>({
    accessType: initialData?.accessType || 'URL',
    formatType: initialData?.formatType || 'AMMOSEEK_V1',
    url: initialData?.url || '',
    username: initialData?.username || '',
    password: initialData?.password || '',
    scheduleMinutes: initialData?.scheduleMinutes || 60,
  });

  const needsAuth = ['AUTH_URL', 'FTP', 'SFTP'].includes(formData.accessType);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: name === 'scheduleMinutes' ? parseInt(value) : value,
    }));
    setTestResult(null);
    setError(null);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestResult(null);
    setError(null);

    try {
      const res = await fetch('/api/feed/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData),
      });

      const data = await res.json();

      if (!res.ok) {
        setTestResult({ success: false, message: data.error || 'Test failed' });
        return;
      }

      setTestResult({
        success: true,
        message: `Successfully connected! Found ${data.rowCount} products.`,
        rowCount: data.rowCount,
      });
    } catch {
      setTestResult({ success: false, message: 'Connection test failed' });
    } finally {
      setIsTesting(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/feed', {
        method: initialData?.id ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          id: initialData?.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to save feed configuration');
        return;
      }

      onSuccess?.();
      router.refresh();
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Access Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Connection Type
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ACCESS_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none ${
                formData.accessType === option.value
                  ? 'border-gray-900 ring-2 ring-gray-900'
                  : 'border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="accessType"
                value={option.value}
                checked={formData.accessType === option.value}
                onChange={handleChange}
                className="sr-only"
              />
              <div className="flex flex-1 flex-col">
                <span className="block text-sm font-medium text-gray-900">
                  {option.label}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  {option.description}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* Format Type */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Feed Format
        </label>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {FORMAT_TYPE_OPTIONS.map((option) => (
            <label
              key={option.value}
              className={`relative flex cursor-pointer rounded-lg border p-4 shadow-sm focus:outline-none ${
                formData.formatType === option.value
                  ? 'border-gray-900 ring-2 ring-gray-900'
                  : 'border-gray-300'
              }`}
            >
              <input
                type="radio"
                name="formatType"
                value={option.value}
                checked={formData.formatType === option.value}
                onChange={handleChange}
                className="sr-only"
              />
              <div className="flex flex-1 flex-col">
                <span className="block text-sm font-medium text-gray-900">
                  {option.label}
                </span>
                <span className="mt-1 text-xs text-gray-500">
                  {option.description}
                </span>
              </div>
            </label>
          ))}
        </div>
      </div>

      {/* URL */}
      <div>
        <label htmlFor="url" className="block text-sm font-medium text-gray-700">
          Feed URL
        </label>
        <input
          type="url"
          id="url"
          name="url"
          required
          value={formData.url}
          onChange={handleChange}
          placeholder={
            formData.accessType === 'FTP' || formData.accessType === 'SFTP'
              ? 'ftp://example.com/feeds/products.csv'
              : 'https://example.com/feed.csv'
          }
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        />
      </div>

      {/* Auth Fields */}
      {needsAuth && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-700">
              Username
            </label>
            <input
              type="text"
              id="username"
              name="username"
              value={formData.username}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
            />
          </div>
        </div>
      )}

      {/* Schedule */}
      <div>
        <label htmlFor="scheduleMinutes" className="block text-sm font-medium text-gray-700">
          Update Schedule
        </label>
        <select
          id="scheduleMinutes"
          name="scheduleMinutes"
          value={formData.scheduleMinutes}
          onChange={handleChange}
          className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          {SCHEDULE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-gray-500">
          How often we should fetch your product feed
        </p>
      </div>

      {/* Test Result */}
      {testResult && (
        <div className={`rounded-md p-4 ${testResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
          <p className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
            {testResult.message}
          </p>
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t">
        <button
          type="button"
          onClick={handleTest}
          disabled={isTesting || !formData.url}
          className="inline-flex items-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isTesting ? 'Testing...' : 'Test Connection'}
        </button>

        <button
          type="submit"
          disabled={isLoading}
          className="inline-flex items-center rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isLoading ? 'Saving...' : initialData?.id ? 'Update Feed' : 'Save Feed'}
        </button>
      </div>
    </form>
  );
}
