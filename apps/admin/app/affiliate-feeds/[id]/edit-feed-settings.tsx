'use client';

import { useState, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X, Check, Loader2, Key, AlertTriangle, CheckCircle, XCircle, Plug } from 'lucide-react';
import { updateAffiliateFeed } from '../actions';
import { testFeedConnection } from './actions';

interface EditFeedSettingsProps {
  feed: {
    id: string;
    status: 'DRAFT' | 'ENABLED' | 'PAUSED' | 'DISABLED';
    host: string | null;
    port: number | null;
    path: string | null;
    username: string | null;
    transport: string;
    format: string;
    compression: string;
    scheduleFrequencyHours: number | null;
    expiryHours: number;
    maxFileSizeBytes: bigint | null;
    maxRowCount: number | null;
    secretCiphertext: Uint8Array | null;
  };
}

export function EditFeedSettings({ feed }: EditFeedSettingsProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testPassed, setTestPassed] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Track if modal is still mounted to avoid state updates after close
  const isMountedRef = useRef(true);
  const testAbortedRef = useRef(false);

  // Form state
  const [formData, setFormData] = useState<{
    host: string;
    port: number;
    path: string;
    username: string;
    password: string;
    scheduleFrequencyHours: number;
    expiryHours: number;
    compression: 'NONE' | 'GZIP';
  }>({
    host: feed.host || '',
    port: feed.port || (feed.transport === 'SFTP' ? 22 : 21),
    path: feed.path || '',
    username: feed.username || '',
    password: '', // Always empty - only set if changing
    scheduleFrequencyHours: feed.scheduleFrequencyHours || 24,
    expiryHours: feed.expiryHours || 48,
    compression: (feed.compression as 'NONE' | 'GZIP') || 'NONE',
  });

  // Track if form has been modified since last test
  const [formModifiedSinceTest, setFormModifiedSinceTest] = useState(false);

  const hasCredentials = !!feed.secretCiphertext;
  const isRunning = feed.status === 'ENABLED';

  // Can only save if test passed and form hasn't been modified since
  const canSave = testPassed && !formModifiedSinceTest;

  const handleFormChange = (field: string, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    setFormModifiedSinceTest(true);
    setTestPassed(false);
    setTestResult(null);
  };

  const handleTestConnection = useCallback(async () => {
    setIsTesting(true);
    setTestResult(null);
    setTestPassed(false);
    testAbortedRef.current = false;

    try {
      // If password changed, we need to save first before testing
      if (formData.password) {
        // Save the credentials first
        const saveResult = await updateAffiliateFeed(feed.id, {
          host: formData.host,
          port: formData.port,
          path: formData.path,
          username: formData.username,
          password: formData.password,
          scheduleFrequencyHours: formData.scheduleFrequencyHours,
          expiryHours: formData.expiryHours,
          compression: formData.compression,
        });

        // Check if aborted during save
        if (testAbortedRef.current) return;

        if (!saveResult.success) {
          setTestResult({
            success: false,
            message: saveResult.error || 'Failed to save credentials before test',
          });
          return;
        }

        // Clear password field after successful save
        setFormData(prev => ({ ...prev, password: '' }));
      }

      const result = await testFeedConnection(feed.id);

      // Check if aborted during test - don't update state
      if (testAbortedRef.current) return;

      const success = result.success;

      setTestResult({
        success,
        message: success
          ? `Connected! File: ${result.fileName} (${((result.fileSize || 0) / 1024 / 1024).toFixed(1)} MB)`
          : result.error || 'Connection failed',
      });

      if (success) {
        setTestPassed(true);
        setFormModifiedSinceTest(false);
      }
    } catch {
      // Only set error if not aborted
      if (!testAbortedRef.current) {
        setTestResult({ success: false, message: 'Test failed unexpectedly' });
      }
    } finally {
      // Only update testing state if not aborted
      if (!testAbortedRef.current) {
        setIsTesting(false);
      }
    }
  }, [feed.id, formData]);

  const handleSave = async () => {
    if (!canSave) return;

    setIsSaving(true);
    setError(null);

    try {
      const updateData: Record<string, unknown> = {
        host: formData.host,
        port: formData.port,
        path: formData.path,
        username: formData.username,
        scheduleFrequencyHours: formData.scheduleFrequencyHours,
        expiryHours: formData.expiryHours,
        compression: formData.compression,
      };

      // Only include password if user entered a new one
      if (formData.password) {
        updateData.password = formData.password;
      }

      const result = await updateAffiliateFeed(feed.id, updateData);

      if (result.success) {
        setIsOpen(false);
        router.refresh();
      } else {
        setError(result.error || 'Failed to save settings');
      }
    } catch {
      setError('An unexpected error occurred');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCancel = useCallback(() => {
    // Abort any in-progress test
    testAbortedRef.current = true;

    // Reset all state
    setIsTesting(false);
    setFormData({
      host: feed.host || '',
      port: feed.port || (feed.transport === 'SFTP' ? 22 : 21),
      path: feed.path || '',
      username: feed.username || '',
      password: '',
      scheduleFrequencyHours: feed.scheduleFrequencyHours || 24,
      expiryHours: feed.expiryHours || 48,
      compression: (feed.compression as 'NONE' | 'GZIP') || 'NONE',
    });
    setIsOpen(false);
    setError(null);
    setTestResult(null);
    setTestPassed(false);
    setFormModifiedSinceTest(false);
  }, [feed]);

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
                <h2 className="text-lg font-medium text-gray-900">Edit Feed Settings</h2>
                <button
                  onClick={handleCancel}
                  className="text-gray-400 hover:text-gray-500"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Warning if feed is running */}
              {isRunning && (
                <div className="mb-4 rounded-md bg-amber-50 border border-amber-200 p-3">
                  <div className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    <span className="text-sm text-amber-800">
                      Feed is enabled. Consider pausing before making changes.
                    </span>
                  </div>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md text-red-700 text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-6">
                {/* Connection Settings */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Connection Settings</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Host</label>
                      <input
                        type="text"
                        value={formData.host}
                        onChange={(e) => handleFormChange('host', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Port</label>
                      <input
                        type="number"
                        value={formData.port}
                        onChange={(e) => handleFormChange('port', parseInt(e.target.value) || 0)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-sm font-medium text-gray-700">Path</label>
                      <input
                        type="text"
                        value={formData.path}
                        onChange={(e) => handleFormChange('path', e.target.value)}
                        placeholder="/path/to/feed.csv"
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono border px-3 py-2"
                      />
                    </div>
                  </div>
                </div>

                {/* Credentials */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Credentials
                    {hasCredentials && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                        Configured
                      </span>
                    )}
                  </h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Username</label>
                      <input
                        type="text"
                        value={formData.username}
                        onChange={(e) => handleFormChange('username', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">
                        Password {hasCredentials && <span className="text-gray-400">(leave blank to keep)</span>}
                      </label>
                      <input
                        type="password"
                        value={formData.password}
                        onChange={(e) => handleFormChange('password', e.target.value)}
                        placeholder={hasCredentials ? '••••••••' : 'Enter password'}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      />
                    </div>
                  </div>
                </div>

                {/* Schedule Settings */}
                <div className="border-t pt-4">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">Schedule Settings</h3>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Frequency (hours)</label>
                      <input
                        type="number"
                        value={formData.scheduleFrequencyHours}
                        onChange={(e) => handleFormChange('scheduleFrequencyHours', parseInt(e.target.value) || 24)}
                        min={1}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Expiry (hours)</label>
                      <input
                        type="number"
                        value={formData.expiryHours}
                        onChange={(e) => handleFormChange('expiryHours', parseInt(e.target.value) || 48)}
                        min={24}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Compression</label>
                      <select
                        value={formData.compression}
                        onChange={(e) => handleFormChange('compression', e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm border px-3 py-2"
                      >
                        <option value="NONE">None</option>
                        <option value="GZIP">GZIP</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Test Result */}
                {testResult && (
                  <div className={`rounded-md p-3 flex items-center gap-2 ${testResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}>
                    {testResult.success ? (
                      <CheckCircle className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-red-600" />
                    )}
                    <span className={`text-sm ${testResult.success ? 'text-green-800' : 'text-red-800'}`}>
                      {testResult.message}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center justify-between pt-4 border-t">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={isTesting || (!hasCredentials && !formData.password)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                  >
                    {isTesting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Plug className="h-4 w-4" />
                    )}
                    Test Connection
                  </button>

                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={handleCancel}
                      disabled={isSaving}
                      className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleSave}
                      disabled={isSaving || !canSave}
                      title={!canSave ? 'Test connection must pass before saving' : undefined}
                      className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
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
                </div>

                {!canSave && !testResult && (
                  <p className="text-sm text-gray-500 text-center">
                    Test connection to enable save
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
