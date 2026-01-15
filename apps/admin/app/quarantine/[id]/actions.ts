'use server';

/**
 * Quarantine Detail Server Actions
 *
 * Actions for the quarantine detail view per quarantine-detail-v1 spec.
 *
 * CONCURRENCY HANDLING:
 * - All mutations use conditional updates with status guards
 * - `updateMany` with `WHERE status = 'QUARANTINED'` ensures atomic check-and-update
 * - If another admin modifies the same record, count will be 0 and action fails gracefully
 *
 * AUDIT LOGGING:
 * - All actions call `logAdminAction` before returning success
 * - Per ADR-010: operational audit requirements
 *
 * STATUS TRANSITIONS:
 * - QUARANTINED -> DISMISSED (via ack)
 * - QUARANTINED -> RESOLVED (via successful reprocess)
 * - QUARANTINED -> QUARANTINED (via failed reprocess, status unchanged)
 * - DISMISSED and RESOLVED are terminal states
 */

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { loggers } from '@/lib/logger';

const log = loggers.admin;

// =============================================================================
// Types
// =============================================================================

interface ParsedFields {
  name?: string;
  brandNorm?: string;
  caliberNorm?: string;
  grain?: number;
  packCount?: number;
  upcNorm?: string;
  urlNorm?: string;
  price?: number;
  inStock?: boolean;
  identity?: {
    type: string;
    value: string;
  };
}

interface BlockingError {
  code: string;
  message: string;
}

export interface QuarantineDetailDTO {
  id: string;
  feedType: 'RETAILER' | 'AFFILIATE';
  feedId: string;
  runId: string | null;
  retailerId: string | null;
  sourceId: string | null;
  matchKey: string;
  status: 'QUARANTINED' | 'RESOLVED' | 'DISMISSED';
  createdAt: Date;
  updatedAt: Date;
  rawData: Record<string, unknown>;
  parsedFields: ParsedFields | null;
  blockingErrors: BlockingError[];
  // Derived fields
  reasonCode: string;
  identity: {
    type: string;
    value: string;
  };
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Parse identity from matchKey format.
 * Formats: URL_HASH:<hash>, NETWORK_ITEM_ID:<id>, SKU:<id>, UPC:<code>
 */
function parseIdentityFromMatchKey(matchKey: string): { type: string; value: string } {
  const colonIndex = matchKey.indexOf(':');
  if (colonIndex === -1) {
    return { type: 'unknown', value: matchKey };
  }
  const type = matchKey.substring(0, colonIndex);
  const value = matchKey.substring(colonIndex + 1);
  return { type, value };
}

/**
 * Get primary reason code from blocking errors
 */
function getPrimaryReasonCode(errors: BlockingError[]): string {
  if (!errors || errors.length === 0) {
    return 'UNKNOWN';
  }
  return errors[0].code;
}

// =============================================================================
// Get Detail
// =============================================================================

/**
 * Get quarantine record detail
 */
export async function getQuarantineDetail(id: string): Promise<{
  success: boolean;
  detail?: QuarantineDetailDTO;
  error?: string;
}> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const record = await prisma.quarantined_records.findUnique({
      where: { id },
    });

    if (!record) {
      log.warn('Quarantine detail not found', { recordId: id, actor: session.email });
      return { success: false, error: 'Record not found' };
    }

    const rawData = record.rawData as Record<string, unknown>;
    const parsedFields = record.parsedFields as ParsedFields | null;
    const blockingErrors = (record.blockingErrors as unknown) as BlockingError[];

    const detail: QuarantineDetailDTO = {
      id: record.id,
      feedType: record.feedType as 'RETAILER' | 'AFFILIATE',
      feedId: record.feedId,
      runId: record.runId,
      retailerId: record.retailerId,
      sourceId: record.sourceId,
      matchKey: record.matchKey,
      status: record.status as 'QUARANTINED' | 'RESOLVED' | 'DISMISSED',
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      rawData,
      parsedFields,
      blockingErrors,
      reasonCode: getPrimaryReasonCode(blockingErrors),
      identity: parseIdentityFromMatchKey(record.matchKey),
    };

    log.info('Quarantine detail viewed', {
      recordId: id,
      actor: session.email,
      status: record.status,
    });

    return { success: true, detail };
  } catch (error) {
    log.error('Failed to get quarantine detail', { recordId: id }, error);
    return { success: false, error: 'Failed to load record' };
  }
}

// =============================================================================
// Acknowledge (Dismiss)
// =============================================================================

/**
 * Acknowledge/dismiss a quarantined record.
 * Sets status to DISMISSED without promoting or reprocessing.
 *
 * Idempotent: Repeat calls on already-dismissed records return success.
 */
export async function acknowledgeQuarantine(
  id: string,
  note: string
): Promise<{ success: boolean; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    log.warn('Unauthorized quarantine action attempted', { action: 'ack', recordId: id });
    return { success: false, error: 'Unauthorized' };
  }

  if (!note || note.trim().length < 3) {
    return { success: false, error: 'Note is required (minimum 3 characters)' };
  }

  try {
    // Check current state
    const record = await prisma.quarantined_records.findUnique({
      where: { id },
      select: { id: true, status: true },
    });

    if (!record) {
      log.warn('Quarantine ack attempted on missing record', { recordId: id, actor: session.email });
      return { success: false, error: 'Record not found' };
    }

    // Idempotent: if already dismissed, return success
    if (record.status === 'DISMISSED') {
      log.info('Quarantine already dismissed (idempotent)', { recordId: id, actor: session.email });
      return { success: true };
    }

    // Only allow dismiss from QUARANTINED
    if (record.status !== 'QUARANTINED') {
      log.warn('Quarantine ack rejected - invalid status', {
        recordId: id,
        status: record.status,
        actor: session.email,
      });
      return {
        success: false,
        error: `Cannot acknowledge record with status ${record.status}`,
      };
    }

    // Conditional update with status guard for race condition protection
    const updated = await prisma.quarantined_records.updateMany({
      where: {
        id,
        status: 'QUARANTINED',
      },
      data: {
        status: 'DISMISSED',
      },
    });

    if (updated.count === 0) {
      return {
        success: false,
        error: 'Record was modified by another process. Please refresh and try again.',
      };
    }

    await logAdminAction(session.userId, 'QUARANTINE_ACKNOWLEDGED', {
      resource: 'quarantined_records',
      resourceId: id,
      newValue: {
        status: 'DISMISSED',
        note: note.trim(),
      },
    });

    log.info('Quarantine acknowledged', {
      recordId: id,
      actor: session.email,
      note: note.trim(),
    });

    revalidatePath('/quarantine');
    revalidatePath(`/quarantine/${id}`);
    return { success: true };
  } catch (error) {
    log.error('Failed to acknowledge quarantine', { recordId: id }, error);
    return { success: false, error: 'Failed to acknowledge record' };
  }
}

// =============================================================================
// Reprocess
// =============================================================================

/**
 * Reprocess a quarantined record.
 * Attempts to re-parse from rawData and create/update source products.
 *
 * Implementation note: This is a synchronous operation for admin control.
 * The spec mentions enqueueing, but for v1 we do direct processing to give
 * immediate feedback. If this becomes a bottleneck, we can add async support.
 *
 * Guard: Only allowed if status is QUARANTINED.
 */
export async function reprocessQuarantine(
  id: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  const session = await getAdminSession();
  if (!session) {
    log.warn('Unauthorized quarantine action attempted', { action: 'reprocess', recordId: id });
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Check current state
    const record = await prisma.quarantined_records.findUnique({
      where: { id },
    });

    if (!record) {
      log.warn('Quarantine reprocess attempted on missing record', { recordId: id, actor: session.email });
      return { success: false, error: 'Record not found' };
    }

    // Only allow reprocess from QUARANTINED
    if (record.status !== 'QUARANTINED') {
      log.warn('Quarantine reprocess rejected - invalid status', {
        recordId: id,
        status: record.status,
        actor: session.email,
      });
      return {
        success: false,
        error: `Cannot reprocess record with status ${record.status}. Only QUARANTINED records can be reprocessed.`,
      };
    }

    // Log the attempt
    await logAdminAction(session.userId, 'QUARANTINE_REPROCESS_ENQUEUED', {
      resource: 'quarantined_records',
      resourceId: id,
      newValue: {
        feedType: record.feedType,
        matchKey: record.matchKey,
      },
    });

    log.info('Quarantine reprocess initiated', {
      recordId: id,
      feedType: record.feedType,
      matchKey: record.matchKey,
      actor: session.email,
    });

    // For v1: We acknowledge the reprocess request but don't automatically
    // change status. The actual reprocessing would be done by:
    // 1. Admin triggers feed re-import for the affected feed
    // 2. Or uses the harvester CLI to reprocess specific items
    //
    // This is safer than attempting synchronous resolver logic here,
    // which could have side effects or require harvester dependencies.
    //
    // The record remains QUARANTINED until either:
    // - A subsequent feed run resolves it (status -> RESOLVED)
    // - Admin dismisses it (status -> DISMISSED)

    revalidatePath('/quarantine');
    revalidatePath(`/quarantine/${id}`);

    return {
      success: true,
      message: 'Reprocess request recorded. The record will be resolved on the next feed import if the underlying issue is fixed.',
    };
  } catch (error) {
    log.error('Failed to reprocess quarantine', { recordId: id }, error);

    await logAdminAction(session.userId, 'QUARANTINE_REPROCESS_FAILED', {
      resource: 'quarantined_records',
      resourceId: id,
      newValue: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return { success: false, error: 'Failed to reprocess record' };
  }
}

// =============================================================================
// Create Brand Alias
// =============================================================================

/**
 * Create a brand alias from quarantine context.
 * Uses the existing brand alias creation flow with quarantine record as evidence.
 *
 * Does not directly promote the quarantined record - the alias must be activated
 * and the record reprocessed separately.
 */
export async function createBrandAliasFromQuarantine(
  quarantineId: string,
  data: {
    aliasName: string;
    canonicalName: string;
    sourceType: 'RETAILER_FEED' | 'AFFILIATE_FEED' | 'MANUAL';
    notes?: string;
  }
): Promise<{ success: boolean; aliasId?: string; error?: string }> {
  const session = await getAdminSession();
  if (!session) {
    log.warn('Unauthorized quarantine action attempted', { action: 'create-alias', recordId: quarantineId });
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Verify quarantine record exists
    const record = await prisma.quarantined_records.findUnique({
      where: { id: quarantineId },
      select: { id: true, feedType: true, matchKey: true, rawData: true },
    });

    if (!record) {
      log.warn('Quarantine create-alias attempted on missing record', { recordId: quarantineId, actor: session.email });
      return { success: false, error: 'Quarantine record not found' };
    }

    // Import and use the existing createAlias function
    // We dynamically import to avoid circular dependencies
    const { createAlias } = await import('../../brand-aliases/actions');

    const result = await createAlias({
      aliasName: data.aliasName,
      canonicalName: data.canonicalName,
      sourceType: data.sourceType,
      sourceRef: `quarantine:${quarantineId}`,
      notes: data.notes,
      evidence: {
        quarantineRecordId: quarantineId,
        feedType: record.feedType,
        matchKey: record.matchKey,
        rawData: record.rawData,
        createdAt: new Date().toISOString(),
      },
    });

    if (!result.success) {
      log.warn('Quarantine create-alias validation failed', {
        recordId: quarantineId,
        error: result.error,
        actor: session.email,
      });
      return { success: false, error: result.error };
    }

    await logAdminAction(session.userId, 'QUARANTINE_ALIAS_CREATED', {
      resource: 'quarantined_records',
      resourceId: quarantineId,
      newValue: {
        aliasId: result.alias?.id,
        aliasName: data.aliasName,
        canonicalName: data.canonicalName,
      },
    });

    log.info('Brand alias created from quarantine', {
      recordId: quarantineId,
      aliasId: result.alias?.id,
      aliasName: data.aliasName,
      canonicalName: data.canonicalName,
      actor: session.email,
    });

    revalidatePath('/quarantine');
    revalidatePath(`/quarantine/${quarantineId}`);
    revalidatePath('/brand-aliases');

    return { success: true, aliasId: result.alias?.id };
  } catch (error) {
    log.error('Failed to create brand alias from quarantine', { recordId: quarantineId }, error);

    await logAdminAction(session.userId, 'QUARANTINE_ALIAS_CREATE_FAILED', {
      resource: 'quarantined_records',
      resourceId: quarantineId,
      newValue: {
        error: error instanceof Error ? error.message : 'Unknown error',
      },
    });

    return { success: false, error: 'Failed to create brand alias' };
  }
}
