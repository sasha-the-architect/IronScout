'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Fingerprint, CheckCircle, Loader2 } from 'lucide-react';
import { CandidateCard, NoCandidates } from './candidate-card';
import { LinkConfirmationModal } from './link-confirmation-modal';
import { linkToProduct } from '../actions';

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

interface CandidateWithData {
  candidate: Candidate;
  stats?: CandidateStats | null;
  priceRange30d?: PriceRange | null;
  priceRangeAllTime?: PriceRange | null;
}

interface CandidateListProps {
  sourceProductId: string;
  candidates: CandidateWithData[];
  inputNormalized?: InputNormalized | null;
  sourcePriceFromFeed?: number | null;
}

export function CandidateList({
  sourceProductId,
  candidates,
  inputNormalized,
  sourcePriceFromFeed,
}: CandidateListProps) {
  const router = useRouter();
  const [selectedCandidate, setSelectedCandidate] = useState<Candidate | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleLinkClick = (candidate: Candidate) => {
    setSelectedCandidate(candidate);
    setIsModalOpen(true);
    setError(null);
  };

  const handleConfirmLink = async () => {
    if (!selectedCandidate) return;

    setIsSubmitting(true);
    setError(null);

    const result = await linkToProduct(sourceProductId, selectedCandidate.productId);

    if (result.success) {
      setSuccess('Successfully linked to product');
      setIsModalOpen(false);
      setTimeout(() => router.push('/review-queue'), 1500);
    } else {
      setError(result.error ?? 'Failed to link product');
      setIsSubmitting(false);
    }
  };

  const handleCloseModal = () => {
    if (!isSubmitting) {
      setIsModalOpen(false);
      setSelectedCandidate(null);
    }
  };

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
        <p className="mt-2 text-sm text-green-700">{success}</p>
        <p className="mt-1 text-xs text-green-600 flex items-center justify-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" />
          Redirecting...
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide flex items-center gap-2">
          <Fingerprint className="h-4 w-4 text-purple-500" />
          Match Candidates ({candidates.length})
        </h2>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {candidates.length === 0 ? (
        <NoCandidates />
      ) : (
        <div className="space-y-4">
          {candidates.map(({ candidate, stats, priceRange30d, priceRangeAllTime }, idx) => (
            <CandidateCard
              key={candidate.productId}
              candidate={candidate}
              inputNormalized={inputNormalized}
              stats={stats}
              priceRange30d={priceRange30d}
              priceRangeAllTime={priceRangeAllTime}
              sourcePriceFromFeed={sourcePriceFromFeed}
              onLink={() => handleLinkClick(candidate)}
              isTopCandidate={idx === 0}
              rank={idx + 1}
            />
          ))}
        </div>
      )}

      {/* Link Confirmation Modal */}
      {selectedCandidate && (
        <LinkConfirmationModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          onConfirm={handleConfirmLink}
          sourceFields={{
            brandNorm: inputNormalized?.brandNorm,
            caliberNorm: inputNormalized?.caliberNorm,
            packCount: inputNormalized?.packCount,
            grain: inputNormalized?.grain,
            caseMaterial: inputNormalized?.caseMaterial,
            muzzleVelocityFps: inputNormalized?.muzzleVelocityFps,
            bulletType: inputNormalized?.bulletType,
          }}
          candidate={selectedCandidate}
          isSubmitting={isSubmitting}
        />
      )}
    </div>
  );
}
