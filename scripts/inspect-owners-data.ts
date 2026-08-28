import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const owners = await prisma.owner.findMany();
  const ownerTxs = await prisma.ownerTransaction.findMany({ orderBy: { createdAt: 'desc' } });
  const ledger = await prisma.ledgerEntry.findMany({ orderBy: { createdAt: 'desc' } });

  console.log('=== OWNERS ===');
  console.dir(owners, { depth: null });

  console.log('=== OWNER TRANSACTIONS ===');
  console.dir(ownerTxs, { depth: null });

  console.log('=== LEDGER ENTRIES ===');
  console.dir(ledger, { depth: null });
}

main()
  .catch((e) => console.error(e))
  .finally(() => prisma.$disconnect());
