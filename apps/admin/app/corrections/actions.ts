'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { loggers } from '@/lib/logger';
import { enqueueCurrentPriceRecompute, mapCorrectionScopeToRecomputeScope } from '@/lib/queue';

// =============================================================================
// Types
// =============================================================================

export type CorrectionScopeType =
  | 'PRODUCT'
  | 'RETAILER'
  | 'MERCHANT'
  | 'SOURCE'
  | 'AFFILIATE'
  | 'FEED_RUN';

export type CorrectionAction = 'IGNORE' | 'MULTIPLIER';

export interface CreateCorrectionInput {
  scopeType: CorrectionScopeType;
  scopeId: string;
  startTs: Date;
  endTs: Date;
  action: CorrectionAction;
  value?: number | null;
  reason: string;
}

export interface CorrectionDTO {
  id: string;
  scopeType: CorrectionScopeType;
  scopeId: string;
  startTs: Date;
  endTs: Date;
  action: CorrectionAction;
  value: number | null;
  reason: string;
  createdAt: Date;
  createdBy: string;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
  // Resolved scope name for display
  scopeName?: string;
}

// =============================================================================
// Validation
// =============================================================================

function validateCorrectionInput(data: CreateCorrectionInput): string | null {
  if (!data.scopeType) {
    return 'Scope type is required';
  }

  if (!data.scopeId || data.scopeId.trim().length === 0) {
    return 'Scope ID is required';
  }

  if (!data.startTs || !data.endTs) {
    return 'Start and end timestamps are required';
  }

  if (new Date(data.startTs) >= new Date(data.endTs)) {
    return 'Start time must be before end time';
  }

  if (!data.action) {
    return 'Action is required';
  }

  if (data.action === 'MULTIPLIER') {
    if (data.value === null || data.value === undefined) {
      return 'Multiplier value is required for MULTIPLIER action';
    }
    if (data.value <= 0 || data.value > 10) {
      return 'Multiplier value must be between 0 and 10';
    }
  }

  if (data.action === 'IGNORE' && data.value !== null && data.value !== undefined) {
    return 'Value must be null for IGNORE action';
  }

  if (!data.reason || data.reason.trim().length < 3) {
    return 'Reason is required (min 3 characters)';
  }

  return null;
}

// =============================================================================
// CRUD Operations
// =============================================================================

/**
 * Create a new price correction
 * Per ADR-015: Corrections are explicit, auditable overlays
 */
export async function createCorrection(data: CreateCorrectionInput) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const validationError = validateCorrectionInput(data);
  if (validationError) {
    return { success: false, error: validationError };
  }

  try {
    // Verify the scope entity exists
    const scopeExists = await verifyScopeExists(data.scopeType, data.scopeId);
    if (!scopeExists) {
      return { success: false, error: `${data.scopeType} with ID "${data.scopeId}" not found` };
    }

    // Check for overlapping active corrections on the same scope
    const overlapping = await prisma.price_corrections.findFirst({
      where: {
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        revokedAt: null,
        OR: [
          // New correction starts during existing
          {
            startTs: { lte: data.startTs },
            endTs: { gt: data.startTs },
          },
          // New correction ends during existing
          {
            startTs: { lt: data.endTs },
            endTs: { gte: data.endTs },
          },
          // New correction completely contains existing
          {
            startTs: { gte: data.startTs },
            endTs: { lte: data.endTs },
          },
        ],
      },
    });

    if (overlapping) {
      return {
        success: false,
        error: `Overlapping active correction exists (ID: ${overlapping.id}). Revoke it first or adjust the time range.`,
      };
    }

    // Create the correction
    const correction = await prisma.price_corrections.create({
      data: {
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        startTs: data.startTs,
        endTs: data.endTs,
        action: data.action,
        value: data.action === 'MULTIPLIER' ? data.value : null,
        reason: data.reason.trim(),
        createdBy: session.email,
      },
    });

    await logAdminAction(session.userId, 'CREATE_CORRECTION', {
      resource: 'PriceCorrection',
      resourceId: correction.id,
      newValue: {
        scopeType: data.scopeType,
        scopeId: data.scopeId,
        action: data.action,
        startTs: data.startTs,
        endTs: data.endTs,
        reason: data.reason,
      },
    });

    // ADR-015: Trigger current price recompute
    try {
      const { scope } = mapCorrectionScopeToRecomputeScope(data.scopeType);
      await enqueueCurrentPriceRecompute({
        scope,
        scopeId: scope !== 'FULL' ? data.scopeId : undefined,
        trigger: 'CORRECTION_CREATED',
        triggeredBy: session.email,
      });
    } catch (recomputeError) {
      // Non-blocking: log error but don't fail the correction creation
      loggers.admin.error(
        'Failed to enqueue price recompute after correction creation',
        { correctionId: correction.id },
        recomputeError instanceof Error ? recomputeError : new Error(String(recomputeError))
      );
    }

    revalidatePath('/corrections');

    return { success: true, correction };
  } catch (error) {
    loggers.admin.error('Failed to create correction', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to create correction' };
  }
}

/**
 * Revoke a correction (soft-delete)
 * Per ADR-015: Corrections are never deleted, only revoked
 */
export async function revokeCorrection(id: string, reason: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  if (!reason || reason.trim().length < 3) {
    return { success: false, error: 'Revoke reason is required (min 3 characters)' };
  }

  try {
    const correction = await prisma.price_corrections.findUnique({
      where: { id },
    });

    if (!correction) {
      return { success: false, error: 'Correction not found' };
    }

    if (correction.revokedAt) {
      return { success: false, error: 'Correction is already revoked' };
    }

    // Revoke the correction
    await prisma.price_corrections.update({
      where: { id },
      data: {
        revokedAt: new Date(),
        revokedBy: session.email,
        revokeReason: reason.trim(),
      },
    });

    await logAdminAction(session.userId, 'REVOKE_CORRECTION', {
      resource: 'PriceCorrection',
      resourceId: id,
      oldValue: {
        scopeType: correction.scopeType,
        scopeId: correction.scopeId,
        action: correction.action,
      },
      newValue: {
        revokedBy: session.email,
        revokeReason: reason,
      },
    });

    // ADR-015: Trigger current price recompute
    try {
      const { scope } = mapCorrectionScopeToRecomputeScope(correction.scopeType as CorrectionScopeType);
      await enqueueCurrentPriceRecompute({
        scope,
        scopeId: scope !== 'FULL' ? correction.scopeId : undefined,
        trigger: 'CORRECTION_REVOKED',
        triggeredBy: session.email,
      });
    } catch (recomputeError) {
      // Non-blocking: log error but don't fail the correction revocation
      loggers.admin.error(
        'Failed to enqueue price recompute after correction revocation',
        { correctionId: id },
        recomputeError instanceof Error ? recomputeError : new Error(String(recomputeError))
      );
    }

    revalidatePath('/corrections');

    return { success: true, message: 'Correction revoked successfully' };
  } catch (error) {
    loggers.admin.error('Failed to revoke correction', { correctionId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to revoke correction' };
  }
}

/**
 * List all corrections with optional filtering
 */
export async function listCorrections(options?: {
  includeRevoked?: boolean;
  scopeType?: CorrectionScopeType;
  limit?: number;
}) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', corrections: [] };
  }

  try {
    const where: Record<string, unknown> = {};

    if (!options?.includeRevoked) {
      where.revokedAt = null;
    }

    if (options?.scopeType) {
      where.scopeType = options.scopeType;
    }

    const corrections = await prisma.price_corrections.findMany({
      where,
      orderBy: [
        { revokedAt: 'asc' }, // Active first
        { createdAt: 'desc' },
      ],
      take: options?.limit ?? 100,
    });

    // Resolve scope names for display
    const enrichedCorrections: CorrectionDTO[] = await Promise.all(
      corrections.map(async (c) => ({
        id: c.id,
        scopeType: c.scopeType as CorrectionScopeType,
        scopeId: c.scopeId,
        startTs: c.startTs,
        endTs: c.endTs,
        action: c.action as CorrectionAction,
        value: c.value ? parseFloat(c.value.toString()) : null,
        reason: c.reason,
        createdAt: c.createdAt,
        createdBy: c.createdBy,
        revokedAt: c.revokedAt,
        revokedBy: c.revokedBy,
        revokeReason: c.revokeReason,
        scopeName: await resolveScopeName(c.scopeType as CorrectionScopeType, c.scopeId),
      }))
    );

    return { success: true, corrections: enrichedCorrections };
  } catch (error) {
    loggers.admin.error('Failed to list corrections', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to list corrections', corrections: [] };
  }
}

/**
 * Get a single correction by ID
 */
export async function getCorrection(id: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', correction: null };
  }

  try {
    const correction = await prisma.price_corrections.findUnique({
      where: { id },
    });

    if (!correction) {
      return { success: false, error: 'Correction not found', correction: null };
    }

    const enriched: CorrectionDTO = {
      id: correction.id,
      scopeType: correction.scopeType as CorrectionScopeType,
      scopeId: correction.scopeId,
      startTs: correction.startTs,
      endTs: correction.endTs,
      action: correction.action as CorrectionAction,
      value: correction.value ? parseFloat(correction.value.toString()) : null,
      reason: correction.reason,
      createdAt: correction.createdAt,
      createdBy: correction.createdBy,
      revokedAt: correction.revokedAt,
      revokedBy: correction.revokedBy,
      revokeReason: correction.revokeReason,
      scopeName: await resolveScopeName(correction.scopeType as CorrectionScopeType, correction.scopeId),
    };

    return { success: true, correction: enriched };
  } catch (error) {
    loggers.admin.error('Failed to get correction', { correctionId: id }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to get correction', correction: null };
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Verify that a scope entity exists
 */
async function verifyScopeExists(scopeType: CorrectionScopeType, scopeId: string): Promise<boolean> {
  try {
    switch (scopeType) {
      case 'PRODUCT':
        return !!(await prisma.products.findUnique({ where: { id: scopeId }, select: { id: true } }));
      case 'RETAILER':
        return !!(await prisma.retailers.findUnique({ where: { id: scopeId }, select: { id: true } }));
      case 'MERCHANT':
        return !!(await prisma.merchants.findUnique({ where: { id: scopeId }, select: { id: true } }));
      case 'SOURCE':
        return !!(await prisma.sources.findUnique({ where: { id: scopeId }, select: { id: true } }));
      case 'AFFILIATE':
        return !!(await prisma.affiliate_feeds.findUnique({ where: { id: scopeId }, select: { id: true } }));
      case 'FEED_RUN':
        return !!(await prisma.affiliate_feed_runs.findUnique({ where: { id: scopeId }, select: { id: true } }));
      default:
        return false;
    }
  } catch {
    return false;
  }
}

/**
 * Resolve a human-readable name for a scope entity
 */
async function resolveScopeName(scopeType: CorrectionScopeType, scopeId: string): Promise<string> {
  try {
    switch (scopeType) {
      case 'PRODUCT': {
        const product = await prisma.products.findUnique({ where: { id: scopeId }, select: { name: true } });
        return product?.name ?? scopeId;
      }
      case 'RETAILER': {
        const retailer = await prisma.retailers.findUnique({ where: { id: scopeId }, select: { name: true } });
        return retailer?.name ?? scopeId;
      }
      case 'MERCHANT': {
        const merchant = await prisma.merchants.findUnique({ where: { id: scopeId }, select: { businessName: true } });
        return merchant?.businessName ?? scopeId;
      }
      case 'SOURCE': {
        const source = await prisma.sources.findUnique({ where: { id: scopeId }, select: { name: true } });
        return source?.name ?? scopeId;
      }
      case 'AFFILIATE': {
        const feed = await prisma.affiliate_feeds.findUnique({
          where: { id: scopeId },
          include: { sources: { select: { name: true } } },
        });
        return feed?.sources?.name ?? scopeId;
      }
      case 'FEED_RUN': {
        const run = await prisma.affiliate_feed_runs.findUnique({
          where: { id: scopeId },
          include: { affiliate_feeds: { include: { sources: { select: { name: true } } } } },
        });
        const source = run?.affiliate_feeds?.sources?.name ?? 'Unknown';
        const date = run?.startedAt ? new Date(run.startedAt).toLocaleDateString() : '';
        return `${source} (${date})`;
      }
      default:
        return scopeId;
    }
  } catch {
    return scopeId;
  }
}

/**
 * Search for entities by scope type (for autocomplete)
 */
export async function searchScopeEntities(scopeType: CorrectionScopeType, query: string) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized', results: [] };
  }

  if (!query || query.length < 2) {
    return { success: true, results: [] };
  }

  try {
    let results: Array<{ id: string; name: string }> = [];

    switch (scopeType) {
      case 'PRODUCT': {
        const products = await prisma.products.findMany({
          where: { name: { contains: query, mode: 'insensitive' } },
          select: { id: true, name: true },
          take: 10,
        });
        results = products.map(p => ({ id: p.id, name: p.name }));
        break;
      }
      case 'RETAILER': {
        const retailers = await prisma.retailers.findMany({
          where: { name: { contains: query, mode: 'insensitive' } },
          select: { id: true, name: true },
          take: 10,
        });
        results = retailers.map(r => ({ id: r.id, name: r.name }));
        break;
      }
      case 'MERCHANT': {
        const merchants = await prisma.merchants.findMany({
          where: { businessName: { contains: query, mode: 'insensitive' } },
          select: { id: true, businessName: true },
          take: 10,
        });
        results = merchants.map(m => ({ id: m.id, name: m.businessName }));
        break;
      }
      case 'SOURCE': {
        const sources = await prisma.sources.findMany({
          where: { name: { contains: query, mode: 'insensitive' } },
          select: { id: true, name: true },
          take: 10,
        });
        results = sources.map(s => ({ id: s.id, name: s.name }));
        break;
      }
      case 'AFFILIATE': {
        const feeds = await prisma.affiliate_feeds.findMany({
          where: { sources: { name: { contains: query, mode: 'insensitive' } } },
          include: { sources: { select: { name: true } } },
          take: 10,
        });
        results = feeds.map(f => ({ id: f.id, name: f.sources?.name ?? f.id }));
        break;
      }
      case 'FEED_RUN': {
        // For feed runs, search by source name or run ID
        const runs = await prisma.affiliate_feed_runs.findMany({
          where: {
            OR: [
              { id: { contains: query } },
              { affiliate_feeds: { sources: { name: { contains: query, mode: 'insensitive' } } } },
            ],
          },
          include: { affiliate_feeds: { include: { sources: { select: { name: true } } } } },
          orderBy: { startedAt: 'desc' },
          take: 10,
        });
        results = runs.map(r => ({
          id: r.id,
          name: `${r.affiliate_feeds?.sources?.name ?? 'Unknown'} - ${new Date(r.startedAt).toLocaleString()}`,
        }));
        break;
      }
    }

    return { success: true, results };
  } catch (error) {
    loggers.admin.error('Failed to search scope entities', { scopeType, query }, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Search failed', results: [] };
  }
}
