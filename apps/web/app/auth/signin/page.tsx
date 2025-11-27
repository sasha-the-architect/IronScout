"use client"

import { signIn } from 'next-auth/react'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export default function SignInPage() {
  const params = useSearchParams()
  const callbackUrl = params.get('callbackUrl') || '/'

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Sign in to ZeroedIn</CardTitle>
          <CardDescription>Continue with your Google account</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={() => signIn('google', { callbackUrl })}
            className="w-full h-11 gap-2"
            variant="outline"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-5 w-5">
              <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303C33.602 32.91 29.196 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.153 7.961 3.039l5.657-5.657C34.651 6.053 29.591 4 24 4 12.954 4 4 12.954 4 24s8.954 20 20 20 20-8.954 20-20c0-1.341-.138-2.651-.389-3.917z"/>
              <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.464 16.109 18.879 13 24 13c3.059 0 5.842 1.153 7.961 3.039l5.657-5.657C34.651 6.053 29.591 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"/>
              <path fill="#4CAF50" d="M24 44c5.138 0 9.74-1.97 13.245-5.189l-6.104-5.16C29.196 36 24.79 36 24 36c-5.176 0-9.57-3.07-11.28-7.377l-6.49 5.004C9.537 39.798 16.227 44 24 44z"/>
              <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-1.092 3.193-3.566 5.707-6.813 6.648l6.104 5.16C36.123 41.205 44 36 44 24c0-1.341-.138-2.651-.389-3.917z"/>
            </svg>
            Continue with Google
          </Button>

          <p className="mt-4 text-xs text-muted-foreground text-center">
            By continuing, you agree to our Terms and acknowledge our Privacy Policy.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}


