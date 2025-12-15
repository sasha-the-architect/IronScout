'use client';

import type { DealerFeedRun } from '@ironscout/db';
import { CheckCircle, AlertTriangle, XCircle, Clock, Loader2, SkipForward } from 'lucide-react';

interface FeedRunsTableProps {
  runs: DealerFeedRun[];
}

const statusConfig = {
  PENDING: { icon: Clock, color: 'text-gray-600', bg: 'bg-gray-100', label: 'Pending', iconClass: '' },
  RUNNING: { icon: Loader2, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Running', iconClass: 'animate-spin' },
  SUCCESS: { icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-100', label: 'Success', iconClass: '' },
  WARNING: { icon: AlertTriangle, color: 'text-yellow-600', bg: 'bg-yellow-100', label: 'Warning', iconClass: '' },
  FAILURE: { icon: XCircle, color: 'text-red-600', bg: 'bg-red-100', label: 'Failed', iconClass: '' },
  SKIPPED: { icon: SkipForward, color: 'text-amber-600', bg: 'bg-amber-100', label: 'Skipped', iconClass: '' },
};

function formatDuration(ms: number | null): string {
  if (!ms) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

export function FeedRunsTable({ runs }: FeedRunsTableProps) {
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead>
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Started
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Duration
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Rows
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Indexed
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Quarantined
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Rejected
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-200">
          {runs.map((run) => {
            const status = statusConfig[run.status];
            return (
              <tr key={run.id}>
                <td className="px-4 py-3 whitespace-nowrap">
                  <div className="flex items-center gap-2">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${status.bg} ${status.color}`}>
                      <status.icon className={`h-3 w-3 mr-1 ${status.iconClass}`} />
                      {status.label}
                    </span>
                  </div>
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {new Date(run.startedAt).toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {formatDuration(run.duration)}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                  {run.rowCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-green-600">
                  {run.indexedCount.toLocaleString()}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-yellow-600">
                  {run.quarantinedCount > 0 ? run.quarantinedCount.toLocaleString() : '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-red-600">
                  {run.rejectedCount > 0 ? run.rejectedCount.toLocaleString() : '-'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      
      {runs.length === 0 && (
        <div className="text-center py-8">
          <Clock className="mx-auto h-8 w-8 text-gray-400" />
          <p className="mt-2 text-sm text-gray-500">No feed runs yet</p>
        </div>
      )}
    </div>
  );
}
