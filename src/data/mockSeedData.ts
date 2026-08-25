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

export const INITIAL_SUPPLIERS: Supplier[] = [];
export const INITIAL_INVOICES: SupplierInvoice[] = [];
export const INITIAL_DEVICES: Device[] = [];
export const INITIAL_SALES: Sale[] = [];
export const INITIAL_REPAIRS: RepairTicket[] = [];
export const INITIAL_TRANSFERS: TransferRequest[] = [];
export const INITIAL_BONUSES: SupplierBonus[] = [];
export const INITIAL_EXPENSES: Expense[] = [];
export const INITIAL_OWNERS: Owner[] = [];
export const INITIAL_OWNER_TRANSACTIONS: OwnerTransaction[] = [];
export const INITIAL_NOTIFICATIONS: NotificationItem[] = [];
export const INITIAL_AUDIT_LOGS: AuditLogEntry[] = [];
export const INITIAL_LEDGER: LedgerEntry[] = [];
