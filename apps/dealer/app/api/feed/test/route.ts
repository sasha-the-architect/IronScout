import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { logger } from '@/lib/logger';
import { testFtpFeed } from '@/lib/ftp-test';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

/**
 * Test feed connection
 * This is a simplified test - in production, you'd actually fetch and parse the feed
 */
export async function POST(request: Request) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/feed/test' });
  
  reqLogger.info('Feed test request received');
  
  try {
    const session = await getSession();
    
    if (!session || session.type !== 'dealer') {
      reqLogger.warn('Unauthorized feed test attempt');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    reqLogger.debug('Session verified', { dealerId: session.dealerId });

    let body: { accessType?: string; url?: string; username?: string; password?: string };
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { accessType, url, username, password } = body;

    reqLogger.debug('Testing feed connection', { accessType, hasUrl: !!url });

    if (!url) {
      reqLogger.warn('Feed test failed - URL required');
      return NextResponse.json(
        { error: 'URL is required' },
        { status: 400 }
      );
    }

    // Handle FTP/SFTP connections
    if (accessType === 'FTP' || accessType === 'SFTP') {
      try {
        const result = await testFtpFeed(url, accessType, username, password);

        if (!result.success) {
          reqLogger.warn('FTP/SFTP test failed', { url, accessType, error: result.error });
          return NextResponse.json(
            { error: result.error || 'Connection failed' },
            { status: 400 }
          );
        }

        // Count rows in content
        const content = result.content || '';
        let rowCount = 0;

        // Detect format and count
        const trimmed = content.trim();
        if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
          // JSON
          try {
            const json = JSON.parse(content);
            rowCount = Array.isArray(json) ? json.length : (json.products?.length || json.items?.length || 0);
          } catch {
            rowCount = 0;
          }
        } else if (trimmed.startsWith('<')) {
          // XML
          const productMatches = content.match(/<product|<item|<entry/gi);
          rowCount = productMatches?.length || 0;
        } else {
          // CSV/TSV
          rowCount = content.split('\n').filter(line => line.trim()).length - 1;
        }

        reqLogger.info('FTP/SFTP test successful', { url, accessType, rowCount: Math.max(0, rowCount) });

        return NextResponse.json({
          success: true,
          rowCount: Math.max(0, rowCount),
          contentType: 'text/plain',
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : 'Unknown error';
        reqLogger.warn('FTP/SFTP test error', { url, accessType }, error);
        return NextResponse.json(
          { error: `Connection failed: ${message}` },
          { status: 400 }
        );
      }
    }

    // Test HTTP/HTTPS URL
    try {
      const headers: Record<string, string> = {};

      // Add basic auth if needed
      if (accessType === 'AUTH_URL' && username && password) {
        const auth = Buffer.from(`${username}:${password}`).toString('base64');
        headers['Authorization'] = `Basic ${auth}`;
        reqLogger.debug('Using basic auth for feed test');
      }

      reqLogger.debug('Fetching feed URL', { url });

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

      const response = await fetch(url!, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        reqLogger.warn('Feed test failed - server error', { 
          url, 
          status: response.status, 
          statusText: response.statusText 
        });
        return NextResponse.json(
          { error: `Server returned ${response.status}: ${response.statusText}` },
          { status: 400 }
        );
      }

      // Get content type to validate it's a feed
      const contentType = response.headers.get('content-type') || '';
      const validTypes = ['text/csv', 'application/json', 'text/xml', 'application/xml', 'text/plain'];
      const isValidType = validTypes.some(t => contentType.includes(t));

      if (!isValidType) {
        reqLogger.warn('Feed test failed - invalid content type', { url, contentType });
        return NextResponse.json(
          { error: `Unexpected content type: ${contentType}. Expected CSV, JSON, or XML.` },
          { status: 400 }
        );
      }

      // Try to get a rough row count (for CSV, count lines)
      const text = await response.text();
      let rowCount = 0;

      if (contentType.includes('csv') || contentType.includes('text/plain')) {
        // Count non-empty lines (minus header)
        rowCount = text.split('\n').filter(line => line.trim()).length - 1;
      } else if (contentType.includes('json')) {
        try {
          const json = JSON.parse(text);
          rowCount = Array.isArray(json) ? json.length : (json.products?.length || json.items?.length || 0);
        } catch {
          reqLogger.warn('Feed test failed - invalid JSON', { url });
          return NextResponse.json(
            { error: 'Invalid JSON format' },
            { status: 400 }
          );
        }
      } else if (contentType.includes('xml')) {
        // Simple XML product count
        const productMatches = text.match(/<product|<item|<entry/gi);
        rowCount = productMatches?.length || 0;
      }

      reqLogger.info('Feed test successful', { 
        url, 
        contentType, 
        rowCount: Math.max(0, rowCount) 
      });

      return NextResponse.json({
        success: true,
        rowCount: Math.max(0, rowCount),
        contentType,
      });
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'AbortError') {
        reqLogger.warn('Feed test failed - timeout', { url });
        return NextResponse.json(
          { error: 'Connection timed out after 10 seconds' },
          { status: 400 }
        );
      }
      
      const message = error instanceof Error ? error.message : 'Unknown error';
      reqLogger.warn('Feed test failed - connection error', { url }, error);
      return NextResponse.json(
        { error: `Connection failed: ${message}` },
        { status: 400 }
      );
    }
  } catch (error) {
    reqLogger.error('Feed test failed - unexpected error', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
