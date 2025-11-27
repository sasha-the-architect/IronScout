import { Worker, Job } from 'bullmq'
import { prisma } from '@zeroedin/db'
import { redisConnection } from '../config/redis'
import { alertQueue, WriteJobData } from '../config/queues'

// Writer worker - upserts products, retailers, and prices to database
export const writerWorker = new Worker<WriteJobData>(
  'write',
  async (job: Job<WriteJobData>) => {
    const { executionId, sourceId, normalizedItems } = job.data

    console.log(`[Writer] Writing ${normalizedItems.length} items to database`)

    let upsertedCount = 0
    const priceChanges: Array<{ productId: string; oldPrice?: number; newPrice: number }> = []

    try {
      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'WRITE_START',
          message: `Starting write of ${normalizedItems.length} items`,
        },
      })

      for (const item of normalizedItems) {
        try {
          // Upsert retailer
          const retailer = await prisma.retailer.upsert({
            where: {
              website: item.retailerWebsite,
            },
            create: {
              name: item.retailerName,
              website: item.retailerWebsite,
              tier: 'STANDARD', // Default tier
            },
            update: {
              name: item.retailerName,
            },
          })

          await prisma.executionLog.create({
            data: {
              executionId,
              level: 'INFO',
              event: 'UPSERT_RETAILER',
              message: `Retailer: ${retailer.name}`,
              metadata: { retailerId: retailer.id },
            },
          })

          // Upsert product (match by name and category for simplicity)
          // In production, you might use SKU or other unique identifiers
          const product = await prisma.product.upsert({
            where: {
              id: `${item.name}_${item.category}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
            },
            create: {
              id: `${item.name}_${item.category}`.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase(),
              name: item.name,
              description: item.description,
              category: item.category,
              brand: item.brand,
              imageUrl: item.imageUrl,
            },
            update: {
              description: item.description || undefined,
              imageUrl: item.imageUrl || undefined,
            },
          })

          await prisma.executionLog.create({
            data: {
              executionId,
              level: 'INFO',
              event: 'UPSERT_PRODUCT',
              message: `Product: ${product.name}`,
              metadata: { productId: product.id },
            },
          })

          // Check for existing price from this retailer
          const existingPrice = await prisma.price.findFirst({
            where: {
              productId: product.id,
              retailerId: retailer.id,
            },
            orderBy: {
              createdAt: 'desc',
            },
          })

          const newPrice = parseFloat(item.price.toFixed(2))
          const oldPrice = existingPrice ? parseFloat(existingPrice.price.toString()) : undefined

          // Only create new price if it's different or doesn't exist
          if (!existingPrice || oldPrice !== newPrice || existingPrice.inStock !== item.inStock) {
            await prisma.price.create({
              data: {
                productId: product.id,
                retailerId: retailer.id,
                price: newPrice,
                currency: item.currency,
                url: item.url,
                inStock: item.inStock,
              },
            })

            await prisma.executionLog.create({
              data: {
                executionId,
                level: 'INFO',
                event: 'UPSERT_PRICE',
                message: `Price: $${newPrice} (was: ${oldPrice ? `$${oldPrice}` : 'N/A'})`,
                metadata: {
                  productId: product.id,
                  oldPrice,
                  newPrice,
                  inStock: item.inStock,
                },
              },
            })

            // Track price changes for alerts
            if (oldPrice && oldPrice !== newPrice) {
              priceChanges.push({
                productId: product.id,
                oldPrice,
                newPrice,
              })
            }

            upsertedCount++
          }
        } catch (itemError) {
          const errorMsg = itemError instanceof Error ? itemError.message : 'Unknown error'
          await prisma.executionLog.create({
            data: {
              executionId,
              level: 'WARN',
              event: 'WRITE_ITEM_FAIL',
              message: `Failed to write item: ${errorMsg}`,
              metadata: { item },
            },
          })
        }
      }

      // Update execution status
      const duration = Date.now() - new Date(job.timestamp).getTime()
      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: 'SUCCESS',
          itemsUpserted: upsertedCount,
          completedAt: new Date(),
          duration,
        },
      })

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'WRITE_OK',
          message: `Successfully wrote ${upsertedCount} items`,
          metadata: { upsertedCount },
        },
      })

      // Queue alert jobs for price changes
      for (const change of priceChanges) {
        await alertQueue.add('alert', {
          executionId,
          productId: change.productId,
          oldPrice: change.oldPrice,
          newPrice: change.newPrice,
        })
      }

      if (priceChanges.length > 0) {
        await prisma.executionLog.create({
          data: {
            executionId,
            level: 'INFO',
            event: 'ALERT_QUEUED',
            message: `Queued ${priceChanges.length} alert evaluations`,
          },
        })
      }

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'INFO',
          event: 'EXEC_DONE',
          message: `Execution completed successfully`,
          metadata: { duration, upsertedCount },
        },
      })

      return { success: true, upsertedCount, priceChanges: priceChanges.length }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'WRITE_FAIL',
          message: `Write failed: ${errorMessage}`,
        },
      })

      await prisma.execution.update({
        where: { id: executionId },
        data: {
          status: 'FAILED',
          errorMessage: `Write failed: ${errorMessage}`,
          completedAt: new Date(),
          itemsUpserted: upsertedCount,
        },
      })

      await prisma.executionLog.create({
        data: {
          executionId,
          level: 'ERROR',
          event: 'EXEC_FAIL',
          message: errorMessage,
        },
      })

      throw error
    }
  },
  {
    connection: redisConnection,
    concurrency: 2,
  }
)

writerWorker.on('completed', (job) => {
  console.log(`[Writer] Job ${job.id} completed`)
})

writerWorker.on('failed', (job, err) => {
  console.error(`[Writer] Job ${job?.id} failed:`, err.message)
})
