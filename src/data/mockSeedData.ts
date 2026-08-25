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
    id: 'store-siyoma',
    name: 'Сиёма',
    isMainWarehouse: false,
    cashBalanceTjs: 0,
    active: true
  }
];

export const INITIAL_USERS: User[] = [
  {
    id: 'user-admin',
    name: 'Далер',
    login: 'admin',
    passwordHash: 'admin123',
    role: 'ADMIN',
    active: true,
    createdAt: '2026-01-01T08:00:00Z'
  },
  {
    id: 'user-partner',
    name: 'Рустам',
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
    storeId: 'store-siyoma',
    storeName: 'Сиёма',
    active: true,
    createdAt: '2026-02-01T09:00:00Z'
  },
  {
    id: 'user-farhod',
    name: 'Фарход',
    login: 'farhod',
    passwordHash: 'seller123',
    role: 'SELLER',
    storeId: 'store-siyoma',
    storeName: 'Сиёма',
    active: true,
    createdAt: '2026-02-01T09:00:00Z'
  }
];

export const INITIAL_SUPPLIERS: Supplier[] = [
  {
    id: 'sup-1',
    name: 'Apple Distributor Corp',
    phone: '+992 93 555 0101',
    contactPerson: 'Александр Смирнов',
    totalDebtUsd: 2100,
    totalPaidUsd: 5000,
    totalPurchasedUsd: 7100,
    createdAt: '2026-08-01T08:00:00Z'
  },
  {
    id: 'sup-2',
    name: 'Samsung Global Asia',
    phone: '+992 90 777 0202',
    contactPerson: 'Дмитрий Ким',
    totalDebtUsd: 1200,
    totalPaidUsd: 3000,
    totalPurchasedUsd: 4200,
    createdAt: '2026-08-05T09:00:00Z'
  },
  {
    id: 'sup-3',
    name: 'Xiaomi Tech Logistics',
    phone: '+992 91 888 0303',
    contactPerson: 'Ли Вэй',
    totalDebtUsd: 0,
    totalPaidUsd: 2500,
    totalPurchasedUsd: 2500,
    createdAt: '2026-08-10T10:00:00Z'
  }
];

export const INITIAL_INVOICES: SupplierInvoice[] = [
  {
    id: 'inv-101',
    invoiceNumber: 'INV-101',
    supplierId: 'sup-1',
    supplierName: 'Apple Distributor Corp',
    date: '2026-08-15T10:00:00Z',
    devicesCount: 4,
    totalAmountUsd: 3420,
    paidAmountUsd: 1320,
    remainingAmountUsd: 2100,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-102',
    invoiceNumber: 'INV-102',
    supplierId: 'sup-2',
    supplierName: 'Samsung Global Asia',
    date: '2026-08-18T11:30:00Z',
    devicesCount: 3,
    totalAmountUsd: 2330,
    paidAmountUsd: 1130,
    remainingAmountUsd: 1200,
    status: 'PARTIALLY_PAID'
  },
  {
    id: 'inv-103',
    invoiceNumber: 'INV-103',
    supplierId: 'sup-3',
    supplierName: 'Xiaomi Tech Logistics',
    date: '2026-08-20T14:00:00Z',
    devicesCount: 3,
    totalAmountUsd: 1270,
    paidAmountUsd: 1270,
    remainingAmountUsd: 0,
    status: 'PAID'
  }
];

export const INITIAL_DEVICES: Device[] = [
  // Brand 1: Apple (4 devices)
  {
    id: 'dev-apple-1',
    brand: 'Apple',
    model: 'iPhone 16 Pro Max',
    storage: '512 GB',
    color: 'Natural Titanium',
    imei: '358901209876543',
    imei2: '358901209876544',
    barcode: '194253123456',
    status: 'STORE_STOCK',
    locationId: 'store-1',
    locationName: 'Сиёма',
    supplierId: 'sup-1',
    supplierName: 'Apple Distributor Corp',
    invoiceNumber: 'INV-101',
    purchaseCostUsd: 1200,
    costBasisUsd: 1200,
    createdAt: '2026-08-15T10:00:00Z',
    timeline: [
      { id: 't-1', date: '15.08 10:00', type: 'PURCHASE', description: 'Оприходован на главный склад по накладной INV-101 ($1200)', user: 'Далер', storeName: 'Главный склад' },
      { id: 't-2', date: '17.08 14:20', type: 'TRANSFER', description: 'Перемещен на склад: Сиёма', user: 'Далер', storeName: 'Сиёма' }
    ]
  },
  {
    id: 'dev-apple-2',
    brand: 'Apple',
    model: 'iPhone 16 Pro',
    storage: '256 GB',
    color: 'Black Titanium',
    imei: '358901209876545',
    imei2: '358901209876546',
    barcode: '194253123457',
    status: 'SOLD',
    locationId: 'store-1',
    locationName: 'Сиёма',
    supplierId: 'sup-1',
    supplierName: 'Apple Distributor Corp',
    invoiceNumber: 'INV-101',
    purchaseCostUsd: 980,
    costBasisUsd: 980,
    createdAt: '2026-08-15T10:00:00Z',
    timeline: [
      { id: 't-3', date: '15.08 10:00', type: 'PURCHASE', description: 'Оприходован по накладной INV-101 ($980)', user: 'Далер', storeName: 'Сиёма' },
      { id: 't-4', date: '21.08 16:45', type: 'SALE', description: 'Продан покупателю Алишер Р. за 10 800 TJS ($1136.84)', user: 'Фарход', storeName: 'Сиёма' }
    ]
  },
  {
    id: 'dev-apple-3',
    brand: 'Apple',
    model: 'iPhone 15',
    storage: '128 GB',
    color: 'Blue',
    imei: '358901209876547',
    barcode: '194253123458',
    status: 'MAIN_WAREHOUSE',
    locationId: 'main-warehouse',
    locationName: 'Главный склад',
    supplierId: 'sup-1',
    supplierName: 'Apple Distributor Corp',
    invoiceNumber: 'INV-101',
    purchaseCostUsd: 720,
    costBasisUsd: 720,
    createdAt: '2026-08-15T10:00:00Z',
    timeline: [
      { id: 't-5', date: '15.08 10:00', type: 'PURCHASE', description: 'Оприходован на главный склад по накладной INV-101 ($720)', user: 'Далер', storeName: 'Главный склад' }
    ]
  },
  {
    id: 'dev-apple-4',
    brand: 'Apple',
    model: 'iPhone 13',
    storage: '128 GB',
    color: 'Midnight',
    imei: '358901207766554',
    barcode: '194253776655',
    status: 'IN_STOCK_AFTER_EXCHANGE',
    locationId: 'store-1',
    locationName: 'Сиёма',
    supplierId: 'sup-1',
    supplierName: 'Trade-In Клиент',
    purchaseCostUsd: 473.68,
    costBasisUsd: 473.68,
    createdAt: '2026-08-21T16:45:00Z',
    timeline: [
      { id: 't-6', date: '21.08 16:45', type: 'EXCHANGE_IN', description: 'Принят по обмену (Trade-In). Оценка: 4 500 TJS ($473.68)', user: 'Фарход', storeName: 'Сиёма' }
    ]
  },

  // Brand 2: Samsung (3 devices)
  {
    id: 'dev-samsung-1',
    brand: 'Samsung',
    model: 'Galaxy S24 Ultra',
    storage: '512 GB',
    color: 'Titanium Gray',
    imei: '354890123456781',
    imei2: '354890123456782',
    barcode: '880609123456',
    status: 'SOLD',
    locationId: 'store-2',
    locationName: 'Сиёма',
    supplierId: 'sup-2',
    supplierName: 'Samsung Global Asia',
    invoiceNumber: 'INV-102',
    purchaseCostUsd: 1100,
    costBasisUsd: 1100,
    createdAt: '2026-08-18T11:30:00Z',
    timeline: [
      { id: 't-7', date: '18.08 11:30', type: 'PURCHASE', description: 'Оприходован в Магазин №2 по накладной INV-102 ($1100)', user: 'Далер', storeName: 'Сиёма' },
      { id: 't-8', date: '22.08 12:15', type: 'SALE', description: 'Продан за 11 900 TJS ($1252.63) по карте', user: 'Ахмад', storeName: 'Сиёма' }
    ]
  },
  {
    id: 'dev-samsung-2',
    brand: 'Samsung',
    model: 'Galaxy S24+',
    storage: '256 GB',
    color: 'Onyx Black',
    imei: '354890123456783',
    barcode: '880609123457',
    status: 'STORE_STOCK',
    locationId: 'store-2',
    locationName: 'Сиёма',
    supplierId: 'sup-2',
    supplierName: 'Samsung Global Asia',
    invoiceNumber: 'INV-102',
    purchaseCostUsd: 850,
    costBasisUsd: 850,
    createdAt: '2026-08-18T11:30:00Z',
    timeline: [
      { id: 't-9', date: '18.08 11:30', type: 'PURCHASE', description: 'Оприходован на главный склад по накладной INV-102 ($850)', user: 'Далер', storeName: 'Главный склад' },
      { id: 't-10', date: '19.08 15:10', type: 'TRANSFER', description: 'Перемещен в Сиёма', user: 'Далер', storeName: 'Сиёма' }
    ]
  },
  {
    id: 'dev-samsung-3',
    brand: 'Samsung',
    model: 'Galaxy A55',
    storage: '128 GB',
    color: 'Awesome Iceblue',
    imei: '354890123456784',
    barcode: '880609123458',
    status: 'STORE_STOCK',
    locationId: 'store-1',
    locationName: 'Сиёма',
    supplierId: 'sup-2',
    supplierName: 'Samsung Global Asia',
    invoiceNumber: 'INV-102',
    purchaseCostUsd: 380,
    costBasisUsd: 380,
    createdAt: '2026-08-18T11:30:00Z',
    timeline: [
      { id: 't-11', date: '18.08 11:30', type: 'PURCHASE', description: 'Оприходован по накладной INV-102 ($380)', user: 'Далер', storeName: 'Сиёма' }
    ]
  },

  // Brand 3: Xiaomi (3 devices including 🎁 Gift $0)
  {
    id: 'dev-xiaomi-1',
    brand: 'Xiaomi',
    model: 'Xiaomi 14 Ultra',
    storage: '512 GB',
    color: 'White',
    imei: '864920059876541',
    imei2: '864920059876542',
    barcode: '690123456781',
    status: 'MAIN_WAREHOUSE',
    locationId: 'main-warehouse',
    locationName: 'Главный склад',
    supplierId: 'sup-3',
    supplierName: 'Xiaomi Tech Logistics',
    invoiceNumber: 'INV-103',
    purchaseCostUsd: 950,
    costBasisUsd: 950,
    createdAt: '2026-08-20T14:00:00Z',
    timeline: [
      { id: 't-12', date: '20.08 14:00', type: 'PURCHASE', description: 'Оприходован на главный склад по накладной INV-103 ($950)', user: 'Далер', storeName: 'Главный склад' }
    ]
  },
  {
    id: 'dev-xiaomi-2',
    brand: 'Xiaomi',
    model: 'Redmi Note 13 Pro+',
    storage: '256 GB',
    color: 'Aurora Purple',
    imei: '864920059876543',
    barcode: '690123456782',
    status: 'SOLD',
    locationId: 'store-2',
    locationName: 'Сиёма',
    supplierId: 'sup-3',
    supplierName: 'Xiaomi Tech Logistics',
    invoiceNumber: 'INV-103',
    purchaseCostUsd: 320,
    costBasisUsd: 320,
    createdAt: '2026-08-20T14:00:00Z',
    timeline: [
      { id: 't-13', date: '20.08 14:00', type: 'PURCHASE', description: 'Оприходован в Магазин №2 по накладной INV-103 ($320)', user: 'Далер', storeName: 'Сиёма' },
      { id: 't-14', date: '23.08 11:00', type: 'SALE', description: 'Продан за 3 700 TJS ($389.47)', user: 'Ахмад', storeName: 'Сиёма' }
    ]
  },
  {
    id: 'dev-gift-xiaomi-redmi-13',
    brand: 'Xiaomi',
    model: 'Redmi Note 13',
    storage: '256 GB',
    color: 'Midnight Black',
    imei: '864920051234567',
    barcode: '690123456783',
    status: 'MAIN_WAREHOUSE',
    locationId: 'main-warehouse',
    locationName: 'Главный склад',
    supplierId: 'sup-3',
    supplierName: 'Xiaomi Tech Logistics',
    purchaseCostUsd: 0,
    costBasisUsd: 180,
    isBonus: true,
    bonusCampaign: 'Бонус за закупку партий Xiaomi ($0 подарок)',
    createdAt: '2026-08-20T14:00:00Z',
    timeline: [
      { id: 't-gift-1', date: '20.08 14:00', type: 'BONUS', description: 'Получен бесплатный бонус от Xiaomi ($0 подарок)', user: 'Далер', storeName: 'Главный склад' }
    ]
  }
];

export const INITIAL_SALES: Sale[] = [
  {
    id: 'sale-1001',
    receiptNumber: 1001,
    date: '2026-08-21T16:45:00Z',
    storeId: 'store-1',
    storeName: 'Сиёма',
    sellerId: 'user-farhod',
    sellerName: 'Фарход',
    customerName: 'Алишер Рахимов',
    paymentMethod: 'CASH',
    totalUsd: 1136.84,
    totalTjs: 10800,
    cashAmountTjs: 10800,
    cardAmountTjs: 0,
    status: 'COMPLETED',
    items: [
      {
        deviceId: 'dev-apple-2',
        brand: 'Apple',
        model: 'iPhone 16 Pro',
        storage: '256 GB',
        color: 'Black Titanium',
        imei: '358901209876545',
        purchaseCostUsd: 980,
        costBasisUsd: 980,
        salePriceUsd: 1136.84,
        salePriceTjs: 10800
      }
    ]
  },
  {
    id: 'sale-1002',
    receiptNumber: 1002,
    date: '2026-08-22T12:15:00Z',
    storeId: 'store-2',
    storeName: 'Сиёма',
    sellerId: 'user-ahmad',
    sellerName: 'Ахмад',
    customerName: 'Зафар Каримов',
    paymentMethod: 'CARD',
    totalUsd: 1252.63,
    totalTjs: 11900,
    cashAmountTjs: 0,
    cardAmountTjs: 11900,
    status: 'COMPLETED',
    items: [
      {
        deviceId: 'dev-samsung-1',
        brand: 'Samsung',
        model: 'Galaxy S24 Ultra',
        storage: '512 GB',
        color: 'Titanium Gray',
        imei: '354890123456781',
        purchaseCostUsd: 1100,
        costBasisUsd: 1100,
        salePriceUsd: 1252.63,
        salePriceTjs: 11900
      }
    ]
  },
  {
    id: 'sale-1003',
    receiptNumber: 1003,
    date: '2026-08-23T11:00:00Z',
    storeId: 'store-2',
    storeName: 'Сиёма',
    sellerId: 'user-ahmad',
    sellerName: 'Ахмад',
    customerName: 'Фаридун Саидов',
    paymentMethod: 'CASH',
    totalUsd: 389.47,
    totalTjs: 3700,
    cashAmountTjs: 3700,
    cardAmountTjs: 0,
    status: 'COMPLETED',
    items: [
      {
        deviceId: 'dev-xiaomi-2',
        brand: 'Xiaomi',
        model: 'Redmi Note 13 Pro+',
        storage: '256 GB',
        color: 'Aurora Purple',
        imei: '864920059876543',
        purchaseCostUsd: 320,
        costBasisUsd: 320,
        salePriceUsd: 389.47,
        salePriceTjs: 3700
      }
    ]
  }
];

export const INITIAL_TRANSFERS: TransferRequest[] = [
  {
    id: 'tr-801',
    transferNumber: 'TR-801',
    fromLocationId: 'main-warehouse',
    fromLocationName: 'Главный склад',
    toLocationId: 'store-1',
    toLocationName: 'Сиёма',
    deviceIds: ['dev-apple-1'],
    deviceImeis: ['358901209876543'],
    deviceModels: ['Apple iPhone 16 Pro Max (512 GB / Natural Titanium)'],
    requestedBy: 'Далер',
    requestedAt: '2026-08-17T14:20:00Z',
    status: 'APPROVED',
    approvedBy: 'Далер',
    approvedAt: '2026-08-17T14:20:00Z'
  },
  {
    id: 'tr-802',
    transferNumber: 'TR-802',
    fromLocationId: 'main-warehouse',
    fromLocationName: 'Главный склад',
    toLocationId: 'store-2',
    toLocationName: 'Сиёма',
    deviceIds: ['dev-samsung-2'],
    deviceImeis: ['354890123456783'],
    deviceModels: ['Samsung Galaxy S24+ (256 GB / Onyx Black)'],
    requestedBy: 'Далер',
    requestedAt: '2026-08-19T15:10:00Z',
    status: 'APPROVED',
    approvedBy: 'Далер',
    approvedAt: '2026-08-19T15:10:00Z'
  }
];

export const INITIAL_REPAIRS: RepairTicket[] = [
  {
    id: 'rep-201',
    ticketNumber: 201,
    imei: '359988776655443',
    barcode: '690987654321',
    brand: 'Apple',
    model: 'iPhone 14 Pro',
    storage: '128 GB',
    color: 'Deep Purple',
    storeId: 'store-1',
    storeName: 'Сиёма',
    intakeSeller: 'Фарход',
    customerName: 'Рустам Назаров',
    customerPhone: '+992 90 999 1122',
    problemDescription: 'Замена разбитого дисплея и разъем питания',
    visualCondition: 'Трещины на стеклопакете',
    equipmentPackage: 'Только телефон',
    estimatedCostTjs: 650,
    finalCostTjs: 650,
    repairCostTjs: 650,
    status: 'ISSUED',
    statusHistory: [
      { status: 'ACCEPTED', updatedAt: '2026-08-20T10:00:00Z', updatedBy: 'Фарход', note: 'Прием телефона на сервис' },
      { status: 'IN_PROGRESS', updatedAt: '2026-08-20T14:30:00Z', updatedBy: 'Далер', note: 'Заменены комплектующие' },
      { status: 'READY', updatedAt: '2026-08-21T11:00:00Z', updatedBy: 'Далер', note: 'Протестирован' },
      { status: 'ISSUED', updatedAt: '2026-08-21T15:20:00Z', updatedBy: 'Фарход', note: 'Выдан клиенту. Оплачено 650 TJS' }
    ],
    createdAt: '2026-08-20T10:00:00Z'
  },
  {
    id: 'rep-202',
    ticketNumber: 202,
    imei: '359988776655444',
    barcode: '690987654322',
    brand: 'Samsung',
    model: 'Galaxy S23',
    storage: '256 GB',
    color: 'Phantom Black',
    storeId: 'store-2',
    storeName: 'Сиёма',
    intakeSeller: 'Ахмад',
    customerName: 'Бахром Шамсиев',
    customerPhone: '+992 91 777 3344',
    problemDescription: 'Быстро разряжается, замена аккумулятора',
    visualCondition: 'Хорошее',
    equipmentPackage: 'Телефон и чехол',
    estimatedCostTjs: 350,
    finalCostTjs: 350,
    repairCostTjs: 350,
    status: 'IN_PROGRESS',
    statusHistory: [
      { status: 'ACCEPTED', updatedAt: '2026-08-22T09:30:00Z', updatedBy: 'Ахмад', note: 'Принят в ремонт' },
      { status: 'IN_PROGRESS', updatedAt: '2026-08-22T14:00:00Z', updatedBy: 'Далер', note: 'Установлена новая батарея' }
    ],
    createdAt: '2026-08-22T09:30:00Z'
  }
];

export const INITIAL_BONUSES: SupplierBonus[] = [
  {
    id: 'bonus-301',
    supplierId: 'sup-1',
    supplierName: 'Apple Distributor Corp',
    campaignTitle: 'Ретро-бонус за объем закупок (Август)',
    bonusType: 'CASH_DISCOUNT',
    amountUsd: 300,
    estimatedValueUsd: 300,
    dateReceived: '2026-08-20',
    date: '2026-08-20'
  },
  {
    id: 'bonus-302',
    supplierId: 'sup-3',
    supplierName: 'Xiaomi Tech Logistics',
    campaignTitle: 'Подарочный телефон по промо-акции Xiaomi ($0)',
    bonusType: 'FREE_DEVICES',
    amountUsd: 0,
    estimatedValueUsd: 180,
    freeDevices: [
      {
        brand: 'Xiaomi',
        model: 'Redmi Note 13',
        storage: '256 GB',
        color: 'Midnight Black',
        imei: '864920051234567',
        costBasisUsd: 0
      }
    ],
    dateReceived: '2026-08-20',
    date: '2026-08-20'
  }
];

export const INITIAL_EXPENSES: Expense[] = [
  {
    id: 'exp-501',
    category: 'RENT',
    amountTjs: 2500,
    storeId: 'store-1',
    storeName: 'Сиёма',
    createdByName: 'Далер',
    description: 'Аренда помещения за август (Магазин №1)',
    paidFromCashRegister: true,
    date: '2026-08-01T10:00:00Z'
  },
  {
    id: 'exp-502',
    category: 'UTILITIES',
    amountTjs: 600,
    storeId: 'store-2',
    storeName: 'Сиёма',
    createdByName: 'Далер',
    description: 'Оплата электроэнергии и интернета (Магазин №2)',
    paidFromCashRegister: true,
    date: '2026-08-05T12:00:00Z'
  },
  {
    id: 'exp-503',
    category: 'REPAIR_PARTS',
    amountTjs: 650,
    storeId: 'store-1',
    storeName: 'Сиёма',
    createdByName: 'Далер',
    description: 'Затраты на дисплейный модуль по квитанции ремонта #201',
    paidFromCashRegister: true,
    date: '2026-08-20T10:00:00Z'
  }
];

export const INITIAL_OWNERS: Owner[] = [
  {
    id: 'owner-1',
    name: 'Далер',
    profitSharePercent: 60,
    capitalBalanceUsd: 5000,
    totalAccruedProfitUsd: 420.50,
    totalPaidProfitUsd: 0,
    totalReinvestedUsd: 0,
    availableProfitUsd: 420.50
  },
  {
    id: 'owner-2',
    name: 'Рустам',
    profitSharePercent: 40,
    capitalBalanceUsd: 3000,
    totalAccruedProfitUsd: 280.30,
    totalPaidProfitUsd: 0,
    totalReinvestedUsd: 0,
    availableProfitUsd: 280.30
  }
];

export const INITIAL_OWNER_TRANSACTIONS: OwnerTransaction[] = [];

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];

export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];

export const INITIAL_LEDGER: LedgerEntry[] = [];

