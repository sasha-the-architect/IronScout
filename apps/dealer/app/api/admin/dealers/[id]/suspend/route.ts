import { NextResponse } from 'next/server';
import { getSession, logAdminAction } from '@/lib/auth';
import { prisma } from '@ironscout/db';
import { headers } from 'next/headers';
import { logger } from '@/lib/logger';

// Force dynamic rendering - this route uses cookies for auth
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const requestId = crypto.randomUUID().slice(0, 8);
  const reqLogger = logger.child({ requestId, endpoint: '/api/admin/dealers/[id]/suspend' });
  
  try {
    const session = await getSession();
    
    if (!session || session.type !== 'admin') {
      reqLogger.warn('Unauthorized suspend attempt');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const { id: dealerId } = await params;
    reqLogger.info('Dealer suspend request', { dealerId, adminEmail: session.email });

    // Get current dealer state
    const dealer = await prisma.dealer.findUnique({
      where: { id: dealerId },
    });

    if (!dealer) {
      reqLogger.warn('Dealer not found', { dealerId });
      return NextResponse.json(
        { error: 'Dealer not found' },
        { status: 404 }
      );
    }

    if (dealer.status === 'SUSPENDED') {
      reqLogger.warn('Dealer already suspended', { dealerId });
      return NextResponse.json(
        { error: 'Dealer is already suspended' },
        { status: 400 }
      );
    }

    reqLogger.info('Suspending dealer', { 
      dealerId, 
      businessName: dealer.businessName 
    });

    // Update dealer status
    const updatedDealer = await prisma.dealer.update({
      where: { id: dealerId },
      data: {
        status: 'SUSPENDED',
      },
    });

    reqLogger.info('Dealer suspended successfully', { dealerId });

    // Log admin action
    const headersList = await headers();
    await logAdminAction(session.email, 'suspend', {
      dealerId,
      resource: 'dealer',
      resourceId: dealerId,
      oldValue: { status: dealer.status },
      newValue: { status: 'SUSPENDED' },
      ipAddress: headersList.get('x-forwarded-for') || undefined,
      userAgent: headersList.get('user-agent') || undefined,
    });

    // TODO: Send suspension email to dealer

    return NextResponse.json({
      success: true,
      dealer: {
        id: updatedDealer.id,
        status: updatedDealer.status,
      },
    });
  } catch (error) {
    reqLogger.error('Suspend dealer error', {}, error);
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    );
  }
}
