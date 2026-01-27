'use client'

import { useState, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { User, Mail, Bell, LogOut, Trash2, Shield, AlertTriangle, Clock, XCircle, Loader2 } from 'lucide-react'
import Image from 'next/image'
import { createLogger } from '@/lib/logger'
import {
  checkDeletionEligibility,
  requestAccountDeletion,
  cancelAccountDeletion,
  type DeletionEligibility,
} from '@/lib/api'

const logger = createLogger('user-settings')

export function UserSettings() {
  const { data: session } = useSession()
  const searchParams = useSearchParams()
  const router = useRouter()
  const [emailNotifications, setEmailNotifications] = useState(true)
  const [priceDropAlerts, setPriceDropAlerts] = useState(true)
  const [backInStockAlerts, setBackInStockAlerts] = useState(true)
  const [weeklyDigest, setWeeklyDigest] = useState(false)

  // Deletion state
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState('')
  const [deletionEligibility, setDeletionEligibility] = useState<DeletionEligibility | null>(null)
  const [loadingEligibility, setLoadingEligibility] = useState(false)
  const [deletionLoading, setDeletionLoading] = useState(false)
  const [deletionError, setDeletionError] = useState<string | null>(null)

  const handleSignOut = async () => {
    await signOut({ callbackUrl: '/' })
  }

  // Check if user came back to cancel deletion
  useEffect(() => {
    if (searchParams.get('cancel-deletion') === 'true') {
      handleCancelDeletion()
      // Remove the query param
      router.replace('/dashboard/settings')
    }
  }, [searchParams])

  // Fetch deletion eligibility when dialog opens
  useEffect(() => {
    if (showDeleteDialog && !deletionEligibility) {
      fetchDeletionEligibility()
    }
  }, [showDeleteDialog])

  const fetchDeletionEligibility = async () => {
    const token = session?.accessToken
    if (!token) {
      logger.error('No access token available')
      return
    }

    setLoadingEligibility(true)
    try {
      const data = await checkDeletionEligibility(token)
      setDeletionEligibility(data)
    } catch (error) {
      logger.error('Failed to check deletion eligibility', {}, error)
    } finally {
      setLoadingEligibility(false)
    }
  }

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE MY ACCOUNT') {
      setDeletionError('Please type "DELETE MY ACCOUNT" exactly to confirm')
      return
    }

    const token = session?.accessToken
    if (!token) {
      setDeletionError('Please sign in again to continue')
      return
    }

    setDeletionLoading(true)
    setDeletionError(null)

    try {
      await requestAccountDeletion(token, deleteConfirmation)
      // Sign out after successful deletion request
      await signOut({ callbackUrl: '/?deleted=pending' })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'An error occurred. Please try again.'
      setDeletionError(message)
    } finally {
      setDeletionLoading(false)
    }
  }

  const handleCancelDeletion = async () => {
    const token = session?.accessToken
    if (!token) {
      logger.error('No access token available')
      return
    }

    setDeletionLoading(true)
    try {
      await cancelAccountDeletion(token)
      // Refresh eligibility state
      setDeletionEligibility(null)
      fetchDeletionEligibility()
    } catch (error) {
      logger.error('Failed to cancel deletion', {}, error)
    } finally {
      setDeletionLoading(false)
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
              onClick={() => setShowDeleteDialog(true)}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Account
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Delete Account Dialog */}
      {showDeleteDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background border rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-full bg-destructive/10">
                  <AlertTriangle className="h-6 w-6 text-destructive" />
                </div>
                <h2 className="text-xl font-semibold">Delete Account</h2>
              </div>

              {loadingEligibility ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : deletionEligibility?.pendingDeletion ? (
                /* Pending deletion - show cancel option */
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
                    <div className="flex items-start gap-3">
                      <Clock className="h-5 w-5 text-amber-600 mt-0.5" />
                      <div>
                        <p className="font-medium text-amber-800 dark:text-amber-200">
                          Deletion Scheduled
                        </p>
                        <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                          Your account is scheduled for permanent deletion on{' '}
                          <strong>
                            {new Date(deletionEligibility.pendingDeletion.scheduledFor).toLocaleDateString('en-US', {
                              weekday: 'long',
                              year: 'numeric',
                              month: 'long',
                              day: 'numeric'
                            })}
                          </strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <p className="text-sm text-muted-foreground">
                    You can cancel this deletion request if you change your mind. After the scheduled date, your data will be permanently removed.
                  </p>

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowDeleteDialog(false)}
                    >
                      Close
                    </Button>
                    <Button
                      variant="default"
                      className="flex-1"
                      onClick={handleCancelDeletion}
                      disabled={deletionLoading}
                    >
                      {deletionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <XCircle className="h-4 w-4 mr-2" />
                      )}
                      Cancel Deletion
                    </Button>
                  </div>
                </div>
              ) : !deletionEligibility?.eligible ? (
                /* Not eligible - show blockers */
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Your account cannot be deleted at this time. Please resolve the following:
                  </p>

                  <div className="space-y-3">
                    {deletionEligibility?.blockers.map((blocker, i) => (
                      <div key={i} className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                        <p className="font-medium text-destructive">{blocker.message}</p>
                        {blocker.resolution && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {blocker.resolution}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>

                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => setShowDeleteDialog(false)}
                  >
                    Close
                  </Button>
                </div>
              ) : (
                /* Eligible - show confirmation form */
                <div className="space-y-4">
                  <div className="p-4 rounded-lg bg-destructive/5 border border-destructive/20">
                    <p className="text-sm">
                      <strong>This action cannot be easily undone.</strong> After a 14-day cooling-off period, all your data will be permanently deleted, including:
                    </p>
                    <ul className="text-sm mt-2 space-y-1 list-disc list-inside text-muted-foreground">
                      <li>Saved items and watchlists</li>
                      <li>Price alerts and notification preferences</li>
                      <li>Search history and preferences</li>
                      <li>Account settings and profile information</li>
                    </ul>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">
                      Type <span className="font-mono bg-muted px-1 py-0.5 rounded">DELETE MY ACCOUNT</span> to confirm:
                    </label>
                    <Input
                      value={deleteConfirmation}
                      onChange={(e) => {
                        setDeleteConfirmation(e.target.value)
                        setDeletionError(null)
                      }}
                      placeholder="DELETE MY ACCOUNT"
                      className="font-mono"
                    />
                  </div>

                  {deletionError && (
                    <p className="text-sm text-destructive">{deletionError}</p>
                  )}

                  <div className="flex gap-3 pt-2">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => {
                        setShowDeleteDialog(false)
                        setDeleteConfirmation('')
                        setDeletionError(null)
                      }}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      className="flex-1"
                      onClick={handleDeleteAccount}
                      disabled={deletionLoading || deleteConfirmation !== 'DELETE MY ACCOUNT'}
                    >
                      {deletionLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Delete Account
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
