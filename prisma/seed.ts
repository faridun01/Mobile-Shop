import { prisma } from '../server/src/prisma/prisma.service';
import { AuthService } from '../server/src/auth/auth.service';

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
  { id: 'sup-1', name: 'Apple Distributor Corp', phone: '+992 93 555 0101', contactPerson: 'Александр Смирнов' },
  { id: 'sup-2', name: 'Samsung Global Asia', phone: '+992 90 777 0202', contactPerson: 'Дмитрий Ким' },
  { id: 'sup-3', name: 'Xiaomi Tech Logistics', phone: '+992 91 888 0303', contactPerson: 'Ли Вэй' },
];

const OWNER_SEEDS = [
  { id: 'owner-1', name: 'Далер', profitSharePercent: 60, capitalBalanceUsd: 5000 },
  { id: 'owner-2', name: 'Рустам', profitSharePercent: 40, capitalBalanceUsd: 3000 },
];

// MODELS_SPEC below still uses the old placeholder supplier ids from the original mock catalog;
// map them onto the real seeded suppliers above.
const SUPPLIER_ID_MAP: Record<string, string> = {
  'sup-apple': 'sup-1',
  'sup-samsung': 'sup-2',
  'sup-xiaomi': 'sup-3',
};

async function seedCoreEntities() {
  for (const store of STORE_SEEDS) {
    await prisma.store.upsert({
      where: { id: store.id },
      update: {},
      create: store,
    });
  }

  for (const user of USER_SEEDS) {
    const hashedPassword = await AuthService.hashPassword(user.password);
    await prisma.user.upsert({
      where: { id: user.id },
      update: {},
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

  for (const supplier of SUPPLIER_SEEDS) {
    await prisma.supplier.upsert({
      where: { id: supplier.id },
      update: {},
      create: supplier,
    });
  }

  for (const owner of OWNER_SEEDS) {
    await prisma.owner.upsert({
      where: { id: owner.id },
      update: {},
      create: owner,
    });
  }

  console.log(`Seeded ${STORE_SEEDS.length} stores, ${USER_SEEDS.length} users, ${SUPPLIER_SEEDS.length} suppliers, ${OWNER_SEEDS.length} owners.`);
}

const MODELS_SPEC = [
  {
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    purchasePriceUsd: 1150,
    storages: ['256 GB', '512 GB', '1 TB'],
    colors: ['Desert Titanium', 'Black Titanium', 'White Titanium', 'Natural Titanium'],
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
  },
  {
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    purchasePriceUsd: 980,
    storages: ['128 GB', '256 GB', '512 GB'],
    colors: ['Black Titanium', 'White Titanium', 'Natural Titanium', 'Desert Titanium'],
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
  },
  {
    brand: 'Apple',
    model: 'iPhone 16',
    purchasePriceUsd: 790,
    storages: ['128 GB', '256 GB'],
    colors: ['Black', 'White', 'Teal', 'Pink', 'Ultramarine'],
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
  },
  {
    brand: 'Apple',
    model: 'iPhone 15 Pro Max',
    purchasePriceUsd: 1020,
    storages: ['256 GB', '512 GB'],
    colors: ['Natural Titanium', 'Black Titanium', 'Blue Titanium', 'White Titanium'],
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
  },
  {
    brand: 'Apple',
    model: 'iPhone 15 Pro',
    purchasePriceUsd: 870,
    storages: ['128 GB', '256 GB'],
    colors: ['Black Titanium', 'Blue Titanium', 'White Titanium'],
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
  },
  {
    brand: 'Samsung',
    model: 'Galaxy S25 Ultra',
    purchasePriceUsd: 1100,
    storages: ['256 GB', '512 GB', '1 TB'],
    colors: ['Titanium Gray', 'Titanium Black', 'Titanium Silver', 'Titanium Blue'],
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
  },
  {
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    purchasePriceUsd: 950,
    storages: ['256 GB', '512 GB'],
    colors: ['Titanium Gray', 'Titanium Black', 'Titanium Violet', 'Titanium Yellow'],
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
  },
  {
    brand: 'Samsung',
    model: 'Galaxy S24+',
    purchasePriceUsd: 750,
    storages: ['256 GB', '512 GB'],
    colors: ['Onyx Black', 'Marble Gray', 'Cobalt Violet'],
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
  },
  {
    brand: 'Samsung',
    model: 'Galaxy A55',
    purchasePriceUsd: 340,
    storages: ['128 GB', '256 GB'],
    colors: ['Awesome Navy', 'Awesome Iceblue', 'Awesome Lemon'],
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
  },
  {
    brand: 'Xiaomi',
    model: 'Xiaomi 14 Ultra',
    purchasePriceUsd: 920,
    storages: ['512 GB', '1 TB'],
    colors: ['Black', 'White', 'Olive Green'],
    supplierId: 'sup-xiaomi',
    supplierName: 'Xiaomi Tech Hub',
  },
  {
    brand: 'Xiaomi',
    model: 'Redmi Note 13 Pro+',
    purchasePriceUsd: 310,
    storages: ['256 GB', '512 GB'],
    colors: ['Midnight Black', 'Moonlight White', 'Aurora Purple'],
    supplierId: 'sup-xiaomi',
    supplierName: 'Xiaomi Tech Hub',
  },
  {
    brand: 'Google',
    model: 'Pixel 9 Pro',
    purchasePriceUsd: 890,
    storages: ['256 GB', '512 GB'],
    colors: ['Obsidian', 'Porcelain', 'Hazel', 'Rose Quartz'],
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
  },
  {
    brand: 'OnePlus',
    model: 'OnePlus 12',
    purchasePriceUsd: 680,
    storages: ['256 GB', '512 GB'],
    colors: ['Silky Black', 'Flowy Emerald', 'Cool Blue'],
    supplierId: 'sup-xiaomi',
    supplierName: 'Xiaomi Tech Hub',
  },
  {
    brand: 'Honor',
    model: 'Magic6 Pro',
    purchasePriceUsd: 840,
    storages: ['512 GB'],
    colors: ['Black', 'Epi Green', 'Cloud Purple'],
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
  },
];

const STORES = STORE_SEEDS.map((s) => s.id);

async function main() {
  await seedCoreEntities();

  console.log('Seeding ~200 devices into PostgreSQL database...');

  let count = 0;
  let baseImei = 354891100000000;

  for (const spec of MODELS_SPEC) {
    // Generate ~14 to 15 devices per model to reach 200 total
    for (let i = 0; i < 15; i++) {
      count++;
      baseImei += 1;

      const storage = spec.storages[i % spec.storages.length];
      const color = spec.colors[i % spec.colors.length];
      const storeId = STORES[i % STORES.length];
      const supplierId = SUPPLIER_ID_MAP[spec.supplierId];

      await prisma.device.upsert({
        where: { imei: baseImei.toString() },
        update: {},
        create: {
          imei: baseImei.toString(),
          brand: spec.brand,
          model: spec.model,
          storage: storage,
          color: color,
          status: storeId === 'main-warehouse' ? 'MAIN_WAREHOUSE' : 'STORE_STOCK',
          purchasePriceUsd: spec.purchasePriceUsd,
          costBasisUsd: spec.purchasePriceUsd,
          storeId: storeId,
          supplierId: supplierId,
          supplierName: spec.supplierName,
        },
      });
    }
  }

  console.log(`Successfully seeded ${count} devices across all stores!`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
