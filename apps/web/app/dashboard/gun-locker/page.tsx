import { GunLockerManager } from '@/components/dashboard/gun-locker-manager'

export default function GunLockerPage() {
  return (
    <div className="p-6 lg:p-8">
      {/* Page Header */}
      <div className="mb-6">
        <h1 className="text-xl md:text-2xl font-semibold">Gun Locker</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Add the guns you shoot to personalize your results
        </p>
      </div>

      <GunLockerManager />
    </div>
  )
}
