import { Router, type Router as ExpressRouter } from 'express'
import { randomUUID } from 'crypto'
import { prisma } from '@ironscout/db'
import { z } from 'zod'
import { logger } from '../config/logger'

const log = logger.child('reports')

const router: ExpressRouter = Router()

// =====================================================
// VALIDATION SCHEMAS
// =====================================================

const createReportSchema = z.object({
  productId: z.string(),
  userId: z.string().optional(), // Optional for anonymous reports
  priceId: z.string().optional(), // Optional - specific retailer/price issue
  issueType: z.enum([
    'INCORRECT_PRICE',
    'OUT_OF_STOCK',
    'INCORRECT_INFO',
    'BROKEN_LINK',
    'WRONG_PRODUCT',
    'SPAM',
    'OTHER'
  ]),
  description: z.string().min(10).max(1000),
})

const updateReportSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']),
  reviewedBy: z.string().optional(),
  reviewNotes: z.string().max(1000).optional(),
})

const listReportsSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED']).optional(),
  productId: z.string().optional(),
  userId: z.string().optional(),
  issueType: z.enum([
    'INCORRECT_PRICE',
    'OUT_OF_STOCK',
    'INCORRECT_INFO',
    'BROKEN_LINK',
    'WRONG_PRODUCT',
    'SPAM',
    'OTHER'
  ]).optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
})

// =====================================================
// CREATE REPORT
// =====================================================

router.post('/', async (req, res) => {
  try {
    const data = createReportSchema.parse(req.body)

    // Verify product exists
    const product = await prisma.products.findUnique({
      where: { id: data.productId }
    })

    if (!product) {
      return res.status(404).json({ error: 'Product not found' })
    }

    // If priceId provided, verify it exists and belongs to the product
    if (data.priceId) {
      const price = await prisma.prices.findFirst({
        where: {
          id: data.priceId,
          productId: data.productId
        }
      })

      if (!price) {
        return res.status(404).json({ error: 'Price not found for this product' })
      }
    }

    // Create the report
    const report = await prisma.product_reports.create({
      data: {
        id: randomUUID(),
        productId: data.productId,
        userId: data.userId,
        priceId: data.priceId,
        issueType: data.issueType,
        description: data.description,
        status: 'PENDING',
        updatedAt: new Date(),
      },
      include: {
        products: {
          select: {
            id: true,
            name: true,
          }
        },
        prices: {
          select: {
            id: true,
            retailers: {
              select: {
                name: true,
              }
            }
          }
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    })

    res.status(201).json(report)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues })
    }
    log.error('Error creating report', { error }, error as Error)
    res.status(500).json({ error: 'Failed to create report' })
  }
})

// =====================================================
// LIST REPORTS (Admin)
// =====================================================

router.get('/', async (req, res) => {
  try {
    const params = listReportsSchema.parse(req.query)

    const page = parseInt(params.page || '1')
    const limit = parseInt(params.limit || '20')
    const skip = (page - 1) * limit

    // Build where clause
    const where: any = {}
    if (params.status) where.status = params.status
    if (params.productId) where.productId = params.productId
    if (params.userId) where.userId = params.userId
    if (params.issueType) where.issueType = params.issueType

    // Get reports with pagination
    const [reports, total] = await Promise.all([
      prisma.product_reports.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          products: {
            select: {
              id: true,
              name: true,
              brand: true,
            }
          },
          prices: {
            select: {
              id: true,
              price: true,
              retailers: {
                select: {
                  name: true,
                  website: true,
                }
              }
            }
          },
          users: {
            select: {
              id: true,
              email: true,
              name: true,
            }
          }
        }
      }),
      prisma.product_reports.count({ where })
    ])

    res.json({
      reports,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      }
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid query parameters', details: error.issues })
    }
    log.error('Error listing reports', { error }, error as Error)
    res.status(500).json({ error: 'Failed to list reports' })
  }
})

// =====================================================
// GET SINGLE REPORT
// =====================================================

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params

    const report = await prisma.product_reports.findUnique({
      where: { id },
      include: {
        products: {
          select: {
            id: true,
            name: true,
            brand: true,
            category: true,
          }
        },
        prices: {
          select: {
            id: true,
            price: true,
            url: true,
            retailers: {
              select: {
                name: true,
                website: true,
              }
            }
          }
        },
        users: {
          select: {
            id: true,
            email: true,
            name: true,
          }
        }
      }
    })

    if (!report) {
      return res.status(404).json({ error: 'Report not found' })
    }

    res.json(report)
  } catch (error) {
    log.error('Error fetching report', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch report' })
  }
})

// =====================================================
// GET REPORTS FOR A PRODUCT
// =====================================================

router.get('/product/:productId', async (req, res) => {
  try {
    const { productId } = req.params
    const { status } = req.query

    const where: any = { productId }
    if (status) where.status = status

    const reports = await prisma.product_reports.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        prices: {
          select: {
            retailers: {
              select: {
                name: true,
              }
            }
          }
        },
        users: {
          select: {
            name: true,
          }
        }
      }
    })

    res.json(reports)
  } catch (error) {
    log.error('Error fetching product reports', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch product reports' })
  }
})

// =====================================================
// UPDATE REPORT (Admin)
// =====================================================

router.patch('/:id', async (req, res) => {
  try {
    const { id } = req.params
    const data = updateReportSchema.parse(req.body)

    // Check if report exists
    const existingReport = await prisma.product_reports.findUnique({
      where: { id }
    })

    if (!existingReport) {
      return res.status(404).json({ error: 'Report not found' })
    }

    // Update the report
    const updateData: any = {
      status: data.status,
      updatedAt: new Date(),
    }

    if (data.reviewedBy) updateData.reviewedBy = data.reviewedBy
    if (data.reviewNotes) updateData.reviewNotes = data.reviewNotes

    // Set resolvedAt if status is RESOLVED or DISMISSED
    if ((data.status === 'RESOLVED' || data.status === 'DISMISSED') && !existingReport.resolvedAt) {
      updateData.resolvedAt = new Date()
    }

    const report = await prisma.product_reports.update({
      where: { id },
      data: updateData,
      include: {
        products: {
          select: {
            id: true,
            name: true,
          }
        },
        prices: {
          select: {
            retailers: {
              select: {
                name: true,
              }
            }
          }
        }
      }
    })

    res.json(report)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid request data', details: error.issues })
    }
    log.error('Error updating report', { error }, error as Error)
    res.status(500).json({ error: 'Failed to update report' })
  }
})

// =====================================================
// DELETE REPORT (Admin)
// =====================================================

router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params

    await prisma.product_reports.delete({
      where: { id }
    })

    res.json({ message: 'Report deleted successfully' })
  } catch (error: any) {
    if (error.code === 'P2025') {
      return res.status(404).json({ error: 'Report not found' })
    }
    log.error('Error deleting report', { error }, error as Error)
    res.status(500).json({ error: 'Failed to delete report' })
  }
})

// =====================================================
// GET REPORT STATISTICS (Admin Dashboard)
// =====================================================

router.get('/stats/summary', async (req, res) => {
  try {
    const [
      totalReports,
      pendingReports,
      underReviewReports,
      resolvedReports,
      dismissedReports,
      recentReports
    ] = await Promise.all([
      prisma.product_reports.count(),
      prisma.product_reports.count({ where: { status: 'PENDING' } }),
      prisma.product_reports.count({ where: { status: 'UNDER_REVIEW' } }),
      prisma.product_reports.count({ where: { status: 'RESOLVED' } }),
      prisma.product_reports.count({ where: { status: 'DISMISSED' } }),
      prisma.product_reports.findMany({
        take: 5,
        orderBy: { createdAt: 'desc' },
        include: {
          products: {
            select: {
              name: true,
            }
          }
        }
      })
    ])

    // Get issue type breakdown
    const issueTypeBreakdown = await prisma.product_reports.groupBy({
      by: ['issueType'],
      _count: true,
    })

    res.json({
      total: totalReports,
      byStatus: {
        pending: pendingReports,
        underReview: underReviewReports,
        resolved: resolvedReports,
        dismissed: dismissedReports,
      },
      byIssueType: issueTypeBreakdown.map(item => ({
        type: item.issueType,
        count: item._count
      })),
      recent: recentReports,
    })
  } catch (error) {
    log.error('Error fetching report statistics', { error }, error as Error)
    res.status(500).json({ error: 'Failed to fetch statistics' })
  }
})

export default router
