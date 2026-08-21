import { prisma } from '../server/src/prisma/prisma.service';

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

const STORES = ['main-warehouse', 'store-1', 'store-2'];

async function main() {
  console.log('Seeding 200 devices into PostgreSQL database...');

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

      await prisma.device.upsert({
        where: { imei: baseImei.toString() },
        update: {},
        create: {
          imei: baseImei.toString(),
          brand: spec.brand,
          model: spec.model,
          storage: storage,
          color: color,
          status: storeId === 'main-warehouse' ? 'IN_STOCK' : 'IN_STOCK',
          purchasePriceUsd: spec.purchasePriceUsd,
          costBasisUsd: spec.purchasePriceUsd,
          storeId: storeId,
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
