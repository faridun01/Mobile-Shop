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

export type PaymentMethod = 'CASH' | 'CARD' | 'SPLIT';

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

export type LedgerType = 
  | 'SALE'
  | 'CASH_SALE'
  | 'CARD_SALE'
  | 'PURCHASE'
  | 'EXPENSE'
  | 'SALARY'
  | 'SUPPLIER_PAYMENT'
  | 'OWNER_INVESTMENT'
  | 'OWNER_CAPITAL_WITHDRAWAL'
  | 'OWNER_PROFIT_PAYOUT'
  | 'OWNER_REINVESTMENT'
  | 'EXCHANGE_SETTLEMENT'
  | 'SUPPLIER_BONUS'
  | 'TRANSFER'
  | 'REFUND';

export type PageId = 
  | 'SALE'
  | 'SALES_HISTORY'
  | 'INVENTORY'
  | 'PURCHASE'
  | 'TRANSFER'
  | 'EXCHANGE'
  | 'REPAIR'
  | 'SUPPLIERS'
  | 'BONUSES'
  | 'EXPENSES'
  | 'OWNERS'
  | 'EMPLOYEES'
  | 'REPORTS'
  | 'AUDIT_LOG'
  | 'SETTINGS'
  | 'NOTIFICATIONS';

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
  cashBalanceTjs: number;
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

export interface Device {
  id: string;
  imei: string;
  imei2?: string;
  serialNumber?: string;
  barcode?: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
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
  createdAt: string;
  timeline: DeviceTimelineEvent[];
}

export interface SaleItem {
  deviceId: string;
  imei: string;
  imei2?: string;
  brand: string;
  model: string;
  storage: string;
  color: string;
  salePriceTjs: number;
  salePriceUsd: number;
  purchaseCostUsd: number;
  costBasisUsd: number;
  isBelowCost?: boolean;
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
  items: SaleItem[];
  totalTjs: number;
  totalUsd: number;
  exchangeRate?: number;
  paymentMethod: PaymentMethod;
  cashAmountTjs: number;
  cardAmountTjs: number;
  exchangeTradeInCreditTjs?: number;
  status: 'COMPLETED' | 'EXCHANGED' | 'REFUNDED';
  hasBelowCostItem?: boolean;
  exchangeEvents?: ExchangeEvent[];
  refundReason?: string;
  refundedAt?: string;
  refundedBy?: string;
  penaltyFeeTjs?: number;
  penaltyFeeUsd?: number;
  actualRefundAmountTjs?: number;
}

export interface TransferRequest {
  id: string;
  transferNumber: string;
  fromLocationId: string;
  fromLocationName: string;
  toLocationId: string;
  toLocationName: string;
  deviceIds: string[];
  deviceImeis: string[];
  deviceModels: string[];
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
  barcode?: string;
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
}

export interface SupplierInvoice {
  id: string;
  invoiceNumber: string;
  supplierId: string;
  supplierName: string;
  date: string;
  totalAmountUsd: number;
  paidAmountUsd: number;
  remainingAmountUsd: number;
  status: 'PAID' | 'PARTIALLY_PAID' | 'UNPAID';
  devicesCount: number;
  isStorePurchase?: boolean;
  storeId?: string;
}

export interface SupplierPayment {
  id: string;
  supplierId: string;
  supplierName: string;
  amountUsd: number;
  sourceAccount: 'MAIN_ACCOUNT' | 'STORE_CASH';
  storeId?: string;
  date: string;
  appliedToInvoices: {
    invoiceId: string;
    invoiceNumber: string;
    allocatedAmountUsd: number;
  }[];
  createdByName: string;
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
  targetType?: 'STORE' | 'BUSINESS';
  storeId?: string;
  storeName?: string;
  sourceAccount?: string; // e.g. "Store #1 Cash", "Main Account"
  comment?: string;
  description?: string;
  createdByName: string;
  paidFromCashRegister?: boolean;
  employeeId?: string;
  employeeName?: string;
  isEmployeeAdvance?: boolean;
}

export interface Owner {
  id: string;
  name: string;
  profitSharePercent: number; // e.g. 60
  capitalBalanceUsd: number;
  totalAccruedProfitUsd: number;
  totalPaidProfitUsd: number;
  totalReinvestedUsd: number;
  availableProfitUsd: number;
}

export interface OwnerTransaction {
  id: string;
  ownerId: string;
  ownerName: string;
  type: 'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST';
  amountUsd: number;
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
  targetRoute?: PageId;
  linkPage?: PageId;
  targetRole?: Role;
  targetUserId?: string;
  read?: boolean;
  isRead?: boolean;
  resolved?: boolean;
  readAt?: string;
  resolvedAt?: string;
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

export interface LedgerEntry {
  id: string;
  timestamp: string;
  type: LedgerType;
  description: string;
  amountTjs?: number;
  amountUsd?: number;
  exchangeRate?: number;
  storeId?: string;
  storeName?: string;
  referenceId?: string;
  userName: string;
}

export type ThemeMode = 'light' | 'dark';
