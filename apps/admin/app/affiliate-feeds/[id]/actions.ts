'use server';

import { prisma } from '@ironscout/db';
import { getAdminSession } from '@/lib/auth';
import { loggers } from '@/lib/logger';
import { decryptSecret } from '@ironscout/crypto';
import * as ftp from 'basic-ftp';
import { Client as SftpClient, SFTPWrapper, FileEntry } from 'ssh2';

const log = loggers.feeds;

/**
 * Connection parameters that can override saved values for testing
 */
export interface TestConnectionParams {
  host?: string;
  port?: number;
  path?: string;
  username?: string;
}

/**
 * Test connection to a feed's server
 * @param feedId - The feed ID to test
 * @param overrideParams - Optional params to override saved values (for testing unsaved changes)
 */
export async function testFeedConnection(
  feedId: string,
  overrideParams?: TestConnectionParams
): Promise<{
  success: boolean;
  error?: string;
  fileSize?: number;
  fileName?: string;
}> {
  log.info('TEST_CONNECTION_START', { feedId, hasOverrides: !!overrideParams });

  const session = await getAdminSession();
  if (!session) {
    log.warn('TEST_CONNECTION_UNAUTHORIZED', { feedId });
    return { success: false, error: 'Unauthorized' };
  }

  const feed = await prisma.affiliate_feeds.findUnique({
    where: { id: feedId },
  });

  if (!feed) {
    log.warn('TEST_CONNECTION_FEED_NOT_FOUND', { feedId });
    return { success: false, error: 'Feed not found' };
  }

  // Merge override params with saved values
  const connectionParams = {
    host: overrideParams?.host ?? feed.host,
    port: overrideParams?.port ?? feed.port,
    path: overrideParams?.path ?? feed.path,
    username: overrideParams?.username ?? feed.username,
  };

  log.info('TEST_CONNECTION_FEED_LOADED', {
    feedId,
    transport: feed.transport,
    hasSecret: !!feed.secretCiphertext,
    usingOverrides: !!overrideParams,
    overrideFields: overrideParams ? Object.keys(overrideParams) : [],
  });

  if (!feed.secretCiphertext) {
    log.warn('TEST_CONNECTION_NO_CREDENTIALS', { feedId });
    return { success: false, error: 'Credentials not configured - save password first' };
  }

  let password: string;
  try {
    log.debug('TEST_CONNECTION_DECRYPTING', { feedId, keyId: feed.secretKeyId });
    password = decryptSecret(
      Buffer.from(feed.secretCiphertext),
      feed.secretKeyId || undefined
    );
    log.debug('TEST_CONNECTION_DECRYPTED', { feedId, passwordPresent: true });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    log.error('TEST_CONNECTION_DECRYPT_FAILED', { feedId, error: errorMsg });
    return {
      success: false,
      error: `Failed to decrypt credentials: ${errorMsg}`
    };
  }

  if (feed.transport === 'SFTP') {
    log.info('TEST_CONNECTION_SFTP', { feedId });
    return testSftpConnection(connectionParams, password, feedId);
  } else {
    log.info('TEST_CONNECTION_FTP', { feedId });
    return testFtpConnection(connectionParams, password, feedId);
  }
}

async function testSftpConnection(
  feed: { host: string | null; port: number | null; username: string | null; path: string | null },
  password: string,
  feedId: string
): Promise<{ success: boolean; error?: string; fileSize?: number; fileName?: string }> {
  const startTime = Date.now();
  log.info('SFTP_TEST_START', {
    feedId,
  });

  return new Promise((resolve) => {
    const conn = new SftpClient();
    const timeout = setTimeout(() => {
      const elapsed = Date.now() - startTime;
      log.error('SFTP_TIMEOUT', { elapsed, feedId });
      conn.end();
      resolve({ success: false, error: 'Connection timeout (10s)' });
    }, 10000);

    conn.on('ready', () => {
      const elapsed = Date.now() - startTime;
      log.info('SFTP_CONNECTED', { elapsed, feedId });

      conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (err) {
          const elapsed2 = Date.now() - startTime;
          log.error('SFTP_SESSION_ERROR', { elapsed: elapsed2, feedId, error: err.message });
          clearTimeout(timeout);
          conn.end();
          resolve({ success: false, error: `SFTP session error: ${err.message}` });
          return;
        }

        log.debug('SFTP_SESSION_READY', { feedId });

        sftp.stat(feed.path!, (statErr: Error | undefined, stats: FileEntry['attrs']) => {
          const elapsed3 = Date.now() - startTime;
          clearTimeout(timeout);
          conn.end();

          if (statErr) {
            log.error('SFTP_FILE_NOT_FOUND', { elapsed: elapsed3, feedId, error: statErr.message });
            resolve({ success: false, error: `File not found: ${feed.path}` });
            return;
          }

          log.info('SFTP_TEST_SUCCESS', {
            elapsed: elapsed3,
            fileSize: stats.size,
            feedId,
          });

          resolve({
            success: true,
            fileSize: stats.size,
            fileName: feed.path!.split('/').pop(),
          });
        });
      });
    });

    conn.on('error', (err: Error) => {
      const elapsed = Date.now() - startTime;
      log.error('SFTP_CONNECTION_ERROR', {
        elapsed,
        feedId,
        error: err.message,
        code: (err as NodeJS.ErrnoException).code,
      });
      clearTimeout(timeout);
      resolve({ success: false, error: `Connection error: ${err.message}` });
    });

    conn.on('keyboard-interactive', () => {
      log.debug('SFTP_KEYBOARD_INTERACTIVE', { feedId });
    });

    log.debug('SFTP_CONNECTING', { feedId });

    conn.connect({
      host: feed.host!,
      port: feed.port || 22,
      username: feed.username!,
      password,
      readyTimeout: 10000,
      debug: (msg: string) => log.debug('SFTP_DEBUG', { msg }),
    });
  });
}

async function testFtpConnection(
  feed: { host: string | null; port: number | null; username: string | null; path: string | null },
  password: string,
  feedId: string
): Promise<{ success: boolean; error?: string; fileSize?: number; fileName?: string }> {
  const startTime = Date.now();
  log.info('FTP_TEST_START', {
    feedId,
  });

  const client = new ftp.Client(30000); // 30s timeout
  client.ftp.verbose = true; // Enable verbose logging

  // Capture FTP library logs
  client.ftp.log = (msg: string) => {
    log.debug('FTP_PROTOCOL', { msg: msg.replace(/PASS .+/, 'PASS ***') });
  };

  try {
    log.debug('FTP_CONNECTING', { feedId });

    await client.access({
      host: feed.host!,
      port: feed.port || 21,
      user: feed.username!,
      password,
      secure: false,
    });

    const connectElapsed = Date.now() - startTime;
    log.info('FTP_CONNECTED', { elapsed: connectElapsed, feedId });

    log.debug('FTP_GETTING_SIZE', { feedId });
    const size = await client.size(feed.path!);

    const totalElapsed = Date.now() - startTime;
    log.info('FTP_TEST_SUCCESS', {
      elapsed: totalElapsed,
      fileSize: size,
      feedId,
    });

    return {
      success: true,
      fileSize: size,
      fileName: feed.path!.split('/').pop(),
    };
  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : 'Connection failed';
    const errorCode = (error as NodeJS.ErrnoException).code;

    log.error('FTP_TEST_ERROR', {
      elapsed,
      feedId,
      error: errorMsg,
      code: errorCode,
      stack: error instanceof Error ? error.stack : undefined,
    });

    return {
      success: false,
      error: errorMsg,
    };
  } finally {
    log.debug('FTP_CLOSING', { feedId });
    client.close();
  }
}
