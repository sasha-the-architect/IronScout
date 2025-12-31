/**
 * Dealer Portal Authentication Library
 * 
 * Handles:
 * - Dealer user email/password authentication
 * - Admin session detection (from main ironscout.ai)
 * - JWT token generation/verification
 * - Password hashing
 * - Team member management
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { prisma } from '@ironscout/db';
import type { Dealer, DealerUser, DealerStatus, DealerUserRole } from '@ironscout/db';
import { logger } from './logger';

// =============================================
// Configuration
// =============================================

// JWT secret for dealer portal tokens
// CRITICAL: At least one of these must be set in production
const jwtSecretString = process.env.DEALER_JWT_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!jwtSecretString && process.env.NODE_ENV === 'production') {
  throw new Error('CRITICAL: No JWT secret configured. Set DEALER_JWT_SECRET, JWT_SECRET, or NEXTAUTH_SECRET in production.');
}
const JWT_SECRET = new TextEncoder().encode(
  jwtSecretString || 'dev-only-dealer-secret-not-for-production'
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

const SESSION_COOKIE = 'dealer-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

async function decodeAdminToken(token: string, secret: string) {
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
      algorithms: ['HS256'],
    });
    return payload;
  } catch (error) {
    logger.warn('Admin token verification failed', {}, error);
    return null;
  }
}

// =============================================
// Types
// =============================================

export type SessionType = 'dealer' | 'admin';

export interface DealerSession {
  type: 'dealer';
  dealerUserId: string;
  dealerId: string;
  email: string;
  name: string;
  role: DealerUserRole;
  businessName: string;
  status: DealerStatus;
  tier: string;
  // Impersonation metadata (optional)
  isImpersonating?: boolean;
  impersonatedBy?: string;
  impersonatedAt?: string;
}

export interface AdminSession {
  type: 'admin';
  userId: string;
  email: string;
  name?: string;
}

export type Session = DealerSession | AdminSession;

export type DealerUserWithDealer = DealerUser & { dealer: Dealer };

// =============================================
// Password Utilities
// =============================================

export async function hashPassword(password: string): Promise<string> {
  logger.debug('Hashing password');
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  logger.debug('Verifying password');
  return bcrypt.compare(password, hash);
}

// =============================================
// JWT Utilities
// =============================================

export async function createDealerToken(dealerUser: DealerUserWithDealer): Promise<string> {
  logger.debug('Creating dealer JWT token', { 
    dealerUserId: dealerUser.id, 
    dealerId: dealerUser.dealerId,
    email: dealerUser.email 
  });
  return new SignJWT({
    dealerUserId: dealerUser.id,
    dealerId: dealerUser.dealerId,
    email: dealerUser.email,
    name: dealerUser.name,
    role: dealerUser.role,
    businessName: dealerUser.dealer.businessName,
    status: dealerUser.dealer.status,
    tier: dealerUser.dealer.tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyDealerToken(token: string): Promise<DealerSession | null> {
  try {
    logger.debug('Verifying dealer JWT token');
    const { payload } = await jwtVerify(token, JWT_SECRET);
    logger.debug('Token verified successfully', { dealerUserId: payload.dealerUserId });
    
    const session: DealerSession = {
      type: 'dealer',
      dealerUserId: payload.dealerUserId as string,
      dealerId: payload.dealerId as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as DealerUserRole,
      businessName: payload.businessName as string,
      status: payload.status as DealerStatus,
      tier: payload.tier as string,
    };
    
    // Include impersonation metadata if present
    if (payload.isImpersonating) {
      session.isImpersonating = true;
      session.impersonatedBy = payload.impersonatedBy as string;
      session.impersonatedAt = payload.impersonatedAt as string;
      logger.info('Impersonation session detected', { 
        impersonatedBy: session.impersonatedBy,
        dealerId: session.dealerId 
      });
    }
    
    return session;
  } catch (error) {
    logger.warn('Token verification failed', {}, error);
    return null;
  }
}

// =============================================
// Session Management
// =============================================

export async function setSessionCookie(token: string): Promise<void> {
  logger.debug('Setting session cookie');
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
  logger.debug('Session cookie set successfully');
}

export async function clearSessionCookie(): Promise<void> {
  logger.debug('Clearing session cookie');
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
  logger.info('Session cookie cleared');
}

export async function getDealerSession(): Promise<DealerSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  
  if (!token) {
    logger.debug('No dealer session cookie found');
    return null;
  }
  
  return verifyDealerToken(token);
}

/**
 * Admin session from shared NextAuth cookie (main web app)
 */
export async function getAdminSession(): Promise<AdminSession | null> {
  try {
    const cookieStore = await cookies();
    const headerStore = await headers();

    let token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

    // Fallback: parse raw cookie header if cookieStore misses it
    if (!token) {
      const rawCookieHeader = headerStore.get('cookie');
      const match = rawCookieHeader?.match(new RegExp(`${SESSION_COOKIE_NAME}=([^;]+)`));
      token = match?.[1];
    }

    if (!token) {
      logger.debug('No admin session cookie found', { cookieName: SESSION_COOKIE_NAME });
      return null;
    }

    const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
    if (!secret) {
      logger.warn('Admin session unavailable - missing NEXTAUTH_SECRET/AUTH_SECRET');
      return null;
    }

    const payload = await decodeAdminToken(token, secret);

    if (!payload) {
      logger.warn('Admin session decode returned null');
      return null;
    }

    const email = (payload.email as string | undefined)?.toLowerCase();
    const userId = payload.sub as string | undefined;
    const name = payload.name as string | undefined;

    if (!email || !userId) {
      logger.warn('Admin token missing email or sub');
      return null;
    }

    if (!ADMIN_EMAILS.includes(email)) {
      logger.warn('Admin email not authorized', { email });
      return null;
    }

    return {
      type: 'admin',
      userId,
      email,
      name,
    };
  } catch (error) {
    logger.error('Error verifying admin session', {}, error);
    return null;
  }
}

/**
 * Convenience wrapper used throughout the dealer app.
 * Returns dealer session (real or impersonated) or admin session if present.
 */
export async function getSession(): Promise<Session | null> {
  const dealerSession = await getDealerSession();
  if (dealerSession) {
    return dealerSession;
  }

  return getAdminSession();
}

/**
 * Check if current dealer user can manage team (OWNER or ADMIN role)
 */
export function canManageTeam(session: DealerSession): boolean {
  return session.role === 'OWNER' || session.role === 'ADMIN';
}

/**
 * Check if current dealer user can edit settings (OWNER, ADMIN, or MEMBER role)
 */
export function canEditSettings(session: DealerSession): boolean {
  return session.role !== 'VIEWER';
}

/**
 * Get session with fresh dealer data from database
 */
export async function getSessionWithDealer(): Promise<{ 
  session: Session; 
  dealer?: Dealer;
  dealerUser?: DealerUser;
} | null> {
  const session = await getSession();
  
  if (!session) return null;
  
  if (session.type === 'dealer') {
    logger.debug('Fetching fresh dealer data', { dealerUserId: session.dealerUserId });
    const dealerUser = await prisma.dealerUser.findUnique({
      where: { id: session.dealerUserId },
      include: { dealer: true },
    });
    
    if (!dealerUser) {
      logger.warn('Dealer user not found for session', { dealerUserId: session.dealerUserId });
      return null;
    }
    
    return { session, dealer: dealerUser.dealer, dealerUser };
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
  dealerUser?: DealerUser;
}

export async function authenticateDealer(
  email: string,
  password: string
): Promise<LoginResult> {
  const authLogger = logger.child({ action: 'login', email: email.toLowerCase() });
  
  authLogger.info('Login attempt started');
  
  try {
    // Find dealer user by email (with dealer info)
    const dealerUser = await prisma.dealerUser.findFirst({
      where: { email: email.toLowerCase() },
      include: { dealer: true },
    });
    
    if (!dealerUser) {
      authLogger.warn('Login failed - user not found');
      return { success: false, error: 'Invalid email or password' };
    }
    
    authLogger.debug('Dealer user found, verifying password', { 
      dealerUserId: dealerUser.id,
      dealerId: dealerUser.dealerId 
    });
    
    const isValid = await verifyPassword(password, dealerUser.passwordHash);
    
    if (!isValid) {
      authLogger.warn('Login failed - invalid password', { dealerUserId: dealerUser.id });
      return { success: false, error: 'Invalid email or password' };
    }
    
    if (!dealerUser.emailVerified) {
      authLogger.warn('Login failed - email not verified', { dealerUserId: dealerUser.id });
      return { success: false, error: 'Please verify your email address' };
    }
    
    const dealer = dealerUser.dealer;
    
    if (dealer.status === 'PENDING') {
      authLogger.warn('Login failed - account pending', { dealerId: dealer.id });
      return { success: false, error: 'Your account is pending approval' };
    }
    
    if (dealer.status === 'SUSPENDED') {
      authLogger.warn('Login failed - account suspended', { dealerId: dealer.id });
      return { success: false, error: 'Your account has been suspended' };
    }
    
    // Update last login timestamp
    await prisma.dealerUser.update({
      where: { id: dealerUser.id },
      data: { lastLoginAt: new Date() },
    });
    
    const token = await createDealerToken(dealerUser as DealerUserWithDealer);
    
    authLogger.info('Login successful', { 
      dealerUserId: dealerUser.id,
      dealerId: dealer.id, 
      status: dealer.status,
      role: dealerUser.role
    });
    
    return { success: true, token, dealer, dealerUser };
  } catch (error) {
    authLogger.error('Login failed - unexpected error', {}, error);
    throw error;
  }
}

export interface RegisterInput {
  email: string;
  password: string;
  businessName: string;
  contactFirstName: string;
  contactLastName: string;
  websiteUrl: string;
  phone?: string;
}

export interface RegisterResult {
  success: boolean;
  error?: string;
  dealer?: Dealer;
  dealerUser?: DealerUser;
}

export async function registerDealer(input: RegisterInput): Promise<RegisterResult> {
  const { email, password, businessName, contactFirstName, contactLastName, websiteUrl, phone } = input;
  
  const regLogger = logger.child({ 
    action: 'register', 
    email: email.toLowerCase(),
    businessName 
  });
  
  regLogger.info('Registration attempt started');
  
  try {
    // Check if email already exists
    regLogger.debug('Checking for existing account');
    const existing = await prisma.dealerUser.findFirst({
      where: { email: email.toLowerCase() },
    });
    
    if (existing) {
      regLogger.warn('Registration failed - email already exists');
      return { success: false, error: 'An account with this email already exists' };
    }
    
    // Hash password
    regLogger.debug('Hashing password');
    const passwordHash = await hashPassword(password);
    
    // Generate verification token
    const verifyToken = crypto.randomUUID();
    regLogger.debug('Generated verification token');
    
    // Full name for user display
    const fullName = `${contactFirstName} ${contactLastName}`.trim();
    
    // Create dealer, owner user, and initial contact in a transaction
    regLogger.debug('Creating dealer, owner user, and contact in database');
    const result = await prisma.$transaction(async (tx) => {
      // Create the dealer (business account)
      const dealer = await tx.dealer.create({
        data: {
          businessName,
          contactFirstName,
          contactLastName,
          websiteUrl,
          phone,
          status: 'PENDING',
          tier: 'FOUNDING',
        },
      });
      
      // Create the owner user
      const dealerUser = await tx.dealerUser.create({
        data: {
          dealerId: dealer.id,
          email: email.toLowerCase(),
          passwordHash,
          name: fullName,
          role: 'OWNER',
          verifyToken,
          emailVerified: false,
        },
      });
      
      // Create the initial primary contact
      await tx.dealerContact.create({
        data: {
          dealerId: dealer.id,
          firstName: contactFirstName,
          lastName: contactLastName,
          email: email.toLowerCase(),
          phone,
          roles: ['PRIMARY'],
          isAccountOwner: true,
          marketingOptIn: false,
          communicationOptIn: true,
        },
      });
      
      return { dealer, dealerUser };
    });
    
    regLogger.info('Registration successful', { 
      dealerId: result.dealer.id,
      dealerUserId: result.dealerUser.id,
      status: result.dealer.status,
      tier: result.dealer.tier 
    });
    
    return { success: true, dealer: result.dealer, dealerUser: result.dealerUser };
  } catch (error) {
    regLogger.error('Registration failed - database error', { 
      websiteUrl,
      contactFirstName,
      contactLastName 
    }, error);
    throw error;
  }
}

// =============================================
// Team Management
// =============================================

export interface InviteResult {
  success: boolean;
  error?: string;
  inviteToken?: string;
}

export async function inviteTeamMember(
  dealerId: string,
  invitedById: string,
  email: string,
  role: DealerUserRole = 'MEMBER'
): Promise<InviteResult> {
  const inviteLogger = logger.child({ 
    action: 'invite', 
    dealerId,
    email: email.toLowerCase(),
    role
  });
  
  inviteLogger.info('Invite attempt started');
  
  try {
    // Check if user already exists for this dealer
    const existingUser = await prisma.dealerUser.findFirst({
      where: { 
        dealerId,
        email: email.toLowerCase(),
      },
    });
    
    if (existingUser) {
      inviteLogger.warn('Invite failed - user already exists');
      return { success: false, error: 'This user is already a team member' };
    }
    
    // Check for existing pending invite
    const existingInvite = await prisma.dealerInvite.findFirst({
      where: {
        dealerId,
        email: email.toLowerCase(),
        acceptedAt: null,
        expiresAt: { gt: new Date() },
      },
    });
    
    if (existingInvite) {
      inviteLogger.warn('Invite failed - pending invite exists');
      return { success: false, error: 'An invite has already been sent to this email' };
    }
    
    // Cannot invite as OWNER
    if (role === 'OWNER') {
      inviteLogger.warn('Invite failed - cannot invite as owner');
      return { success: false, error: 'Cannot invite someone as owner' };
    }
    
    // Generate invite token
    const inviteToken = crypto.randomUUID();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 day expiry
    
    // Create invite
    await prisma.dealerInvite.create({
      data: {
        dealerId,
        email: email.toLowerCase(),
        role,
        inviteToken,
        invitedById,
        expiresAt,
      },
    });
    
    inviteLogger.info('Invite created successfully', { inviteToken });
    
    // TODO: Send invite email
    
    return { success: true, inviteToken };
  } catch (error) {
    inviteLogger.error('Invite failed - unexpected error', {}, error);
    throw error;
  }
}

export interface AcceptInviteResult {
  success: boolean;
  error?: string;
  dealerUser?: DealerUser;
}

export async function acceptInvite(
  inviteToken: string,
  password: string,
  name: string
): Promise<AcceptInviteResult> {
  const acceptLogger = logger.child({ action: 'accept-invite' });
  
  acceptLogger.info('Accept invite attempt started');
  
  try {
    // Find the invite
    const invite = await prisma.dealerInvite.findUnique({
      where: { inviteToken },
      include: { dealer: true },
    });
    
    if (!invite) {
      acceptLogger.warn('Accept failed - invite not found');
      return { success: false, error: 'Invalid invite link' };
    }
    
    if (invite.acceptedAt) {
      acceptLogger.warn('Accept failed - invite already used');
      return { success: false, error: 'This invite has already been used' };
    }
    
    if (invite.expiresAt < new Date()) {
      acceptLogger.warn('Accept failed - invite expired');
      return { success: false, error: 'This invite has expired' };
    }
    
    // Hash password
    const passwordHash = await hashPassword(password);
    
    // Create user and mark invite as accepted in transaction
    const result = await prisma.$transaction(async (tx) => {
      const dealerUser = await tx.dealerUser.create({
        data: {
          dealerId: invite.dealerId,
          email: invite.email,
          passwordHash,
          name,
          role: invite.role,
          emailVerified: true, // Already verified via invite email
        },
      });
      
      await tx.dealerInvite.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });
      
      return dealerUser;
    });
    
    acceptLogger.info('Invite accepted successfully', { 
      dealerUserId: result.id,
      dealerId: invite.dealerId
    });
    
    return { success: true, dealerUser: result };
  } catch (error) {
    acceptLogger.error('Accept invite failed - unexpected error', {}, error);
    throw error;
  }
}

// =============================================
// Admin Actions
// =============================================

export async function approveDealer(
  dealerId: string,
  adminEmail: string
): Promise<Dealer> {
  logger.info('Approving dealer', { dealerId, adminEmail });
  
  try {
    const dealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        status: 'ACTIVE',
      },
    });
    
    logger.info('Dealer approved successfully', { 
      dealerId, 
      adminEmail, 
      businessName: dealer.businessName 
    });
    
    return dealer;
  } catch (error) {
    logger.error('Failed to approve dealer', { dealerId, adminEmail }, error);
    throw error;
  }
}

export async function suspendDealer(
  dealerId: string,
  adminEmail: string
): Promise<Dealer> {
  logger.info('Suspending dealer', { dealerId, adminEmail });
  
  try {
    const dealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        status: 'SUSPENDED',
      },
    });
    
    logger.info('Dealer suspended successfully', { 
      dealerId, 
      adminEmail, 
      businessName: dealer.businessName 
    });
    
    return dealer;
  } catch (error) {
    logger.error('Failed to suspend dealer', { dealerId, adminEmail }, error);
    throw error;
  }
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
  logger.debug('Creating admin audit log', { adminUserId, action, dealerId, resource });
  
  try {
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
    
    logger.info('Admin audit log created', { adminUserId, action });
  } catch (error) {
    logger.error('Failed to create admin audit log', { adminUserId, action }, error);
    throw error;
  }
}
