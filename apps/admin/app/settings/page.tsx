import { AlertTriangle, Flag, Sliders, Database } from 'lucide-react';
import { getAllSettings } from './actions';
import { DangerZoneSettings } from './danger-zone-settings';
import { OperationsSettings } from './operations-settings';
import { FeatureFlagsSettings } from './feature-flags-settings';
import { QueueHistorySettings } from './queue-history-settings';

export default async function SettingsPage() {
  const { settings, error } = await getAllSettings();

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="mt-1 text-sm text-gray-500">
          Platform configuration, feature flags, and operations settings
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
          {error}
        </div>
      )}

      {/* Feature Flags */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900">Feature Flags</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Enable or disable platform features. Changes take effect immediately.
          </p>
        </div>
        <div className="p-6">
          {settings ? (
            <FeatureFlagsSettings initialSettings={settings.featureFlags} />
          ) : (
            <p className="text-gray-500">Loading...</p>
          )}
        </div>
      </div>

      {/* Operations Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Sliders className="h-5 w-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900">Operations</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Tunable parameters for harvester and affiliate feed processing.
          </p>
        </div>
        <div className="p-6">
          {settings ? (
            <OperationsSettings initialSettings={settings.operations} />
          ) : (
            <p className="text-gray-500">Loading...</p>
          )}
        </div>
      </div>

      {/* Queue History Settings */}
      <div className="bg-white shadow rounded-lg">
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-cyan-600" />
            <h2 className="text-lg font-semibold text-gray-900">Queue History</h2>
          </div>
          <p className="mt-1 text-sm text-gray-600">
            Control which queues retain job history in Bull Board. Changes require harvester restart.
          </p>
        </div>
        <div className="p-6">
          {settings ? (
            <QueueHistorySettings initialSettings={settings.queueHistory} />
          ) : (
            <p className="text-gray-500">Loading...</p>
          )}
        </div>
      </div>

      {/* Danger Zone */}
      <div className="bg-white shadow rounded-lg border-2 border-red-200">
        <div className="px-6 py-4 border-b border-red-200 bg-red-50 rounded-t-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-red-600" />
            <h2 className="text-lg font-semibold text-red-900">Danger Zone</h2>
          </div>
          <p className="mt-1 text-sm text-red-700">
            These settings can compromise security or stability. Changes require double confirmation.
          </p>
        </div>
        <div className="p-6">
          {settings ? (
            <DangerZoneSettings initialSettings={settings.dangerZone} />
          ) : (
            <p className="text-gray-500">Loading...</p>
          )}
        </div>
      </div>
    </div>
  );
}
