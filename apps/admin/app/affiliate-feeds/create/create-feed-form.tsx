'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Save, Loader2, Plus, Store, Wifi, CheckCircle, XCircle } from 'lucide-react';
import { createAffiliateFeedWithSource, getRetailers, testFeedConnection, type AffiliateNetwork, type TestConnectionResult } from './actions';

/** Normalize a URL: add https:// if missing, lowercase, remove trailing slash */
function normalizeUrl(url: string): string {
  let normalized = url.trim().toLowerCase();
  if (!normalized) return normalized;
  if (!normalized.startsWith('http://') && !normalized.startsWith('https://')) {
    normalized = 'https://' + normalized;
  }
  return normalized.replace(/\/+$/, '');
}

/** Normalize a remote path: ensure leading slash for absolute path */
function normalizePath(path: string): string {
  let normalized = path.trim();
  if (!normalized) return normalized;
  // Add leading slash if missing (makes it an absolute path)
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  return normalized;
}

/** Format file size in human-readable format */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

type Transport = 'FTP' | 'SFTP';

const AFFILIATE_NETWORKS: { value: AffiliateNetwork; label: string }[] = [
  { value: 'IMPACT', label: 'Impact' },
  { value: 'AVANTLINK', label: 'AvantLink' },
  { value: 'SHAREASALE', label: 'ShareASale' },
  { value: 'CJ', label: 'CJ Affiliate' },
  { value: 'RAKUTEN', label: 'Rakuten' },
];

/**
 * Default tracking URL templates for each affiliate network.
 * These use the standard placeholders: {PRODUCT_URL}, {ADVERTISER_ID}, {PROGRAM_ID}, {CAMPAIGN_ID}
 * Users can override these if their setup differs from the standard.
 */
const DEFAULT_TRACKING_TEMPLATES: Record<AffiliateNetwork, string> = {
  // Impact uses campaign/advertiser structure
  IMPACT: 'https://goto.target.com/c/{CAMPAIGN_ID}/{ADVERTISER_ID}?u={PRODUCT_URL}',
  // AvantLink uses program ID for publisher tracking
  AVANTLINK: 'https://www.avantlink.com/click.php?p={PROGRAM_ID}&pw=1&pt=3&pri=1&url={PRODUCT_URL}',
  // ShareASale: u=affiliate ID, m=merchant/advertiser ID
  SHAREASALE: 'https://shareasale.com/r.cfm?b=1&u={PROGRAM_ID}&m={ADVERTISER_ID}&urllink={PRODUCT_URL_RAW}',
  // CJ Affiliate (Commission Junction)
  CJ: 'https://www.anrdoezrs.net/links/{PROGRAM_ID}/type/dlg/{ADVERTISER_ID}?url={PRODUCT_URL}',
  // Rakuten (formerly LinkShare)
  RAKUTEN: 'https://click.linksynergy.com/deeplink?id={PROGRAM_ID}&mid={ADVERTISER_ID}&murl={PRODUCT_URL}',
};

/** Check if a template is a default (used to know if we should auto-replace on network change) */
function isDefaultTemplate(template: string): boolean {
  return Object.values(DEFAULT_TRACKING_TEMPLATES).includes(template);
}

interface Retailer {
  id: string;
  name: string;
  website: string;
}

interface CreateFeedFormProps {
  preselectedRetailerId?: string;
  preselectedRetailerName?: string;
  preselectedRetailerWebsite?: string;
}

export function CreateFeedForm({
  preselectedRetailerId,
  preselectedRetailerName,
  preselectedRetailerWebsite,
}: CreateFeedFormProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Retailer selection state
  const [retailers, setRetailers] = useState<Retailer[]>([]);
  const [loadingRetailers, setLoadingRetailers] = useState(true);
  const [createNewRetailer, setCreateNewRetailer] = useState(false);

  // Connection test state
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestConnectionResult | null>(null);

  // Generate default source name from retailer name
  const defaultSourceName = preselectedRetailerName
    ? `${preselectedRetailerName} - Impact Feed`
    : '';

  const [formData, setFormData] = useState({
    // Source info
    sourceName: defaultSourceName,
    retailerId: preselectedRetailerId || '', // existing retailer
    newRetailerName: '', // for creating new
    newRetailerWebsite: '', // for creating new
    // Affiliate network
    affiliateNetwork: 'IMPACT' as AffiliateNetwork,
    affiliateAdvertiserId: '',
    affiliateAccountId: '',
    affiliateProgramId: '',
    affiliateTrackingTemplate: DEFAULT_TRACKING_TEMPLATES.IMPACT, // Pre-populate with default
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

  // Load retailers on mount
  useEffect(() => {
    async function loadRetailers() {
      try {
        const result = await getRetailers();
        if (result.success && result.data) {
          setRetailers(result.data);
          // If no retailers exist and no preselected, default to create new
          if (result.data.length === 0 && !preselectedRetailerId) {
            setCreateNewRetailer(true);
          }
        }
      } catch (err) {
        console.error('Failed to load retailers:', err);
      } finally {
        setLoadingRetailers(false);
      }
    }
    loadRetailers();
  }, [preselectedRetailerId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    // Validate retailer selection
    if (!createNewRetailer && !formData.retailerId) {
      setError('Please select a retailer or create a new one');
      setIsSubmitting(false);
      return;
    }
    if (createNewRetailer && !formData.newRetailerName.trim()) {
      setError('Please enter a retailer name');
      setIsSubmitting(false);
      return;
    }

    try {
      const result = await createAffiliateFeedWithSource({
        sourceName: formData.sourceName,
        // Either use existing retailer ID or create new
        retailerId: createNewRetailer ? undefined : formData.retailerId,
        newRetailerName: createNewRetailer ? formData.newRetailerName : undefined,
        newRetailerWebsite: createNewRetailer ? formData.newRetailerWebsite : undefined,
        affiliateNetwork: formData.affiliateNetwork,
        affiliateAdvertiserId: formData.affiliateAdvertiserId || undefined,
        affiliateAccountId: formData.affiliateAccountId || undefined,
        affiliateProgramId: formData.affiliateProgramId || undefined,
        affiliateTrackingTemplate: formData.affiliateTrackingTemplate || undefined,
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
    // Clear test result when connection fields change
    if (['transport', 'host', 'port', 'path', 'username', 'password'].includes(field)) {
      setTestResult(null);
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    setTestResult(null);

    try {
      const result = await testFeedConnection({
        transport: formData.transport,
        host: formData.host,
        port: formData.port,
        path: formData.path,
        username: formData.username,
        password: formData.password,
      });
      setTestResult(result);
    } catch (err) {
      setTestResult({
        success: false,
        error: 'Failed to test connection',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const canTestConnection = formData.host && formData.path && formData.username && formData.password;

  const selectedRetailer = retailers.find(r => r.id === formData.retailerId);

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
          <div className="sm:col-span-2">
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

          {/* Retailer Selection */}
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Retailer *
            </label>

            {/* When preselected from retailer detail page, show read-only display */}
            {preselectedRetailerId && preselectedRetailerName ? (
              <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-md">
                <Store className="h-5 w-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-900">{preselectedRetailerName}</span>
              </div>
            ) : loadingRetailers ? (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading retailers...
              </div>
            ) : (
              <>
                {/* Toggle between existing and new */}
                <div className="flex gap-4 mb-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={!createNewRetailer}
                      onChange={() => setCreateNewRetailer(false)}
                      disabled={retailers.length === 0}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className={`text-sm ${retailers.length === 0 ? 'text-gray-400' : 'text-gray-700'}`}>
                      Select existing retailer
                    </span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      checked={createNewRetailer}
                      onChange={() => setCreateNewRetailer(true)}
                      className="h-4 w-4 text-blue-600 border-gray-300 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Create new retailer</span>
                  </label>
                </div>

                {!createNewRetailer ? (
                  /* Existing Retailer Dropdown */
                  <div>
                    <select
                      value={formData.retailerId}
                      onChange={(e) => updateField('retailerId', e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                    >
                      <option value="">Select a retailer...</option>
                      {retailers.map((retailer) => (
                        <option key={retailer.id} value={retailer.id}>
                          {retailer.name}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  /* New Retailer Form */
                  <div className="space-y-4 p-4 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center gap-2 text-sm font-medium text-blue-800">
                      <Plus className="h-4 w-4" />
                      Create New Retailer
                    </div>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Retailer Name *
                        </label>
                        <input
                          type="text"
                          value={formData.newRetailerName}
                          onChange={(e) => updateField('newRetailerName', e.target.value)}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          placeholder="e.g., Palmetto State Armory"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700">
                          Website URL *
                        </label>
                        <input
                          type="text"
                          value={formData.newRetailerWebsite}
                          onChange={(e) => updateField('newRetailerWebsite', e.target.value)}
                          onBlur={(e) => updateField('newRetailerWebsite', normalizeUrl(e.target.value))}
                          className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
                          placeholder="e.g., palmettostatearmory.com"
                        />
                        <p className="mt-1 text-xs text-gray-500">
                          https:// will be added automatically
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Affiliate Network */}
      <div className="bg-white shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-4">Affiliate Network</h2>
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Network *
            </label>
            <select
              value={formData.affiliateNetwork}
              onChange={(e) => {
                const newNetwork = e.target.value as AffiliateNetwork;
                const currentTemplate = formData.affiliateTrackingTemplate;

                // Auto-populate template if empty or using another network's default
                const shouldAutoPopulate = !currentTemplate || isDefaultTemplate(currentTemplate);

                // Update source name if it follows the default pattern
                const networkLabel = AFFILIATE_NETWORKS.find(n => n.value === newNetwork)?.label || newNetwork;
                const oldNetworkLabel = AFFILIATE_NETWORKS.find(n => n.value === formData.affiliateNetwork)?.label || formData.affiliateNetwork;
                const defaultNamePattern = preselectedRetailerName
                  ? `${preselectedRetailerName} - ${oldNetworkLabel} Feed`
                  : '';
                const shouldUpdateName = preselectedRetailerName && formData.sourceName === defaultNamePattern;

                setFormData((prev) => ({
                  ...prev,
                  affiliateNetwork: newNetwork,
                  affiliateTrackingTemplate: shouldAutoPopulate
                    ? DEFAULT_TRACKING_TEMPLATES[newNetwork]
                    : currentTemplate,
                  sourceName: shouldUpdateName
                    ? `${preselectedRetailerName} - ${networkLabel} Feed`
                    : prev.sourceName,
                }));
              }}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
            >
              {AFFILIATE_NETWORKS.map((network) => (
                <option key={network.value} value={network.value}>
                  {network.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Advertiser ID
            </label>
            <input
              type="text"
              value={formData.affiliateAdvertiserId}
              onChange={(e) => updateField('affiliateAdvertiserId', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., 12345"
            />
            <p className="mt-1 text-xs text-gray-500">
              Network-assigned advertiser identifier for attribution
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Account ID
            </label>
            <input
              type="text"
              value={formData.affiliateAccountId}
              onChange={(e) => updateField('affiliateAccountId', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Optional"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Program ID
            </label>
            <input
              type="text"
              value={formData.affiliateProgramId}
              onChange={(e) => updateField('affiliateProgramId', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="Optional"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-700">
              Tracking Template
            </label>
            <input
              type="text"
              value={formData.affiliateTrackingTemplate}
              onChange={(e) => updateField('affiliateTrackingTemplate', e.target.value)}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm font-mono text-sm"
              placeholder="e.g., https://track.example.com/click?url={PRODUCT_URL}"
            />
            <p className="mt-1 text-xs text-gray-500">
              Pre-filled with network default. Edit if your setup differs.
              Placeholders: <code className="bg-gray-100 px-1 rounded">{'{PRODUCT_URL}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{ADVERTISER_ID}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{PROGRAM_ID}'}</code>,{' '}
              <code className="bg-gray-100 px-1 rounded">{'{CAMPAIGN_ID}'}</code>
            </p>
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
              onBlur={(e) => updateField('path', normalizePath(e.target.value))}
              className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm"
              placeholder="e.g., /outgoing/products.csv"
            />
            <p className="mt-1 text-xs text-gray-500">
              Leading / will be added automatically for absolute paths
            </p>
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

        {/* Test Connection Button */}
        <div className="mt-6 pt-4 border-t border-gray-200">
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={!canTestConnection || isTesting}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isTesting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="h-4 w-4" />
              )}
              {isTesting ? 'Testing...' : 'Test Connection'}
            </button>

            {/* Test Result */}
            {testResult && (
              <div className={`flex items-center gap-2 text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.success ? (
                  <>
                    <CheckCircle className="h-4 w-4" />
                    <span>
                      Connected! Found {testResult.fileName}
                      {testResult.fileSize !== undefined && ` (${formatFileSize(testResult.fileSize)})`}
                    </span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-4 w-4" />
                    <span>{testResult.error}</span>
                  </>
                )}
              </div>
            )}
          </div>
          {!canTestConnection && (
            <p className="mt-2 text-xs text-gray-500">
              Fill in host, path, username, and password to test the connection
            </p>
          )}
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
