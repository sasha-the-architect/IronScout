/**
 * NextAuth API Route Handler
 * Handles all OAuth callbacks and session management
 */

import { handlers } from '@/lib/auth-config'

export const { GET, POST } = handlers
