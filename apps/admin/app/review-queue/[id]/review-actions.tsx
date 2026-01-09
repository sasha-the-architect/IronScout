'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Link as LinkIcon,
  Plus,
  SkipForward,
  Search,
  CheckCircle,
  Loader2,
} from 'lucide-react';
import { linkToProduct, createAndLinkProduct, skipReview } from '../actions';

interface Candidate {
  productId: string;
  canonicalKey: string;
  brandNorm?: string;
  caliberNorm?: string;
  packCount?: number;
  grain?: number;
  score: number;
}

interface SearchProduct {
  id: string;
  name: string;
  canonicalKey: string | null;
  brandNorm: string | null;
  caliberNorm: string | null;
}

interface InputNormalized {
  title?: string;
  brandNorm?: string;
  caliberNorm?: string;
  grain?: number;
  packCount?: number;
  upcNorm?: string;
}

interface ReviewActionsProps {
  sourceProductId: string;
  candidates: Candidate[];
  searchProducts: SearchProduct[];
  inputNormalized?: InputNormalized;
  /** Known brand values for autocomplete consistency */
  knownBrands?: string[];
  /** Known caliber values for autocomplete consistency */
  knownCalibers?: string[];
}

export function ReviewActions({
  sourceProductId,
  candidates,
  searchProducts,
  inputNormalized,
  knownBrands = [],
  knownCalibers = [],
}: ReviewActionsProps) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [skipReason, setSkipReason] = useState('');

  // New product form state
  const [newProductName, setNewProductName] = useState(inputNormalized?.title ?? '');
  const [newProductBrand, setNewProductBrand] = useState(inputNormalized?.brandNorm ?? '');
  const [newProductCaliber, setNewProductCaliber] = useState(inputNormalized?.caliberNorm ?? '');
  const [newProductGrain, setNewProductGrain] = useState(inputNormalized?.grain?.toString() ?? '');
  const [newProductPack, setNewProductPack] = useState(inputNormalized?.packCount?.toString() ?? '');

  const filteredProducts = searchProducts.filter(
    (p) =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.canonicalKey?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLinkToExisting = async (productId: string) => {
    setIsSubmitting(true);
    setError(null);

    const result = await linkToProduct(sourceProductId, productId);

    if (result.success) {
      setSuccess('Successfully linked to product');
      setTimeout(() => router.push('/review-queue'), 1500);
    } else {
      setError(result.error ?? 'Failed to link product');
      setIsSubmitting(false);
    }
  };

  const handleLinkToCandidate = async (candidate: Candidate) => {
    await handleLinkToExisting(candidate.productId);
  };

  const handleCreateAndLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    const result = await createAndLinkProduct(sourceProductId, {
      name: newProductName,
      brandNorm: newProductBrand || undefined,
      caliberNorm: newProductCaliber || undefined,
      grainWeight: newProductGrain ? parseInt(newProductGrain, 10) : undefined,
      roundCount: newProductPack ? parseInt(newProductPack, 10) : undefined,
      upcNorm: inputNormalized?.upcNorm,
    });

    if (result.success) {
      setSuccess('Successfully created and linked product');
      setTimeout(() => router.push('/review-queue'), 1500);
    } else {
      setError(result.error ?? 'Failed to create product');
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!skipReason.trim()) {
      setError('Please provide a reason for skipping');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    const result = await skipReview(sourceProductId, skipReason);

    if (result.success) {
      setSuccess('Item skipped');
      setTimeout(() => router.push('/review-queue'), 1500);
    } else {
      setError(result.error ?? 'Failed to skip item');
      setIsSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="bg-green-50 border border-green-200 rounded-lg p-6 text-center">
        <CheckCircle className="mx-auto h-8 w-8 text-green-500" />
        <p className="mt-2 text-sm text-green-700">{success}</p>
        <p className="mt-1 text-xs text-green-600">Redirecting...</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Quick Link to Candidate */}
      {candidates.length > 0 && (
        <div className="bg-white shadow rounded-lg p-4">
          <h3 className="text-sm font-medium text-gray-900 mb-3">
            Quick Link to Top Candidate
          </h3>
          <button
            onClick={() => handleLinkToCandidate(candidates[0])}
            disabled={isSubmitting}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-purple-600 text-white rounded-md hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <LinkIcon className="h-4 w-4" />
            )}
            Link to {candidates[0].canonicalKey?.slice(0, 20) ?? candidates[0].productId.slice(0, 8)}
            <span className="text-purple-200">({(candidates[0].score * 100).toFixed(0)}%)</span>
          </button>
        </div>
      )}

      {/* Link to Existing Product */}
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          Link to Existing Product
        </h3>
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search products..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>

          <div className="max-h-48 overflow-y-auto space-y-1">
            {filteredProducts.length === 0 ? (
              <p className="text-sm text-gray-500 py-2 text-center">
                No matching products found
              </p>
            ) : (
              filteredProducts.map((product) => (
                <button
                  key={product.id}
                  onClick={() => handleLinkToExisting(product.id)}
                  disabled={isSubmitting}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <div className="text-sm font-medium text-gray-900 truncate">
                    {product.name}
                  </div>
                  <div className="text-xs text-gray-500">
                    {product.brandNorm} · {product.caliberNorm}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Create New Product */}
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">
          Create New Product
        </h3>

        {!showCreateForm ? (
          <button
            onClick={() => setShowCreateForm(true)}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
          >
            <Plus className="h-4 w-4" />
            Create & Link New Product
          </button>
        ) : (
          <form onSubmit={handleCreateAndLink} className="space-y-3">
            <div>
              <label className="block text-xs font-medium text-gray-700">
                Name
              </label>
              <input
                type="text"
                required
                value={newProductName}
                onChange={(e) => setNewProductName(e.target.value)}
                className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Brand
                </label>
                <input
                  type="text"
                  list="brand-suggestions"
                  value={newProductBrand}
                  onChange={(e) => setNewProductBrand(e.target.value)}
                  placeholder="Start typing..."
                  className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <datalist id="brand-suggestions">
                  {knownBrands.map((brand) => (
                    <option key={brand} value={brand} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Caliber
                </label>
                <input
                  type="text"
                  list="caliber-suggestions"
                  value={newProductCaliber}
                  onChange={(e) => setNewProductCaliber(e.target.value)}
                  placeholder="Start typing..."
                  className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
                />
                <datalist id="caliber-suggestions">
                  {knownCalibers.map((caliber) => (
                    <option key={caliber} value={caliber} />
                  ))}
                </datalist>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Grain Weight
                </label>
                <input
                  type="number"
                  value={newProductGrain}
                  onChange={(e) => setNewProductGrain(e.target.value)}
                  className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700">
                  Round Count
                </label>
                <input
                  type="number"
                  value={newProductPack}
                  onChange={(e) => setNewProductPack(e.target.value)}
                  className="mt-1 w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                Create & Link
              </button>
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Skip / Defer */}
      <div className="bg-white shadow rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Skip Review</h3>
        <div className="space-y-3">
          <textarea
            placeholder="Reason for skipping (required)..."
            value={skipReason}
            onChange={(e) => setSkipReason(e.target.value)}
            rows={2}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:border-blue-500 focus:ring-blue-500"
          />
          <button
            onClick={handleSkip}
            disabled={isSubmitting || !skipReason.trim()}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isSubmitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <SkipForward className="h-4 w-4" />
            )}
            Skip This Item
          </button>
        </div>
      </div>
    </div>
  );
}
