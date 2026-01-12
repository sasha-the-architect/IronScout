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
import { isPlainFtpAllowed } from '@ironscout/db'
import { logger } from '../config/logger'
import type { AffiliateFeed, DownloadResult } from './types'

const log = logger.affiliate

// Default limits
const DEFAULT_MAX_FILE_SIZE = 500 * 1024 * 1024 // 500 MB

/**
 * Download feed file with change detection
 */
export async function downloadFeed(feed: AffiliateFeed): Promise<DownloadResult> {
  const feedLog = log.child({ feedId: feed.id })

  feedLog.debug('DOWNLOAD_START', {
    phase: 'init',
    transport: feed.transport,
    host: feed.host,
    port: feed.port ?? (feed.transport === 'SFTP' ? 22 : 21),
    path: feed.path,
    compression: feed.compression,
    hasCredentials: !!feed.secretCiphertext,
    hasLastMtime: !!feed.lastRemoteMtime,
    hasLastSize: !!feed.lastRemoteSize,
    hasLastHash: !!feed.lastContentHash,
  })

  // Decrypt credentials
  if (!feed.secretCiphertext) {
    feedLog.error('DOWNLOAD_NO_CREDENTIALS', {
      phase: 'auth',
      reason: 'Feed credentials not configured',
      hasSecretCiphertext: false,
      hint: 'Was CREDENTIAL_ENCRYPTION_KEY_B64 set in admin .env when feed was created?',
    })
    throw new Error('Feed credentials not configured - re-save the feed credentials in admin.')
  }

  feedLog.debug('DOWNLOAD_DECRYPTING_CREDENTIALS', {
    phase: 'auth',
    hasKeyId: !!feed.secretKeyId,
  })

  let password: string
  const decryptStart = Date.now()
  try {
    password = decryptSecret(
      Buffer.from(feed.secretCiphertext),
      feed.secretKeyId || undefined  // AAD (for future KMS migration)
    )
    feedLog.debug('DOWNLOAD_CREDENTIALS_DECRYPTED', {
      phase: 'auth',
      durationMs: Date.now() - decryptStart,
    })
  } catch (err) {
    feedLog.error('DOWNLOAD_DECRYPT_FAILED', {
      phase: 'auth',
      errorMessage: err instanceof Error ? err.message : String(err),
      hint: 'Is CREDENTIAL_ENCRYPTION_KEY_B64 the same in admin and harvester?',
    })
    throw new Error(`Failed to decrypt feed credentials: ${err instanceof Error ? err.message : String(err)}`)
  }

  const maxFileSize = feed.maxFileSizeBytes
    ? Number(feed.maxFileSizeBytes)
    : DEFAULT_MAX_FILE_SIZE

  feedLog.debug('DOWNLOAD_CONFIG', {
    phase: 'config',
    maxFileSizeBytes: maxFileSize,
    maxFileSizeMB: Math.round(maxFileSize / 1024 / 1024),
    lastRemoteMtime: feed.lastRemoteMtime?.toISOString(),
    lastRemoteSize: feed.lastRemoteSize?.toString(),
    lastContentHashPrefix: feed.lastContentHash?.slice(0, 16),
    changeDetectionEnabled: !!(feed.lastRemoteMtime || feed.lastRemoteSize || feed.lastContentHash),
  })

  const downloadStart = Date.now()
  let result: DownloadResult

  if (feed.transport === 'SFTP') {
    feedLog.debug('DOWNLOAD_TRANSPORT_SELECTED', {
      phase: 'connect',
      transport: 'SFTP',
      host: feed.host,
      port: feed.port || 22,
    })
    result = await downloadViaSftp(feed, password, maxFileSize, feedLog)
  } else {
    feedLog.debug('DOWNLOAD_TRANSPORT_SELECTED', {
      phase: 'connect',
      transport: 'FTP',
      host: feed.host,
      port: feed.port || 21,
    })
    result = await downloadViaFtp(feed, password, maxFileSize, feedLog)
  }

  const downloadDuration = Date.now() - downloadStart

  if (result.skipped) {
    feedLog.info('DOWNLOAD_SKIPPED', {
      phase: 'complete',
      durationMs: downloadDuration,
      skippedReason: result.skippedReason,
      changeDetectionMethod: result.skippedReason === 'UNCHANGED_MTIME' ? 'mtime_size' : 'content_hash',
    })
  } else {
    feedLog.info('DOWNLOAD_COMPLETE', {
      phase: 'complete',
      durationMs: downloadDuration,
      contentBytes: result.content.length,
      contentMB: (result.content.length / 1024 / 1024).toFixed(2),
      contentHashPrefix: result.contentHash?.slice(0, 16),
      compressionApplied: feed.compression === 'GZIP',
      throughputMBps: downloadDuration > 0 ? ((result.content.length / 1024 / 1024) / (downloadDuration / 1000)).toFixed(2) : null,
    })
  }

  return result
}

/**
 * Download via SFTP with change detection
 */
async function downloadViaSftp(
  feed: AffiliateFeed,
  password: string,
  maxFileSize: number,
  feedLog: typeof log
): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    const conn = new SftpClient()
    let resolved = false
    const connectStart = Date.now()

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        conn.end()
        feedLog.error('SFTP_TIMEOUT', {
          phase: 'connect',
          timeoutMs: 30000,
          host: feed.host,
        })
        reject(new Error('SFTP connection timeout (30s)'))
      }
    }, 30000)

    conn.on('ready', () => {
      const connectDurationMs = Date.now() - connectStart
      feedLog.info('SFTP_CONNECTED', {
        phase: 'connect',
        host: feed.host,
        port: feed.port || 22,
        connectDurationMs,
      })

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
            // FILE_NOT_FOUND is an expected condition (file not yet published, being regenerated)
            // Return as skip instead of error to avoid failure cascade
            feedLog.warn('SFTP_FILE_NOT_FOUND', {
              event_name: 'SFTP_FILE_NOT_FOUND',
              phase: 'stat',
              path: feed.path,
              errorMessage: statErr.message,
              action: 'skip_run',
            })
            resolve({
              content: Buffer.alloc(0),
              mtime: null,
              size: BigInt(0),
              contentHash: '',
              skipped: true,
              skippedReason: 'FILE_NOT_FOUND',
            })
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

          feedLog.debug('SFTP_FILE_STATS', {
            phase: 'stat',
            path: feed.path,
            remoteMtime: remoteMtime?.toISOString(),
            remoteSize: remoteSize.toString(),
            remoteSizeMB: (Number(remoteSize) / 1024 / 1024).toFixed(2),
            lastMtime: feed.lastRemoteMtime?.toISOString(),
            lastSize: feed.lastRemoteSize?.toString(),
          })

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
            feedLog.debug('SFTP_CHANGE_DETECTION_SKIP', {
              phase: 'change_detection',
              reason: 'mtime_and_size_unchanged',
              remoteMtime: remoteMtime.toISOString(),
              remoteSize: remoteSize.toString(),
            })
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
          const downloadStart = Date.now()
          feedLog.info('SFTP_DOWNLOAD_START', {
            phase: 'download',
            path: feed.path,
            sizeBytes: remoteSize.toString(),
            sizeMB: (Number(remoteSize) / 1024 / 1024).toFixed(2),
          })
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

            const downloadDurationMs = Date.now() - downloadStart
            feedLog.debug('SFTP_DOWNLOAD_COMPLETE', {
              phase: 'download',
              downloadedBytes,
              downloadDurationMs,
              throughputMBps: downloadDurationMs > 0 ? ((downloadedBytes / 1024 / 1024) / (downloadDurationMs / 1000)).toFixed(2) : null,
            })

            let content = Buffer.concat(chunks)

            // Decompress if needed
            if (feed.compression === 'GZIP') {
              const decompressStart = Date.now()
              try {
                const compressedSize = content.length
                content = gunzipSync(content)
                const decompressDurationMs = Date.now() - decompressStart
                feedLog.debug('SFTP_GZIP_DECOMPRESSED', {
                  phase: 'decompress',
                  compressedBytes: compressedSize,
                  decompressedBytes: content.length,
                  compressionRatio: (compressedSize / content.length).toFixed(3),
                  durationMs: decompressDurationMs,
                })
              } catch (gzipErr) {
                feedLog.error('SFTP_GZIP_FAILED', {
                  phase: 'decompress',
                  errorMessage: (gzipErr as Error).message,
                  compressedBytes: content.length,
                })
                reject(new Error(`GZIP decompression failed: ${(gzipErr as Error).message}`))
                return
              }
            }

            // Compute content hash
            const hashStart = Date.now()
            const contentHash = createHash('sha256').update(content).digest('hex')
            feedLog.debug('SFTP_CONTENT_HASH_COMPUTED', {
              phase: 'hash',
              contentBytes: content.length,
              hashPrefix: contentHash.slice(0, 16),
              durationMs: Date.now() - hashStart,
            })

            // Check if content unchanged
            if (feed.lastContentHash && contentHash === feed.lastContentHash) {
              feedLog.info('SFTP_UNCHANGED_HASH', {
                phase: 'change_detection',
                reason: 'content_hash_unchanged',
                hashPrefix: contentHash.slice(0, 16),
                contentBytes: content.length,
              })
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

            feedLog.debug('SFTP_DOWNLOAD_SUCCESS', {
              phase: 'complete',
              contentBytes: content.length,
              hashPrefix: contentHash.slice(0, 16),
              isNewContent: !feed.lastContentHash,
              hashChanged: feed.lastContentHash ? 'yes' : 'first_download',
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
            feedLog.error('SFTP_READ_ERROR', {
              phase: 'download',
              errorMessage: readErr.message,
              downloadedBytes,
              path: feed.path,
            })
            reject(new Error(`SFTP read error: ${readErr.message}`))
          })
        })
      })
    })

    conn.on('error', (connErr: Error) => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        feedLog.error('SFTP_CONNECTION_ERROR', {
          phase: 'connect',
          host: feed.host,
          port: feed.port || 22,
          errorMessage: connErr.message,
          errorName: connErr.name,
        })
        reject(new Error(`SFTP connection error: ${connErr.message}`))
      }
    })

    feedLog.debug('SFTP_CONNECTING', {
      phase: 'connect',
      host: feed.host,
      port: feed.port || 22,
      username: feed.username,
      readyTimeoutMs: 30000,
    })

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
  maxFileSize: number,
  feedLog: typeof log
): Promise<DownloadResult> {
  // Check if FTP is allowed (database setting with env var fallback)
  feedLog.debug('FTP_CHECKING_ALLOWED', { phase: 'init' })
  const ftpAllowed = await isPlainFtpAllowed()
  if (!ftpAllowed) {
    feedLog.warn('FTP_DISABLED', {
      phase: 'init',
      reason: 'Plain FTP disabled in settings',
      hint: 'Enable via admin settings or use SFTP',
    })
    throw new Error('Plain FTP is disabled. Use SFTP instead or enable via admin settings.')
  }

  const client = new ftp.Client()
  client.ftp.verbose = false

  const connectStart = Date.now()
  try {
    feedLog.debug('FTP_CONNECTING', {
      phase: 'connect',
      host: feed.host,
      port: feed.port || 21,
      username: feed.username,
    })

    await client.access({
      host: feed.host!,
      port: feed.port || 21,
      user: feed.username!,
      password,
      secure: false,
    })

    const connectDurationMs = Date.now() - connectStart
    feedLog.info('FTP_CONNECTED', {
      phase: 'connect',
      host: feed.host,
      port: feed.port || 21,
      connectDurationMs,
    })

    // Get file size for change detection (FTP doesn't reliably provide mtime)
    feedLog.debug('FTP_GETTING_SIZE', { phase: 'stat', path: feed.path })
    const sizeStart = Date.now()
    const remoteSize = await client.size(feed.path!)
    feedLog.debug('FTP_FILE_SIZE', {
      phase: 'stat',
      path: feed.path,
      remoteSize,
      remoteSizeMB: (remoteSize / 1024 / 1024).toFixed(2),
      durationMs: Date.now() - sizeStart,
      lastSize: feed.lastRemoteSize?.toString(),
    })

    if (remoteSize > maxFileSize) {
      feedLog.error('FTP_FILE_TOO_LARGE', {
        phase: 'stat',
        remoteSize,
        maxFileSize,
        remoteSizeMB: (remoteSize / 1024 / 1024).toFixed(2),
        maxFileSizeMB: (maxFileSize / 1024 / 1024).toFixed(2),
      })
      throw new Error(`File size ${remoteSize} exceeds limit ${maxFileSize}`)
    }

    // Check if size matches (less reliable than SFTP mtime check)
    const sizeMatches = feed.lastRemoteSize && BigInt(remoteSize) === feed.lastRemoteSize && feed.lastContentHash
    feedLog.debug('FTP_SIZE_CHECK', {
      phase: 'change_detection',
      sizeMatches,
      reason: 'FTP_mtime_unreliable_must_download_and_hash',
    })

    // Download the file
    feedLog.info('FTP_DOWNLOAD_START', {
      phase: 'download',
      path: feed.path,
      sizeBytes: remoteSize,
      sizeMB: (remoteSize / 1024 / 1024).toFixed(2),
    })

    const downloadStart = Date.now()
    const chunks: Buffer[] = []
    let downloadedBytes = 0
    const { Writable } = await import('stream')

    const writable = new Writable({
      write(chunk: Buffer, _encoding: string, callback: () => void) {
        downloadedBytes += chunk.length
        chunks.push(chunk)
        callback()
      },
    })

    await client.downloadTo(writable, feed.path!)

    const downloadDurationMs = Date.now() - downloadStart
    feedLog.debug('FTP_DOWNLOAD_COMPLETE', {
      phase: 'download',
      downloadedBytes,
      downloadDurationMs,
      throughputMBps: downloadDurationMs > 0 ? ((downloadedBytes / 1024 / 1024) / (downloadDurationMs / 1000)).toFixed(2) : null,
    })

    let content = Buffer.concat(chunks)

    // Decompress if needed
    if (feed.compression === 'GZIP') {
      const decompressStart = Date.now()
      try {
        const compressedSize = content.length
        content = gunzipSync(content)
        const decompressDurationMs = Date.now() - decompressStart
        feedLog.debug('FTP_GZIP_DECOMPRESSED', {
          phase: 'decompress',
          compressedBytes: compressedSize,
          decompressedBytes: content.length,
          compressionRatio: (compressedSize / content.length).toFixed(3),
          durationMs: decompressDurationMs,
        })
      } catch (gzipErr) {
        feedLog.error('FTP_GZIP_FAILED', {
          phase: 'decompress',
          errorMessage: (gzipErr as Error).message,
          compressedBytes: content.length,
        })
        throw new Error(`GZIP decompression failed: ${(gzipErr as Error).message}`)
      }
    }

    // Compute content hash
    const hashStart = Date.now()
    const contentHash = createHash('sha256').update(content).digest('hex')
    feedLog.debug('FTP_CONTENT_HASH_COMPUTED', {
      phase: 'hash',
      contentBytes: content.length,
      hashPrefix: contentHash.slice(0, 16),
      durationMs: Date.now() - hashStart,
    })

    // Check if content unchanged
    if (feed.lastContentHash && contentHash === feed.lastContentHash) {
      feedLog.info('FTP_UNCHANGED_HASH', {
        phase: 'change_detection',
        reason: 'content_hash_unchanged',
        hashPrefix: contentHash.slice(0, 16),
        contentBytes: content.length,
      })
      return {
        content,
        mtime: null, // FTP doesn't provide reliable mtime
        size: BigInt(remoteSize),
        contentHash,
        skipped: true,
        skippedReason: 'UNCHANGED_HASH',
      }
    }

    feedLog.debug('FTP_DOWNLOAD_SUCCESS', {
      phase: 'complete',
      contentBytes: content.length,
      hashPrefix: contentHash.slice(0, 16),
      isNewContent: !feed.lastContentHash,
      hashChanged: feed.lastContentHash ? 'yes' : 'first_download',
    })

    return {
      content,
      mtime: null,
      size: BigInt(remoteSize),
      contentHash,
      skipped: false,
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    const errorMessageLower = errorMessage.toLowerCase()

    // Detect file-not-found errors (FTP 550, "no such file", etc.)
    // Return as skip instead of error to avoid failure cascade
    const isFileNotFound =
      errorMessageLower.includes('550') ||
      errorMessageLower.includes('no such file') ||
      errorMessageLower.includes('not found') ||
      errorMessageLower.includes('does not exist')

    if (isFileNotFound) {
      feedLog.warn('FTP_FILE_NOT_FOUND', {
        event_name: 'FTP_FILE_NOT_FOUND',
        phase: 'stat',
        path: feed.path,
        errorMessage,
        action: 'skip_run',
      })
      return {
        content: Buffer.alloc(0),
        mtime: null,
        size: BigInt(0),
        contentHash: '',
        skipped: true,
        skippedReason: 'FILE_NOT_FOUND',
      }
    }

    feedLog.error('FTP_ERROR', {
      event_name: 'FTP_ERROR',
      phase: 'error',
      errorMessage,
      errorName: err instanceof Error ? err.name : 'Unknown',
      host: feed.host,
      path: feed.path,
    })
    throw err
  } finally {
    feedLog.debug('FTP_DISCONNECTING', { phase: 'cleanup' })
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
    if (!feed.secretCiphertext) {
      return { success: false, error: 'Feed credentials not configured - re-save credentials in admin' }
    }

    const password = decryptSecret(
      Buffer.from(feed.secretCiphertext),
      feed.secretKeyId || undefined  // AAD (for future KMS migration)
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
  const ftpAllowed = await isPlainFtpAllowed()
  if (!ftpAllowed) {
    return { success: false, error: 'Plain FTP is disabled. Enable via admin settings.' }
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
