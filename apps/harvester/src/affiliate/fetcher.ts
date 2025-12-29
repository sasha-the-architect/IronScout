/**
 * Affiliate Feed Fetcher
 *
 * Downloads feed files via FTP/SFTP with change detection.
 * Per spec Section 8.2: Detect unchanged files via mtime/size and content hash.
 */

import * as ftp from 'basic-ftp'
import { Client as SftpClient, SFTPWrapper, FileEntry } from 'ssh2'
import { createHash } from 'crypto'
import { gunzipSync } from 'zlib'
import { decryptSecret } from '@ironscout/crypto'
import { logger } from '../config/logger'
import type { AffiliateFeed, DownloadResult } from './types'

const log = logger.affiliate

// Default limits
const DEFAULT_MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB

/**
 * Download feed file with change detection
 */
export async function downloadFeed(feed: AffiliateFeed): Promise<DownloadResult> {
  // Decrypt credentials
  if (!feed.secretCiphertext || !feed.secretKeyId) {
    throw new Error('Feed credentials not configured')
  }

  const password = decryptSecret(
    Buffer.from(feed.secretCiphertext),
    feed.secretKeyId || undefined  // AAD (Additional Authenticated Data)
  )

  const maxFileSize = feed.maxFileSizeBytes
    ? Number(feed.maxFileSizeBytes)
    : DEFAULT_MAX_FILE_SIZE

  if (feed.transport === 'SFTP') {
    return downloadViaSftp(feed, password, maxFileSize)
  } else {
    return downloadViaFtp(feed, password, maxFileSize)
  }
}

/**
 * Download via SFTP with change detection
 */
async function downloadViaSftp(
  feed: AffiliateFeed,
  password: string,
  maxFileSize: number
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    const conn = new SftpClient()
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        conn.end()
        reject(new Error('SFTP connection timeout (30s)'))
      }
    }, 30000)

    conn.on('ready', () => {
      log.info('SFTP connected', { host: feed.host, feedId: feed.id })

      conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (err) {
          clearTimeout(timeout)
          resolved = true
          conn.end()
          reject(new Error(`SFTP session error: ${err.message}`))
          return
        }

        // Get file stats for change detection
        sftp.stat(feed.path!, (statErr: Error | undefined, stats: FileEntry['attrs']) => {
          if (statErr) {
            clearTimeout(timeout)
            resolved = true
            conn.end()
            reject(new Error(`File not found: ${feed.path}`))
            return
          }

          const remoteMtime = stats.mtime ? new Date(stats.mtime * 1000) : null
          const remoteSize = BigInt(stats.size || 0)

          // Check if file exceeds size limit
          if (remoteSize > BigInt(maxFileSize)) {
            clearTimeout(timeout)
            resolved = true
            conn.end()
            reject(new Error(`File size ${remoteSize} exceeds limit ${maxFileSize}`))
            return
          }

          // Check for unchanged file (mtime + size)
          if (
            feed.lastRemoteMtime &&
            feed.lastRemoteSize &&
            remoteMtime &&
            remoteMtime.getTime() === feed.lastRemoteMtime.getTime() &&
            remoteSize === feed.lastRemoteSize
          ) {
            clearTimeout(timeout)
            resolved = true
            conn.end()
            log.info('File unchanged (mtime+size match)', { feedId: feed.id })
            resolve({
              content: Buffer.alloc(0),
              mtime: remoteMtime,
              size: remoteSize,
              contentHash: feed.lastContentHash || '',
              skipped: true,
              skippedReason: 'UNCHANGED_MTIME',
            })
            return
          }

          // Download the file
          log.info('Downloading file', { path: feed.path, size: remoteSize.toString() })
          const readStream = sftp.createReadStream(feed.path!)
          const chunks: Buffer[] = []
          let downloadedBytes = 0

          readStream.on('data', (chunk: Buffer) => {
            downloadedBytes += chunk.length
            if (downloadedBytes > maxFileSize) {
              readStream.destroy()
              clearTimeout(timeout)
              resolved = true
              conn.end()
              reject(new Error(`Download exceeded max file size: ${maxFileSize}`))
              return
            }
            chunks.push(chunk)
          })

          readStream.on('end', () => {
            clearTimeout(timeout)
            resolved = true
            conn.end()

            let content = Buffer.concat(chunks)

            // Decompress if needed
            if (feed.compression === 'GZIP') {
              try {
                content = gunzipSync(content)
                log.debug('Decompressed GZIP content', {
                  compressed: downloadedBytes,
                  decompressed: content.length,
                })
              } catch (gzipErr) {
                reject(new Error(`GZIP decompression failed: ${(gzipErr as Error).message}`))
                return
              }
            }

            // Compute content hash
            const contentHash = createHash('sha256').update(content).digest('hex')

            // Check if content unchanged
            if (feed.lastContentHash && contentHash === feed.lastContentHash) {
              log.info('File unchanged (content hash match)', { feedId: feed.id })
              resolve({
                content,
                mtime: remoteMtime,
                size: remoteSize,
                contentHash,
                skipped: true,
                skippedReason: 'UNCHANGED_HASH',
              })
              return
            }

            log.info('Download complete', {
              feedId: feed.id,
              bytes: content.length,
              hash: contentHash.slice(0, 16),
            })

            resolve({
              content,
              mtime: remoteMtime,
              size: remoteSize,
              contentHash,
              skipped: false,
            })
          })

          readStream.on('error', (readErr: Error) => {
            clearTimeout(timeout)
            resolved = true
            conn.end()
            reject(new Error(`SFTP read error: ${readErr.message}`))
          })
        })
      })
    })

    conn.on('error', (connErr: Error) => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        log.error('SFTP connection error', { host: feed.host }, connErr)
        reject(new Error(`SFTP connection error: ${connErr.message}`))
      }
    })

    log.info('Connecting to SFTP server', { host: feed.host, port: feed.port })

    conn.connect({
      host: feed.host!,
      port: feed.port || 22,
      username: feed.username!,
      password,
      readyTimeout: 30000,
    })
  })
}

/**
 * Download via FTP with change detection
 */
async function downloadViaFtp(
  feed: AffiliateFeed,
  password: string,
  maxFileSize: number
): Promise<DownloadResult> {
  // Check if FTP is allowed
  if (process.env.AFFILIATE_FEED_ALLOW_PLAIN_FTP !== 'true') {
    throw new Error('Plain FTP is disabled. Use SFTP instead.')
  }

  const client = new ftp.Client()
  client.ftp.verbose = false

  try {
    log.info('Connecting to FTP server', { host: feed.host, port: feed.port })

    await client.access({
      host: feed.host!,
      port: feed.port || 21,
      user: feed.username!,
      password,
      secure: false,
    })

    // Get file size for change detection (FTP doesn't reliably provide mtime)
    const remoteSize = await client.size(feed.path!)

    if (remoteSize > maxFileSize) {
      throw new Error(`File size ${remoteSize} exceeds limit ${maxFileSize}`)
    }

    // Check if size matches (less reliable than SFTP mtime check)
    if (
      feed.lastRemoteSize &&
      BigInt(remoteSize) === feed.lastRemoteSize &&
      feed.lastContentHash
    ) {
      // Size matches - still need to download and check hash
      // (FTP mtime is unreliable, so we can't skip based on size alone)
    }

    // Download the file
    log.info('Downloading file', { path: feed.path, size: remoteSize })

    const chunks: Buffer[] = []
    const { Writable } = await import('stream')

    const writable = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        chunks.push(chunk)
        callback()
      },
    })

    await client.downloadTo(writable, feed.path!)

    let content = Buffer.concat(chunks)

    // Decompress if needed
    if (feed.compression === 'GZIP') {
      try {
        content = gunzipSync(content)
        log.debug('Decompressed GZIP content', {
          compressed: chunks.reduce((a, b) => a + b.length, 0),
          decompressed: content.length,
        })
      } catch (gzipErr) {
        throw new Error(`GZIP decompression failed: ${(gzipErr as Error).message}`)
      }
    }

    // Compute content hash
    const contentHash = createHash('sha256').update(content).digest('hex')

    // Check if content unchanged
    if (feed.lastContentHash && contentHash === feed.lastContentHash) {
      log.info('File unchanged (content hash match)', { feedId: feed.id })
      return {
        content,
        mtime: null, // FTP doesn't provide reliable mtime
        size: BigInt(remoteSize),
        contentHash,
        skipped: true,
        skippedReason: 'UNCHANGED_HASH',
      }
    }

    log.info('Download complete', {
      feedId: feed.id,
      bytes: content.length,
      hash: contentHash.slice(0, 16),
    })

    return {
      content,
      mtime: null,
      size: BigInt(remoteSize),
      contentHash,
      skipped: false,
    }
  } finally {
    client.close()
  }
}

/**
 * Test connection to feed server
 * Used by admin UI to validate credentials
 */
export async function testConnection(feed: AffiliateFeed): Promise<{
  success: boolean
  error?: string
  fileSize?: number
  fileName?: string
}> {
  try {
    if (!feed.secretCiphertext || !feed.secretKeyId) {
      return { success: false, error: 'Feed credentials not configured' }
    }

    const password = decryptSecret(
      Buffer.from(feed.secretCiphertext),
      feed.secretKeyId || undefined  // AAD (Additional Authenticated Data)
    )

    if (feed.transport === 'SFTP') {
      return await testSftpConnection(feed, password)
    } else {
      return await testFtpConnection(feed, password)
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}

async function testSftpConnection(
  feed: AffiliateFeed,
  password: string
): Promise<{ success: boolean; error?: string; fileSize?: number; fileName?: string }> {
  return new Promise((resolve) => {
    const conn = new SftpClient()
    const timeout = setTimeout(() => {
      conn.end()
      resolve({ success: false, error: 'Connection timeout' })
    }, 10000)

    conn.on('ready', () => {
      conn.sftp((err, sftp) => {
        if (err) {
          clearTimeout(timeout)
          conn.end()
          resolve({ success: false, error: `SFTP session error: ${err.message}` })
          return
        }

        sftp.stat(feed.path!, (statErr, stats) => {
          clearTimeout(timeout)
          conn.end()

          if (statErr) {
            resolve({ success: false, error: `File not found: ${feed.path}` })
            return
          }

          resolve({
            success: true,
            fileSize: stats.size,
            fileName: feed.path!.split('/').pop(),
          })
        })
      })
    })

    conn.on('error', (err) => {
      clearTimeout(timeout)
      resolve({ success: false, error: `Connection error: ${err.message}` })
    })

    conn.connect({
      host: feed.host!,
      port: feed.port || 22,
      username: feed.username!,
      password,
      readyTimeout: 10000,
    })
  })
}

async function testFtpConnection(
  feed: AffiliateFeed,
  password: string
): Promise<{ success: boolean; error?: string; fileSize?: number; fileName?: string }> {
  if (process.env.AFFILIATE_FEED_ALLOW_PLAIN_FTP !== 'true') {
    return { success: false, error: 'Plain FTP is disabled' }
  }

  const client = new ftp.Client()
  client.ftp.verbose = false

  try {
    await client.access({
      host: feed.host!,
      port: feed.port || 21,
      user: feed.username!,
      password,
      secure: false,
    })

    const size = await client.size(feed.path!)

    return {
      success: true,
      fileSize: size,
      fileName: feed.path!.split('/').pop(),
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    }
  } finally {
    client.close()
  }
}
