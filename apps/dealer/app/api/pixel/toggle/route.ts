import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/pixel/toggle' });
  
  reqLogger.info('Pixel toggle request received');
  
  try {
    const session = await getSession();
    
    if (!session) {
      reqLogger.warn('Unauthorized - no session');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: { dealerId?: string; enabled?: boolean };
    try {
      body = await request.json();
    } catch {
      reqLogger.warn('Failed to parse request body');
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
    }

    const { dealerId, enabled } = body;

    if (!dealerId || typeof enabled !== 'boolean') {
      reqLogger.warn('Invalid request parameters', { dealerId, enabled });
      return NextResponse.json({ error: 'Dealer ID and enabled status required' }, { status: 400 });
    }

    // Verify the dealer owns this account or is admin
    if (session.type === 'dealer' && session.dealerId !== dealerId) {
      reqLogger.warn('Forbidden - dealer mismatch', { 
        sessionDealerId: session.dealerId, 
        requestedDealerId: dealerId 
      });
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    reqLogger.debug('Toggling pixel status', { dealerId, enabled });

    // Update the pixel enabled status
    await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        pixelEnabled: enabled,
      },
    });

    reqLogger.info('Pixel status updated', { dealerId, enabled });

    return NextResponse.json({ success: true, enabled });
  } catch (error) {
    reqLogger.error('Failed to toggle pixel', {}, error);
    return NextResponse.json(
      { error: 'Failed to toggle pixel' },
      { status: 500 }
    );
  }
}
