'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';
import { getAdminSession, logAdminAction } from '@/lib/auth';
import { loggers } from '@/lib/logger';
import {
  validateTransportAsync,
  validatePort,
  validateHost,
  validatePath,
  ValidationError,
} from '@/lib/affiliate-feed-validation';
import { encryptSecret } from '@ironscout/crypto';

export type AffiliateNetwork = 'IMPACT' | 'AVANTLINK' | 'SHAREASALE' | 'CJ' | 'RAKUTEN';

export interface CreateAffiliateFeedWithSourceInput {
  // Source info
  sourceName: string;
  retailerName: string;
  websiteUrl?: string;
  // Affiliate network
  affiliateNetwork: AffiliateNetwork;
  affiliateAdvertiserId?: string;
  affiliateAccountId?: string;
  affiliateProgramId?: string;
  affiliateTrackingTemplate?: string;
  // Connection
  transport: 'FTP' | 'SFTP';
  host: string;
  port: number;
  path: string;
  username: string;
  password: string;
  // Schedule
  scheduleFrequencyHours?: number;
}

export async function createAffiliateFeedWithSource(data: CreateAffiliateFeedWithSourceInput) {
  const session = await getAdminSession();

  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate inputs
    await validateTransportAsync(data.transport);
    validateHost(data.host);
    validatePort(data.port, data.transport);
    validatePath(data.path);

    if (!data.sourceName.trim()) {
      return { success: false, error: 'Source name is required' };
    }
    if (!data.retailerName.trim()) {
      return { success: false, error: 'Retailer name is required' };
    }
    if (!data.username.trim()) {
      return { success: false, error: 'Username is required' };
    }
    if (!data.password) {
      return { success: false, error: 'Password is required' };
    }
    if (!data.websiteUrl?.trim()) {
      return { success: false, error: 'Website URL is required' };
    }

    // Create retailer if it doesn't exist
    let retailer = await prisma.retailers.findFirst({
      where: { name: { equals: data.retailerName, mode: 'insensitive' } },
    });

    if (!retailer) {
      retailer = await prisma.retailers.create({
        data: {
          name: data.retailerName,
          website: data.websiteUrl!,
        },
      });
    }

    // Create source for the affiliate feed
    const source = await prisma.sources.create({
      data: {
        name: data.sourceName,
        type: 'FEED_CSV',
        url: data.websiteUrl!,
        retailerId: retailer.id,
        sourceKind: 'AFFILIATE_FEED',
        affiliateNetwork: data.affiliateNetwork,
        affiliateAdvertiserId: data.affiliateAdvertiserId || null,
        affiliateAccountId: data.affiliateAccountId || null,
        affiliateProgramId: data.affiliateProgramId || null,
        affiliateTrackingTemplate: data.affiliateTrackingTemplate || null,
      },
    });

    // Encrypt the password
    const encryptedBuffer = encryptSecret(data.password);
    const secretCiphertext = new Uint8Array(encryptedBuffer) as Uint8Array<ArrayBuffer>;

    // Create the affiliate feed
    const feed = await prisma.affiliate_feeds.create({
      data: {
        sourceId: source.id,
        network: data.affiliateNetwork,
        status: 'DRAFT',
        transport: data.transport,
        host: data.host,
        port: data.port,
        path: data.path,
        username: data.username,
        secretCiphertext,
        secretVersion: 1,
        format: 'CSV',
        compression: 'NONE',
        scheduleFrequencyHours: data.scheduleFrequencyHours ?? 24,
        expiryHours: 48,
        createdBy: session.email,
      },
    });

    await logAdminAction(session.userId, 'CREATE_AFFILIATE_FEED', {
      resource: 'AffiliateFeed',
      resourceId: feed.id,
      newValue: {
        sourceId: source.id,
        sourceName: data.sourceName,
        retailerName: data.retailerName,
        network: data.affiliateNetwork,
        affiliateAdvertiserId: data.affiliateAdvertiserId,
        host: data.host,
        path: data.path,
      },
    });

    revalidatePath('/affiliate-feeds');

    return { success: true, feed, source };
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    loggers.feeds.error('Failed to create affiliate feed with source', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to create affiliate feed' };
  }
}
