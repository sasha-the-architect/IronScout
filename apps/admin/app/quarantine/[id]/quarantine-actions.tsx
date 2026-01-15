'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  CheckCircle,
  RefreshCw,
  Link as LinkIcon,
  Loader2,
  X,
  AlertTriangle,
} from 'lucide-react';
import {
  acknowledgeQuarantine,
  reprocessQuarantine,
  createBrandAliasFromQuarantine,
} from './actions';

interface QuarantineActionsProps {
  recordId: string;
  status: 'QUARANTINED' | 'RESOLVED' | 'DISMISSED';
  feedType: 'RETAILER' | 'AFFILIATE';
  // For brand alias suggestion
  rawBrand?: string;
}

export function QuarantineActions({
  recordId,
  status,
  feedType,
  rawBrand,
}: QuarantineActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  // Modal states
  const [showAckModal, setShowAckModal] = useState(false);
  const [showAliasModal, setShowAliasModal] = useState(false);

  // Form states
  const [ackNote, setAckNote] = useState('');
  const [aliasName, setAliasName] = useState(rawBrand || '');
  const [canonicalName, setCanonicalName] = useState('');
  const [aliasNotes, setAliasNotes] = useState('');

  // Result states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const isQuarantined = status === 'QUARANTINED';

  const handleAcknowledge = () => {
    setError(null);
    startTransition(async () => {
      const result = await acknowledgeQuarantine(recordId, ackNote);
      if (result.success) {
        setSuccess('Record dismissed successfully');
        setShowAckModal(false);
        setTimeout(() => router.push('/quarantine'), 1500);
      } else {
        setError(result.error || 'Failed to acknowledge');
      }
    });
  };

  const handleReprocess = () => {
    setError(null);
    startTransition(async () => {
      const result = await reprocessQuarantine(recordId);
      if (result.success) {
        setSuccess(result.message || 'Reprocess initiated');
      } else {
        setError(result.error || 'Failed to reprocess');
      }
    });
  };

  const handleCreateAlias = () => {
    setError(null);
    startTransition(async () => {
      const result = await createBrandAliasFromQuarantine(recordId, {
        aliasName,
        canonicalName,
        sourceType: feedType === 'AFFILIATE' ? 'AFFILIATE_FEED' : 'RETAILER_FEED',
        notes: aliasNotes || undefined,
      });
      if (result.success) {
        setSuccess('Brand alias created (as draft)');
        setShowAliasModal(false);
      } else {
        setError(result.error || 'Failed to create alias');
      }
    });
  };

  // Show success state
  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-4">
        <div className="flex items-center gap-2 text-green-700">
          <CheckCircle className="h-5 w-5" />
          <span className="font-medium">{success}</span>
        </div>
        {success.includes('dismissed') && (
          <p className="mt-2 text-sm text-green-600 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Redirecting to queue...
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
          Actions
        </h3>
      </div>

      <div className="p-4 space-y-3">
        {/* Error display */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Status badge for non-quarantined */}
        {!isQuarantined && (
          <div className={`rounded-lg p-3 ${
            status === 'RESOLVED'
              ? 'bg-green-50 border border-green-200'
              : 'bg-gray-50 border border-gray-200'
          }`}>
            <p className="text-sm">
              This record has been <strong>{status.toLowerCase()}</strong> and cannot be modified.
            </p>
          </div>
        )}

        {/* Action buttons */}
        <div className="space-y-2">
          {/* Acknowledge */}
          <button
            onClick={() => setShowAckModal(true)}
            disabled={!isQuarantined || isPending}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isQuarantined
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            <CheckCircle className="h-4 w-4" />
            Acknowledge (Dismiss)
          </button>

          {/* Reprocess */}
          <button
            onClick={handleReprocess}
            disabled={!isQuarantined || isPending}
            className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
              isQuarantined
                ? 'bg-blue-600 hover:bg-blue-700 text-white'
                : 'bg-gray-100 text-gray-400 cursor-not-allowed'
            }`}
          >
            {isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Reprocess
          </button>

          {/* Create Brand Alias */}
          <button
            onClick={() => {
              setAliasName(rawBrand || '');
              setShowAliasModal(true);
            }}
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium bg-purple-100 hover:bg-purple-200 text-purple-700 transition-colors"
          >
            <LinkIcon className="h-4 w-4" />
            Create Brand Alias
          </button>
        </div>

        {/* Help text */}
        <div className="text-xs text-gray-500 space-y-1 pt-2 border-t border-gray-100">
          <p><strong>Acknowledge:</strong> Mark as reviewed without action</p>
          <p><strong>Reprocess:</strong> Queue for re-import on next feed run</p>
          <p><strong>Brand Alias:</strong> Create mapping for unknown brands</p>
        </div>
      </div>

      {/* Acknowledge Modal */}
      {showAckModal && (
        <Modal onClose={() => setShowAckModal(false)}>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Acknowledge Quarantine Record
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              This will mark the record as dismissed. It will not be shown in the quarantine queue
              but remains in the database for audit purposes.
            </p>

            <div className="mb-4">
              <label htmlFor="ack-note" className="block text-sm font-medium text-gray-700 mb-1">
                Note (required)
              </label>
              <textarea
                id="ack-note"
                value={ackNote}
                onChange={(e) => setAckNote(e.target.value)}
                rows={3}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                placeholder="Why is this being dismissed?"
              />
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowAckModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleAcknowledge}
                disabled={isPending || ackNote.trim().length < 3}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-gray-900 text-white rounded-md hover:bg-gray-800 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Confirm Dismiss
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* Brand Alias Modal */}
      {showAliasModal && (
        <Modal onClose={() => setShowAliasModal(false)}>
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              Create Brand Alias
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              Create a mapping from an unrecognized brand name to a canonical brand.
              The alias will be created as a draft and require activation.
            </p>

            <div className="space-y-4">
              <div>
                <label htmlFor="alias-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Alias Name (raw brand from feed)
                </label>
                <input
                  type="text"
                  id="alias-name"
                  value={aliasName}
                  onChange={(e) => setAliasName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g., Federal Ammunition"
                />
              </div>

              <div>
                <label htmlFor="canonical-name" className="block text-sm font-medium text-gray-700 mb-1">
                  Canonical Name (standard brand)
                </label>
                <input
                  type="text"
                  id="canonical-name"
                  value={canonicalName}
                  onChange={(e) => setCanonicalName(e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="e.g., Federal Premium"
                />
              </div>

              <div>
                <label htmlFor="alias-notes" className="block text-sm font-medium text-gray-700 mb-1">
                  Notes (optional)
                </label>
                <textarea
                  id="alias-notes"
                  value={aliasNotes}
                  onChange={(e) => setAliasNotes(e.target.value)}
                  rows={2}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:ring-blue-500"
                  placeholder="Context or reasoning for this alias"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowAliasModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
                disabled={isPending}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateAlias}
                disabled={isPending || !aliasName.trim() || !canonicalName.trim()}
                className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                Create Alias (Draft)
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// Simple modal component
function Modal({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div
          className="relative w-full max-w-md transform rounded-lg bg-white shadow-xl transition-all"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="h-5 w-5" />
          </button>

          {children}
        </div>
      </div>
    </div>
  );
}
