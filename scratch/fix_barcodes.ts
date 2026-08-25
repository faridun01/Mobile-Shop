import { prisma } from '../server/src/prisma/prisma.service.js';

async function fixBarcodes() {
  const devices = await prisma.device.findMany();
  console.log(`Checking ${devices.length} devices in DB...`);
  
  let fixedCount = 0;
  for (const d of devices) {
    if (!d.barcode || d.barcode === 'null' || d.barcode.trim() === '') {
      const gen = '200' + Math.floor(100000000 + Math.random() * 900000000).toString();
      await prisma.device.update({
        where: { id: d.id },
        data: { barcode: gen }
      });
      console.log(`Updated Device ID ${d.id} (${d.brand} ${d.model}) -> New Barcode: ${gen}`);
      fixedCount++;
    }
  }

  console.log(`Fix complete! Updated ${fixedCount} devices.`);
}

fixBarcodes().catch(console.error).finally(() => prisma.$disconnect());
