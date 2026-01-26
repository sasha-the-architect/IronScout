import { PrismaClient } from '@ironscout/db/generated/prisma';

const prisma = new PrismaClient();

async function check() {
  try {
    const products = await prisma.products.count();
    console.log('Products:', products);

    const links = await prisma.product_links.groupBy({
      by: ['status'],
      _count: { status: true }
    });
    console.log('Product links by status:');
    links.forEach(l => console.log(`  ${l.status}: ${l._count.status}`));

    const prices = await prisma.prices.count();
    console.log('Prices:', prices);

    const matchedLinks = await prisma.product_links.count({
      where: { status: { in: ['MATCHED', 'CREATED'] } }
    });
    console.log('MATCHED/CREATED links:', matchedLinks);

  } catch (e) {
    console.error('Error:', e.message);
  } finally {
    await prisma.$disconnect();
  }
}

check();
