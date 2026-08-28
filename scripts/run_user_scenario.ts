import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.pbkdf2(password, salt, 100000, 64, 'sha512', (err, derivedKey) => {
      if (err) reject(err);
      resolve(`${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

async function main() {
  console.log('=== STARTING USER LIVE SCENARIO EXECUTION ===');

  // 1. Create New Store
  const storeName = 'Магазин №2 Сомони';
  let newStore = await prisma.store.findFirst({ where: { name: storeName } });
  if (!newStore) {
    newStore = await prisma.store.create({
      data: {
        name: storeName,
        address: 'пр. Рудаки 15',
        isMainWarehouse: false,
        cashBalanceTjs: 0,
      },
    });
    console.log(`[1/8] Created new store: "${newStore.name}" (ID: ${newStore.id})`);
  } else {
    console.log(`[1/8] Store already exists: "${newStore.name}" (ID: ${newStore.id})`);
  }

  // 2. Create New Seller and assign to new store
  const sellerLogin = 'bahodur';
  let seller = await prisma.user.findUnique({ where: { login: sellerLogin } });
  if (!seller) {
    const hashedPassword = await hashPassword('seller123');
    seller = await prisma.user.create({
      data: {
        name: 'Баходур Продавец',
        login: sellerLogin,
        password: hashedPassword,
        role: 'SELLER',
        storeId: newStore.id,
      },
    });
    console.log(`[2/8] Created seller: "${seller.name}" assigned to store "${newStore.name}"`);
  } else {
    await prisma.user.update({ where: { id: seller.id }, data: { storeId: newStore.id } });
    console.log(`[2/8] Seller "${seller.name}" updated with store "${newStore.name}"`);
  }

  // 3. Intake of 3 Phones (Main Warehouse first)
  const mainWarehouse = await prisma.store.findFirst({ where: { isMainWarehouse: true } });
  const mainStoreId = mainWarehouse?.id || 'main-warehouse';

  const phonesData = [
    {
      imei: '358912345678901',
      brand: 'Apple',
      model: 'iPhone 15 Pro',
      storage: '256GB',
      color: 'Black',
      purchasePriceUsd: 800,
      costBasisUsd: 800,
      retailPriceTjs: 9500,
    },
    {
      imei: '358912345678902',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      storage: '512GB',
      color: 'Titanium',
      purchasePriceUsd: 900,
      costBasisUsd: 900,
      retailPriceTjs: 10500,
    },
    {
      imei: '358912345678903',
      brand: 'Xiaomi',
      model: '14 Ultra',
      storage: '512GB',
      color: 'Black',
      purchasePriceUsd: 700,
      costBasisUsd: 700,
      retailPriceTjs: 8200,
    },
  ];

  const createdDevices = [];
  for (const p of phonesData) {
    let device = await prisma.device.findUnique({ where: { imei: p.imei } });
    if (!device) {
      device = await prisma.device.create({
        data: {
          imei: p.imei,
          brand: p.brand,
          model: p.model,
          storage: p.storage,
          color: p.color,
          status: 'MAIN_WAREHOUSE',
          storeId: mainStoreId,
          purchasePriceUsd: p.purchasePriceUsd,
          costBasisUsd: p.costBasisUsd,
          retailPriceTjs: p.retailPriceTjs,
          receivedDate: new Date(),
        },
      });
    }
    createdDevices.push(device);
  }
  console.log(`[3/8] Intake complete: Registered 3 phones into Main Warehouse`);

  // 4. Transfer all 3 phones from Main Warehouse to New Store
  for (const dev of createdDevices) {
    await prisma.device.update({
      where: { id: dev.id },
      data: {
        storeId: newStore.id,
        status: 'STORE_STOCK',
      },
    });
  }
  console.log(`[4/8] Transfer complete: Moved 3 phones to "${newStore.name}"`);

  // 5. Make 2 Sales in New Store by seller Bahodur
  // Sale 1: iPhone 15 Pro
  const dev1 = createdDevices[0];
  let sale1 = await prisma.sale.create({
    data: {
      storeId: newStore.id,
      userId: seller.id,
      customerName: 'Давлат',
      totalTjs: dev1.retailPriceTjs || 9500,
      totalUsd: 1000,
      exchangeRate: 9.5,
      paymentMethod: 'CASH',
      cashAmountTjs: dev1.retailPriceTjs || 9500,
      status: 'COMPLETED',
      saleItems: {
        create: {
          deviceId: dev1.id,
          brand: dev1.brand,
          model: dev1.model,
          storage: dev1.storage,
          color: dev1.color,
          imei: dev1.imei,
          salePriceTjs: dev1.retailPriceTjs || 9500,
          salePriceUsd: 1000,
          purchaseCostUsd: dev1.purchasePriceUsd,
          costBasisUsd: dev1.costBasisUsd,
        },
      },
    },
  });
  await prisma.device.update({ where: { id: dev1.id }, data: { status: 'SOLD' } });

  // Sale 2: Samsung Galaxy S24 Ultra
  const dev2 = createdDevices[1];
  let sale2 = await prisma.sale.create({
    data: {
      storeId: newStore.id,
      userId: seller.id,
      customerName: 'Собир',
      totalTjs: dev2.retailPriceTjs || 10500,
      totalUsd: 1105.26,
      exchangeRate: 9.5,
      paymentMethod: 'CARD',
      cardAmountTjs: dev2.retailPriceTjs || 10500,
      status: 'COMPLETED',
      saleItems: {
        create: {
          deviceId: dev2.id,
          brand: dev2.brand,
          model: dev2.model,
          storage: dev2.storage,
          color: dev2.color,
          imei: dev2.imei,
          salePriceTjs: dev2.retailPriceTjs || 10500,
          salePriceUsd: 1105.26,
          purchaseCostUsd: dev2.purchasePriceUsd,
          costBasisUsd: dev2.costBasisUsd,
        },
      },
    },
  });
  await prisma.device.update({ where: { id: dev2.id }, data: { status: 'SOLD' } });

  console.log(`[5/8] Completed 2 Sales in "${newStore.name}": Receipt #${sale1.receiptNumber} (${dev1.model}) & Receipt #${sale2.receiptNumber} (${dev2.model})`);

  // 6. Make 1 Trade-In / Exchange
  let returnedDev = await prisma.device.findUnique({ where: { imei: '351111111111111' } });
  if (!returnedDev) {
    returnedDev = await prisma.device.create({
      data: {
        imei: '351111111111111',
        brand: 'Apple',
        model: 'iPhone 13',
        storage: '128GB',
        color: 'Blue',
        status: 'IN_STOCK_AFTER_EXCHANGE',
        storeId: newStore.id,
        purchasePriceUsd: 421.05,
        costBasisUsd: 421.05,
        retailPriceTjs: 4500,
      },
    });
  }

  // Sold replacement device: Xiaomi 14 Ultra (dev3)
  const dev3 = createdDevices[2];
  const exchangeSale = await prisma.sale.create({
    data: {
      storeId: newStore.id,
      userId: seller.id,
      customerName: 'Алишер',
      totalTjs: dev3.retailPriceTjs || 8200,
      totalUsd: 863.15,
      exchangeRate: 9.5,
      paymentMethod: 'CASH',
      cashAmountTjs: 4200,
      exchangeTradeInCreditTjs: 4000,
      status: 'COMPLETED',
      saleItems: {
        create: {
          deviceId: dev3.id,
          brand: dev3.brand,
          model: dev3.model,
          storage: dev3.storage,
          color: dev3.color,
          imei: dev3.imei,
          salePriceTjs: dev3.retailPriceTjs || 8200,
          salePriceUsd: 863.15,
          purchaseCostUsd: dev3.purchasePriceUsd,
          costBasisUsd: dev3.costBasisUsd,
        },
      },
      exchangeEvents: {
        create: {
          returnedDeviceId: returnedDev.id,
          returnedImei: returnedDev.imei,
          returnedModel: `${returnedDev.brand} ${returnedDev.model}`,
          exchangeInValueTjs: 4000,
          exchangeInValueUsd: 421.05,
          replacementDeviceId: dev3.id,
          replacementImei: dev3.imei,
          replacementModel: `${dev3.brand} ${dev3.model}`,
          newPriceTjs: dev3.retailPriceTjs || 8200,
          newPriceUsd: 863.15,
          differenceTjs: 4200,
          paymentMethod: 'CASH',
          cashAmountTjs: 4200,
          processedByUserId: seller.id,
        },
      },
    },
  });
  await prisma.device.update({ where: { id: dev3.id }, data: { status: 'SOLD' } });

  console.log(`[6/8] Exchange complete: Trade-in iPhone 13 for Xiaomi 14 Ultra (Receipt #${exchangeSale.receiptNumber})`);

  // 7. Accept 1 Repair
  const repair = await prisma.repairTicket.create({
    data: {
      storeId: newStore.id,
      userId: seller.id,
      imei: '357777777777777',
      brand: 'Apple',
      model: 'iPhone 12',
      storage: '128GB',
      color: 'Black',
      customerName: 'Ислом Каримов',
      customerPhone: '+992931112233',
      problemDescription: 'Замена оригинального дисплея',
      status: 'ACCEPTED',
      estimatedCostTjs: 550,
    },
  });
  console.log(`[7/8] Repair registered: Ticket #${repair.ticketNumber} for iPhone 12 (Client: ${repair.customerName})`);

  // 8. Add 1 Expense
  const expense = await prisma.expense.create({
    data: {
      category: 'Аренда и коммунальные',
      amountTjs: 350,
      amountUsd: 36.84,
      exchangeRate: 9.5,
      targetType: 'STORE',
      storeId: newStore.id,
      description: 'Оплата интернета и аренды помещения точки №2',
      createdByUserId: seller.id,
      paidFromCashRegister: true,
    },
  });
  console.log(`[8/8] Expense recorded: ID ${expense.id} (350 TJS, "${expense.description}")`);

  console.log('=== ALL 8 USER SCENARIO STEPS EXECUTED SUCCESSFULLY! ===');
}

main()
  .catch((err) => {
    console.error('Error executing live scenario script:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
