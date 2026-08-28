import { prisma } from '../server/src/prisma/prisma.service.js';
import { AuthService } from '../server/src/auth/auth.service.js';

const STORE_SEEDS = [
  { id: 'main-warehouse', name: 'Главный склад', isMainWarehouse: true },
  { id: 'store-siyoma', name: 'Сиёма', isMainWarehouse: false },
];

const USER_SEEDS = [
  { id: 'user-admin', name: 'Далер', login: 'admin', password: 'admin123', role: 'ADMIN' as const, storeId: null },
  { id: 'user-partner', name: 'Рустам', login: 'partner', password: 'partner123', role: 'PARTNER' as const, storeId: null },
  { id: 'user-ahmad', name: 'Ahmad', login: 'ahmad', password: 'seller123', role: 'SELLER' as const, storeId: 'store-siyoma' },
  { id: 'user-farhod', name: 'Фарход', login: 'farhod', password: 'seller123', role: 'SELLER' as const, storeId: 'store-siyoma' },
];

const SUPPLIER_SEEDS = [
  { id: 'sup-dubai', name: 'Dubai Mobile', phone: '+971 4 123 4567', contactPerson: 'Ахмед' },
  { id: 'sup-china', name: 'China Tech', phone: '+86 20 8888 9999', contactPerson: 'Ли' },
];

const OWNER_SEEDS = [
  { id: 'owner-admin', name: 'Далер', profitSharePercent: 50 },
  { id: 'owner-partner', name: 'Рустам', profitSharePercent: 50 },
];

async function main() {
  for (const store of STORE_SEEDS) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: {},
      create: store,
    });
  }

  for (const sup of SUPPLIER_SEEDS) {
    await prisma.supplier.upsert({
      where: { id: sup.id },
      update: {},
      create: sup,
    });
  }

  for (const owner of OWNER_SEEDS) {
    await prisma.owner.upsert({ where: { id: owner.id }, update: {}, create: owner });
  }

  for (const user of USER_SEEDS) {
    const hashedPassword = await AuthService.hashPassword(user.password);
    await prisma.user.upsert({
      where: { id: user.id },
      update: {
        password: hashedPassword,
        storeId: user.storeId,
      },
      create: {
        id: user.id,
        name: user.name,
        login: user.login,
        password: hashedPassword,
        role: user.role,
        storeId: user.storeId,
      },
    });
  }

  const todayStr = new Date().toISOString().split('T')[0];
  const adminUser = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  await prisma.exchangeRate.upsert({
    where: { date: todayStr },
    update: {},
    create: {
      date: todayStr,
      rate: 9.50,
      createdByUserId: adminUser?.id || 'user-admin',
    },
  });

  console.log(`Seeded ${STORE_SEEDS.length} stores, ${USER_SEEDS.length} users, and exchange rate ${todayStr}: 9.50 TJS. Database clean of test data.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
