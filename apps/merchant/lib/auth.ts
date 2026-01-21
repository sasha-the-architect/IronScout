/**
 * Merchant Portal Authentication Library
 *
 * Handles:
 * - Merchant user email/password authentication
 * - Admin session detection (from main ironscout.ai)
 * - JWT token generation/verification
 * - Password hashing
 * - Team member management
 */

import { SignJWT, jwtVerify } from 'jose';
import bcrypt from 'bcryptjs';
import { cookies, headers } from 'next/headers';
import { prisma } from '@ironscout/db';
import type { merchants, merchant_users, MerchantStatus, MerchantUserRole, MerchantRetailerStatus, MerchantRetailerListingStatus, MerchantRetailerRole } from '@ironscout/db';
import { logger } from './logger';

// =============================================
// Configuration
// =============================================

// JWT secret for merchant portal tokens
// CRITICAL: At least one of these must be set in production
const jwtSecretString = process.env.MERCHANT_JWT_SECRET || process.env.JWT_SECRET || process.env.NEXTAUTH_SECRET;
if (!jwtSecretString && process.env.NODE_ENV === 'production') {
  throw new Error('CRITICAL: No JWT secret configured. Set MERCHANT_JWT_SECRET, JWT_SECRET, or NEXTAUTH_SECRET in production.');
}
const JWT_SECRET = new TextEncoder().encode(
  jwtSecretString || 'dev-only-merchant-secret-not-for-production'
);

const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map(e => e.trim().toLowerCase())
  .filter(Boolean);
const SESSION_COOKIE_NAME = process.env.NODE_ENV === 'production'
  ? '__Secure-authjs.session-token'
  : 'authjs.session-token';

const SESSION_COOKIE = 'merchant-session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days

const E2E_AUTH_BYPASS = process.env.E2E_AUTH_BYPASS === 'true';
const E2E_MERCHANT_ID = process.env.E2E_MERCHANT_ID || 'e2e-merchant';
const E2E_MERCHANT_USER_ID = process.env.E2E_MERCHANT_USER_ID || 'e2e-merchant-user';
const E2E_MERCHANT_EMAIL = process.env.E2E_MERCHANT_EMAIL || 'e2e-merchant@ironscout.local';
const E2E_BUSINESS_NAME = process.env.E2E_MERCHANT_BUSINESS || 'E2E Ammo';

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

export type SessionType = 'merchant' | 'admin';

export interface MerchantSession {
  type: 'merchant';
  merchantUserId: string;
  merchantId: string;
  email: string;
  name: string;
  role: MerchantUserRole;
  businessName: string;
  status: MerchantStatus;
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

export type Session = MerchantSession | AdminSession;

// Type that includes the merchant relation
export type MerchantUserWithMerchant = merchant_users & { merchants: merchants };

// Legacy type aliases for backward compatibility
/** @deprecated Use MerchantSession instead */
export type DealerSession = MerchantSession;
/** @deprecated Use MerchantUserWithMerchant instead */
export type DealerUserWithDealer = MerchantUserWithMerchant;

function getE2eMerchantSession(): MerchantSession {
  return {
    type: 'merchant',
    merchantUserId: E2E_MERCHANT_USER_ID,
    merchantId: E2E_MERCHANT_ID,
    email: E2E_MERCHANT_EMAIL,
    name: 'E2E User',
    role: 'OWNER',
    businessName: E2E_BUSINESS_NAME,
    status: 'ACTIVE',
    tier: 'FOUNDING',
  };
}

function getE2eMerchantBundle(): {
  session: MerchantSession;
  merchant: merchants;
  merchantUser: merchant_users;
} {
  const now = new Date();

  return {
    session: getE2eMerchantSession(),
    merchant: {
      id: E2E_MERCHANT_ID,
      businessName: E2E_BUSINESS_NAME,
      websiteUrl: 'https://e2e.example',
      phone: null,
      storeType: 'ONLINE_ONLY',
      status: 'ACTIVE',
      tier: 'FOUNDING',
      pixelApiKey: 'e2e-pixel-key',
      pixelEnabled: true,
      shippingType: 'UNKNOWN',
      shippingFlat: null,
      shippingPerUnit: null,
      createdAt: now,
      updatedAt: now,
      contactFirstName: 'E2E',
      contactLastName: 'Merchant',
      lastSubscriptionNotifyAt: null,
      subscriptionExpiresAt: null,
      subscriptionGraceDays: 7,
      subscriptionStatus: 'ACTIVE',
      autoRenew: true,
      paymentMethod: null,
      stripeCustomerId: null,
      stripeSubscriptionId: null,
    },
    merchantUser: {
      id: E2E_MERCHANT_USER_ID,
      merchantId: E2E_MERCHANT_ID,
      email: E2E_MERCHANT_EMAIL,
      passwordHash: 'e2e',
      name: 'E2E User',
      role: 'OWNER',
      emailVerified: true,
      verifyToken: null,
      resetToken: null,
      resetTokenExp: null,
      lastLoginAt: now,
      createdAt: now,
      updatedAt: now,
    },
  };
}

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

export async function createMerchantToken(merchantUser: MerchantUserWithMerchant): Promise<string> {
  logger.debug('Creating merchant JWT token', {
    merchantUserId: merchantUser.id,
    merchantId: merchantUser.merchantId,
    email: merchantUser.email
  });
  return new SignJWT({
    merchantUserId: merchantUser.id,
    merchantId: merchantUser.merchantId,
    email: merchantUser.email,
    name: merchantUser.name,
    role: merchantUser.role,
    businessName: merchantUser.merchants.businessName,
    status: merchantUser.merchants.status,
    tier: merchantUser.merchants.tier,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyMerchantToken(token: string): Promise<MerchantSession | null> {
  try {
    logger.debug('Verifying merchant JWT token');
    const { payload } = await jwtVerify(token, JWT_SECRET);

    const merchantUserId = payload.merchantUserId as string;
    const merchantId = payload.merchantId as string;

    logger.debug('Token verified successfully', { merchantUserId });

    const session: MerchantSession = {
      type: 'merchant',
      merchantUserId,
      merchantId,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as MerchantUserRole,
      businessName: payload.businessName as string,
      status: payload.status as MerchantStatus,
      tier: payload.tier as string,
    };

    // Include impersonation metadata if present
    if (payload.isImpersonating) {
      session.isImpersonating = true;
      session.impersonatedBy = payload.impersonatedBy as string;
      session.impersonatedAt = payload.impersonatedAt as string;
      logger.info('Impersonation session detected', {
        impersonatedBy: session.impersonatedBy,
        merchantId: session.merchantId
      });
    }

    return session;
  } catch (error) {
    logger.warn('Token verification failed', {}, error);
    return null;
  }
}

// Legacy aliases
/** @deprecated Use createMerchantToken instead */
export const createDealerToken = createMerchantToken;
/** @deprecated Use verifyMerchantToken instead */
export const verifyDealerToken = verifyMerchantToken;

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

export async function getMerchantSession(): Promise<MerchantSession | null> {
  const cookieStore = await cookies();

  const token = cookieStore.get(SESSION_COOKIE)?.value;

  if (!token) {
    logger.debug('No merchant session cookie found');
    return null;
  }

  return verifyMerchantToken(token);
}

// Legacy alias
/** @deprecated Use getMerchantSession instead */
export const getDealerSession = getMerchantSession;

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
 * Convenience wrapper used throughout the merchant app.
 * Returns merchant session (real or impersonated) or admin session if present.
 */
export async function getSession(): Promise<Session | null> {
  if (E2E_AUTH_BYPASS) {
    return getE2eMerchantSession();
  }

  const merchantSession = await getMerchantSession();
  if (merchantSession) {
    return merchantSession;
  }

  return getAdminSession();
}

/**
 * Check if current merchant user can manage team (OWNER or ADMIN role)
 */
export function canManageTeam(session: MerchantSession): boolean {
  return session.role === 'OWNER' || session.role === 'ADMIN';
}

/**
 * Check if current merchant user can edit settings (OWNER, ADMIN, or MEMBER role)
 */
export function canEditSettings(session: MerchantSession): boolean {
  return session.role !== 'VIEWER';
}

/**
 * Get session with fresh merchant data from database
 */
export async function getSessionWithMerchant(): Promise<{
  session: Session;
  merchant?: merchants;
  merchantUser?: merchant_users;
} | null> {
  if (E2E_AUTH_BYPASS) {
    return getE2eMerchantBundle();
  }

  const session = await getSession();

  if (!session) return null;

  if (session.type === 'merchant') {
    logger.debug('Fetching fresh merchant data', { merchantUserId: session.merchantUserId });
    const merchantUser = await prisma.merchant_users.findUnique({
      where: { id: session.merchantUserId },
      include: { merchants: true },
    });

    if (!merchantUser) {
      logger.warn('Merchant user not found for session', { merchantUserId: session.merchantUserId });
      return null;
    }

    return { session, merchant: merchantUser.merchants, merchantUser };
  }

  return { session };
}

// Legacy alias
/** @deprecated Use getSessionWithMerchant instead */
export const getSessionWithDealer = getSessionWithMerchant;

// =============================================
// Authentication Actions
// =============================================

export interface LoginResult {
  success: boolean;
  error?: string;
  token?: string;
  merchant?: merchants;
  merchantUser?: merchant_users;
}

export async function authenticateMerchant(
  email: string,
  password: string
): Promise<LoginResult> {
  const authLogger = logger.child({ action: 'login', email: email.toLowerCase() });

  authLogger.info('Login attempt started');

  try {
    // Find merchant user by email (with merchant info)
    const merchantUser = await prisma.merchant_users.findFirst({
      where: { email: email.toLowerCase() },
      include: { merchants: true },
    });

    if (!merchantUser) {
      authLogger.warn('Login failed - user not found');
      return { success: false, error: 'Invalid email or password' };
    }

    authLogger.debug('Merchant user found, verifying password', {
      merchantUserId: merchantUser.id,
      merchantId: merchantUser.merchantId
    });

    const isValid = await verifyPassword(password, merchantUser.passwordHash);

    if (!isValid) {
      authLogger.warn('Login failed - invalid password', { merchantUserId: merchantUser.id });
      return { success: false, error: 'Invalid email or password' };
    }

    if (!merchantUser.emailVerified) {
      authLogger.warn('Login failed - email not verified', { merchantUserId: merchantUser.id });
      return { success: false, error: 'Please verify your email address' };
    }

    const merchant = merchantUser.merchants;

    if (merchant.status === 'PENDING') {
      authLogger.warn('Login failed - account pending', { merchantId: merchant.id });
      return { success: false, error: 'Your account is pending approval' };
    }

    if (merchant.status === 'SUSPENDED') {
      authLogger.warn('Login failed - account suspended', { merchantId: merchant.id });
      return { success: false, error: 'Your account has been suspended' };
    }

    // Update last login timestamp
    await prisma.merchant_users.update({
      where: { id: merchantUser.id },
      data: { lastLoginAt: new Date() },
    });

    const token = await createMerchantToken(merchantUser);

    authLogger.info('Login successful', {
      merchantUserId: merchantUser.id,
      merchantId: merchant.id,
      status: merchant.status,
      role: merchantUser.role
    });

    return { success: true, token, merchant, merchantUser };
  } catch (error) {
    authLogger.error('Login failed - unexpected error', {}, error);
    throw error;
  }
}

// Legacy alias
/** @deprecated Use authenticateMerchant instead */
export const authenticateDealer = authenticateMerchant;

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
  merchant?: merchants;
  merchantUser?: merchant_users;
}

export async function registerMerchant(input: RegisterInput): Promise<RegisterResult> {
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
    const existing = await prisma.merchant_users.findFirst({
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

    // Create merchant, owner user, and initial contact in a transaction
    regLogger.debug('Creating merchant, owner user, and contact in database');
    const result = await prisma.$transaction(async (tx) => {
      // Create the merchant (business account)
      const merchant = await tx.merchants.create({
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
      const merchantUser = await tx.merchant_users.create({
        data: {
          merchantId: merchant.id,
          email: email.toLowerCase(),
          passwordHash,
          name: fullName,
          role: 'OWNER',
          verifyToken,
          emailVerified: false,
        },
      });

      // Create the initial primary contact
      await tx.merchant_contacts.create({
        data: {
          merchantId: merchant.id,
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

      return { merchant, merchantUser };
    });

    regLogger.info('Registration successful', {
      merchantId: result.merchant.id,
      merchantUserId: result.merchantUser.id,
      status: result.merchant.status,
      tier: result.merchant.tier
    });

    return { success: true, merchant: result.merchant, merchantUser: result.merchantUser };
  } catch (error) {
    regLogger.error('Registration failed - database error', {
      websiteUrl,
      contactFirstName,
      contactLastName
    }, error);
    throw error;
  }
}

// Legacy alias
/** @deprecated Use registerMerchant instead */
export const registerDealer = registerMerchant;

// =============================================
// Team Management
// =============================================

export interface InviteResult {
  success: boolean;
  error?: string;
  inviteToken?: string;
}

export async function inviteTeamMember(
  merchantId: string,
  invitedById: string,
  email: string,
  role: MerchantUserRole = 'MEMBER'
): Promise<InviteResult> {
  const inviteLogger = logger.child({
    action: 'invite',
    merchantId,
    email: email.toLowerCase(),
    role
  });

  inviteLogger.info('Invite attempt started');

  try {
    // Check if user already exists for this merchant
    const existingUser = await prisma.merchant_users.findFirst({
      where: {
        merchantId,
        email: email.toLowerCase(),
      },
    });

    if (existingUser) {
      inviteLogger.warn('Invite failed - user already exists');
      return { success: false, error: 'This user is already a team member' };
    }

    // Check for existing pending invite
    const existingInvite = await prisma.merchant_invites.findFirst({
      where: {
        merchantId,
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
    await prisma.merchant_invites.create({
      data: {
        merchantId,
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
  merchantUser?: merchant_users;
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
    const invite = await prisma.merchant_invites.findUnique({
      where: { inviteToken },
      include: { merchants: true },
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
      const merchantUser = await tx.merchant_users.create({
        data: {
          merchantId: invite.merchantId,
          email: invite.email,
          passwordHash,
          name,
          role: invite.role,
          emailVerified: true, // Already verified via invite email
        },
      });

      await tx.merchant_invites.update({
        where: { id: invite.id },
        data: { acceptedAt: new Date() },
      });

      return merchantUser;
    });

    acceptLogger.info('Invite accepted successfully', {
      merchantUserId: result.id,
      merchantId: invite.merchantId
    });

    return { success: true, merchantUser: result };
  } catch (error) {
    acceptLogger.error('Accept invite failed - unexpected error', {}, error);
    throw error;
  }
}

// =============================================
// Admin Actions
// =============================================

export async function approveMerchant(
  merchantId: string,
  adminEmail: string
): Promise<merchants> {
  logger.info('Approving merchant', { merchantId, adminEmail });

  try {
    const merchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: {
        status: 'ACTIVE',
      },
    });

    logger.info('Merchant approved successfully', {
      merchantId,
      adminEmail,
      businessName: merchant.businessName
    });

    return merchant;
  } catch (error) {
    logger.error('Failed to approve merchant', { merchantId, adminEmail }, error);
    throw error;
  }
}

// Legacy alias
/** @deprecated Use approveMerchant instead */
export const approveDealer = approveMerchant;

export async function suspendMerchant(
  merchantId: string,
  adminEmail: string
): Promise<merchants> {
  logger.info('Suspending merchant', { merchantId, adminEmail });

  try {
    const merchant = await prisma.merchants.update({
      where: { id: merchantId },
      data: {
        status: 'SUSPENDED',
      },
    });

    logger.info('Merchant suspended successfully', {
      merchantId,
      adminEmail,
      businessName: merchant.businessName
    });

    return merchant;
  } catch (error) {
    logger.error('Failed to suspend merchant', { merchantId, adminEmail }, error);
    throw error;
  }
}

// Legacy alias
/** @deprecated Use suspendMerchant instead */
export const suspendDealer = suspendMerchant;

// =============================================
// Audit Logging
// =============================================

export async function logAdminAction(
  adminUserId: string,
  action: string,
  {
    merchantId,
    resource,
    resourceId,
    oldValue,
    newValue,
    ipAddress,
    userAgent,
  }: {
    merchantId?: string;
    resource?: string;
    resourceId?: string;
    oldValue?: unknown;
    newValue?: unknown;
    ipAddress?: string;
    userAgent?: string;
  }
): Promise<void> {
  logger.debug('Creating admin audit log', { adminUserId, action, merchantId, resource });

  try {
    await prisma.admin_audit_logs.create({
      data: {
        adminUserId,
        merchantId,
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

// =============================================
// Retailer Context Resolution
// =============================================

/**
 * Error thrown when retailer context cannot be resolved.
 */
export class RetailerContextError extends Error {
  public readonly code: 'NO_RETAILERS' | 'RETAILER_NOT_FOUND' | 'RETAILER_NOT_ACTIVE' | 'MULTIPLE_RETAILERS' | 'USER_NOT_AUTHORIZED' | 'INSUFFICIENT_PERMISSION'
  public readonly statusCode: number

  constructor(
    code: RetailerContextError['code'],
    message: string,
    statusCode: number = 403
  ) {
    super(message)
    this.name = 'RetailerContextError'
    this.code = code
    this.statusCode = statusCode
  }
}

export interface RetailerContext {
  retailerId: string
  retailerName: string
  listingStatus: MerchantRetailerListingStatus
  relationshipStatus: MerchantRetailerStatus
  /**
   * User's role on this specific retailer.
   * - For OWNER/ADMIN merchant users: defaults to 'ADMIN' (full access to all retailers)
   * - For others: from merchant_user_retailers assignment
   */
  userRole: MerchantRetailerRole
  /**
   * Whether this user has merchant-level admin access (OWNER or ADMIN role on merchant_users)
   */
  isMerchantAdmin: boolean
}

/**
 * Resolve retailer context for merchant portal operations.
 *
 * Per Merchant-and-Retailer-Reference:
 * - Merchants administer Retailers via merchant_retailers join table
 * - session.merchantId is the merchant's ID, NOT a retailer ID
 * - All retailer-scoped queries must resolve retailerId through this helper
 * - User-level permissions are enforced via merchant_user_retailers
 *
 * Resolution logic:
 * 1. Check if user is merchant-level admin (OWNER or ADMIN role)
 * 2. Fetch all ACTIVE merchant_retailers for session.merchantId
 * 3. For non-admin users: filter to only retailers they have explicit access to
 * 4. If inputRetailerId provided: verify it's in the allowed list and return it
 * 5. If exactly one allowed retailer: return it (single-retailer convenience)
 * 6. If zero allowed retailers: throw NO_RETAILERS or USER_NOT_AUTHORIZED
 * 7. If multiple allowed retailers and no inputRetailerId: throw MULTIPLE_RETAILERS
 *
 * @param session - The merchant session (must have merchantId and merchantUserId)
 * @param inputRetailerId - Optional retailer ID from request (query param, body, etc.)
 * @returns RetailerContext with retailerId, metadata, and user's role
 * @throws RetailerContextError if context cannot be resolved or user lacks access
 */
export async function requireRetailerContext(
  session: MerchantSession,
  inputRetailerId?: string
): Promise<RetailerContext> {
  const contextLogger = logger.child({
    action: 'requireRetailerContext',
    merchantId: session.merchantId,
    merchantUserId: session.merchantUserId,
    userRole: session.role,
    inputRetailerId,
  })

  contextLogger.debug('Resolving retailer context')

  // Check if user is merchant-level admin (OWNER or ADMIN can access all retailers)
  const isMerchantAdmin = session.role === 'OWNER' || session.role === 'ADMIN'

  // Fetch all linked retailers for this merchant with user assignments
  const linkedRetailers = await prisma.merchant_retailers.findMany({
    where: {
      merchantId: session.merchantId,
    },
    include: {
      retailers: {
        select: { id: true, name: true },
      },
      // Include user's specific assignment for this retailer
      merchant_user_retailers: {
        where: { merchantUserId: session.merchantUserId },
        select: { role: true },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  // Filter to only ACTIVE relationships
  const activeRetailers = linkedRetailers.filter(r => r.status === 'ACTIVE')

  // For non-admin users, filter to only retailers they have explicit access to
  let allowedRetailers: typeof activeRetailers
  if (isMerchantAdmin) {
    // Admins can access all active retailers
    allowedRetailers = activeRetailers
    contextLogger.debug('Merchant admin - access to all retailers', {
      total: linkedRetailers.length,
      active: activeRetailers.length,
    })
  } else {
    // Non-admins need explicit merchant_user_retailers assignment
    allowedRetailers = activeRetailers.filter(r => r.merchant_user_retailers.length > 0)
    contextLogger.debug('Non-admin user - filtered to assigned retailers', {
      total: linkedRetailers.length,
      active: activeRetailers.length,
      allowed: allowedRetailers.length,
    })
  }

  /**
   * Helper to get user's role on a specific retailer
   */
  function getUserRole(relationship: (typeof linkedRetailers)[0]): MerchantRetailerRole {
    if (isMerchantAdmin) {
      // Merchant admins get ADMIN role on all retailers
      return 'ADMIN'
    }
    // Use the explicit assignment role
    return relationship.merchant_user_retailers[0]?.role || 'VIEWER'
  }

  // Case: inputRetailerId provided - verify it's in the allowed list
  if (inputRetailerId) {
    const relationship = linkedRetailers.find(r => r.retailerId === inputRetailerId)

    if (!relationship) {
      contextLogger.warn('Retailer not found in merchant relationships', { inputRetailerId })
      throw new RetailerContextError(
        'RETAILER_NOT_FOUND',
        'Retailer not found or not linked to your account',
        404
      )
    }

    if (relationship.status !== 'ACTIVE') {
      contextLogger.warn('Retailer relationship not active', {
        inputRetailerId,
        status: relationship.status,
      })
      throw new RetailerContextError(
        'RETAILER_NOT_ACTIVE',
        `Retailer relationship is ${relationship.status.toLowerCase()}`,
        403
      )
    }

    // Check user authorization for this specific retailer
    if (!isMerchantAdmin && relationship.merchant_user_retailers.length === 0) {
      contextLogger.warn('User not authorized for retailer', {
        inputRetailerId,
        merchantUserId: session.merchantUserId,
      })
      throw new RetailerContextError(
        'USER_NOT_AUTHORIZED',
        'You do not have access to this retailer. Contact your administrator.',
        403
      )
    }

    contextLogger.debug('Retailer context resolved via explicit ID', {
      retailerId: relationship.retailerId,
      retailerName: relationship.retailers.name,
      userRole: getUserRole(relationship),
    })

    return {
      retailerId: relationship.retailerId,
      retailerName: relationship.retailers.name,
      listingStatus: relationship.listingStatus,
      relationshipStatus: relationship.status,
      userRole: getUserRole(relationship),
      isMerchantAdmin,
    }
  }

  // Case: No inputRetailerId - try to infer from allowed retailers
  if (allowedRetailers.length === 0) {
    // Check if there are active retailers the user doesn't have access to
    if (activeRetailers.length > 0 && !isMerchantAdmin) {
      contextLogger.warn('User has no retailer assignments', {
        activeRetailers: activeRetailers.length,
      })
      throw new RetailerContextError(
        'USER_NOT_AUTHORIZED',
        'You have not been assigned to any retailers. Contact your administrator.',
        403
      )
    }

    // Check if there are any relationships at all (might be suspended/pending)
    if (linkedRetailers.length > 0) {
      const statuses = linkedRetailers.map(r => r.status).join(', ')
      contextLogger.warn('No active retailer relationships', { statuses })
      throw new RetailerContextError(
        'NO_RETAILERS',
        `No active retailer relationships. Current status: ${statuses}`,
        403
      )
    }

    contextLogger.warn('Merchant has no linked retailers')
    throw new RetailerContextError(
      'NO_RETAILERS',
      'No retailers linked to your account. Please contact support.',
      403
    )
  }

  if (allowedRetailers.length === 1) {
    // Single allowed retailer - convenience case, auto-select
    const relationship = allowedRetailers[0]
    contextLogger.debug('Retailer context resolved via single-retailer inference', {
      retailerId: relationship.retailerId,
      retailerName: relationship.retailers.name,
      userRole: getUserRole(relationship),
    })

    return {
      retailerId: relationship.retailerId,
      retailerName: relationship.retailers.name,
      listingStatus: relationship.listingStatus,
      relationshipStatus: relationship.status,
      userRole: getUserRole(relationship),
      isMerchantAdmin,
    }
  }

  // Multiple allowed retailers - must specify which one
  const retailerNames = allowedRetailers.map(r => r.retailers.name).join(', ')
  contextLogger.warn('Multiple retailers require explicit selection', {
    count: allowedRetailers.length,
    retailers: retailerNames,
  })

  throw new RetailerContextError(
    'MULTIPLE_RETAILERS',
    `Multiple retailers linked. Please specify retailerId. Available: ${retailerNames}`,
    400
  )
}

/**
 * Require specific permission level for an operation.
 * Call this AFTER requireRetailerContext to enforce role-based access.
 *
 * Role hierarchy: ADMIN > EDITOR > VIEWER
 * - ADMIN: Can manage feeds, approve SKUs, manage settings
 * - EDITOR: Can edit feeds, approve/map SKUs
 * - VIEWER: Read-only access
 *
 * @param context - The retailer context from requireRetailerContext
 * @param requiredRole - Minimum role required ('ADMIN', 'EDITOR', or 'VIEWER')
 * @param operation - Description of the operation for error messages
 * @throws RetailerContextError if user lacks sufficient permission
 */
export function requireRetailerPermission(
  context: RetailerContext,
  requiredRole: MerchantRetailerRole,
  operation: string
): void {
  const roleHierarchy: Record<MerchantRetailerRole, number> = {
    ADMIN: 3,
    EDITOR: 2,
    VIEWER: 1,
  }

  const userLevel = roleHierarchy[context.userRole]
  const requiredLevel = roleHierarchy[requiredRole]

  if (userLevel < requiredLevel) {
    logger.warn('Insufficient permission for operation', {
      retailerId: context.retailerId,
      userRole: context.userRole,
      requiredRole,
      operation,
    })
    throw new RetailerContextError(
      'INSUFFICIENT_PERMISSION',
      `You need ${requiredRole} access to ${operation}. Your current role is ${context.userRole}.`,
      403
    )
  }
}

/**
 * Optional retailer context resolution - returns null instead of throwing for NO_RETAILERS.
 * Useful for dashboard pages that should render even with no retailers.
 */
export async function getRetailerContext(
  session: MerchantSession,
  inputRetailerId?: string
): Promise<RetailerContext | null> {
  try {
    return await requireRetailerContext(session, inputRetailerId)
  } catch (error) {
    if (error instanceof RetailerContextError && error.code === 'NO_RETAILERS') {
      return null
    }
    throw error
  }
}
