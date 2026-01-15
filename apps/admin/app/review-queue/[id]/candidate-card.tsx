'use client';

import {
  CheckCircle,
  XCircle,
  MinusCircle,
  Users,
  Clock,
  ExternalLink,
  LinkIcon,
} from 'lucide-react';
import { ScoreBreakdown, computeScoreBreakdown } from './score-breakdown';
import { PriceContext } from './price-context';

interface MatchDetails {
  brandMatch: boolean;
  caliberMatch: boolean;
  packMatch: boolean;
  grainMatch: boolean;
  titleSimilarity: number;
}

interface Candidate {
  productId: string;
  canonicalKey: string;
  name?: string | null;
  upcNorm?: string | null;
  brandNorm?: string | null;
  caliberNorm?: string | null;
  packCount?: number | null;
  grain?: number | null;
  caseMaterial?: string | null;
  muzzleVelocityFps?: number | null;
  bulletType?: string | null;
  score: number;
  matchDetails?: MatchDetails;
}

interface InputNormalized {
  brandNorm?: string;
  caliberNorm?: string;
  packCount?: number;
  grain?: number;
  caseMaterial?: string;
  muzzleVelocityFps?: number;
  bulletType?: string;
}

interface CandidateStats {
  sourceCount: number;
  retailerCount: number;
  lastSeenAt?: Date | string | null;
}

interface PriceRange {
  min: number;
  max: number;
  avg: number;
  count: number;
}

interface CandidateCardProps {
  candidate: Candidate;
  inputNormalized?: InputNormalized | null;
  stats?: CandidateStats | null;
  priceRange30d?: PriceRange | null;
  priceRangeAllTime?: PriceRange | null;
  sourcePriceFromFeed?: number | null;
  onLink: () => void;
  isTopCandidate?: boolean;
  rank: number;
}

type MatchStatus = 'match' | 'mismatch' | 'missing' | 'na';

/**
 * Compare two values and determine match status
 */
function getMatchStatus(
  sourceValue: string | number | null | undefined,
  candidateValue: string | number | null | undefined
): MatchStatus {
  // Both missing - not applicable
  if (!sourceValue && !candidateValue) return 'na';
  // Only source has value
  if (sourceValue && !candidateValue) return 'missing';
  // Only candidate has value (show it, mark as n/a for comparison)
  if (!sourceValue && candidateValue) return 'na';
  // Both have values - compare
  const sourceStr = String(sourceValue).toLowerCase().trim();
  const candidateStr = String(candidateValue).toLowerCase().trim();
  return sourceStr === candidateStr ? 'match' : 'mismatch';
}

/**
 * Field comparison row in the grid
 */
function ComparisonRow({
  label,
  sourceValue,
  candidateValue,
  status,
}: {
  label: string;
  sourceValue: string | number | null | undefined;
  candidateValue: string | number | null | undefined;
  status: MatchStatus;
}) {
  return (
    <tr className="border-b border-gray-100 last:border-b-0">
      <td className="py-1.5 pr-3 text-xs text-gray-500 font-medium">{label}</td>
      <td className="py-1.5 px-2 text-xs font-mono">
        {sourceValue != null ? (
          <span className={status === 'mismatch' ? 'text-red-700 font-semibold' : 'text-gray-900'}>
            {String(sourceValue)}
          </span>
        ) : (
          <span className="text-gray-400 italic">—</span>
        )}
      </td>
      <td className="py-1.5 px-2 text-xs font-mono">
        {candidateValue != null ? (
          <span className={status === 'mismatch' ? 'text-red-700 font-semibold' : 'text-gray-900'}>
            {String(candidateValue)}
          </span>
        ) : (
          <span className="text-gray-400 italic">—</span>
        )}
      </td>
      <td className="py-1.5 pl-2">
        <MatchIndicator status={status} />
      </td>
    </tr>
  );
}

/**
 * Visual match/mismatch indicator
 */
function MatchIndicator({ status }: { status: MatchStatus }) {
  switch (status) {
    case 'match':
      return <CheckCircle className="h-4 w-4 text-green-600" />;
    case 'mismatch':
      return <XCircle className="h-4 w-4 text-red-600" />;
    case 'missing':
      return <MinusCircle className="h-4 w-4 text-amber-500" />;
    case 'na':
      return <span className="text-xs text-gray-400">n/a</span>;
  }
}

/**
 * Format relative time
 */
function formatRelativeTime(date: Date | string | null | undefined): string {
  if (!date) return 'unknown';
  const d = typeof date === 'string' ? new Date(date) : date;
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);

  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export function CandidateCard({
  candidate,
  inputNormalized,
  stats,
  priceRange30d,
  priceRangeAllTime,
  sourcePriceFromFeed,
  onLink,
  isTopCandidate = false,
  rank,
}: CandidateCardProps) {
  // Field comparison data
  const fields = [
    {
      label: 'Brand',
      source: inputNormalized?.brandNorm,
      candidate: candidate.brandNorm,
    },
    {
      label: 'Caliber',
      source: inputNormalized?.caliberNorm,
      candidate: candidate.caliberNorm,
    },
    {
      label: 'Grain',
      source: inputNormalized?.grain,
      candidate: candidate.grain,
    },
    {
      label: 'Pack',
      source: inputNormalized?.packCount,
      candidate: candidate.packCount,
    },
    {
      label: 'Casing',
      source: inputNormalized?.caseMaterial,
      candidate: candidate.caseMaterial,
    },
    {
      label: 'Velocity',
      source: inputNormalized?.muzzleVelocityFps,
      candidate: candidate.muzzleVelocityFps,
    },
    {
      label: 'Bullet',
      source: inputNormalized?.bulletType,
      candidate: candidate.bulletType,
    },
  ];

  // Calculate match statuses
  const fieldStatuses = fields.map((f) => ({
    ...f,
    status: getMatchStatus(f.source, f.candidate),
  }));

  // Count mismatches (excluding n/a and missing)
  const mismatchCount = fieldStatuses.filter((f) => f.status === 'mismatch').length;
  const hasMismatches = mismatchCount > 0;

  return (
    <div
      className={`border rounded-lg overflow-hidden transition-shadow hover:shadow-md ${
        isTopCandidate
          ? 'border-purple-300 ring-2 ring-purple-100'
          : 'border-gray-200'
      }`}
    >
      {/* Header */}
      <div
        className={`px-4 py-3 ${
          isTopCandidate ? 'bg-purple-50' : 'bg-gray-50'
        } border-b border-gray-200`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span
              className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold flex-shrink-0 ${
                isTopCandidate
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-300 text-gray-700'
              }`}
            >
              {rank}
            </span>
            <div className="min-w-0 flex-1">
              {/* Full product name/title */}
              <div className="font-semibold text-gray-900 text-sm leading-tight">
                {candidate.name || candidate.canonicalKey || candidate.productId}
              </div>
              {/* Show canonical key as subtitle if name is shown */}
              {candidate.name && candidate.canonicalKey && (
                <div className="text-xs text-gray-500 font-mono truncate mt-0.5">
                  {candidate.canonicalKey}
                </div>
              )}
              <div className="text-xs text-gray-500 font-mono mt-0.5">
                UPC: {candidate.upcNorm ?? 'unknown'}
              </div>
              {hasMismatches && (
                <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">
                  <XCircle className="h-3 w-3" />
                  {mismatchCount} mismatch{mismatchCount > 1 ? 'es' : ''}
                </span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-2xl font-bold text-gray-900 tabular-nums">
              {(candidate.score * 100).toFixed(0)}%
            </div>
            <div className="text-xs text-gray-500">match score</div>
          </div>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* Score Breakdown */}
        {candidate.matchDetails && (
          <ScoreBreakdown score={candidate.score} matchDetails={candidate.matchDetails} />
        )}

        {/* Field Comparison Grid */}
        <div>
          <h4 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
            Field Comparison
          </h4>
          <div className="bg-gray-50 rounded-lg overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-100">
                  <th className="py-1.5 pr-3 text-left text-xs font-medium text-gray-500 pl-3">
                    Field
                  </th>
                  <th className="py-1.5 px-2 text-left text-xs font-medium text-gray-500">
                    Source
                  </th>
                  <th className="py-1.5 px-2 text-left text-xs font-medium text-gray-500">
                    Candidate
                  </th>
                  <th className="py-1.5 pl-2 pr-3 text-xs font-medium text-gray-500"></th>
                </tr>
              </thead>
              <tbody className="px-3">
                {fieldStatuses.map((field) => (
                  <ComparisonRow
                    key={field.label}
                    label={field.label}
                    sourceValue={field.source}
                    candidateValue={field.candidate}
                    status={field.status}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Stats Row */}
        {stats && (
          <div className="flex items-center gap-4 text-xs text-gray-600">
            <div className="flex items-center gap-1.5">
              <Users className="h-3.5 w-3.5 text-gray-400" />
              <span>{stats.sourceCount} sources</span>
              {stats.retailerCount > 0 && (
                <span className="text-gray-400">
                  ({stats.retailerCount} retailers)
                </span>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-gray-400" />
              <span>Last seen {formatRelativeTime(stats.lastSeenAt)}</span>
            </div>
          </div>
        )}

        {/* Price Context */}
        {(priceRange30d || sourcePriceFromFeed) && (
          <PriceContext
            sourcePrice={sourcePriceFromFeed}
            range30d={priceRange30d}
            rangeAllTime={priceRangeAllTime}
          />
        )}

        {/* Actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-gray-100">
          <button
            onClick={onLink}
            className={`flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              hasMismatches
                ? 'bg-amber-600 hover:bg-amber-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            <LinkIcon className="h-4 w-4" />
            Link to This
            {hasMismatches && (
              <span className="text-xs opacity-80">(review required)</span>
            )}
          </button>
          {/* Product detail link - disabled until page exists */}
          {/* <a
            href={`/admin/products/${candidate.productId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-md text-sm font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 transition-colors"
          >
            <ExternalLink className="h-4 w-4" />
            View
          </a> */}
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no candidates
 */
export function NoCandidates() {
  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-6 text-center">
      <div className="text-gray-400 mb-2">
        <MinusCircle className="h-8 w-8 mx-auto" />
      </div>
      <p className="text-sm text-gray-600">No match candidates found</p>
      <p className="text-xs text-gray-500 mt-1">
        Consider creating a new product or searching manually
      </p>
    </div>
  );
}
