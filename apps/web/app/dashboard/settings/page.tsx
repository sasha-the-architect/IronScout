import { redirect } from 'next/navigation'
import { getServerSession } from 'next-auth'
import { UserSettings } from '@/components/dashboard/user-settings'

export default async function SettingsPage() {
  const session = await getServerSession()

  if (!session) {
    redirect('/api/auth/signin')
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-4xl">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Settings</h1>
        <p className="text-muted-foreground mt-2">
          Manage your account settings and preferences
        </p>
      </div>

      <UserSettings />
    </div>
  )
}
