'use server';

import { prisma, isPlainFtpAllowed } from '@ironscout/db';
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
import * as ftp from 'basic-ftp';
import { Client as SftpClient, SFTPWrapper } from 'ssh2';
import type { FileEntry } from 'ssh2';

export type AffiliateNetwork = 'IMPACT' | 'AVANTLINK' | 'SHAREASALE' | 'CJ' | 'RAKUTEN';

export interface CreateAffiliateFeedWithSourceInput {
  // Source info
  sourceName: string;
  // Retailer - either existing ID or new retailer details
  retailerId?: string; // Use existing retailer
  newRetailerName?: string; // Create new retailer
  newRetailerWebsite?: string; // Website for new retailer
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

/**
 * Get all retailers for dropdown selection
 */
export async function getRetailers() {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const retailers = await prisma.retailers.findMany({
      select: {
        id: true,
        name: true,
        website: true,
      },
      orderBy: { name: 'asc' },
    });

    return { success: true, data: retailers };
  } catch (error) {
    loggers.feeds.error('Failed to fetch retailers', {}, error instanceof Error ? error : new Error(String(error)));
    return { success: false, error: 'Failed to fetch retailers' };
  }
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
    if (!data.username.trim()) {
      return { success: false, error: 'Username is required' };
    }
    if (!data.password) {
      return { success: false, error: 'Password is required' };
    }

    // Validate retailer selection
    const isNewRetailer = !data.retailerId;
    if (isNewRetailer) {
      if (!data.newRetailerName?.trim()) {
        return { success: false, error: 'Retailer name is required' };
      }
      if (!data.newRetailerWebsite?.trim()) {
        return { success: false, error: 'Website URL is required for new retailer' };
      }
    }

    // Get or create retailer
    let retailer: { id: string; name: string; website: string };
    let websiteUrl: string;

    if (data.retailerId) {
      // Use existing retailer
      const existing = await prisma.retailers.findUnique({
        where: { id: data.retailerId },
        select: { id: true, name: true, website: true },
      });
      if (!existing) {
        return { success: false, error: 'Selected retailer not found' };
      }
      retailer = existing;
      websiteUrl = existing.website;
    } else {
      // Create new retailer
      // Normalize website URL
      websiteUrl = data.newRetailerWebsite!.trim().toLowerCase();
      if (!websiteUrl.startsWith('http://') && !websiteUrl.startsWith('https://')) {
        websiteUrl = 'https://' + websiteUrl;
      }
      websiteUrl = websiteUrl.replace(/\/+$/, '');

      // Check for duplicate retailer name
      const existingByName = await prisma.retailers.findFirst({
        where: { name: { equals: data.newRetailerName!.trim(), mode: 'insensitive' } },
      });
      if (existingByName) {
        return {
          success: false,
          error: `A retailer named "${existingByName.name}" already exists. Please select it from the dropdown.`
        };
      }

      retailer = await prisma.retailers.create({
        data: {
          name: data.newRetailerName!.trim(),
          website: websiteUrl,
        },
      });
    }

    // Create source for the affiliate feed
    const source = await prisma.sources.create({
      data: {
        name: data.sourceName,
        type: 'FEED_CSV',
        url: websiteUrl,
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
        retailerId: retailer.id,
        retailerName: retailer.name,
        isNewRetailer: !data.retailerId,
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

/**
 * Test FTP/SFTP connection with raw credentials (before saving feed)
 */
export interface TestConnectionInput {
  transport: 'FTP' | 'SFTP';
  host: string;
  port: number;
  path: string;
  username: string;
  password: string;
}

export interface TestConnectionResult {
  success: boolean;
  error?: string;
  fileSize?: number;
  fileName?: string;
}

export async function testFeedConnection(data: TestConnectionInput): Promise<TestConnectionResult> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    // Validate inputs
    validateHost(data.host);
    validatePort(data.port, data.transport);
    validatePath(data.path);

    if (!data.username.trim()) {
      return { success: false, error: 'Username is required' };
    }
    if (!data.password) {
      return { success: false, error: 'Password is required' };
    }

    if (data.transport === 'SFTP') {
      return await testSftpConnection(data);
    } else {
      return await testFtpConnection(data);
    }
  } catch (error) {
    if (error instanceof ValidationError) {
      return { success: false, error: error.message };
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
}

async function testSftpConnection(data: TestConnectionInput): Promise<TestConnectionResult> {
  return new Promise((resolve) => {
    const conn = new SftpClient();
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        conn.end();
        resolve({ success: false, error: 'Connection timeout (10s)' });
      }
    }, 10000);

    conn.on('ready', () => {
      conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (err) {
          clearTimeout(timeout);
          resolved = true;
          conn.end();
          resolve({ success: false, error: `SFTP session error: ${err.message}` });
          return;
        }

        sftp.stat(data.path, (statErr: Error | undefined, stats: FileEntry['attrs']) => {
          clearTimeout(timeout);
          resolved = true;
          conn.end();

          if (statErr) {
            resolve({ success: false, error: `File not found: ${data.path}` });
            return;
          }

          resolve({
            success: true,
            fileSize: stats.size,
            fileName: data.path.split('/').pop(),
          });
        });
      });
    });

    conn.on('error', (err: Error) => {
      clearTimeout(timeout);
      if (!resolved) {
        resolved = true;
        resolve({ success: false, error: `Connection error: ${err.message}` });
      }
    });

    conn.connect({
      host: data.host,
      port: data.port || 22,
      username: data.username,
      password: data.password,
      readyTimeout: 10000,
    });
  });
}

async function testFtpConnection(data: TestConnectionInput): Promise<TestConnectionResult> {
  const ftpAllowed = await isPlainFtpAllowed();
  if (!ftpAllowed) {
    return { success: false, error: 'Plain FTP is disabled. Use SFTP instead or enable via admin settings.' };
  }

  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: data.host,
      port: data.port || 21,
      user: data.username,
      password: data.password,
      secure: false,
    });

    const size = await client.size(data.path);

    return {
      success: true,
      fileSize: size,
      fileName: data.path.split('/').pop(),
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    };
  } finally {
    client.close();
  }
}
