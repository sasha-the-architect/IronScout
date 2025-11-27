'use client'

import { useState } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { User, Mail, Bell, Crown, LogOut, Trash2, Shield } from 'lucide-react'
import Image from 'next/image'

export function UserSettings() {
  const { data: session } = useSession()
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [priceDropAlerts, setPriceDropAlerts] = useState(true)
  const [backInStockAlerts, setBackInStockAlerts] = useState(true)
  const [weeklyDigest, setWeeklyDigest] = useState(false)

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  const handleDeleteAccount = () => {
    if (confirm('Are you sure you want to delete your account? This action cannot be undone.')) {
      // TODO: Implement account deletion
      alert('Account deletion will be implemented soon')
    }
  }

  if (!session?.user) {
    return null
  }

  return (
    <div className="space-y-6">
      {/* Profile Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Profile Information
          </CardTitle>
          <CardDescription>
            Your account details from Google
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            {session.user.image && (
              <div className="relative w-16 h-16 rounded-full overflow-hidden">
                <Image
                  src={session.user.image}
                  alt={session.user.name || 'User'}
                  fill
                  className="object-cover"
                />
              </div>
            )}
            <div className="flex-1">
              <div className="font-medium">{session.user.name || 'User'}</div>
              <div className="text-sm text-muted-foreground">{session.user.email}</div>
            </div>
          </div>

          <div className="pt-4 border-t">
            <div className="flex items-center justify-between">
              <div>
                <div className="font-medium">Account Tier</div>
                <div className="text-sm text-muted-foreground">
                  Manage your subscription level
                </div>
              </div>
              <Badge variant="outline" className="text-base px-4 py-1">
                Free
              </Badge>
            </div>
            <Button variant="outline" className="mt-4 w-full" asChild>
              <a href="/pricing">
                <Crown className="h-4 w-4 mr-2" />
                Upgrade to Premium
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Notification Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notification Preferences
          </CardTitle>
          <CardDescription>
            Choose how you want to receive alerts
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="font-medium">Email Notifications</div>
              <div className="text-sm text-muted-foreground">
                Receive email alerts for price changes
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                checked={emailNotifications}
                onChange={(e) => setEmailNotifications(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="pt-4 border-t space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Price Drop Alerts</div>
                <div className="text-sm text-muted-foreground">
                  Get notified when prices drop below your target
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={priceDropAlerts}
                  onChange={(e) => setPriceDropAlerts(e.target.checked)}
                  disabled={!emailNotifications}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Back in Stock Alerts</div>
                <div className="text-sm text-muted-foreground">
                  Get notified when out-of-stock items return
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={backInStockAlerts}
                  onChange={(e) => setBackInStockAlerts(e.target.checked)}
                  disabled={!emailNotifications}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <div className="font-medium">Weekly Digest</div>
                <div className="text-sm text-muted-foreground">
                  Get a weekly summary of all your alerts
                </div>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={weeklyDigest}
                  onChange={(e) => setWeeklyDigest(e.target.checked)}
                  disabled={!emailNotifications}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary peer-disabled:opacity-50 peer-disabled:cursor-not-allowed"></div>
              </label>
            </div>
          </div>

          <div className="pt-4 border-t">
            <Button className="w-full">Save Preferences</Button>
          </div>
        </CardContent>
      </Card>

      {/* Privacy & Security */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Privacy & Security
          </CardTitle>
          <CardDescription>
            Manage your account security and data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="font-medium">Data Export</div>
            <div className="text-sm text-muted-foreground mb-2">
              Download a copy of your data
            </div>
            <Button variant="outline" className="w-full">
              Export My Data
            </Button>
          </div>

          <div className="pt-4 border-t space-y-2">
            <div className="font-medium">Connected Accounts</div>
            <div className="text-sm text-muted-foreground mb-2">
              Manage your connected authentication providers
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-gray-100 rounded flex items-center justify-center">
                  <Mail className="h-4 w-4" />
                </div>
                <div>
                  <div className="font-medium text-sm">Google</div>
                  <div className="text-xs text-muted-foreground">{session.user.email}</div>
                </div>
              </div>
              <Badge variant="outline">Connected</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Account Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Account Actions</CardTitle>
          <CardDescription>
            Manage your account status
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <div className="font-medium">Sign Out</div>
            <div className="text-sm text-muted-foreground mb-2">
              Sign out of your account on this device
            </div>
            <Button
              variant="outline"
              className="w-full"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>

          <div className="pt-4 border-t space-y-2">
            <div className="font-medium text-destructive">Danger Zone</div>
            <div className="text-sm text-muted-foreground mb-2">
              Permanently delete your account and all associated data
            </div>
            <Button
              variant="outline"
              className="w-full border-destructive text-destructive hover:bg-destructive hover:text-destructive-foreground"
              onClick={handleDeleteAccount}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
