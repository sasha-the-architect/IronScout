import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { Prisma } from '../generated/prisma/client.js'
import { createTestDb, disconnectTestClient, resetDb } from '../test-utils.js'

describe('Database Integration (Postgres + Prisma)', () => {
  const testRunId = Date.now()
  const userEmail = (suffix: string) =>
    `integration-${testRunId}-${suffix}@test.ironscout.local`

  const prisma = createTestDb()

  beforeAll(async () => {
    await resetDb(prisma)
  })

  afterAll(async () => {
    await disconnectTestClient(prisma)
  })

  it('creates and reads a user record', async () => {
    const created = await prisma.users.create({
      data: { email: userEmail('create-read'), name: 'Integration User' },
      select: { id: true, email: true, name: true },
    })

    const fetched = await prisma.users.findUnique({
      where: { id: created.id },
      select: { id: true, email: true, name: true },
    })

    expect(fetched).not.toBeNull()
    expect(fetched?.email).toBe(created.email)
    expect(fetched?.name).toBe('Integration User')
  })

  it('updates a user record', async () => {
    const created = await prisma.users.create({
      data: { email: userEmail('update'), name: 'Original Name' },
      select: { id: true },
    })

    const updated = await prisma.users.update({
      where: { id: created.id },
      data: { name: 'Updated Name' },
      select: { id: true, name: true },
    })

    expect(updated.id).toBe(created.id)
    expect(updated.name).toBe('Updated Name')
  })

  it('enforces unique email constraint', async () => {
    const email = userEmail('unique')

    await prisma.users.create({
      data: { email, name: 'Unique One' },
      select: { id: true },
    })

    let error: unknown
    try {
      await prisma.users.create({
        data: { email, name: 'Unique Two' },
        select: { id: true },
      })
    } catch (err) {
      error = err
    }

    expect(error).toBeInstanceOf(Prisma.PrismaClientKnownRequestError)
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      expect(error.code).toBe('P2002')
    }
  })
})
