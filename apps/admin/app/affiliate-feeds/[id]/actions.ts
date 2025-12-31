'use server';

import { prisma } from '@ironscout/db';
import { getAdminSession } from '@/lib/auth';
import { decryptSecret } from '@ironscout/crypto';
import * as ftp from 'basic-ftp';
import { Client as SftpClient, SFTPWrapper, FileEntry } from 'ssh2';

/**
 * Test connection to a feed's server
 */
export async function testFeedConnection(feedId: string): Promise<{
  success: boolean;
  error?: string;
  fileSize?: number;
  fileName?: string;
}> {
  const session = await getAdminSession();
  if (!session) {
    return { success: false, error: 'Unauthorized' };
  }

  const feed = await prisma.affiliateFeed.findUnique({
    where: { id: feedId },
  });

  if (!feed) {
    return { success: false, error: 'Feed not found' };
  }

  if (!feed.secretCiphertext) {
    return { success: false, error: 'Credentials not configured - save password first' };
  }

  let password: string;
  try {
    password = decryptSecret(
      Buffer.from(feed.secretCiphertext),
      feed.secretKeyId || undefined
    );
  } catch (err) {
    return {
      success: false,
      error: `Failed to decrypt credentials: ${err instanceof Error ? err.message : String(err)}`
    };
  }

  if (feed.transport === 'SFTP') {
    return testSftpConnection(feed, password);
  } else {
    return testFtpConnection(feed, password);
  }
}

async function testSftpConnection(
  feed: { host: string | null; port: number | null; username: string | null; path: string | null },
  password: string
): Promise<{ success: boolean; error?: string; fileSize?: number; fileName?: string }> {
  return new Promise((resolve) => {
    const conn = new SftpClient();
    const timeout = setTimeout(() => {
      conn.end();
      resolve({ success: false, error: 'Connection timeout (10s)' });
    }, 10000);

    conn.on('ready', () => {
      conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (err) {
          clearTimeout(timeout);
          conn.end();
          resolve({ success: false, error: `SFTP session error: ${err.message}` });
          return;
        }

        sftp.stat(feed.path!, (statErr: Error | undefined, stats: FileEntry['attrs']) => {
          clearTimeout(timeout);
          conn.end();

          if (statErr) {
            resolve({ success: false, error: `File not found: ${feed.path}` });
            return;
          }

          resolve({
            success: true,
            fileSize: stats.size,
            fileName: feed.path!.split('/').pop(),
          });
        });
      });
    });

    conn.on('error', (err: Error) => {
      clearTimeout(timeout);
      resolve({ success: false, error: `Connection error: ${err.message}` });
    });

    conn.connect({
      host: feed.host!,
      port: feed.port || 22,
      username: feed.username!,
      password,
      readyTimeout: 10000,
    });
  });
}

async function testFtpConnection(
  feed: { host: string | null; port: number | null; username: string | null; path: string | null },
  password: string
): Promise<{ success: boolean; error?: string; fileSize?: number; fileName?: string }> {
  const client = new ftp.Client();
  client.ftp.verbose = false;

  try {
    await client.access({
      host: feed.host!,
      port: feed.port || 21,
      user: feed.username!,
      password,
      secure: false,
    });

    const size = await client.size(feed.path!);

    return {
      success: true,
      fileSize: size,
      fileName: feed.path!.split('/').pop(),
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
