'use client'

import Link from 'next/link'
import { useState } from 'react'
import { useSession, signIn, signOut } from 'next-auth/react'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '@/components/ui/theme-toggle'
import { Menu, X, User, ShoppingBag, Bell, Settings, LayoutDashboard, ChevronDown } from 'lucide-react'

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false)
  const { data: session } = useSession()

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Logo */}
          <Link href="/" className="flex items-center space-x-2">
            <ShoppingBag className="h-6 w-6 text-primary" />
            <span className="text-xl font-bold">IronScout.ai</span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center space-x-6">
            <Link href="/pricing" className="text-sm font-medium hover:text-primary transition-colors">
              Pricing
            </Link>
            <Link href="/dealers" className="text-sm font-medium hover:text-primary transition-colors">
              For Dealers
            </Link>
            <ThemeToggle />
            {session ? (
              <div className="relative">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                  className="flex items-center space-x-2"
                >
                  <User className="h-4 w-4" />
                  <span>{session.user?.name?.split(' ')[0] || 'Account'}</span>
                  <ChevronDown className="h-4 w-4" />
                </Button>

                {isUserMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      onClick={() => setIsUserMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-background border z-50">
                      <div className="py-1">
                        <Link
                          href="/dashboard"
                          className="flex items-center px-4 py-2 text-sm hover:bg-accent"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <LayoutDashboard className="h-4 w-4 mr-3" />
                          Dashboard
                        </Link>
                        <Link
                          href="/dashboard/alerts"
                          className="flex items-center px-4 py-2 text-sm hover:bg-accent"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <Bell className="h-4 w-4 mr-3" />
                          My Alerts
                        </Link>
                        <Link
                          href="/dashboard/settings"
                          className="flex items-center px-4 py-2 text-sm hover:bg-accent"
                          onClick={() => setIsUserMenuOpen(false)}
                        >
                          <Settings className="h-4 w-4 mr-3" />
                          Settings
                        </Link>
                        <div className="border-t my-1"></div>
                        <button
                          onClick={() => {
                            setIsUserMenuOpen(false)
                            signOut({ callbackUrl: '/' })
                          }}
                          className="flex items-center w-full px-4 py-2 text-sm hover:bg-accent text-left"
                        >
                          <User className="h-4 w-4 mr-3" />
                          Sign Out
                        </button>
                      </div>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <Button onClick={() => signIn()} size="sm">
                Sign In
              </Button>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <Button
            variant="ghost"
            size="sm"
            className="md:hidden"
            onClick={() => setIsMenuOpen(!isMenuOpen)}
          >
            {isMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
        </div>

        {/* Mobile Navigation */}
        {isMenuOpen && (
          <div className="md:hidden border-t py-4">
            <nav className="flex flex-col space-y-4">
              <Link
                href="/pricing"
                className="text-sm font-medium hover:text-primary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                Pricing
              </Link>
              <Link
                href="/dealers"
                className="text-sm font-medium hover:text-primary transition-colors"
                onClick={() => setIsMenuOpen(false)}
              >
                For Dealers
              </Link>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-medium">Theme:</span>
                <ThemeToggle />
              </div>
              {session ? (
                <>
                  <Link
                    href="/dashboard"
                    className="flex items-center text-sm font-medium hover:text-primary transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <LayoutDashboard className="h-4 w-4 mr-2" />
                    Dashboard
                  </Link>
                  <Link
                    href="/dashboard/alerts"
                    className="flex items-center text-sm font-medium hover:text-primary transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Bell className="h-4 w-4 mr-2" />
                    My Alerts
                  </Link>
                  <Link
                    href="/dashboard/settings"
                    className="flex items-center text-sm font-medium hover:text-primary transition-colors"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    <Settings className="h-4 w-4 mr-2" />
                    Settings
                  </Link>
                  <div className="border-t my-2"></div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      signOut({ callbackUrl: '/' })
                      setIsMenuOpen(false)
                    }}
                    className="justify-start"
                  >
                    <User className="h-4 w-4 mr-2" />
                    Sign Out
                  </Button>
                </>
              ) : (
                <Button
                  onClick={() => {
                    signIn()
                    setIsMenuOpen(false)
                  }}
                  size="sm"
                  className="w-fit"
                >
                  Sign In
                </Button>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  )
}
