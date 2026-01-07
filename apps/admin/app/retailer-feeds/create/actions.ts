'use server';

import { prisma } from '@ironscout/db';
import { revalidatePath } from 'next/cache';

export type FeedAccessType = 'URL' | 'AUTH_URL' | 'FTP' | 'SFTP' | 'UPLOAD';
export type FeedFormatType = 'GENERIC' | 'AMMOSEEK_V1' | 'GUNENGINE_V2' | 'IMPACT';

interface CreateRetailerFeedInput {
  retailerId: string;
  name: string;
  accessType: FeedAccessType;
  formatType: FeedFormatType;
  url?: string;
  username?: string;
  password?: string;
  scheduleMinutes: number;
}

export async function createRetailerFeed(input: CreateRetailerFeedInput): Promise<{
  success: boolean;
  feedId?: string;
  error?: string;
}> {
  try {
    // Verify retailer exists
    const retailer = await prisma.retailers.findUnique({
      where: { id: input.retailerId },
      select: { id: true, name: true },
    });

    if (!retailer) {
      return { success: false, error: 'Retailer not found' };
    }

    // Validate required fields based on access type
    if (input.accessType === 'URL' && !input.url) {
      return { success: false, error: 'URL is required for URL access type' };
    }

    if (['AUTH_URL', 'FTP', 'SFTP'].includes(input.accessType)) {
      if (!input.url) {
        return { success: false, error: 'URL/Host is required' };
      }
      if (!input.username || !input.password) {
        return { success: false, error: 'Username and password are required for authenticated access' };
      }
    }

    // Create the feed
    const feed = await prisma.retailer_feeds.create({
      data: {
        retailerId: input.retailerId,
        name: input.name,
        accessType: input.accessType,
        formatType: input.formatType,
        url: input.url || null,
        username: input.username || null,
        password: input.password || null,
        scheduleMinutes: input.scheduleMinutes,
        status: 'PENDING',
        enabled: false, // Start disabled until verified
      },
    });

    revalidatePath(`/retailers/${input.retailerId}`);
    revalidatePath('/retailer-feeds');

    return { success: true, feedId: feed.id };
  } catch (error) {
    console.error('Failed to create retailer feed:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to create feed',
    };
  }
}
