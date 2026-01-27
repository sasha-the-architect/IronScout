import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      tier?: string | null
      isAdmin?: boolean
    } & DefaultSession['user']
    accessToken?: string
    error?: string
  }

  interface User {
    tier?: string | null
    accessToken?: string
    refreshToken?: string
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    sub: string
    email?: string
    tier?: string
    isAdmin?: boolean
    accessToken?: string
    refreshToken?: string
    accessTokenExpires?: number
    error?: string
  }
}
