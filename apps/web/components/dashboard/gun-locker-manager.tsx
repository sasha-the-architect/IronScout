'use client'

import { useState, useEffect } from 'react'
import { useSession } from 'next-auth/react'
import { Plus, Trash2, Crosshair } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import {
  CALIBERS,
  CaliberValue,
  Gun,
  getGunLocker,
  addGun,
  removeGun,
} from '@/lib/api'

export function GunLockerManager() {
  const { data: session } = useSession()
  const [guns, setGuns] = useState<Gun[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [newGun, setNewGun] = useState<{ caliber: CaliberValue | ''; nickname: string }>({
    caliber: '',
    nickname: '',
  })

  // Extract token from session
  const token = (session as any)?.accessToken as string | undefined

  // Fetch guns on mount
  useEffect(() => {
    if (token) {
      fetchGuns()
    }
  }, [token])

  const fetchGuns = async () => {
    if (!token) return

    try {
      const data = await getGunLocker(token)
      setGuns(data.guns || [])
    } catch (error) {
      console.error('Failed to fetch guns:', error)
      toast.error('Failed to load your guns')
    } finally {
      setIsLoading(false)
    }
  }

  const handleAddGun = async () => {
    if (!newGun.caliber) {
      toast.error('Please select a caliber')
      return
    }

    if (!token) {
      toast.error('Please sign in to add guns')
      return
    }

    setIsSubmitting(true)
    try {
      const data = await addGun(
        token,
        newGun.caliber as CaliberValue,
        newGun.nickname || null
      )
      setGuns((prev) => [...prev, data.gun])
      setNewGun({ caliber: '', nickname: '' })
      setIsAddDialogOpen(false)
      toast.success('Gun added to your locker')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add gun')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleDeleteGun = async (gunId: string) => {
    if (!token) return

    // Optimistic update
    const previousGuns = guns
    setGuns((prev) => prev.filter((g) => g.id !== gunId))

    try {
      await removeGun(token, gunId)
      toast.success('Gun removed from your locker')
    } catch (error) {
      // Revert on failure
      setGuns(previousGuns)
      toast.error('Failed to remove gun')
    }
  }

  const getCaliberLabel = (value: string) => {
    return CALIBERS.find((c) => c.value === value)?.label || value
  }

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
        <div className="h-24 bg-muted animate-pulse rounded-lg" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Add Gun Button */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogTrigger asChild>
          <Button>
            <Plus className="h-4 w-4 mr-2" />
            Add Gun
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add a Gun</DialogTitle>
            <DialogDescription>
              Tell us what calibers you use to personalize your deals.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="caliber">Caliber *</Label>
              <Select
                value={newGun.caliber}
                onValueChange={(value: CaliberValue) =>
                  setNewGun((prev) => ({ ...prev, caliber: value }))
                }
              >
                <SelectTrigger id="caliber">
                  <SelectValue placeholder="Select caliber" />
                </SelectTrigger>
                <SelectContent>
                  {CALIBERS.map((caliber) => (
                    <SelectItem key={caliber.value} value={caliber.value}>
                      {caliber.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="nickname">Nickname (optional)</Label>
              <Input
                id="nickname"
                placeholder="e.g., EDC, Range toy, Home defense"
                value={newGun.nickname}
                onChange={(e) =>
                  setNewGun((prev) => ({ ...prev, nickname: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsAddDialogOpen(false)}
              disabled={isSubmitting}
            >
              Cancel
            </Button>
            <Button onClick={handleAddGun} disabled={isSubmitting || !newGun.caliber}>
              {isSubmitting ? 'Adding...' : 'Add Gun'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Gun List */}
      {guns.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12 text-center">
            <Crosshair className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-2">No guns added yet</h3>
            <p className="text-sm text-muted-foreground max-w-sm mb-4">
              Add the guns you shoot to see relevant deals first. Your data stays private
              and you can remove guns at any time.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Your First Gun
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {guns.map((gun) => (
            <Card key={gun.id} className="group relative">
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
                      <Crosshair className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium">{getCaliberLabel(gun.caliber)}</p>
                      {gun.nickname && (
                        <p className="text-sm text-muted-foreground">{gun.nickname}</p>
                      )}
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteGun(gun.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove gun</span>
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Privacy Note */}
      <p className="text-xs text-muted-foreground">
        Your Gun Locker is private. This information is only used to personalize deal
        ordering and is never shared. You can remove guns at any time.
      </p>
    </div>
  )
}
