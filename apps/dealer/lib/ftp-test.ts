/**
 * FTP/SFTP Test Helper
 *
 * Provides FTP and SFTP connection testing for the dealer feed test route.
 */

import * as ftp from 'basic-ftp'
import { Client as SftpClient, SFTPWrapper } from 'ssh2'
import { logger } from './logger'

/**
 * Parse an FTP/SFTP URL into its components
 */
interface FtpUrlParts {
  protocol: 'ftp' | 'sftp'
  host: string
  port: number
  path: string
  username?: string
  password?: string
}

function parseFtpUrl(url: string): FtpUrlParts {
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
 * Test FTP connection and fetch file
 */
async function testFtpConnection(
  url: string,
  username?: string,
  password?: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const parts = parseFtpUrl(url)
  const client = new ftp.Client()

  const user = username || parts.username || 'anonymous'
  const pass = password || parts.password || ''

  try {
    logger.debug('Testing FTP connection', { host: parts.host, port: parts.port })

    await client.access({
      host: parts.host,
      port: parts.port,
      user,
      password: pass,
      secure: false,
    })

    // Download to buffer
    const chunks: Buffer[] = []
    const { Writable } = await import('stream')
    const writable = new Writable({
      write(chunk: Buffer, encoding: string, callback: () => void) {
        chunks.push(chunk)
        callback()
      },
    })

    await client.downloadTo(writable, parts.path)

    const content = Buffer.concat(chunks).toString('utf-8')
    logger.debug('FTP test successful', { bytes: content.length })

    return { success: true, content }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    logger.warn('FTP test failed', { host: parts.host, error: message })
    return { success: false, error: message }
  } finally {
    client.close()
  }
}

/**
 * Test SFTP connection and fetch file
 */
async function testSftpConnection(
  url: string,
  username?: string,
  password?: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  const parts = parseFtpUrl(url)

  const user = username || parts.username
  const pass = password || parts.password

  if (!user) {
    return { success: false, error: 'SFTP requires a username' }
  }

  return new Promise((resolve) => {
    const conn = new SftpClient()
    let resolved = false

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true
        conn.end()
        resolve({ success: false, error: 'SFTP connection timeout' })
      }
    }, 15000)

    conn.on('ready', () => {
      logger.debug('SFTP connected', { host: parts.host })

      conn.sftp((err: Error | undefined, sftp: SFTPWrapper) => {
        if (err) {
          clearTimeout(timeout)
          resolved = true
          conn.end()
          resolve({ success: false, error: `SFTP session error: ${err.message}` })
          return
        }

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
          logger.debug('SFTP test successful', { bytes: content.length })
          resolve({ success: true, content })
        })

        readStream.on('error', (readErr: Error) => {
          clearTimeout(timeout)
          resolved = true
          conn.end()
          resolve({ success: false, error: `SFTP read error: ${readErr.message}` })
        })
      })
    })

    conn.on('error', (connErr: Error) => {
      clearTimeout(timeout)
      if (!resolved) {
        resolved = true
        logger.warn('SFTP test failed', { host: parts.host, error: connErr.message })
        resolve({ success: false, error: `SFTP connection error: ${connErr.message}` })
      }
    })

    logger.debug('Testing SFTP connection', { host: parts.host, port: parts.port })

    conn.connect({
      host: parts.host,
      port: parts.port,
      username: user,
      password: pass,
    })
  })
}

/**
 * Test FTP or SFTP connection based on access type
 */
export async function testFtpFeed(
  url: string,
  accessType: 'FTP' | 'SFTP',
  username?: string,
  password?: string
): Promise<{ success: boolean; content?: string; error?: string }> {
  if (accessType === 'SFTP') {
    return testSftpConnection(url, username, password)
  }
  return testFtpConnection(url, username, password)
}
