import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { tacOf } from '../server/src/modules/phone-catalog/normalize.js';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Очистка каталога от внешней базы TAC ---');

  // 1. Очищаем все строки в таблице phone_catalog
  const deleteResult = await prisma.phoneCatalog.deleteMany({});
  console.log(`Удалено записей сторонней базы: ${deleteResult.count}`);

  // 2. Получаем все реальные телефоны, которые уже были заведены в магазине
  const devices = await prisma.device.findMany({
    select: {
      imei: true,
      imei2: true,
      brand: true,
      model: true,
      ram: true,
      storage: true,
    },
    orderBy: { createdAt: 'desc' },
  });

  console.log(`Найдено реальных устройств в базе магазина: ${devices.length}`);

  // 3. Запоминаем только реальные телефоны магазина
  const byTac = new Map<string, { brand: string; model: string; ram?: string | null; storage?: string | null }>();

  for (const d of devices) {
    const brand = d.brand?.trim();
    const model = d.model?.trim();
    if (!brand || !model) continue;

    for (const rawImei of [d.imei, d.imei2]) {
      const tac = tacOf(rawImei);
      if (tac && !byTac.has(tac)) {
        byTac.set(tac, {
          brand,
          model,
          ram: d.ram?.trim() || null,
          storage: d.storage?.trim() || null,
        });
      }
    }
  }

  let createdCount = 0;
  for (const [tac, entry] of byTac.entries()) {
    await prisma.phoneCatalog.create({
      data: {
        tac,
        brand: entry.brand,
        model: entry.model,
        ram: entry.ram,
        storage: entry.storage,
      },
    });
    createdCount++;
  }

  console.log(`Успешно пересобрано моделей на основе устройств магазина: ${createdCount}`);
  console.log('Теперь автозаполнение работает исключительно на основе реальных добавленных телефонов!');
}

main()
  .catch((err) => {
    console.error('Ошибка очистки каталога:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
