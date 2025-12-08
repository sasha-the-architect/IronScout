/**
 * Dealer Portal Authentication Library
 * 
 * Handles:
 * - Dealer email/password authentication
 * - Admin session detection (from main ironscout.ai)
 * - JWT token generation/verification
 * - Password hashing
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { prisma } from '@ironscout/db';
import type { Dealer, DealerStatus } from '@ironscout/db';

// =============================================
// Configuration
// =============================================

const JWT_SECRET = new TextEncoder().encode(
  process.env.DEALER_JWT_SECRET || process.env.NEXTAUTH_SECRET || 'dealer-secret-change-me'
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').filter(Boolean);

const SESSION_COOKIE = 'dealer-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

// =============================================
// Types
// =============================================

export type SessionType = 'dealer' | 'admin';

export interface DealerSession {
  type: 'dealer';
  dealerId: string;
  email: string;
  businessName: string;
  status: DealerStatus;
  tier: string;
}

export interface AdminSession {
  type: 'admin';
  email: string;
  name?: string;
}

export type Session = DealerSession | AdminSession;

// =============================================
// Password Utilities
// =============================================

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

// =============================================
// JWT Utilities
// =============================================

export async function createDealerToken(dealer: Dealer): Promise<string> {
  return new SignJWT({
    dealerId: dealer.id,
    email: dealer.email,
    businessName: dealer.businessName,
    status: dealer.status,
    tier: dealer.tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyDealerToken(token: string): Promise<DealerSession | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      type: 'dealer',
      dealerId: payload.dealerId as string,
      email: payload.email as string,
      businessName: payload.businessName as string,
      status: payload.status as DealerStatus,
      tier: payload.tier as string,
    };
  } catch {
    return null;
  }
}

// =============================================
// Session Management
// =============================================

export async function setSessionCookie(token: string): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

export async function getDealerSession(): Promise<DealerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  
  if (!token) return null;
  
  return verifyDealerToken(token);
}

/**
 * Check if current user is an admin from the main IronScout site.
 * Looks for the NextAuth session cookie and verifies the email is in ADMIN_EMAILS.
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  const cookieStore = await cookies();
  
  // Try to read NextAuth session cookie from main site
  // This works if both apps share the same domain (ironscout.ai)
  const nextAuthCookie = cookieStore.get('next-auth.session-token')?.value;
  
  if (!nextAuthCookie) return null;
  
  try {
    // Verify the NextAuth token
    const NEXTAUTH_SECRET = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
    const { payload } = await jwtVerify(nextAuthCookie, NEXTAUTH_SECRET);
    
    const email = payload.email as string;
    
    if (email && ADMIN_EMAILS.includes(email)) {
      return {
        type: 'admin',
        email,
        name: payload.name as string | undefined,
      };
    }
  } catch {
    // Invalid token or not an admin
  }
  
  return null;
}

/**
 * Get the current session - either dealer or admin
 */
export async function getSession(): Promise<Session | null> {
  // Check for dealer session first
  const dealerSession = await getDealerSession();
  if (dealerSession) {
    return dealerSession;
  }
  
  // Check for admin session
  const adminSession = await getAdminSession();
  if (adminSession) {
    return adminSession;
  }
  
  return null;
}

/**
 * Check if current session has admin privileges
 */
export async function isAdmin(): Promise<boolean> {
  const session = await getSession();
  return session?.type === 'admin';
}

/**
 * Get session with fresh dealer data from database
 */
export async function getSessionWithDealer(): Promise<{ session: Session; dealer?: Dealer } | null> {
  const session = await getSession();
  
  if (!session) return null;
  
  if (session.type === 'dealer') {
    const dealer = await prisma.dealer.findUnique({
      where: { id: session.dealerId },
    });
    
    if (!dealer) return null;
    
    return { session, dealer };
  }
  
  return { session };
}

// =============================================
// Authentication Actions
// =============================================

export interface LoginResult {
  success: boolean;
  error?: string;
  token?: string;
  dealer?: Dealer;
}

export async function authenticateDealer(
  email: string,
  password: string
): Promise<LoginResult> {
  const dealer = await prisma.dealer.findUnique({
    where: { email: email.toLowerCase() },
  });
  
  if (!dealer) {
    return { success: false, error: 'Invalid email or password' };
  }
  
  const isValid = await verifyPassword(password, dealer.passwordHash);
  
  if (!isValid) {
    return { success: false, error: 'Invalid email or password' };
  }
  
  if (!dealer.emailVerified) {
    return { success: false, error: 'Please verify your email address' };
  }
  
  if (dealer.status === 'PENDING') {
    return { success: false, error: 'Your account is pending approval' };
  }
  
  if (dealer.status === 'SUSPENDED') {
    return { success: false, error: 'Your account has been suspended' };
  }
  
  const token = await createDealerToken(dealer);
  
  return { success: true, token, dealer };
}

export interface RegisterInput {
  email: string;
  password: string;
  businessName: string;
  contactName: string;
  websiteUrl: string;
  phone?: string;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
  dealer?: Dealer;
}

export async function registerDealer(input: RegisterInput): Promise<RegisterResult> {
  const { email, password, businessName, contactName, websiteUrl, phone } = input;
  
  // Check if email already exists
  const existing = await prisma.dealer.findUnique({
    where: { email: email.toLowerCase() },
  });
  
  if (existing) {
    return { success: false, error: 'An account with this email already exists' };
  }
  
  // Hash password
  const passwordHash = await hashPassword(password);
  
  // Generate verification token
  const verifyToken = crypto.randomUUID();
  
  // Create dealer
  const dealer = await prisma.dealer.create({
    data: {
      email: email.toLowerCase(),
      passwordHash,
      businessName,
      contactName,
      websiteUrl,
      phone,
      verifyToken,
      status: 'PENDING',
      tier: 'FOUNDING',
    },
  });
  
  return { success: true, dealer };
}

// =============================================
// Admin Actions
// =============================================

export async function approveDealer(
  dealerId: string,
  adminEmail: string
): Promise<Dealer> {
  return prisma.dealer.update({
    where: { id: dealerId },
    data: {
      status: 'ACTIVE',
    },
  });
}

export async function suspendDealer(
  dealerId: string,
  adminEmail: string
): Promise<Dealer> {
  return prisma.dealer.update({
    where: { id: dealerId },
    data: {
      status: 'SUSPENDED',
    },
  });
}

// =============================================
// Audit Logging
// =============================================

export async function logAdminAction(
  adminUserId: string,
  action: string,
  {
    dealerId,
    resource,
    resourceId,
    oldValue,
    newValue,
    ipAddress,
    userAgent,
  }: {
    dealerId?: string;
    resource?: string;
    resourceId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      adminUserId,
      dealerId,
      action,
      resource,
      resourceId,
      oldValue: oldValue ? JSON.parse(JSON.stringify(oldValue)) : null,
      newValue: newValue ? JSON.parse(JSON.stringify(newValue)) : null,
      ipAddress,
      userAgent,
    },
  });
}
