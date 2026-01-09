/**
 * FTP/SFTP Feed Fetcher
 *
 * Provides FTP and SFTP feed fetching capabilities for retailer feeds.
 * Uses basic-ftp for FTP and ssh2 for SFTP connections.
 */

import * as ftp from 'basic-ftp'
import { Client as SftpClient, SFTPWrapper } from 'ssh2'
import { Readable } from 'stream'
import { logger } from '../config/logger'

const log = logger.merchant

/**
 * Parse an FTP/SFTP URL into its components
 * Expected format: ftp://user:password@host:port/path/to/file.csv
 * or: ftp://host:port/path/to/file.csv (credentials provided separately)
 */
export interface FtpUrlParts {
  protocol: 'ftp' | 'sftp'
  host: string
  port: number
  path: string
  username?: string
  password?: string
}

export function parseFtpUrl(url: string): FtpUrlParts {
  const urlObj = new URL(url)

  const protocol = urlObj.protocol.replace(':', '') as 'ftp' | 'sftp'
  if (protocol !== 'ftp' && protocol !== 'sftp') {
    throw new Error(`Unsupported protocol: ${urlObj.protocol}`)
  }

  const defaultPort = protocol === 'sftp' ? 22 : 21

  return {
    protocol,
    host: urlObj.hostname,
    port: urlObj.port ? parseInt(urlObj.port, 10) : defaultPort,
    path: urlObj.pathname || '/',
    username: urlObj.username || undefined,
    password: urlObj.password || undefined,
  }
}

/**
 * Fetch a file via FTP
 */
export async function fetchViaFtp(
  url: string,
  username?: string,
  password?: string
): Promise<string> {
  const parts = parseFtpUrl(url)
  const client = new ftp.Client()

  // Override URL credentials with provided ones
  const user = username || parts.username || 'anonymous'
  const pass = password || parts.password || ''

  try {
    log.info('Connecting to FTP server', { host: parts.host, port: parts.port })

    await client.access({
      host: parts.host,
      port: parts.port,
      user,
      password: pass,
      secure: false,
    })

    log.info('FTP connected, downloading file', { path: parts.path })

    // Download to a buffer
    const chunks: Buffer[] = []
    const writable = new (require('stream').Writable)({
      write(chunk: Buffer, encoding: string, callback: () => void) {
        chunks.push(chunk)
        callback()
      },
    })

    await client.downloadTo(writable, parts.path)

    const content = Buffer.concat(chunks).toString('utf-8')
    log.info('FTP download complete', { bytes: content.length })

    return content
  } catch (error) {
    log.error('FTP fetch error', { host: parts.host, path: parts.path }, error as Error)
    throw new Error(`FTP fetch failed: ${error instanceof Error ? error.message : String(error)}`)
  } finally {
    client.close()
  }
}

/**
 * Fetch a file via SFTP
 */
export async function fetchViaSftp(
  url: string,
  username?: string,
  password?: string
): Promise<string> {
  const parts = parseFtpUrl(url)

  // Override URL credentials with provided ones
  const user = username || parts.username
  const pass = password || parts.password

  if (!user) {
    throw new Error('SFTP requires a username')
  }

  return new Promise((resolve, reject) => {
    const conn = new SftpClient()
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        conn.end()
        reject(new Error('SFTP connection timeout'))
      }
    }, 30000)

    conn.on('ready', () => {
      log.info('SFTP connected, opening SFTP session', { host: parts.host })

      conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (err) {
          clearTimeout(timeout)
          resolved = true
          conn.end()
          reject(new Error(`SFTP session error: ${err.message}`))
          return
        }

        log.info('SFTP session open, downloading file', { path: parts.path })

        const readStream = sftp.createReadStream(parts.path)
        const chunks: Buffer[] = []

        readStream.on('data', (chunk: Buffer) => {
          chunks.push(chunk)
        })

        readStream.on('end', () => {
          clearTimeout(timeout)
          resolved = true
          conn.end()
          const content = Buffer.concat(chunks).toString('utf-8')
          log.info('SFTP download complete', { bytes: content.length })
          resolve(content)
        })

        readStream.on('error', (readErr: Error) => {
          clearTimeout(timeout)
          resolved = true
          conn.end()
          reject(new Error(`SFTP read error: ${readErr.message}`))
        })
      })
    })

    conn.on('error', (connErr: Error) => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        log.error('SFTP connection error', { host: parts.host }, connErr)
        reject(new Error(`SFTP connection error: ${connErr.message}`))
      }
    })

    log.info('Connecting to SFTP server', { host: parts.host, port: parts.port })

    conn.connect({
      host: parts.host,
      port: parts.port,
      username: user,
      password: pass,
    })
  })
}

/**
 * Fetch feed content via FTP or SFTP based on access type
 */
export async function fetchFeedViaFtp(
  url: string,
  accessType: 'FTP' | 'SFTP',
  username?: string,
  password?: string
): Promise<string> {
  if (accessType === 'SFTP') {
    return fetchViaSftp(url, username, password)
  }
  return fetchViaFtp(url, username, password)
}
