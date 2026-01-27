import { Metadata } from 'next'
import { UserSettings } from '@/components/dashboard/user-settings'

export const metadata: Metadata = {
  title: 'Settings',
}

export default function SettingsPage() {
  return (
    <div className="p-6 lg:p-8 max-w-4xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-1">
          Manage your account settings and preferences
        </p>
      </div>

      <UserSettings />
    </div>
  )
}
