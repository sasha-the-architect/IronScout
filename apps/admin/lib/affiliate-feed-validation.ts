/**
 * Validation utilities for affiliate feed management
 * Per spec: expiryHours must be 1-168 (1 hour to 1 week)
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

export function validateExpiryHours(value: number): void {
  if (!Number.isInteger(value) || value < 1 || value > 168) {
    throw new ValidationError('expiryHours must be an integer between 1 and 168');
  }
}

export function validateScheduleFrequencyHours(value: number | null): void {
  if (value === null) return; // null means manual only
  if (!Number.isInteger(value) || value < 1 || value > 168) {
    throw new ValidationError('scheduleFrequencyHours must be an integer between 1 and 168');
  }
}

export function validateTransport(transport: string): void {
  if (!['FTP', 'SFTP'].includes(transport)) {
    throw new ValidationError('Transport must be FTP or SFTP');
  }
}

/**
 * Async validation for transport - checks database setting for plain FTP
 * Call this separately since it's async
 */
export async function validateTransportAsync(transport: string): Promise<void> {
  validateTransport(transport); // Basic validation first

  if (transport === 'FTP') {
    // Check env var first (for local dev override)
    if (process.env.AFFILIATE_FEED_ALLOW_PLAIN_FTP === 'true') {
      return;
    }

    // Check database setting
    const { prisma } = await import('@ironscout/db');
    const setting = await prisma.systemSetting.findUnique({
      where: { key: 'AFFILIATE_FEED_ALLOW_PLAIN_FTP' },
    });

    if (!setting || setting.value !== true) {
      throw new ValidationError('Plain FTP is disabled in this environment. Use SFTP instead.');
    }
  }
}

export function validatePort(port: number | null, transport: string): void {
  if (port === null) return; // null means use default
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new ValidationError('Port must be an integer between 1 and 65535');
  }
  // Warn if using non-standard ports
  const defaultPort = transport === 'FTP' ? 21 : 22;
  if (port !== defaultPort) {
    // This is just informational, not an error
  }
}

export function validateHost(host: string | null): void {
  if (!host) return;
  // Basic hostname validation
  const hostRegex = /^[a-zA-Z0-9][a-zA-Z0-9.-]*[a-zA-Z0-9]$|^[a-zA-Z0-9]$/;
  if (!hostRegex.test(host)) {
    throw new ValidationError('Invalid hostname format');
  }
}

export function validatePath(path: string | null): void {
  if (!path) return;
  // Must start with /
  if (!path.startsWith('/')) {
    throw new ValidationError('Path must start with /');
  }
  // No path traversal
  if (path.includes('..')) {
    throw new ValidationError('Path cannot contain ".."');
  }
}

export function validateNetwork(network: string): void {
  // v1 only supports IMPACT
  if (network !== 'IMPACT') {
    throw new ValidationError('Only IMPACT network is supported in v1');
  }
}

export function validateFormat(format: string): void {
  // v1 only supports CSV. TSV/XML/JSON are post-v1.
  if (format !== 'CSV') {
    throw new ValidationError('Only CSV format is supported in v1');
  }
}

export function validateCompression(compression: string): void {
  if (!['NONE', 'GZIP'].includes(compression)) {
    throw new ValidationError('Compression must be NONE or GZIP');
  }
}

export function validateMaxFileSizeBytes(value: bigint | null): void {
  if (value === null) return;
  const maxAllowed = BigInt(500 * 1024 * 1024); // 500 MB
  if (value < 0 || value > maxAllowed) {
    throw new ValidationError('maxFileSizeBytes must be between 0 and 500 MB');
  }
}

export function validateMaxRowCount(value: number | null): void {
  if (value === null) return;
  if (!Number.isInteger(value) || value < 0 || value > 500000) {
    throw new ValidationError('maxRowCount must be between 0 and 500,000');
  }
}
