import { SavedItemsManager } from '@/components/dashboard/saved-items-manager'

export default function WatchlistPage() {
  return (
    <div className="p-6 lg:p-8">
      {/* Page Header - management-oriented, not awareness */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">Watchlist</h1>
      </div>

      <SavedItemsManager />
    </div>
  )
}
