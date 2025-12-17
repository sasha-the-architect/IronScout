/**
 * NextAuth TypeScript type extensions
 * Adds custom properties to NextAuth types
 */

import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name?: string | null
      image?: string | null
    }
  }

  interface User {
    id: string
    email: string
    name?: string | null
    image?: string | null
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    sub: string
    email: string
  }
}
