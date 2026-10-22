export type Role = 'ADMIN' | 'PARTNER' | 'SELLER';

export type DeviceStatus = 
  | 'MAIN_WAREHOUSE'
  | 'STORE_STOCK'
  | 'SOLD'
  | 'IN_STOCK_AFTER_EXCHANGE'
  | 'IN_REPAIR'
  | 'TRANSFER_PENDING';

export type RepairStatus = 
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'READY'
  | 'ISSUED'
  | 'DIAGNOSTICS'
  | 'IN_REPAIR'
  | 'DELIVERED'
  | 'UNREPAIRABLE';

export type TransferStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';

export type PaymentMethod = 'CASH' | 'CARD' | 'SPLIT' | 'DEBT';

export type ExpenseCategory = 
  | 'RENT'
  | 'SALARY'
  | 'EMPLOYEE_ADVANCE'
  | 'UTILITIES'
  | 'MARKETING'
  | 'TAXES'
  | 'SUPPLIES'
  | 'REPAIR_PARTS'
  | 'OTHER'
  | 'CASH_SHORTAGE'
  | 'Аренда'
  | 'Зарплата'
  | 'Аванс сотрудника'
  | 'Коммунальные'
  | 'Ремонт'
  | 'Транспорт'
  | 'Доставка'
  | 'Реклама'
  | 'Хозяйственные'
  | 'Другие'
  | (string & {});

export type PageId =
  | 'WELCOME'
  | 'SALE'
  | 'SALES_HISTORY'
  | 'INVENTORY'
  | 'PURCHASE'
  | 'STORE_RECEIPT'
  | 'REVISION'
  | 'TRANSFER'
  | 'EXCHANGE'
  | 'REPAIR'
  | 'SUPPLIERS'
  | 'BONUSES'
  | 'EXPENSES'
  | 'OWNERS'
  | 'EMPLOYEES'
  | 'REPORTS'
  | 'FINANCE'
  | 'AUDIT_LOG'
  | 'SETTINGS'
  | 'NOTIFICATIONS'
  | 'CASH_COLLECTION'
  | 'CASH_DESK'
  | 'CUSTOMERS'
  | 'STOCK_THRESHOLDS';

export interface User {
  id: string;
  name: string;
  login: string;
  passwordHash?: string;
  pin?: string;
  role: Role;
  storeId?: string; // If SELLER, assigned store
  storeName?: string;
  active: boolean;
  isActive?: boolean;
  createdAt: string;
  baseSalaryTjs?: number;
  salesCommissionPercent?: number;
}

export interface Store {
  id: string;
  name: string;
  address?: string;
  isMainWarehouse?: boolean;
  /** Registers are kept in USD (TJS takings converted at the day's rate). */
  cashBalanceUsd: number;
  /** The somoni the register holds, at the rates its money came in at (only from the stores list). */
  cashBalanceTjs?: number;
  active: boolean;
}

export interface DeviceTimelineEvent {
  id: string;
  date: string;
  type: string;
  description: string;
  user: string;
  storeName?: string;
  priceTjs?: number;
  priceUsd?: number;
}

/** A serialized unit: a phone (IMEI) or a tablet (serial number, SN). */
export type DeviceCategory = 'PHONE' | 'TABLET';

export interface Device {
  id: string;
  /** PHONE when absent (older data). A tablet's imei/imei2 are its main and additional SN. */
  category?: DeviceCategory;
  imei: string;
  imei2?: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  /** Tablet-only: Wi-Fi / Wi-Fi + Cellular. */
  connectivity?: string;
  /** Tablet-only: screen size. */
  screenSize?: string;
  status: DeviceStatus;
  locationId: string; // Store id or 'main_warehouse'
  locationName: string;
  supplierId?: string;
  supplierName?: string;
  invoiceNumber?: string;
  purchaseInvoiceId?: string;
  retailPriceTjs?: number;
  receivedDate?: string;
  purchaseCostUsd: number;
  costBasisUsd: number; // Cost basis for calculating profit (could be exchange-in value or $0 for bonus)
  isBonus?: boolean;
  bonusCampaign?: string;
  /** The dearest of identical phones in the store — the one to sell first (cost stays hidden). */
  preferredToSell?: boolean;
  createdAt: string;
  timeline: DeviceTimelineEvent[];
}

export interface SaleItem {
  /** The receipt line itself (needed to return this phone). */
  id?: string;
  deviceId: string;
  /** PHONE when absent; a tablet's imei/imei2 are its serial numbers. */
  category?: DeviceCategory;
  imei: string;
  imei2?: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  salePriceTjs: number;
  salePriceUsd: number;
  purchaseCostUsd: number;
  costBasisUsd: number;
  isBelowCost?: boolean;
  isBonus?: boolean;
  /** Set once this phone was returned (on its own or as the old phone of an exchange). */
  returnId?: string;
  returnWithheldTjs?: number;
  returnWithheldUsd?: number;
  returnCreditTjs?: number;
  returnCreditUsd?: number;
}

/** An accessory line of a receipt. Its cost is ADMIN-only (0 for store staff). */
export interface SaleAccessoryLine {
  id: string;
  productId: string;
  barcode: string;
  brand: string;
  name: string;
  category: string;
  model?: string;
  quantity: number;
  unitPriceTjs: number;
  salePriceTjs: number;
  salePriceUsd: number;
  costUsd: number;
  isBelowCost?: boolean;
  /** Units of the line already returned, with their price and cost. */
  returnedQuantity: number;
  returnedPriceTjs: number;
  returnedPriceUsd?: number;
  returnedCostUsd: number;
}

/** One return of phones from a receipt; an exchange's return links to the new receipt. */
export interface SaleReturnInfo {
  id: string;
  date: string;
  reason: string;
  withheldTjs: number;
  withheldUsd: number;
  creditTjs: number;
  creditUsd: number;
  payoutTjs: number;
  payoutUsd: number;
  payoutMethod?: 'CASH' | 'CARD';
  exchangeSaleId?: string;
  exchangeReceiptNumber?: number;
  /** The return's own rate, the dollars the sale booked for these goods, and today's-rate result. */
  exchangeRate?: number;
  bookedUsd?: number;
  fxUsd?: number;
  /** ADMIN-only: the owner profit this return took back (booked on the sale's day). */
  reversedProfitUsd?: number;
  /** Accessory units returned by this return. */
  accessoryLines?: { lineId: string; name: string; quantity: number; priceTjs: number; withheldTjs: number }[];
}

/** The return half of an exchange, as seen from the new receipt it paid for. */
export interface ExchangeFromInfo {
  saleId: string;
  receiptNumber: number;
  /** When the old receipt was sold, and when the exchange happened (the return's date). */
  saleDate?: string;
  date?: string;
  /** The returned goods, e.g. "Honor X8d". */
  goods?: string;
  creditTjs: number;
  creditUsd: number;
  withheldTjs: number;
  withheldUsd?: number;
  /** Dollars the old receipt booked for the returned goods, and the rate result of taking them back. */
  bookedUsd?: number;
  fxUsd?: number;
  /** Change handed to the customer when the new goods were cheaper. */
  payoutTjs?: number;
  payoutUsd?: number;
  /** ADMIN-only: the returned goods' profit booked on the old day and taken back on the exchange. */
  reversedProfitUsd?: number;
}

export interface ExchangeEvent {
  id: string;
  date: string;
  returnedDeviceId: string;
  returnedImei: string;
  returnedModel: string;
  exchangeInValueTjs: number;
  exchangeInValueUsd: number;
  replacementDeviceId: string;
  replacementImei: string;
  replacementModel: string;
  newPriceTjs: number;
  newPriceUsd: number;
  differenceTjs: number; // positive = customer paid, negative = store gave back
  paymentMethod?: PaymentMethod;
  cashAmountTjs?: number;
  cardAmountTjs?: number;
  exchangeRate: number;
  processedBy: string;
}

export interface Sale {
  id: string;
  receiptNumber: number;
  date: string;
  storeId: string;
  storeName: string;
  sellerId: string;
  sellerName: string;
  customerName?: string;
  customerPhone?: string;
  customerId?: string;
  items: SaleItem[];
  /** Accessory lines of the receipt (quantity × unit price). */
  accessoryItems?: SaleAccessoryLine[];
  totalTjs: number;
  totalUsd: number;
  recognizedProfitUsd?: number;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  cashAmountTjs: number;
  cardAmountTjs: number;
  debtAmountTjs?: number;
  exchangeTradeInCreditTjs?: number;
  /** Dollars of that credit as the return booked them. */
  exchangeTradeInCreditUsd?: number;
  /** Returns of phones from this receipt. */
  returns?: SaleReturnInfo[];
  /** For a receipt opened by an exchange: the receipt the returned phone came from. */
  exchangeFrom?: ExchangeFromInfo;
  status: 'COMPLETED' | 'EXCHANGED' | 'REFUNDED';
  hasBelowCostItem?: boolean;
  exchangeEvents?: ExchangeEvent[];
  refundReason?: string;
  refundedAt?: string;
  refundedBy?: string;
  penaltyFeeTjs?: number;
  penaltyFeeUsd?: number;
  actualRefundAmountTjs?: number;
  /** Dollars handed back on the refund, at the refund day's rate. */
  actualRefundUsd?: number;
  isCancelled?: boolean;
}

/** An admin correction of a past operation (POST /sales/:id/edit), recalculated at its own rate and day. */
export type SaleEditParams =
  | { saleId: string; kind: 'SALE'; items?: { saleItemId: string; salePriceTjs: number }[]; accessories?: { lineId: string; unitPriceTjs: number }[]; cashAmountTjs?: number; cardAmountTjs?: number }
  | { saleId: string; kind: 'RETURN'; returnId: string; items?: { saleItemId: string; withheldTjs: number }[]; accessories?: { lineId: string; withheldTjs: number }[]; payoutMethod?: 'CASH' | 'CARD' }
  | { saleId: string; kind: 'REFUND'; penaltyFeeTjs: number }
  | { saleId: string; kind: 'EXCHANGE'; items?: { saleItemId: string; salePriceTjs: number }[]; accessories?: { lineId: string; unitPriceTjs: number }[]; cashAmountTjs?: number; cardAmountTjs?: number; returnWithheldTjs?: number };

export interface TransferRequest {
  id: string;
  transferNumber: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  deviceIds: string[];
  deviceImeis: string[];
  deviceBrands: string[];
  deviceModels: string[];
  /** Accessories moved by quantity. */
  accessoryLines?: { productId: string; barcode: string; brand: string; name: string; quantity: number }[];
  requestedBy: string;
  requestedAt: string;
  status: TransferStatus;
  approvedBy?: string;
  approvedAt?: string;
  rejectedReason?: string;
}

export interface RepairTicket {
  id: string;
  ticketNumber: number;
  deviceId?: string;
  imei: string;
  imei2?: string;
  brand?: string;
  model?: string;
  deviceModel?: string;
  storage?: string;
  color?: string;
  saleReceiptNumber?: number;
  saleDate?: string;
  storeId: string;
  storeName: string;
  intakeSeller: string;
  customerName?: string;
  customerPhone?: string;
  prepaymentTjs?: number;
  problemDescription: string;
  issueDescription?: string;
  visualCondition: string;
  equipmentPackage: string;
  comment?: string;
  status: RepairStatus;
  statusHistory: {
    status: RepairStatus;
    updatedAt: string;
    updatedBy: string;
    note?: string;
  }[];
  createdAt: string;
  updatedAt?: string;
  estimatedCostTjs?: number;
  finalCostTjs?: number;
  repairCostTjs?: number;
  /** USD equivalents, converted at the daily rate in effect on the ticket's own date (not today's). */
  estimatedCostUsd?: number;
  finalCostUsd?: number;
  exchangeRate?: number;
}

export interface InvoiceGroup {
  id?: string;
  brand: string;
  model: string;
  ram?: string;
  storage: string;
  color: string;
  quantity: number;
  purchasePriceUsd: number;
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  totalAmountUsd: number;
  exchangeRate: number;
  paidAmountUsd: number;
  remainingAmountUsd: number;
  status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  devicesCount: number;
  isStorePurchase?: boolean;
  storeId?: string;
  groups?: InvoiceGroup[];
  /** The receipt's accessory lines (quantity at a unit cost each). */
  accessoryBatches?: InvoiceAccessoryBatch[];
}

/** An accessory card: found by its barcode, counted by quantity. */
export interface AccessoryProduct {
  id: string;
  barcode: string;
  brand: string;
  name: string;
  category: string;
  model?: string;
  attributes?: string;
}

/** A card found by barcode on the receipt form, with its stock and latest unit cost (ADMIN). */
export interface AccessoryLookup extends AccessoryProduct {
  stockQuantity: number;
  lastUnitCostUsd?: number;
}

export interface InvoiceAccessoryBatch {
  id: string;
  quantityReceived: number;
  quantityRemaining: number;
  unitCostUsd: number;
  product: AccessoryProduct;
}

/** An accessory card with its stock by location (cost ADMIN-only). */
export interface AccessoryStockItem extends AccessoryProduct {
  /** On hand, units in a pending transfer included. */
  quantity: number;
  /** Can be sold or moved now. */
  available: number;
  stockCostUsd?: number;
  stores: { storeId: string; storeName: string; quantity: number; reserved: number; available: number; costUsd?: number }[];
}

export interface Supplier {
  id: string;
  name: string;
  phone?: string;
  contactPerson?: string;
  totalPurchasedUsd: number;
  totalPaidUsd: number;
  totalDebtUsd: number;
  active?: boolean;
  createdAt?: string;
}

export interface SupplierBonus {
  id: string;
  supplierId: string;
  supplierName: string;
  campaignName?: string;
  campaignTitle?: string;
  bonusType?: 'FREE_DEVICES' | 'CASH_DISCOUNT';
  amountUsd?: number;
  exchangeRate: number;
  deviceId?: string;
  imei?: string;
  brand?: string;
  model?: string;
  storage?: string;
  color?: string;
  estimatedValueUsd?: number;
  status?: 'IN_STOCK' | 'SOLD';
  dateReceived?: string;
  date?: string;
  dateSold?: string;
  saleReceiptNumber?: number;
  freeDevices?: {
    brand: string;
    model: string;
    ram?: string;
    storage: string;
    color: string;
    imei: string;
    costBasisUsd: number;
  }[];
}

export interface Expense {
  id: string;
  date: string;
  category: ExpenseCategory;
  amountTjs: number;
  exchangeRate?: number;
  amountUsd?: number;
  /** Registered minus paid dollars when an unpaid expense is paid later at another rate. */
  paymentFxUsd?: number;
  targetType?: 'STORE' | 'BUSINESS';
  storeId?: string;
  storeName?: string;
  sourceAccount?: string; // e.g. "Store #1 Cash", "Main Account"
  comment?: string;
  description?: string;
  createdByName: string;
  paidFromCashRegister?: boolean;
  status: 'PAID' | 'UNPAID';
  paidAt?: string;
  employeeId?: string;
  employeeName?: string;
  isEmployeeAdvance?: boolean;
  /** 'YYYY-MM' payroll month an advance is deducted from. */
  payrollMonth?: string | null;
}

export interface Owner {
  id: string;
  userId?: string;
  name: string;
  profitSharePercent: number; // e.g. 60
  capitalBalanceUsd: number;
  totalAccruedProfitUsd: number;
  totalPaidProfitUsd: number;
  totalReinvestedUsd: number;
  availableProfitUsd: number;
  storeId?: string | null;
}

/** A partner's share of one store's profit; the admin owner receives the rest of that store's profit. */
export interface StoreProfitShare {
  id: string;
  storeId: string;
  ownerId: string;
  sharePercent: number;
}

export interface StockThreshold {
  id: string;
  storeId: string;
  brand: string;
  model: string;
  storage: string;
  minQuantity: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface QuarterClosureOwnerSnapshot {
  ownerId: string;
  name: string;
  profitSharePercent?: number;
  capitalBalanceUsd: number;
  totalAccruedProfitUsd: number;
  totalPaidProfitUsd: number;
  totalReinvestedUsd?: number;
  availableProfitUsd: number;
  sweptToCapital?: number;
}

export interface QuarterClosure {
  id: string;
  quarterName: string;
  closedByUserId: string;
  snapshot: QuarterClosureOwnerSnapshot[];
  closedAt: string;
}

export interface OwnerTransaction {
  id: string;
  ownerId: string;
  ownerName: string;
  type: 'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST';
  amountUsd: number;
  exchangeRate: number;
  date: string;
  sourceOrDestination: string;
  createdByName: string;
  note?: string;
}

export interface DailyRate {
  date: string; // YYYY-MM-DD
  rate: number; // 1 USD = X TJS
  createdBy: string;
  createdAt: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  date?: string;
  timestamp?: string;
  targetType?: 'TRANSFER_REQUEST' | 'LOW_STOCK' | 'SYSTEM' | 'REPAIR' | string;
  targetId?: string;
  /** A page id (older notifications) or an app path such as '/receipts?receipt=…'. */
  targetRoute?: PageId | string;
  linkPage?: PageId | string;
  targetRole?: Role;
  targetUserId?: string;
  read?: boolean;
  isRead?: boolean;
  resolved?: boolean;
  readAt?: string;
  resolvedAt?: string;
  /** Facts of the business event behind an admin notification. */
  actionType?: string;
  storeId?: string;
  storeName?: string;
  actorName?: string;
  amountTjs?: number;
  amountUsd?: number;
  documentRef?: string;
  details?: { imeis?: string[] } & Record<string, unknown>;
}

/** A store's receipt of phones delivered from the main warehouse (scanned by IMEI). */
export interface StoreReceiptItem {
  id: string;
  deviceId: string;
  imei: string;
  brand: string;
  model: string;
  ram?: string | null;
  storage: string;
  color: string;
}

export interface StoreReceipt {
  id: string;
  receiptNumber: string;
  storeId: string;
  storeName?: string;
  createdByName: string;
  itemCount: number;
  createdAt: string;
  acknowledgedAt?: string | null;
  acknowledgedByName?: string | null;
  items: StoreReceiptItem[];
  /** Accessories received by quantity (no cost: store staff see the receipt too). */
  accessoryLines?: StoreReceiptAccessoryLine[];
}

export interface StoreReceiptAccessoryLine {
  id?: string;
  productId: string;
  barcode: string;
  brand: string;
  name: string;
  quantity: number;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  action: string;
  userName: string;
  userRole: Role;
  storeName?: string;
  details: string;
  financialDetails?: {
    amountTjs?: number;
    amountUsd?: number;
    exchangeRate?: number;
    purchaseCostUsd?: number;
    salePriceTjs?: number;
    penaltyTjs?: number;
    penaltyUsd?: number;
  };
  imei?: string;
  receiptNumber?: number;
  targetId?: string;
}

export type ThemeMode = 'light' | 'dark';

export type BonusPoolStatus = 'PENDING' | 'DISTRIBUTED' | 'ANNULLED';

export interface BonusPoolEntry {
  id: string;
  deviceId: string;
  saleId?: string;
  saleItemId?: string;
  imei: string;
  brand: string;
  model: string;
  salePriceUsd: number;
  salePriceTjs: number;
  profitUsd: number;
  profitTjs: number;
  status: BonusPoolStatus;
  distributionId?: string;
  distributedAt?: string;
  distributedBy?: string;
  distributionNote?: string;
  annulledAt?: string;
  annulledBy?: string;
  annulledNote?: string;
  createdAt: string;
  sale?: {
    receiptNumber: number;
    createdAt: string;
    storeId: string;
  };
}

export interface BonusDistributionLog {
  id: string;
  periodName: string;
  totalAmountUsd: number;
  totalAmountTjs?: number;
  type: 'DISTRIBUTION' | 'ANNULMENT' | 'BUSINESS_REINVEST' | 'PROFIT_PAYOUT' | string;
  allocations: any;
  note?: string;
  performedByUserId?: string;
  performedByName?: string;
  createdAt: string;
}

export interface DailyCashClosing {
  id: string;
  storeId: string;
  businessDate: string;
  closedByUserId: string;
  closedByName: string;
  openingCashTjs: number | string;
  openingCashUsd: number | string;
  salesCashTjs: number | string;
  salesCashUsd: number | string;
  salesCardTjs: number | string;
  /** Bank takings in USD. Set on day-total closings (actual = cash + bank of that day); null on older ones. */
  salesCardUsd?: number | string | null;
  expensesCashTjs: number | string;
  expensesCashUsd: number | string;
  refundsCashTjs: number | string;
  refundsCashUsd: number | string;
  refundsCardTjs?: number | string | null;
  refundsCardUsd?: number | string | null;
  collectionsCashTjs: number | string;
  collectionsCashUsd: number | string;
  // Net of other register cash moves: customer debt repayments, owner deposits/withdrawals, supplier payments.
  otherCashTjs?: number | string;
  otherCashUsd?: number | string;
  expectedCashTjs: number | string;
  expectedCashUsd: number | string;
  actualCashTjs: number | string;
  actualCashUsd: number | string;
  differenceTjs: number | string;
  differenceUsd: number | string;
  exchangeRate?: number | string | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
  store?: {
    id: string;
    name: string;
  };
}

export interface DailyClosingSummary {
  storeId: string;
  storeName: string;
  businessDate: string;
  alreadyClosed: boolean;
  closing?: DailyCashClosing;
  openingCashTjs: string;
  openingCashUsd: string;
  salesCashTjs: string;
  salesCashUsd: string;
  salesCardTjs: string;
  salesCardUsd: string | null;
  salesCount: number;
  expensesCashTjs: string;
  expensesCashUsd: string;
  expensesCount: number;
  refundsCashTjs: string;
  refundsCashUsd: string;
  refundsCardTjs?: string;
  refundsCardUsd?: string;
  refundsCount: number;
  refundedReceipts?: { receiptNumber: number; amountTjs: string; amountUsd: string; reason?: string }[];
  collectionsCashTjs: string;
  collectionsCashUsd: string;
  collectionsCount: number;
  otherCashTjs: string;
  otherCashUsd: string;
  otherCount: number;
  // The day's own total: cash and bank, plus debt repayments, less refunds and store expenses.
  expectedCashTjs: string;
  expectedCashUsd: string;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string | null;
  note?: string | null;
  pushEnabled?: boolean;
  hasPushSubscription?: boolean;
  totalDebtTjs: number;
  totalPaidTjs: number;
  salesCount?: number;
  paymentsCount?: number;
  lastSale?: {
    createdAt: string;
    receiptNumber: number;
    totalTjs: number;
  } | null;
  createdAt: string;
}

export interface CashDeskSummary {
  exchangeRate: number;
  cash: {
    totalUsd: number;
    totalTjs: number;
    central?: {
      id: string;
      name: string;
      cashUsd: number;
      cashTjs: number;
    };
    stores: {
      id: string;
      name: string;
      isMainWarehouse: boolean;
      cashUsd: number;
      cashTjs: number;
    }[];
  };
  inventory: {
    totalCount: number;
    totalCostUsd: number;
    totalCostTjs: number;
    models?: {
      key: string;
      brand: string;
      model: string;
      storage?: string | null;
      color?: string | null;
      count: number;
      avgCostUsd: number;
      totalCostUsd: number;
      totalCostTjs: number;
      stores: { storeId: string; storeName: string; count: number }[];
    }[];
    items?: {
      id: string;
      brand: string;
      model: string;
      storage?: string | null;
      color?: string | null;
      imei: string;
      costBasisUsd: number;
      costBasisTjs: number;
      retailPriceTjs: number;
      storeId: string;
      storeName: string;
    }[];
  };
  suppliers: {
    totalDebtUsd: number;
    totalDebtTjs: number;
    debtorsCount: number;
    suppliers: {
      id: string;
      name: string;
      phone?: string;
      totalDebtUsd: number;
      totalDebtTjs: number;
    }[];
  };
  customers: {
    totalDebtTjs: number;
    totalDebtUsd: number;
    debtorsCount: number;
    debtors: {
      id: string;
      name: string;
      phone?: string;
      note?: string;
      totalDebtTjs: number;
      totalPaidTjs: number;
      lastSaleDate?: string | null;
      lastReceiptNumber?: number | null;
    }[];
  };
}

export interface StockRevisionItem {
  id: string;
  imei: string;
  imei2?: string | null;
  brand: string;
  model: string;
  storage?: string | null;
  color?: string | null;
  purchasePriceUsd?: string | null;
}

export interface StockRevisionSurplus {
  code: string;
  note?: string;
}

export interface StockRevision {
  id: string;
  storeId: string;
  storeName: string;
  userId: string;
  userName: string;
  userRole: string;
  totalExpected: number;
  totalChecked: number;
  totalMissing: number;
  totalSurplus: number;
  status: 'MATCH' | 'DISCREPANCY';
  missingDevices?: StockRevisionItem[] | null;
  surplusDevices?: StockRevisionSurplus[] | null;
  checkedImeis?: string[] | null;
  /** Accessories counted by units: on the books (expected) and found (counted). */
  accessoryLines?: StockRevisionAccessoryLine[] | null;
  comment?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StockRevisionAccessoryLine {
  productId: string;
  barcode: string;
  brand: string;
  name: string;
  expected: number;
  counted: number;
}
