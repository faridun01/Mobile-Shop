import {
  User,
  Store,
  Device,
  Sale,
  Supplier,
  SupplierInvoice,
  SupplierBonus,
  Expense,
  Owner,
  OwnerTransaction,
  RepairTicket,
  TransferRequest,
  NotificationItem,
  AuditLogEntry,
  LedgerEntry,
  DailyRate
} from '../types';

export const INITIAL_RATE: DailyRate = {
  date: new Date().toISOString().split('T')[0],
  rate: 9.50,
  createdBy: 'admin',
  createdAt: new Date().toISOString()
};

export const INITIAL_STORES: Store[] = [
  {
    id: 'main-warehouse',
    name: 'Главный склад',
    isMainWarehouse: true,
    cashBalanceTjs: 0,
    active: true
  },
  {
    id: 'store-1',
    name: 'Магазин №1 (Рудаки)',
    isMainWarehouse: false,
    cashBalanceTjs: 14200,
    active: true
  },
  {
    id: 'store-2',
    name: 'Магазин №2 (Сомони)',
    isMainWarehouse: false,
    cashBalanceTjs: 9800,
    active: true
  }
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'Администратор',
    login: 'admin',
    passwordHash: 'admin123',
    role: 'ADMIN',
    active: true,
    createdAt: '2026-01-01T08:00:00Z'
  },
  {
    id: 'user-partner',
    name: 'Рустам (Партнер)',
    login: 'partner',
    passwordHash: 'partner123',
    role: 'PARTNER',
    active: true,
    createdAt: '2026-01-05T08:00:00Z'
  },
  {
    id: 'user-ahmad',
    name: 'Ahmad',
    login: 'ahmad',
    passwordHash: 'seller123',
    role: 'SELLER',
    storeId: 'store-2',
    storeName: 'Магазин №2 (Сомони)',
    active: true,
    createdAt: '2026-02-01T09:00:00Z'
  },
  {
    id: 'user-farhod',
    name: 'Farhod',
    login: 'farhod',
    passwordHash: 'seller123',
    role: 'SELLER',
    storeId: 'store-1',
    storeName: 'Магазин №1 (Рудаки)',
    active: true,
    createdAt: '2026-02-01T09:00:00Z'
  }
];

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-apple',
    name: 'Apple Direct Dubai',
    phone: '+971 50 123 4567',
    totalPurchasedUsd: 65000,
    totalPaidUsd: 55000,
    totalDebtUsd: 10000,
    active: true
  },
  {
    id: 'sup-samsung',
    name: 'Samsung Central Asia',
    phone: '+992 90 777 8899',
    totalPurchasedUsd: 42000,
    totalPaidUsd: 42000,
    totalDebtUsd: 0,
    active: true
  },
  {
    id: 'sup-xiaomi',
    name: 'Xiaomi Tech Hub',
    phone: '+992 93 555 4433',
    totalPurchasedUsd: 28000,
    totalPaidUsd: 21000,
    totalDebtUsd: 7000,
    active: true
  }
];

export const INITIAL_INVOICES: SupplierInvoice[] = [
  {
    id: 'inv-101',
    invoiceNumber: 'INV-101',
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
    date: '2026-07-01',
    totalAmountUsd: 18000,
    paidAmountUsd: 18000,
    remainingAmountUsd: 0,
    status: 'PAID',
    devicesCount: 20
  },
  {
    id: 'inv-104',
    invoiceNumber: 'INV-104',
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
    date: '2026-07-20',
    totalAmountUsd: 22000,
    paidAmountUsd: 12000,
    remainingAmountUsd: 10000,
    status: 'PARTIALLY_PAID',
    devicesCount: 24
  },
  {
    id: 'inv-108',
    invoiceNumber: 'INV-108',
    supplierId: 'sup-xiaomi',
    supplierName: 'Xiaomi Tech Hub',
    date: '2026-08-05',
    totalAmountUsd: 14000,
    paidAmountUsd: 7000,
    remainingAmountUsd: 7000,
    status: 'PARTIALLY_PAID',
    devicesCount: 30
  },
  {
    id: 'inv-112',
    invoiceNumber: 'INV-112',
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
    date: '2026-08-10',
    totalAmountUsd: 15000,
    paidAmountUsd: 15000,
    remainingAmountUsd: 0,
    status: 'PAID',
    devicesCount: 18
  },
  {
    id: 'inv-112-bonus',
    invoiceNumber: 'INV-112-BONUS',
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
    date: '2026-08-10',
    totalAmountUsd: 0,
    paidAmountUsd: 0,
    remainingAmountUsd: 0,
    status: 'PAID',
    devicesCount: 4
  }
];

function generate200Devices(): Device[] {
  const specs = [
    { brand: 'Apple', model: 'iPhone 16 Pro Max', costUsd: 1150, storages: ['256 GB', '512 GB', '1 TB'], colors: ['Desert Titanium', 'Black Titanium', 'White Titanium', 'Natural Titanium'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-104' },
    { brand: 'Apple', model: 'iPhone 16 Pro', costUsd: 980, storages: ['128 GB', '256 GB', '512 GB'], colors: ['Black Titanium', 'White Titanium', 'Natural Titanium', 'Desert Titanium'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-104' },
    { brand: 'Apple', model: 'iPhone 16', costUsd: 790, storages: ['128 GB', '256 GB'], colors: ['Black', 'White', 'Teal', 'Pink', 'Ultramarine'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-101' },
    { brand: 'Apple', model: 'iPhone 15 Pro Max', costUsd: 1020, storages: ['256 GB', '512 GB'], colors: ['Natural Titanium', 'Black Titanium', 'Blue Titanium', 'White Titanium'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-101' },
    { brand: 'Apple', model: 'iPhone 15 Pro', costUsd: 870, storages: ['128 GB', '256 GB'], colors: ['Black Titanium', 'Blue Titanium', 'White Titanium'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-101' },
    { brand: 'Apple', model: 'iPhone 15', costUsd: 690, storages: ['128 GB', '256 GB'], colors: ['Black', 'Blue', 'Green', 'Pink', 'Yellow'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-101' },
    { brand: 'Samsung', model: 'Galaxy S25 Ultra', costUsd: 1100, storages: ['256 GB', '512 GB', '1 TB'], colors: ['Titanium Gray', 'Titanium Black', 'Titanium Silver', 'Titanium Blue'], supplierId: 'sup-samsung', supplierName: 'Samsung Central Asia', inv: 'INV-112' },
    { brand: 'Samsung', model: 'Galaxy S24 Ultra', costUsd: 950, storages: ['256 GB', '512 GB'], colors: ['Titanium Gray', 'Titanium Black', 'Titanium Violet', 'Titanium Yellow'], supplierId: 'sup-samsung', supplierName: 'Samsung Central Asia', inv: 'INV-112' },
    { brand: 'Samsung', model: 'Galaxy S24+', costUsd: 750, storages: ['256 GB', '512 GB'], colors: ['Onyx Black', 'Marble Gray', 'Cobalt Violet'], supplierId: 'sup-samsung', supplierName: 'Samsung Central Asia', inv: 'INV-112' },
    { brand: 'Samsung', model: 'Galaxy S24', costUsd: 620, storages: ['128 GB', '256 GB'], colors: ['Onyx Black', 'Marble Gray', 'Amber Yellow'], supplierId: 'sup-samsung', supplierName: 'Samsung Central Asia', inv: 'INV-112' },
    { brand: 'Samsung', model: 'Galaxy A55', costUsd: 340, storages: ['128 GB', '256 GB'], colors: ['Awesome Navy', 'Awesome Iceblue', 'Awesome Lemon'], supplierId: 'sup-samsung', supplierName: 'Samsung Central Asia', inv: 'INV-112' },
    { brand: 'Xiaomi', model: 'Xiaomi 14 Ultra', costUsd: 920, storages: ['512 GB', '1 TB'], colors: ['Black', 'White', 'Olive Green'], supplierId: 'sup-xiaomi', supplierName: 'Xiaomi Tech Hub', inv: 'INV-108' },
    { brand: 'Xiaomi', model: 'Xiaomi 14', costUsd: 640, storages: ['256 GB', '512 GB'], colors: ['Black', 'White', 'Jade Green'], supplierId: 'sup-xiaomi', supplierName: 'Xiaomi Tech Hub', inv: 'INV-108' },
    { brand: 'Xiaomi', model: 'Redmi Note 13 Pro+', costUsd: 310, storages: ['256 GB', '512 GB'], colors: ['Midnight Black', 'Moonlight White', 'Aurora Purple'], supplierId: 'sup-xiaomi', supplierName: 'Xiaomi Tech Hub', inv: 'INV-108' },
    { brand: 'Xiaomi', model: 'POCO X6 Pro', costUsd: 280, storages: ['256 GB', '512 GB'], colors: ['Yellow', 'Black', 'Grey'], supplierId: 'sup-xiaomi', supplierName: 'Xiaomi Tech Hub', inv: 'INV-108' },
    { brand: 'Google', model: 'Pixel 9 Pro', costUsd: 890, storages: ['256 GB', '512 GB'], colors: ['Obsidian', 'Porcelain', 'Hazel', 'Rose Quartz'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-104' },
    { brand: 'OnePlus', model: 'OnePlus 12', costUsd: 680, storages: ['256 GB', '512 GB'], colors: ['Silky Black', 'Flowy Emerald', 'Cool Blue'], supplierId: 'sup-xiaomi', supplierName: 'Xiaomi Tech Hub', inv: 'INV-108' },
    { brand: 'Honor', model: 'Magic6 Pro', costUsd: 840, storages: ['512 GB'], colors: ['Black', 'Epi Green', 'Cloud Purple'], supplierId: 'sup-samsung', supplierName: 'Samsung Central Asia', inv: 'INV-112' },
    { brand: 'Apple', model: 'iPad Pro 13', costUsd: 1200, storages: ['256 GB', '512 GB', '1 TB'], colors: ['Space Black', 'Silver'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-104' },
    { brand: 'Apple', model: 'Apple Watch Ultra 2', costUsd: 750, storages: ['GPS + Cellular'], colors: ['Titanium Ocean', 'Titanium Alpine', 'Titanium Trail'], supplierId: 'sup-apple', supplierName: 'Apple Direct Dubai', inv: 'INV-104' },
  ];

  const storeList = [
    { id: 'main-warehouse', name: 'Главный склад', status: 'MAIN_WAREHOUSE' as const },
    { id: 'store-1', name: 'Магазин №1 (Рудаки)', status: 'STORE_STOCK' as const },
    { id: 'store-2', name: 'Магазин №2 (Сомони)', status: 'STORE_STOCK' as const },
  ];

  const result: Device[] = [];
  let baseImei = 354891100100000;
  let idCounter = 1;

  for (const spec of specs) {
    for (let i = 0; i < 10; i++) {
      baseImei++;
      idCounter++;
      const storage = spec.storages[i % spec.storages.length];
      const color = spec.colors[i % spec.colors.length];
      const storeObj = storeList[i % storeList.length];

      result.push({
        id: `dev-${idCounter}`,
        imei: baseImei.toString(),
        serialNumber: `${spec.brand.substring(0, 3).toUpperCase()}${baseImei.toString().substring(9)}`,
        barcode: `880${baseImei.toString().substring(6, 15)}`,
        brand: spec.brand,
        model: spec.model,
        storage: storage,
        color: color,
        status: storeObj.status,
        locationId: storeObj.id,
        locationName: storeObj.name,
        supplierId: spec.supplierId,
        supplierName: spec.supplierName,
        invoiceNumber: spec.inv,
        purchaseCostUsd: spec.costUsd,
        costBasisUsd: spec.costUsd,
        createdAt: '2026-08-01T10:00:00Z',
        timeline: [
          { id: `t-${idCounter}-1`, date: '2026-08-01 10:00', type: 'INCOME', description: `Приход по накладной ${spec.inv} ($${spec.costUsd})`, user: 'Администратор' }
        ]
      });
    }
  }

  // Include demo sold devices and bonus gift devices
  result.push(
    {
      id: 'dev-bonus-1',
      imei: '354891100109901',
      serialNumber: 'SAM-BONUS-01',
      barcode: '880609000001',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      storage: '256 GB',
      color: 'Titanium Black',
      status: 'MAIN_WAREHOUSE',
      locationId: 'main-warehouse',
      locationName: 'Главный склад',
      supplierId: 'sup-samsung',
      supplierName: 'Samsung Central Asia',
      invoiceNumber: 'INV-112-BONUS',
      purchaseCostUsd: 0,
      costBasisUsd: 0,
      isBonus: true,
      bonusCampaign: 'Samsung August Target Bonus',
      createdAt: '2026-08-10',
      timeline: [
        {
          id: 't-bonus-1',
          date: '10.08.2026, 12:00',
          type: 'INTAKE',
          description: 'Подарочный телефон ($0) по акции Samsung August Target Bonus',
          user: 'Администратор',
          storeName: 'Главный склад',
          priceUsd: 0
        }
      ]
    },
    {
      id: 'dev-bonus-2',
      imei: '354891100109902',
      serialNumber: 'SAM-BONUS-02',
      barcode: '880609000002',
      brand: 'Samsung',
      model: 'Galaxy S24+',
      storage: '256 GB',
      color: 'Cobalt Violet',
      status: 'STORE_STOCK',
      locationId: 'store-1',
      locationName: 'Магазин №1 (Рудаки)',
      supplierId: 'sup-samsung',
      supplierName: 'Samsung Central Asia',
      invoiceNumber: 'INV-112-BONUS',
      purchaseCostUsd: 0,
      costBasisUsd: 0,
      isBonus: true,
      bonusCampaign: 'Samsung August Target Bonus',
      createdAt: '2026-08-10',
      timeline: [
        {
          id: 't-bonus-2',
          date: '10.08.2026, 12:00',
          type: 'INTAKE',
          description: 'Подарочный телефон ($0) по акции Samsung August Target Bonus',
          user: 'Администратор',
          storeName: 'Главный склад',
          priceUsd: 0
        }
      ]
    },
    {
      id: 'dev-bonus-3',
      imei: '354891100109903',
      serialNumber: 'SAM-BONUS-03',
      barcode: '880609000003',
      brand: 'Samsung',
      model: 'Galaxy A55',
      storage: '128 GB',
      color: 'Awesome Navy',
      status: 'STORE_STOCK',
      locationId: 'store-1',
      locationName: 'Магазин №1 (Рудаки)',
      supplierId: 'sup-samsung',
      supplierName: 'Samsung Central Asia',
      invoiceNumber: 'INV-112-BONUS',
      purchaseCostUsd: 0,
      costBasisUsd: 0,
      isBonus: true,
      bonusCampaign: 'Samsung August Target Bonus',
      createdAt: '2026-08-10',
      timeline: [
        {
          id: 't-bonus-3',
          date: '10.08.2026, 12:00',
          type: 'INTAKE',
          description: 'Подарочный телефон ($0) по акции Samsung August Target Bonus',
          user: 'Администратор',
          storeName: 'Главный склад',
          priceUsd: 0
        }
      ]
    },
    {
      id: 'dev-bonus-4',
      imei: '354891100109904',
      serialNumber: 'SAM-BONUS-04',
      barcode: '880609000004',
      brand: 'Samsung',
      model: 'Galaxy A55',
      storage: '128 GB',
      color: 'Awesome Lemon',
      status: 'MAIN_WAREHOUSE',
      locationId: 'main-warehouse',
      locationName: 'Главный склад',
      supplierId: 'sup-samsung',
      supplierName: 'Samsung Central Asia',
      invoiceNumber: 'INV-112-BONUS',
      purchaseCostUsd: 0,
      costBasisUsd: 0,
      isBonus: true,
      bonusCampaign: 'Samsung August Target Bonus',
      createdAt: '2026-08-10',
      timeline: [
        {
          id: 't-bonus-4',
          date: '10.08.2026, 12:00',
          type: 'INTAKE',
          description: 'Подарочный телефон ($0) по акции Samsung August Target Bonus',
          user: 'Администратор',
          storeName: 'Главный склад',
          priceUsd: 0
        }
      ]
    },
    {
      id: 'dev-sold-1',
      imei: '354891100111222',
      serialNumber: 'APL332211',
      barcode: '194253901111',
      brand: 'Apple',
      model: 'iPhone 16 Pro',
      storage: '256 GB',
      color: 'Natural Titanium',
      status: 'SOLD',
      locationId: 'store-2',
      locationName: 'Магазин №2 (Сомони)',
      supplierId: 'sup-apple',
      supplierName: 'Apple Direct Dubai',
      invoiceNumber: 'INV-101',
      purchaseCostUsd: 900,
      costBasisUsd: 900,
      createdAt: '2026-07-01T10:00:00Z',
      timeline: [
        { id: 't-sold-1', date: '2026-07-01 10:00', type: 'INCOME', description: 'Приход по накладной INV-101', user: 'Администратор' },
        { id: 't-sold-2', date: '2026-08-18 14:20', type: 'SALE', description: 'Продажа по чеку #1058 за 9 200 TJS ($968.42)', user: 'Ahmad', priceTjs: 9200, priceUsd: 968.42 }
      ]
    },
    {
      id: 'dev-sold-2',
      imei: '358901200333444',
      serialNumber: 'SMG771122',
      barcode: '880609100333',
      brand: 'Samsung',
      model: 'Galaxy S24 Ultra',
      storage: '256 GB',
      color: 'Titanium Gray',
      status: 'SOLD',
      locationId: 'store-2',
      locationName: 'Магазин №2 (Сомони)',
      supplierId: 'sup-samsung',
      supplierName: 'Samsung Central Asia',
      invoiceNumber: 'INV-112',
      purchaseCostUsd: 950,
      costBasisUsd: 950,
      createdAt: '2026-08-10T11:00:00Z',
      timeline: [
        { id: 't-sold-3', date: '2026-08-10 11:00', type: 'INCOME', description: 'Приход по накладной INV-112', user: 'Администратор' },
        { id: 't-sold-4', date: '2026-08-18 15:05', type: 'SALE', description: 'Продажа по чеку #1059 за 10 500 TJS ($1105.26)', user: 'Ahmad', priceTjs: 10500, priceUsd: 1105.26 }
      ]
    }
  );

  return result;
}

export const INITIAL_DEVICES: Device[] = generate200Devices();

export const INITIAL_SALES: Sale[] = [
  {
    id: 'sale-1058',
    receiptNumber: 1058,
    date: '2026-08-18T14:20:00Z',
    storeId: 'store-2',
    storeName: 'Магазин №2 (Сомони)',
    sellerId: 'user-ahmad',
    sellerName: 'Ahmad',
    customerName: 'Искандар',
    items: [
      {
        deviceId: 'dev-sold-1',
        imei: '354891100111222',
        brand: 'Apple',
        model: 'iPhone 16 Pro',
        storage: '256 GB',
        color: 'Natural Titanium',
        salePriceTjs: 9200,
        salePriceUsd: 968.42,
        purchaseCostUsd: 900,
        costBasisUsd: 900,
        isBelowCost: false
      }
    ],
    totalTjs: 9200,
    totalUsd: 968.42,
    exchangeRate: 9.50,
    paymentMethod: 'SPLIT',
    cashAmountTjs: 5000,
    cardAmountTjs: 4200,
    status: 'COMPLETED',
    hasBelowCostItem: false
  },
  {
    id: 'sale-1059',
    receiptNumber: 1059,
    date: '2026-08-18T15:05:00Z',
    storeId: 'store-2',
    storeName: 'Магазин №2 (Сомони)',
    sellerId: 'user-ahmad',
    sellerName: 'Ahmad',
    customerName: 'Собир',
    items: [
      {
        deviceId: 'dev-sold-2',
        imei: '358901200333444',
        brand: 'Samsung',
        model: 'Samsung S26',
        storage: '256 GB',
        color: 'Phantom Black',
        salePriceTjs: 8500,
        salePriceUsd: 894.74,
        purchaseCostUsd: 720,
        costBasisUsd: 720,
        isBelowCost: false
      }
    ],
    totalTjs: 8500,
    totalUsd: 894.74,
    exchangeRate: 9.50,
    paymentMethod: 'CASH',
    cashAmountTjs: 8500,
    cardAmountTjs: 0,
    status: 'COMPLETED',
    hasBelowCostItem: false
  }
];

export const INITIAL_TRANSFERS: TransferRequest[] = [
  {
    id: 'tr-105',
    transferNumber: 'TR-105',
    fromLocationId: 'store-2',
    fromLocationName: 'Магазин №2 (Сомони)',
    toLocationId: 'main-warehouse',
    toLocationName: 'Главный склад',
    deviceIds: ['dev-9'],
    deviceImeis: ['867011005566701'],
    deviceModels: ['Xiaomi 15 (256 GB / Silver)'],
    requestedBy: 'Ahmad',
    requestedAt: '2026-08-20T10:40:00Z',
    status: 'PENDING_APPROVAL'
  }
];

export const INITIAL_REPAIRS: RepairTicket[] = [
  {
    id: 'rep-1',
    ticketNumber: 201,
    deviceId: 'dev-sold-1',
    imei: '354891100111222',
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    storage: '256 GB',
    color: 'Natural Titanium',
    saleReceiptNumber: 1058,
    saleDate: '2026-08-18',
    storeId: 'store-2',
    storeName: 'Магазин №2 (Сомони)',
    intakeSeller: 'Ahmad',
    customerName: 'Искандар',
    customerPhone: '+992 92 111 2233',
    problemDescription: 'Не заряжается от беспроводной зарядки MagSafe',
    visualCondition: 'Без царапин, наклеено защитное стекло',
    equipmentPackage: 'Только телефон',
    comment: 'Принят по гарантии',
    status: 'ACCEPTED',
    statusHistory: [
      { status: 'ACCEPTED', updatedAt: '2026-08-19T11:20:00Z', updatedBy: 'Ahmad', note: 'Первичный прием' }
    ],
    createdAt: '2026-08-19T11:20:00Z'
  }
];

export const INITIAL_BONUSES: SupplierBonus[] = [
  {
    id: 'bon-2',
    supplierId: 'sup-apple',
    supplierName: 'Apple Direct Dubai',
    campaignTitle: 'Акция',
    campaignName: 'Акция',
    bonusType: 'FREE_DEVICES',
    deviceId: 'dev-bonus-apple-1',
    imei: '316513218151383',
    brand: 'Apple',
    model: 'iPhone 16',
    storage: '128 GB',
    color: 'Teal',
    estimatedValueUsd: 790,
    status: 'IN_STOCK',
    dateReceived: '2026-08-21',
    date: '2026-08-21',
    freeDevices: [
      {
        brand: 'Apple',
        model: 'iPhone 16',
        storage: '128 GB',
        color: 'Teal',
        imei: '316513218151383',
        costBasisUsd: 0
      }
    ]
  },
  {
    id: 'bon-1',
    supplierId: 'sup-samsung',
    supplierName: 'Samsung Central Asia',
    campaignTitle: 'Samsung August Target Bonus',
    campaignName: 'Samsung August Target Bonus',
    bonusType: 'FREE_DEVICES',
    deviceId: 'dev-bonus-1',
    imei: '358901200778899',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    storage: '256 GB',
    color: 'Titanium Black',
    estimatedValueUsd: 950,
    status: 'IN_STOCK',
    dateReceived: '2026-08-10',
    date: '2026-08-10',
    freeDevices: [
      {
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        storage: '256 GB',
        color: 'Titanium Black',
        imei: '358901200778899',
        costBasisUsd: 0
      }
    ]
  }
];

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'exp-1',
    date: '2026-08-18',
    category: 'Аренда',
    amountTjs: 5000,
    exchangeRate: 9.50,
    amountUsd: 526.32,
    targetType: 'STORE',
    storeId: 'store-1',
    storeName: 'Магазин №1 (Рудаки)',
    sourceAccount: 'Касса Store #1',
    comment: 'Аренда помещения за август',
    createdByName: 'Администратор'
  },
  {
    id: 'exp-2',
    date: '2026-08-19',
    category: 'Транспорт',
    amountTjs: 450,
    exchangeRate: 9.50,
    amountUsd: 47.37,
    targetType: 'BUSINESS',
    sourceAccount: 'Главный счет',
    comment: 'Доставка партии товара с таможни',
    createdByName: 'Рустам (Партнер)'
  }
];

export const INITIAL_OWNERS: Owner[] = [
  {
    id: 'owner-1',
    name: 'Владелец 1 (Шариф)',
    profitSharePercent: 60,
    capitalBalanceUsd: 32000,
    totalAccruedProfitUsd: 18000,
    totalPaidProfitUsd: 12000,
    totalReinvestedUsd: 2000,
    availableProfitUsd: 4000
  },
  {
    id: 'owner-2',
    name: 'Владелец 2 (Далер)',
    profitSharePercent: 40,
    capitalBalanceUsd: 23000,
    totalAccruedProfitUsd: 12000,
    totalPaidProfitUsd: 8000,
    totalReinvestedUsd: 1500,
    availableProfitUsd: 2500
  }
];

export const INITIAL_OWNER_TRANSACTIONS: OwnerTransaction[] = [
  {
    id: 'ot-1',
    ownerId: 'owner-1',
    ownerName: 'Владелец 1 (Шариф)',
    type: 'INVESTMENT',
    amountUsd: 5000,
    date: '2026-08-01',
    sourceOrDestination: 'Главный счет',
    createdByName: 'Администратор',
    note: 'Дополнительное вложение в оборот'
  },
  {
    id: 'ot-2',
    ownerId: 'owner-2',
    ownerName: 'Владелец 2 (Далер)',
    type: 'PROFIT_PAYOUT',
    amountUsd: 2000,
    date: '2026-08-10',
    sourceOrDestination: 'Главный счет',
    createdByName: 'Администратор',
    note: 'Выплата дивидендов за июль'
  }
];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: 'Запрос на перемещение',
    message: 'Ahmad запросил перемещение 1 устройства из Магазин №2 в Главный склад (TR-105)',
    date: '2026-08-20T10:40:00Z',
    targetType: 'TRANSFER_REQUEST',
    targetId: 'tr-105',
    targetRoute: 'TRANSFER',
    read: false,
    resolved: false
  }
];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [
  {
    id: 'aud-1',
    timestamp: '2026-08-20T08:00:00Z',
    action: 'RATE_SET',
    userName: 'Администратор',
    userRole: 'ADMIN',
    details: 'Установлен дневной курс 1 USD = 9.50 TJS',
    financialDetails: { exchangeRate: 9.50 }
  },
  {
    id: 'aud-2',
    timestamp: '2026-08-20T10:40:00Z',
    action: 'TRANSFER_REQUEST',
    userName: 'Ahmad',
    userRole: 'SELLER',
    storeName: 'Магазин №2 (Сомони)',
    details: 'Создан запрос на перемещение TR-105 (Xiaomi 15)',
    imei: '867011005566701',
    targetId: 'tr-105'
  },
  {
    id: 'aud-3',
    timestamp: '2026-08-18T14:20:00Z',
    action: 'SALE',
    userName: 'Ahmad',
    userRole: 'SELLER',
    storeName: 'Магазин №2 (Сомони)',
    details: 'Продажа чека #1058 (iPhone 16 Pro 256GB Black)',
    financialDetails: {
      amountTjs: 9200,
      amountUsd: 968.42,
      exchangeRate: 9.50,
      purchaseCostUsd: 900,
      salePriceTjs: 9200
    },
    imei: '354891100111222',
    receiptNumber: 1058
  }
];

export const INITIAL_LEDGER: LedgerEntry[] = [
  {
    id: 'led-1',
    timestamp: '2026-08-18T14:20:00Z',
    type: 'SALE',
    description: 'Продажа по чеку #1058 (Cash: 5000 TJS, Card: 4200 TJS)',
    amountTjs: 9200,
    amountUsd: 968.42,
    exchangeRate: 9.50,
    storeId: 'store-2',
    storeName: 'Магазин №2 (Сомони)',
    referenceId: 'sale-1058',
    userName: 'Ahmad'
  },
  {
    id: 'led-2',
    timestamp: '2026-08-18T15:05:00Z',
    type: 'CASH_SALE',
    description: 'Продажа по чеку #1059 (Cash: 8500 TJS)',
    amountTjs: 8500,
    amountUsd: 894.74,
    exchangeRate: 9.50,
    storeId: 'store-2',
    storeName: 'Магазин №2 (Сомони)',
    referenceId: 'sale-1059',
    userName: 'Ahmad'
  },
  {
    id: 'led-3',
    timestamp: '2026-08-18T18:00:00Z',
    type: 'EXPENSE',
    description: 'Расход: Аренда помещения (Магазин №1)',
    amountTjs: -5000,
    amountUsd: -526.32,
    exchangeRate: 9.50,
    storeId: 'store-1',
    storeName: 'Магазин №1 (Рудаки)',
    referenceId: 'exp-1',
    userName: 'Администратор'
  }
];
