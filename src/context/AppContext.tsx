import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  User,
  Store,
  Device,
  DeviceStatus,
  Sale,
  SaleItem,
  Supplier,
  SupplierInvoice,
  SupplierBonus,
  Expense,
  Owner,
  OwnerTransaction,
  RepairTicket,
  RepairStatus,
  TransferRequest,
  NotificationItem,
  AuditLogEntry,
  LedgerEntry,
  DailyRate,
  PageId,
  PaymentMethod,
  ExpenseCategory,
  ThemeMode
} from '../types';
import { useAuthStore } from '../stores/useAuthStore';
import {
  INITIAL_RATE,
  INITIAL_STORES,
  INITIAL_USERS,
  INITIAL_SUPPLIERS,
  INITIAL_INVOICES,
  INITIAL_DEVICES,
  INITIAL_SALES,
  INITIAL_TRANSFERS,
  INITIAL_REPAIRS,
  INITIAL_BONUSES,
  INITIAL_EXPENSES,
  INITIAL_OWNERS,
  INITIAL_OWNER_TRANSACTIONS,
  INITIAL_NOTIFICATIONS,
  INITIAL_AUDIT_LOGS,
  INITIAL_LEDGER
} from '../data/mockSeedData';
import { useUIStore } from '../stores/useUIStore';

interface AppContextType {
  currentUser: User | null;
  todayRate: DailyRate | null;
  activePage: PageId;
  selectedStoreId: string; // 'all' or store id
  stores: Store[];
  devices: Device[];
  sales: Sale[];
  transfers: TransferRequest[];
  repairs: RepairTicket[];
  suppliers: Supplier[];
  invoices: SupplierInvoice[];
  supplierInvoices: SupplierInvoice[];
  bonuses: SupplierBonus[];
  supplierBonuses: SupplierBonus[];
  expenses: Expense[];
  owners: Owner[];
  ownerTransactions: OwnerTransaction[];
  users: User[];
  notifications: NotificationItem[];
  auditLogs: AuditLogEntry[];
  ledger: LedgerEntry[];
  
  // UI states
  isRateModalOpen: boolean;
  isScannerOpen: boolean;
  scannerCallback: ((code: string) => void) | null;
  drawerOpen: boolean;
  
  // Navigation & UI controls
  login: (login: string, pass: string) => { success: boolean; message?: string };
  logout: () => void;
  setDailyRate: (rate: number) => void;
  setActivePage: (page: PageId, navTargetId?: string) => void;
  setSelectedStoreId: (storeId: string) => void;
  setDrawerOpen: (open: boolean) => void;
  openScanner: (callback: (code: string) => void) => void;
  closeScanner: () => void;
  
  // Business logic operations
  createSale: (params: {
    items: { device: Device; salePriceTjs: number }[];
    paymentMethod: PaymentMethod;
    cashAmountTjs: number;
    cardAmountTjs: number;
    customerName?: string;
  }) => { success: boolean; receiptNumber?: number; message?: string };
  
  processExchange: (params: {
    originalSaleReceiptNumber?: number | string;
    originalSaleId?: string;
    returnedImei?: string;
    returnedItem?: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      imei: string;
      exchangeInValueTjs: number;
    };
    exchangeInValueTjs?: number;
    replacementDeviceId: string;
    newPriceTjs: number;
    differenceTjs?: number;
    paymentMethod?: PaymentMethod;
    cashAmountTjs?: number;
    cardAmountTjs?: number;
  }) => { success: boolean; message?: string };

  processRefund: (params: {
    saleId: string;
    reason: string;
    refundAmountTjs: number;
    penaltyFeeTjs?: number;
    paymentMethod: 'CASH' | 'CARD';
  }) => { success: boolean; message?: string };

  createPurchase: (params: {
    supplierId: string;
    invoiceNumber: string;
    date: string;
    isStorePurchase: boolean;
    storeId?: string;
    groups: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      purchasePriceUsd: number;
      barcode?: string;
      imeis: string[];
    }[];
  }) => { success: boolean; message?: string };

  createSupplier: (params: {
    name: string;
    phone?: string;
    contactPerson?: string;
  }) => { success: boolean; message?: string };

  createSupplierBonus: (params: {
    supplierId: string;
    campaignTitle?: string;
    bonusType: 'FREE_DEVICES' | 'CASH_DISCOUNT';
    amountUsd?: number;
    freeDevices?: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      imei: string;
      costBasisUsd: number;
    }[];
    destinationLocationId?: string;
  }) => { success: boolean; message?: string };

  createTransferRequest: (toLocationIdOrParams: string | { fromLocationId?: string; toLocationId: string; deviceIds: string[] }, deviceIds?: string[]) => { success: boolean; message?: string };
  directTransfer: (fromLocationId: string, toLocationId: string, deviceIds: string[]) => { success: boolean; message?: string };
  approveTransfer: (transferId: string) => { success: boolean; message?: string };
  approveTransferRequest: (transferId: string) => { success: boolean; message?: string };
  rejectTransfer: (transferId: string, reason: string) => { success: boolean; message?: string };
  rejectTransferRequest: (transferId: string, reason: string) => { success: boolean; message?: string };

  createRepairTicket: (params: {
    imei: string;
    imei2?: string;
    barcode?: string;
    brand: string;
    model: string;
    storage: string;
    color: string;
    saleReceiptNumber?: number;
    saleDate?: string;
    customerName?: string;
    customerPhone?: string;
    problemDescription: string;
    visualCondition?: string;
    equipmentPackage?: string;
    comment?: string;
    estimatedCostTjs?: number;
    repairCostTjs?: number;
  }) => { success: boolean; ticketNumber?: number; message?: string };

  updateRepairStatus: (ticketId: string, newStatus: RepairStatus, note?: string, costTjs?: number) => { success: boolean; message?: string };

  paySupplier: (params: {
    supplierId: string;
    amountUsd: number;
    sourceAccount?: 'MAIN_ACCOUNT' | 'STORE_CASH' | string;
    sourceAccountId?: string;
    storeId?: string;
    note?: string;
  }) => { success: boolean; message?: string };

  createExpense: (params: {
    category: ExpenseCategory;
    amountTjs: number;
    targetType?: 'STORE' | 'BUSINESS';
    storeId?: string;
    sourceAccount?: string;
    comment?: string;
    description?: string;
    paidFromCashRegister?: boolean;
    employeeId?: string;
    employeeName?: string;
    isEmployeeAdvance?: boolean;
  }) => { success: boolean; message?: string };

  createOwnerTransaction: (params: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST';
    amountUsd: number;
    note?: string;
  }) => { success: boolean; message?: string };

  ownerInvestment: (ownerId: string, amountUsd: number, destination: string, note?: string) => { success: boolean; message?: string };
  ownerCapitalWithdrawal: (ownerId: string, amountUsd: number, source: string, note?: string) => { success: boolean; message?: string };
  ownerProfitPayout: (ownerId: string, amountUsd: number, source: string, note?: string) => { success: boolean; message?: string };
  ownerReinvest: (ownerId: string, amountUsd: number, note?: string) => { success: boolean; message?: string };
  updateOwnerProfitShares: (owner1Share: number, owner2Share: number) => { success: boolean; message?: string };

  createUser: (user: Omit<User, 'id' | 'createdAt'>) => { success: boolean; message?: string };
  updateUser: (user: User) => { success: boolean; message?: string };
  resetUserPassword: (userId: string, newPass: string) => { success: boolean; message?: string };
  toggleUserActive: (userId: string) => { success: boolean; message?: string };
  deleteUser: (userId: string) => { success: boolean; message?: string };

  markNotificationRead: (id: string) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  resolveNotification: (id: string) => void;
  openDailyRateModal: () => void;
  setTodayExchangeRate: (rate: number) => { success: boolean; message?: string };
  createStore: (name: string, address?: string) => { success: boolean; message?: string };
  updateStore: (storeId: string, name: string, address?: string) => { success: boolean; message?: string };
  deleteStore: (storeId: string) => { success: boolean; message?: string };
  resetToDemo: () => void;
  switchToRealDataMode: () => void;
  resetAllCashBalances: () => void;
  resetAllOwnerCapital: () => void;
  closeQuarterPeriod: (params: { quarterName: string; transferRemainingToCapital: boolean }) => { success: boolean; message?: string };
  resetEntireSystemDataToZero: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

const STORAGE_KEYS = {
  USER: 'ms_current_user',
  RATE: 'ms_today_rate',
  STORES: 'ms_stores',
  USERS: 'ms_users',
  SUPPLIERS: 'ms_suppliers',
  INVOICES: 'ms_invoices',
  DEVICES: 'ms_devices',
  SALES: 'ms_sales',
  TRANSFERS: 'ms_transfers',
  REPAIRS: 'ms_repairs',
  BONUSES: 'ms_bonuses',
  EXPENSES: 'ms_expenses',
  OWNERS: 'ms_owners',
  OWNER_TXS: 'ms_owner_txs',
  NOTIFICATIONS: 'ms_notifications',
  AUDIT: 'ms_audit_logs',
  LEDGER: 'ms_ledger'
};

function loadStorage<T>(key: string, defaultVal: T): T {
  try {
    const saved = localStorage.getItem(key);
    if (saved) return JSON.parse(saved);
  } catch (e) {
    console.error('Error loading storage', key, e);
  }
  return defaultVal;
}

function saveStorage(key: string, val: any) {
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch (e) {
    console.error('Error saving storage', key, e);
  }
}

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

export function isNotificationExpired(n: NotificationItem): boolean {
  const isDone = Boolean(n.read || n.isRead || n.resolved);
  if (!isDone) return false;

  const actionTimeStr = n.resolvedAt || n.readAt || n.timestamp || n.date;
  if (!actionTimeStr) return false;

  const actionTime = new Date(actionTimeStr).getTime();
  if (isNaN(actionTime)) return false;

  return (Date.now() - actionTime) > TWENTY_FOUR_HOURS_MS;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(() => loadStorage(STORAGE_KEYS.USER, INITIAL_USERS[0]));
  const [todayRate, setTodayRateState] = useState<DailyRate | null>(() => loadStorage(STORAGE_KEYS.RATE, INITIAL_RATE));
  const [activePage, setActivePageState] = useState<PageId>('SALE');
  const [selectedStoreId, setSelectedStoreIdState] = useState<string>('all');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [stores, setStores] = useState<Store[]>(() => loadStorage(STORAGE_KEYS.STORES, INITIAL_STORES));
  const [users, setUsers] = useState<User[]>(() => loadStorage(STORAGE_KEYS.USERS, INITIAL_USERS));
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => loadStorage(STORAGE_KEYS.SUPPLIERS, INITIAL_SUPPLIERS));
  const [invoices, setInvoices] = useState<SupplierInvoice[]>(() => loadStorage(STORAGE_KEYS.INVOICES, INITIAL_INVOICES));
  const [devices, setDevices] = useState<Device[]>(() => loadStorage(STORAGE_KEYS.DEVICES, INITIAL_DEVICES));
  const [sales, setSales] = useState<Sale[]>(() => loadStorage(STORAGE_KEYS.SALES, INITIAL_SALES));
  const [transfers, setTransfers] = useState<TransferRequest[]>(() => loadStorage(STORAGE_KEYS.TRANSFERS, INITIAL_TRANSFERS));
  const [repairs, setRepairs] = useState<RepairTicket[]>(() => loadStorage(STORAGE_KEYS.REPAIRS, INITIAL_REPAIRS));
  const [bonuses, setBonuses] = useState<SupplierBonus[]>(() => loadStorage(STORAGE_KEYS.BONUSES, INITIAL_BONUSES));
  const [expenses, setExpenses] = useState<Expense[]>(() => loadStorage(STORAGE_KEYS.EXPENSES, INITIAL_EXPENSES));
  const [owners, setOwners] = useState<Owner[]>(() => {
    const storedOwners: Owner[] = loadStorage(STORAGE_KEYS.OWNERS, INITIAL_OWNERS);
    const storedUsers: User[] = loadStorage(STORAGE_KEYS.USERS, INITIAL_USERS);
    const adminUser = storedUsers.find(u => u.role === 'ADMIN' || u.id === 'user-admin' || u.login === 'admin');
    const partnerUser = storedUsers.find(u => u.role === 'PARTNER' || u.id === 'user-partner' || u.login === 'partner');
    return storedOwners.map(o => {
      if (o.id === 'owner-1' && adminUser) return { ...o, name: adminUser.name };
      if (o.id === 'owner-2' && partnerUser) return { ...o, name: partnerUser.name };
      return o;
    });
  });
  const [ownerTransactions, setOwnerTransactions] = useState<OwnerTransaction[]>(() => loadStorage(STORAGE_KEYS.OWNER_TXS, INITIAL_OWNER_TRANSACTIONS));
  const [notifications, setNotifications] = useState<NotificationItem[]>(() => loadStorage(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS));
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>(() => loadStorage(STORAGE_KEYS.AUDIT, INITIAL_AUDIT_LOGS));
  const [ledger, setLedger] = useState<LedgerEntry[]>(() => loadStorage(STORAGE_KEYS.LEDGER, INITIAL_LEDGER));

  const [isRateModalOpen, setIsRateModalOpen] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);
  const [scannerCallback, setScannerCallback] = useState<((code: string) => void) | null>(null);

  const [theme, setThemeState] = useState<ThemeMode>(() => {
    try {
      const saved = localStorage.getItem('ms_theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch (e) {
      console.error(e);
    }
    return 'light';
  });

  useEffect(() => {
    try {
      localStorage.setItem('ms_theme', theme);
    } catch (e) {
      console.error(e);
    }
    document.documentElement.setAttribute('data-theme', theme);
    if (theme === 'light') {
      document.documentElement.classList.add('light');
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  const toggleTheme = () => {
    setThemeState(prev => (prev === 'dark' ? 'light' : 'dark'));
  };

  // Sync to storage
  useEffect(() => saveStorage(STORAGE_KEYS.USER, currentUser), [currentUser]);
  useEffect(() => saveStorage(STORAGE_KEYS.RATE, todayRate), [todayRate]);
  useEffect(() => saveStorage(STORAGE_KEYS.STORES, stores), [stores]);
  useEffect(() => saveStorage(STORAGE_KEYS.USERS, users), [users]);
  useEffect(() => saveStorage(STORAGE_KEYS.SUPPLIERS, suppliers), [suppliers]);
  useEffect(() => saveStorage(STORAGE_KEYS.INVOICES, invoices), [invoices]);
  useEffect(() => saveStorage(STORAGE_KEYS.DEVICES, devices), [devices]);
  useEffect(() => saveStorage(STORAGE_KEYS.SALES, sales), [sales]);
  useEffect(() => saveStorage(STORAGE_KEYS.TRANSFERS, transfers), [transfers]);
  useEffect(() => saveStorage(STORAGE_KEYS.REPAIRS, repairs), [repairs]);
  useEffect(() => saveStorage(STORAGE_KEYS.BONUSES, bonuses), [bonuses]);
  useEffect(() => saveStorage(STORAGE_KEYS.EXPENSES, expenses), [expenses]);
  useEffect(() => saveStorage(STORAGE_KEYS.OWNERS, owners), [owners]);
  useEffect(() => saveStorage(STORAGE_KEYS.OWNER_TXS, ownerTransactions), [ownerTransactions]);
  useEffect(() => saveStorage(STORAGE_KEYS.NOTIFICATIONS, notifications), [notifications]);
  useEffect(() => saveStorage(STORAGE_KEYS.AUDIT, auditLogs), [auditLogs]);
  useEffect(() => saveStorage(STORAGE_KEYS.LEDGER, ledger), [ledger]);

  // Adjust selected store on user change
  useEffect(() => {
    if (currentUser?.role === 'SELLER' && currentUser.storeId) {
      setSelectedStoreIdState(currentUser.storeId);
    }
  }, [currentUser]);

  // Check rate prompt on login
  const checkRatePrompt = (rate: DailyRate | null) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!rate || rate.date !== todayStr) {
      setIsRateModalOpen(true);
    }
  };

  const addAuditLog = (
    action: string,
    details: string,
    extra?: {
      financialDetails?: AuditLogEntry['financialDetails'];
      imei?: string;
      receiptNumber?: number;
      targetId?: string;
    }
  ) => {
    const newLog: AuditLogEntry = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      action,
      userName: currentUser?.name || 'Система',
      userRole: currentUser?.role || 'ADMIN',
      storeName: currentUser?.storeName || (selectedStoreId !== 'all' ? stores.find(s => s.id === selectedStoreId)?.name : undefined),
      details,
      financialDetails: extra?.financialDetails,
      imei: extra?.imei,
      receiptNumber: extra?.receiptNumber,
      targetId: extra?.targetId
    };
    setAuditLogs(prev => [newLog, ...prev]);
  };

  const addLedgerEntry = (
    type: LedgerEntry['type'],
    description: string,
    amountTjs?: number,
    amountUsd?: number,
    storeId?: string,
    referenceId?: string
  ) => {
    const store = stores.find(s => s.id === storeId);
    const newEntry: LedgerEntry = {
      id: `led-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      timestamp: new Date().toISOString(),
      type,
      description,
      amountTjs,
      amountUsd,
      exchangeRate: todayRate?.rate || 9.50,
      storeId,
      storeName: store?.name,
      referenceId,
      userName: currentUser?.name || 'Система'
    };
    setLedger(prev => [newEntry, ...prev]);
  };

  const login = (loginStr: string, passStr: string) => {
    const found = users.find(
      u => u.login.toLowerCase() === loginStr.trim().toLowerCase() && (u.passwordHash === passStr || u.pin === passStr)
    );
    if (!found) {
      return { success: false, message: 'Неверный логин или пароль' };
    }
    if (!found.active) {
      return { success: false, message: 'Аккаунт отключен администратором' };
    }
    setCurrentUser(found);
    useAuthStore.getState().setAuth(found, `token-${Date.now()}`);
    if (found.role === 'SELLER' && found.storeId) {
      setSelectedStoreIdState(found.storeId);
    } else {
      setSelectedStoreIdState('all');
    }
    setActivePageState('SALE');
    checkRatePrompt(todayRate);
    addAuditLog('LOGIN', `Пользователь ${found.name} (${found.role}) вошел в систему`);
    return { success: true };
  };

  const logout = () => {
    if (currentUser) {
      addAuditLog('LOGOUT', `Пользователь ${currentUser.name} вышел из системы`);
    }
    setCurrentUser(null);
    useAuthStore.getState().logout();
  };

  const setDailyRate = (rate: number) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const isUpdate = todayRate && todayRate.date === todayStr;
    const newRateObj: DailyRate = {
      date: todayStr,
      rate,
      createdBy: isUpdate ? todayRate.createdBy : (currentUser?.login || 'admin'),
      createdAt: isUpdate ? todayRate.createdAt : new Date().toISOString(),
      updatedBy: isUpdate ? currentUser?.login : undefined,
      updatedAt: isUpdate ? new Date().toISOString() : undefined
    };
    setTodayRateState(newRateObj);
    setIsRateModalOpen(false);
    useUIStore.getState().setDailyRateModalOpen(false);
    addAuditLog(
      isUpdate ? 'RATE_CHANGE' : 'RATE_SET',
      `Курс USD/TJS установлен: 1 USD = ${rate.toFixed(2)} TJS`,
      { financialDetails: { exchangeRate: rate } }
    );
  };

  const setActivePage = (page: PageId, _navTargetId?: string) => {
    setActivePageState(page);
    setDrawerOpen(false);
  };

  const setSelectedStoreId = (storeId: string) => {
    if (currentUser?.role === 'SELLER') return; // locked for seller
    setSelectedStoreIdState(storeId);
  };

  const openScanner = (callback: (code: string) => void) => {
    setScannerCallback(() => callback);
    setIsScannerOpen(true);
  };

  const closeScanner = () => {
    setIsScannerOpen(false);
    setScannerCallback(null);
  };

  // 1. ATOMIC SALE TRANSACTION
  const createSale = ({
    items,
    paymentMethod,
    cashAmountTjs,
    cardAmountTjs,
    customerName
  }: {
    items: { device: Device; salePriceTjs: number }[];
    paymentMethod: PaymentMethod;
    cashAmountTjs: number;
    cardAmountTjs: number;
    customerName?: string;
  }) => {
    if (!currentUser) return { success: false, message: 'Необходима авторизация' };
    if (!todayRate) return { success: false, message: 'Сначала задайте курс валют' };
    if (items.length === 0) return { success: false, message: 'Корзина пуста' };

    const totalTjs = items.reduce((acc, item) => acc + item.salePriceTjs, 0);
    const rate = todayRate.rate;
    const totalUsd = +(totalTjs / rate).toFixed(2);

    // Validate payment sum
    if (paymentMethod === 'SPLIT') {
      if (Math.abs(cashAmountTjs + cardAmountTjs - totalTjs) > 0.01) {
        return { success: false, message: `Сумма оплаты (${cashAmountTjs + cardAmountTjs} TJS) не равна итогу (${totalTjs} TJS)` };
      }
    }

    // Determine store
    const storeId = currentUser.role === 'SELLER' ? (currentUser.storeId || 'store-1') : (selectedStoreId !== 'all' ? selectedStoreId : items[0].device.locationId);
    const storeObj = stores.find(s => s.id === storeId) || stores[1];

    // Generate new receipt number
    const maxReceipt = sales.reduce((max, s) => Math.max(max, s.receiptNumber || 0), 1059);
    const receiptNumber = maxReceipt + 1;
    const saleId = `sale-${receiptNumber}`;
    const nowIso = new Date().toISOString();

    let hasBelowCost = false;

    // Check device availability & cost
    const saleItems: SaleItem[] = [];
    const deviceIdsToUpdate = new Set<string>();

    for (const entry of items) {
      const liveDev = devices.find(d => d.id === entry.device.id);
      if (!liveDev || (liveDev.status !== 'STORE_STOCK' && liveDev.status !== 'IN_STOCK_AFTER_EXCHANGE')) {
        return { success: false, message: `Устройство ${entry.device.model} (IMEI ${entry.device.imei}) уже недоступно на складе` };
      }
      deviceIdsToUpdate.add(liveDev.id);

      const priceUsd = +(entry.salePriceTjs / rate).toFixed(2);
      const costTjs = +(liveDev.costBasisUsd * rate).toFixed(2);
      const isBelow = entry.salePriceTjs < costTjs;
      if (isBelow) hasBelowCost = true;

      saleItems.push({
        deviceId: liveDev.id,
        imei: liveDev.imei,
        brand: liveDev.brand,
        model: liveDev.model,
        storage: liveDev.storage,
        color: liveDev.color,
        salePriceTjs: entry.salePriceTjs,
        salePriceUsd: priceUsd,
        purchaseCostUsd: liveDev.purchaseCostUsd,
        costBasisUsd: liveDev.costBasisUsd,
        isBelowCost: isBelow
      });
    }

    // 1. Create Sale Record
    const newSale: Sale = {
      id: saleId,
      receiptNumber,
      date: nowIso,
      storeId: storeObj.id,
      storeName: storeObj.name,
      sellerId: currentUser.id,
      sellerName: currentUser.name,
      customerName: customerName?.trim() || undefined,
      items: saleItems,
      totalTjs,
      totalUsd,
      exchangeRate: rate,
      paymentMethod,
      cashAmountTjs: paymentMethod === 'CASH' ? totalTjs : (paymentMethod === 'CARD' ? 0 : cashAmountTjs),
      cardAmountTjs: paymentMethod === 'CARD' ? totalTjs : (paymentMethod === 'CASH' ? 0 : cardAmountTjs),
      status: 'COMPLETED',
      hasBelowCostItem: hasBelowCost
    };

    // 2. Update Devices Status to SOLD and append timeline
    const updatedDevices = devices.map(d => {
      if (deviceIdsToUpdate.has(d.id)) {
        const matchingSaleItem = saleItems.find(si => si.deviceId === d.id);
        return {
          ...d,
          status: 'SOLD' as const,
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}-${Math.random().toString(36).substring(2, 5)}`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'SALE',
              description: `Продажа по чеку #${receiptNumber} за ${matchingSaleItem?.salePriceTjs || 0} TJS ($${matchingSaleItem?.salePriceUsd || 0})`,
              user: currentUser.name,
              storeName: storeObj.name,
              priceTjs: matchingSaleItem?.salePriceTjs,
              priceUsd: matchingSaleItem?.salePriceUsd
            }
          ]
        };
      }
      return d;
    });

    // 3. Update Store Cash balance if cash used
    const actualCashTjs = paymentMethod === 'CASH' ? totalTjs : (paymentMethod === 'SPLIT' ? cashAmountTjs : 0);
    const updatedStores = stores.map(s => {
      if (s.id === storeObj.id) {
        return { ...s, cashBalanceTjs: s.cashBalanceTjs + actualCashTjs };
      }
      return s;
    });

    // 4. Update Owner accrued profit
    const totalCostUsd = saleItems.reduce((acc, si) => acc + si.costBasisUsd, 0);
    const saleProfitUsd = totalUsd - totalCostUsd;
    const updatedOwners = owners.map(o => {
      const share = o.profitSharePercent / 100;
      const profitPart = +(saleProfitUsd * share).toFixed(2);
      return {
        ...o,
        totalAccruedProfitUsd: +(o.totalAccruedProfitUsd + profitPart).toFixed(2),
        availableProfitUsd: +(o.availableProfitUsd + profitPart).toFixed(2)
      };
    });

    // Commit state
    setSales(prev => [newSale, ...prev]);
    setDevices(updatedDevices);
    setStores(updatedStores);
    setOwners(updatedOwners);

    // 5. Financial Ledger & Audit
    addLedgerEntry(
      paymentMethod === 'CASH' ? 'CASH_SALE' : (paymentMethod === 'CARD' ? 'CARD_SALE' : 'SALE'),
      `Продажа по чеку #${receiptNumber} (${items.map(i => i.device.model).join(', ')})`,
      totalTjs,
      totalUsd,
      storeObj.id,
      saleId
    );

    if (hasBelowCost) {
      addAuditLog(
        'SALE_BELOW_COST',
        `Чек #${receiptNumber}: Продажа ниже себестоимости! Сумма: ${totalTjs} TJS ($${totalUsd}), Себестоимость: $${totalCostUsd}`,
        {
          financialDetails: {
            amountTjs: totalTjs,
            amountUsd: totalUsd,
            exchangeRate: rate,
            purchaseCostUsd: totalCostUsd,
            salePriceTjs: totalTjs
          },
          receiptNumber,
          targetId: saleId
        }
      );
    } else {
      addAuditLog(
        'SALE',
        `Чек #${receiptNumber}: Продажа ${items.length} устройств на сумму ${totalTjs} TJS ($${totalUsd})`,
        {
          financialDetails: {
            amountTjs: totalTjs,
            amountUsd: totalUsd,
            exchangeRate: rate,
            purchaseCostUsd: totalCostUsd,
            salePriceTjs: totalTjs
          },
          receiptNumber,
          targetId: saleId
        }
      );
    }

    return { success: true, receiptNumber };
  };

  // 2. ATOMIC EXCHANGE TRANSACTION
  const processExchange = (params: {
    originalSaleReceiptNumber?: number | string;
    originalSaleId?: string;
    returnedImei?: string;
    returnedItem?: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      imei: string;
      exchangeInValueTjs: number;
    };
    exchangeInValueTjs?: number;
    replacementDeviceId: string;
    newPriceTjs: number;
    differenceTjs?: number;
    paymentMethod?: PaymentMethod;
    cashAmountTjs?: number;
    cardAmountTjs?: number;
  }) => {
    if (!currentUser) return { success: false, message: 'Необходима авторизация' };
    if (!todayRate) return { success: false, message: 'Сначала задайте курс валют' };

    // Extract returned IMEI and valuation
    const returnedImeiStr = (params.returnedImei || params.returnedItem?.imei || '').trim();
    const exchangeInValueTjs = params.exchangeInValueTjs ?? params.returnedItem?.exchangeInValueTjs ?? 0;
    const replacementDeviceId = params.replacementDeviceId;
    const newPriceTjs = params.newPriceTjs;
    const paymentMethod = params.paymentMethod || 'CASH';

    // Parse receipt number / sale ID
    let targetReceiptNum: number | undefined;
    if (typeof params.originalSaleReceiptNumber === 'number') {
      targetReceiptNum = params.originalSaleReceiptNumber;
    } else if (typeof params.originalSaleReceiptNumber === 'string') {
      targetReceiptNum = parseInt(params.originalSaleReceiptNumber.replace('#', ''), 10);
    } else if (params.originalSaleId) {
      targetReceiptNum = parseInt(params.originalSaleId.replace('#', ''), 10);
    }

    // Find target sale in sales history
    let targetSale = sales.find(s =>
      (targetReceiptNum && !isNaN(targetReceiptNum) && s.receiptNumber === targetReceiptNum) ||
      s.id === params.originalSaleId ||
      s.receiptNumber.toString() === params.originalSaleId?.toString().replace('#', '')
    );

    // If sale receipt is not found in history, attempt to find sale by returned IMEI
    if (!targetSale && returnedImeiStr) {
      targetSale = sales.find(s => s.items.some(i => i.imei === returnedImeiStr));
    }

    // Find returned device in system or create temporary device entry if manual Trade-In intake
    let returnedDev = devices.find(d => d.imei === returnedImeiStr);
    const storeObj = currentUser.storeId ? stores.find(s => s.id === currentUser.storeId) : stores[1];
    const storeId = targetSale?.storeId || storeObj?.id || 'store-1';
    const storeName = targetSale?.storeName || storeObj?.name || 'Магазин';

    const rate = todayRate.rate;
    const exchangeInValueUsd = +(exchangeInValueTjs / rate).toFixed(2);
    const newPriceUsd = +(newPriceTjs / rate).toFixed(2);

    if (!returnedDev && returnedImeiStr) {
      const rItem = params.returnedItem || { brand: 'Apple', model: 'iPhone', storage: '256 GB', color: 'Black' };
      returnedDev = {
        id: `dev-tradein-${Date.now()}`,
        brand: rItem.brand,
        model: rItem.model,
        storage: rItem.storage,
        color: rItem.color,
        imei: returnedImeiStr,
        status: 'IN_STOCK_AFTER_EXCHANGE' as const,
        locationId: storeId,
        locationName: storeName,
        costBasisUsd: exchangeInValueUsd,
        purchaseCostUsd: exchangeInValueUsd,
        retailPriceTjs: exchangeInValueTjs,
        supplierName: 'Trade-In Клиент',
        receivedDate: new Date().toISOString().split('T')[0],
        createdAt: new Date().toISOString(),
        timeline: [
          {
            id: `t-${Date.now()}`,
            date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
            type: 'EXCHANGE_IN',
            description: `Принят по обмену (Trade-In). Оценка: ${exchangeInValueTjs} TJS ($${exchangeInValueUsd})`,
            user: currentUser.name,
            storeName
          }
        ]
      };
      setDevices(prev => [returnedDev!, ...prev]);
    }

    if (!returnedDev) {
      return { success: false, message: `Возвращаемое устройство с IMEI ${returnedImeiStr} не найдено` };
    }

    const newDev = devices.find(d => d.id === replacementDeviceId);
    if (!newDev || (newDev.status !== 'STORE_STOCK' && newDev.status !== 'IN_STOCK_AFTER_EXCHANGE')) {
      return { success: false, message: 'Выбранный телефон на замену недоступен на складе' };
    }

    const diffTjs = params.differenceTjs ?? (newPriceTjs - exchangeInValueTjs);
    const cashAmountTjs = params.cashAmountTjs ?? (diffTjs > 0 && paymentMethod === 'CASH' ? diffTjs : 0);
    const cardAmountTjs = params.cardAmountTjs ?? (diffTjs > 0 && paymentMethod === 'CARD' ? diffTjs : 0);

    const exchangeEventId = `exch-${Date.now()}`;
    const exchangeEvent = {
      id: exchangeEventId,
      date: new Date().toISOString(),
      returnedDeviceId: returnedDev.id,
      returnedImei: returnedDev.imei,
      returnedModel: `${returnedDev.brand} ${returnedDev.model} (${returnedDev.storage} / ${returnedDev.color})`,
      exchangeInValueTjs,
      exchangeInValueUsd,
      replacementDeviceId: newDev.id,
      replacementImei: newDev.imei,
      replacementModel: `${newDev.brand} ${newDev.model} (${newDev.storage} / ${newDev.color})`,
      newPriceTjs,
      newPriceUsd,
      differenceTjs: diffTjs,
      paymentMethod,
      cashAmountTjs,
      cardAmountTjs,
      processedBy: currentUser.name
    };

    // 1. Update Sale record if matching sale exists
    if (targetSale) {
      setSales(prev => prev.map(s => {
        if (s.id === targetSale!.id) {
          const newTotalTjs = Math.max(0, s.totalTjs + diffTjs);
          const newTotalUsd = +(newTotalTjs / rate).toFixed(2);

          let newCashTjs = s.cashAmountTjs;
          let newCardTjs = s.cardAmountTjs;
          if (diffTjs > 0) {
            if (paymentMethod === 'CASH') newCashTjs += diffTjs;
            else if (paymentMethod === 'CARD') newCardTjs += diffTjs;
            else if (paymentMethod === 'SPLIT') {
              newCashTjs += cashAmountTjs;
              newCardTjs += cardAmountTjs;
            }
          } else if (diffTjs < 0) {
            newCashTjs = Math.max(0, s.cashAmountTjs + diffTjs);
          }

          let itemFound = false;
          let updatedItems = s.items.map(item => {
            if (item.imei === returnedDev!.imei || (returnedImeiStr && item.imei === returnedImeiStr)) {
              itemFound = true;
              return {
                deviceId: newDev.id,
                imei: newDev.imei,
                brand: newDev.brand,
                model: newDev.model,
                storage: newDev.storage,
                color: newDev.color,
                salePriceTjs: newPriceTjs,
                salePriceUsd: newPriceUsd,
                purchaseCostUsd: newDev.purchaseCostUsd,
                costBasisUsd: newDev.costBasisUsd || newDev.purchaseCostUsd,
                isBelowCost: newPriceUsd < (newDev.costBasisUsd || newDev.purchaseCostUsd)
              };
            }
            return item;
          });

          if (!itemFound) {
            const newItemObj = {
              deviceId: newDev.id,
              imei: newDev.imei,
              brand: newDev.brand,
              model: newDev.model,
              storage: newDev.storage,
              color: newDev.color,
              salePriceTjs: newPriceTjs,
              salePriceUsd: newPriceUsd,
              purchaseCostUsd: newDev.purchaseCostUsd,
              costBasisUsd: newDev.costBasisUsd || newDev.purchaseCostUsd,
              isBelowCost: newPriceUsd < (newDev.costBasisUsd || newDev.purchaseCostUsd)
            };
            if (updatedItems.length > 0) {
              updatedItems[0] = newItemObj;
            } else {
              updatedItems = [newItemObj];
            }
          }

          return {
            ...s,
            items: updatedItems,
            totalTjs: newTotalTjs,
            totalUsd: newTotalUsd,
            cashAmountTjs: newCashTjs,
            cardAmountTjs: newCardTjs,
            status: 'EXCHANGED' as const,
            exchangeEvents: [...(s.exchangeEvents || []), exchangeEvent]
          };
        }
        return s;
      }));
    }

    // 2. Return Old Device to Stock with NEW Cost Basis = exchangeInValueUsd
    // 3. Mark New Device as SOLD
    setDevices(prev => prev.map(d => {
      if (d.id === returnedDev!.id) {
        return {
          ...d,
          status: 'IN_STOCK_AFTER_EXCHANGE' as const,
          locationId: storeId,
          locationName: storeName,
          costBasisUsd: exchangeInValueUsd,
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}-1`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'EXCHANGE_IN',
              description: `Возврат по обмену (Чек #${targetSale?.receiptNumber || 'Trade-In'}). Оценка: ${exchangeInValueTjs} TJS ($${exchangeInValueUsd})`,
              user: currentUser.name,
              storeName,
              priceTjs: exchangeInValueTjs,
              priceUsd: exchangeInValueUsd
            }
          ]
        };
      }
      if (d.id === newDev.id) {
        return {
          ...d,
          status: 'SOLD' as const,
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}-2`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'EXCHANGE_OUT',
              description: `Выдан взамен по обмену (Чек #${targetSale?.receiptNumber || 'Trade-In'}) за ${newPriceTjs} TJS ($${newPriceUsd})`,
              user: currentUser.name,
              storeName,
              priceTjs: newPriceTjs,
              priceUsd: newPriceUsd
            }
          ]
        };
      }
      return d;
    }));

    // 4. Update Store cash if diff involved cash
    let cashDelta = 0;
    if (diffTjs > 0) {
      // Customer paid
      cashDelta = paymentMethod === 'CASH' ? diffTjs : (paymentMethod === 'SPLIT' ? cashAmountTjs : 0);
    } else if (diffTjs < 0) {
      // Store paid customer difference
      cashDelta = diffTjs; // negative
    }

    if (cashDelta !== 0) {
      setStores(prev => prev.map(s => {
        if (s.id === storeId) {
          return { ...s, cashBalanceTjs: s.cashBalanceTjs + cashDelta };
        }
        return s;
      }));
    }

    // Ledger & Audit
    addLedgerEntry(
      'EXCHANGE_SETTLEMENT',
      `Обмен по чеку #${targetSale?.receiptNumber || 'Trade-In'}: Сдан ${returnedDev.model} (${exchangeInValueTjs} TJS), Выдан ${newDev.model} (${newPriceTjs} TJS). Разница: ${diffTjs} TJS`,
      diffTjs,
      +(diffTjs / rate).toFixed(2),
      storeId,
      targetSale?.id
    );

    addAuditLog(
      'EXCHANGE',
      `Чек #${targetSale?.receiptNumber || 'Trade-In'}: Обмен ${returnedDev.model} (IMEI ${returnedDev.imei}) на ${newDev.model} (IMEI ${newDev.imei}). Расчет: ${diffTjs >= 0 ? '+' : ''}${diffTjs} TJS`,
      {
        financialDetails: {
          amountTjs: diffTjs,
          amountUsd: +(diffTjs / rate).toFixed(2),
          exchangeRate: rate
        },
        receiptNumber: targetSale?.receiptNumber,
        imei: returnedDev.imei,
        targetId: targetSale?.id
      }
    );

    return { success: true };
  };

  // 3. REFUND
  const processRefund = ({
    saleId,
    reason,
    refundAmountTjs,
    penaltyFeeTjs = 0,
    paymentMethod
  }: {
    saleId: string;
    reason: string;
    refundAmountTjs: number;
    penaltyFeeTjs?: number;
    paymentMethod: 'CASH' | 'CARD';
  }) => {
    if (!currentUser || currentUser.role === 'SELLER') {
      return { success: false, message: 'У вас нет прав для возврата товара' };
    }
    const sale = sales.find(s => s.id === saleId);
    if (!sale) return { success: false, message: 'Чек не найден' };

    const rate = todayRate?.rate || 9.50;
    const penaltyUsd = +(penaltyFeeTjs / rate).toFixed(2);
    const actualRefundTjs = Math.max(0, refundAmountTjs);
    const actualRefundUsd = +(actualRefundTjs / rate).toFixed(2);

    const updatedSales = sales.map(s => {
      if (s.id === saleId) {
        return {
          ...s,
          status: 'REFUNDED' as const,
          refundReason: reason,
          refundedAt: new Date().toISOString(),
          refundedBy: currentUser.name,
          penaltyFeeTjs,
          penaltyFeeUsd: penaltyUsd,
          actualRefundAmountTjs: actualRefundTjs
        };
      }
      return s;
    });

    // Return sold devices to store stock at their original purchase cost basis
    const deviceIds = sale.items.map(i => i.deviceId);
    const updatedDevices = devices.map(d => {
      if (deviceIds.includes(d.id)) {
        return {
          ...d,
          status: 'STORE_STOCK' as const,
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'REFUND',
              description: `Возврат по чеку #${sale.receiptNumber}. Оприходован на склад по себестоимости закупки ($${d.costBasisUsd || d.purchaseCostUsd}). ${penaltyFeeTjs > 0 ? `Штраф за возврат: ${penaltyFeeTjs} TJS.` : ''}`,
              user: currentUser.name,
              storeName: sale.storeName
            }
          ]
        };
      }
      return d;
    });

    const updatedStores = stores.map(s => {
      if (s.id === sale.storeId && paymentMethod === 'CASH') {
        return { ...s, cashBalanceTjs: s.cashBalanceTjs - actualRefundTjs };
      }
      return s;
    });

    // Reverse owner accrued profit from original sale, but 100% of penalty is net profit!
    const totalCostUsd = sale.items.reduce((acc, si) => acc + (si.costBasisUsd || 0), 0);
    const originalProfitUsd = sale.totalUsd - totalCostUsd;
    const netProfitImpactUsd = -originalProfitUsd + penaltyUsd;

    const updatedOwners = owners.map(o => {
      const share = o.profitSharePercent / 100;
      const ownerProfitDeltaUsd = +(netProfitImpactUsd * share).toFixed(2);
      return {
        ...o,
        totalAccruedProfitUsd: +(o.totalAccruedProfitUsd + ownerProfitDeltaUsd).toFixed(2),
        availableProfitUsd: +(o.availableProfitUsd + ownerProfitDeltaUsd).toFixed(2)
      };
    });

    setSales(updatedSales);
    setDevices(updatedDevices);
    setStores(updatedStores);
    setOwners(updatedOwners);

    addLedgerEntry(
      'REFUND',
      `Возврат по чеку #${sale.receiptNumber}: ${reason} (-${actualRefundTjs} TJS)${penaltyFeeTjs > 0 ? ` [Штраф: +${penaltyFeeTjs} TJS]` : ''}`,
      -actualRefundTjs,
      -actualRefundUsd,
      sale.storeId,
      sale.id
    );

    if (penaltyFeeTjs > 0) {
      addLedgerEntry(
        'SUPPLIER_BONUS',
        `Штраф за возврат товара по чеку #${sale.receiptNumber} (+${penaltyFeeTjs} TJS - 100% в чистую прибыль)`,
        penaltyFeeTjs,
        penaltyUsd,
        sale.storeId,
        sale.id
      );
    }

    addAuditLog(
      'REFUND',
      `Чек #${sale.receiptNumber}: Возврат на сумму ${actualRefundTjs} TJS. ${penaltyFeeTjs > 0 ? `Удержится штраф: ${penaltyFeeTjs} TJS (100% зачисляется в прибыль).` : ''} Причина: ${reason}`,
      {
        financialDetails: { amountTjs: actualRefundTjs, amountUsd: actualRefundUsd, penaltyTjs: penaltyFeeTjs, penaltyUsd },
        receiptNumber: sale.receiptNumber,
        targetId: sale.id
      }
    );

    return { success: true };
  };

  // 4. PURCHASE / INTAKE
  const createPurchase = ({
    supplierId,
    invoiceNumber,
    date,
    isStorePurchase,
    storeId,
    groups
  }: {
    supplierId: string;
    invoiceNumber: string;
    date: string;
    isStorePurchase: boolean;
    storeId?: string;
    groups: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      purchasePriceUsd: number;
      barcode?: string;
      imeis: string[];
    }[];
  }) => {
    if (!currentUser || currentUser.role === 'SELLER') {
      return { success: false, message: 'У продавца нет прав на создание прихода' };
    }

    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return { success: false, message: 'Поставщик не найден' };

    let totalUsd = 0;
    let totalDevicesCount = 0;
    const newDevices: Device[] = [];

    const destLocationId = isStorePurchase && storeId ? storeId : 'main-warehouse';
    const destLocationName = isStorePurchase && storeId 
      ? (stores.find(s => s.id === storeId)?.name || 'Магазин') 
      : 'Главный склад';

    const targetStatus = isStorePurchase ? 'STORE_STOCK' : 'MAIN_WAREHOUSE';

    for (const group of groups) {
      for (const rawImei of group.imeis) {
        if (!rawImei.trim()) continue;
        
        let imei1 = rawImei.trim();
        let imei2Parsed: string | undefined = undefined;

        if (imei1.includes('/')) {
          const parts = imei1.split('/').map(s => s.trim());
          imei1 = parts[0];
          imei2Parsed = parts[1] || undefined;
        } else if (imei1.includes(',')) {
          const parts = imei1.split(',').map(s => s.trim());
          imei1 = parts[0];
          imei2Parsed = parts[1] || undefined;
        }

        // Check uniqueness
        if (devices.some(d => d.imei === imei1 || (d.imei2 && d.imei2 === imei1))) {
          return { success: false, message: `IMEI ${imei1} уже зарегистрирован в базе данных!` };
        }
        totalDevicesCount++;
        totalUsd += group.purchasePriceUsd;

        const devId = `dev-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
        newDevices.push({
          id: devId,
          imei: imei1,
          imei2: imei2Parsed,
          barcode: group.barcode?.trim() || undefined,
          brand: group.brand,
          model: group.model,
          storage: group.storage,
          color: group.color,
          status: targetStatus,
          locationId: destLocationId,
          locationName: destLocationName,
          supplierId: supplier.id,
          supplierName: supplier.name,
          invoiceNumber,
          purchaseCostUsd: group.purchasePriceUsd,
          costBasisUsd: group.purchasePriceUsd,
          createdAt: new Date().toISOString(),
          timeline: [
            {
              id: `t-${Date.now()}`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'INCOME',
              description: `Приход по накладной ${invoiceNumber} ($${group.purchasePriceUsd})`,
              user: currentUser.name,
              storeName: destLocationName,
              priceUsd: group.purchasePriceUsd
            }
          ]
        });
      }
    }

    if (totalDevicesCount === 0) {
      return { success: false, message: 'Добавьте хотя бы один IMEI' };
    }

    // 1. Create Invoice
    const newInvoice: SupplierInvoice = {
      id: `inv-${Date.now()}`,
      invoiceNumber: invoiceNumber.trim(),
      supplierId: supplier.id,
      supplierName: supplier.name,
      date,
      totalAmountUsd: totalUsd,
      paidAmountUsd: 0,
      remainingAmountUsd: totalUsd,
      status: 'UNPAID',
      devicesCount: totalDevicesCount,
      isStorePurchase,
      storeId
    };

    // 2. Update Supplier Debt & Purchased
    const updatedSuppliers = suppliers.map(s => {
      if (s.id === supplier.id) {
        return {
          ...s,
          totalPurchasedUsd: s.totalPurchasedUsd + totalUsd,
          totalDebtUsd: s.totalDebtUsd + totalUsd
        };
      }
      return s;
    });

    setInvoices(prev => [newInvoice, ...prev]);
    setDevices(prev => [...newDevices, ...prev]);
    setSuppliers(updatedSuppliers);

    addLedgerEntry(
      'PURCHASE',
      `Приход по накладной ${invoiceNumber} от ${supplier.name} (${totalDevicesCount} шт. на $${totalUsd})`,
      undefined,
      totalUsd,
      isStorePurchase ? storeId : undefined,
      newInvoice.id
    );

    addAuditLog(
      'PURCHASE',
      `Создан приход по накладной ${invoiceNumber} (${supplier.name}): ${totalDevicesCount} устройств, сумма $${totalUsd} в ${destLocationName}`,
      {
        financialDetails: { amountUsd: totalUsd, purchaseCostUsd: totalUsd },
        targetId: newInvoice.id
      }
    );

    return { success: true };
  };

  // 5. TRANSFERS
  const createTransferRequest = (
    toLocationIdOrParams: string | { fromLocationId?: string; toLocationId: string; deviceIds: string[] },
    deviceIdsParam?: string[]
  ) => {
    if (!currentUser) return { success: false, message: 'Необходима авторизация' };

    let fromLocId = currentUser.storeId || 'main-warehouse';
    let toLocationId = '';
    let deviceIds: string[] = [];

    if (typeof toLocationIdOrParams === 'object') {
      fromLocId = toLocationIdOrParams.fromLocationId || fromLocId;
      toLocationId = toLocationIdOrParams.toLocationId;
      deviceIds = toLocationIdOrParams.deviceIds;
    } else {
      toLocationId = toLocationIdOrParams;
      deviceIds = deviceIdsParam || [];
    }
    const fromStore = stores.find(s => s.id === fromLocId);
    const toStore = stores.find(s => s.id === toLocationId);

    const targetDevs = devices.filter(d => deviceIds.includes(d.id));
    if (targetDevs.length === 0) return { success: false, message: 'Выберите устройства для перемещения' };

    const trNumber = `TR-${Math.floor(100 + Math.random() * 900)}`;
    const newReq: TransferRequest = {
      id: `tr-${Date.now()}`,
      transferNumber: trNumber,
      fromLocationId: fromLocId,
      fromLocationName: fromStore?.name || 'Магазин',
      toLocationId,
      toLocationName: toStore?.name || 'Склад',
      deviceIds,
      deviceImeis: targetDevs.map(d => d.imei),
      deviceModels: targetDevs.map(d => `${d.brand} ${d.model} (${d.storage} / ${d.color})`),
      requestedBy: currentUser.name,
      requestedAt: new Date().toISOString(),
      status: 'PENDING_APPROVAL'
    };

    // Mark devices as TRANSFER_PENDING
    const updatedDevices = devices.map(d => {
      if (deviceIds.includes(d.id)) {
        return { ...d, status: 'TRANSFER_PENDING' as const };
      }
      return d;
    });

    setTransfers(prev => [newReq, ...prev]);
    setDevices(updatedDevices);

    // Create Notification for Admin only when non-admin / seller creates transfer request
    const isAdminOrPartner = currentUser.role === 'ADMIN' || currentUser.role === 'PARTNER';
    if (!isAdminOrPartner) {
      const newNotif: NotificationItem = {
        id: `notif-${Date.now()}`,
        title: 'Запрос на перемещение',
        message: `${currentUser.name} запросил перемещение ${targetDevs.length} устройств из ${newReq.fromLocationName} в ${newReq.toLocationName} (${trNumber})`,
        date: new Date().toISOString(),
        targetType: 'TRANSFER_REQUEST',
        targetId: newReq.id,
        targetRoute: 'TRANSFER',
        linkPage: 'TRANSFER',
        read: false,
        resolved: false
      };
      setNotifications(prev => [newNotif, ...prev]);
    }

    addAuditLog(
      'TRANSFER_REQUEST',
      `Создан запрос на перемещение ${trNumber} (${targetDevs.length} шт.): ${newReq.fromLocationName} → ${newReq.toLocationName}`,
      { targetId: newReq.id }
    );

    return { success: true };
  };

  const directTransfer = (fromLocationId: string, toLocationId: string, deviceIds: string[]) => {
    if (!currentUser || currentUser.role === 'SELLER') {
      return { success: false, message: 'Прямое перемещение доступно только Администратору или Партнеру' };
    }

    const fromStore = stores.find(s => s.id === fromLocationId);
    const toStore = stores.find(s => s.id === toLocationId);
    const targetDevs = devices.filter(d => deviceIds.includes(d.id));

    const trNumber = `TR-${Math.floor(100 + Math.random() * 900)}`;
    const newReq: TransferRequest = {
      id: `tr-${Date.now()}`,
      transferNumber: trNumber,
      fromLocationId,
      fromLocationName: fromStore?.name || 'Главный склад',
      toLocationId,
      toLocationName: toStore?.name || 'Магазин',
      deviceIds,
      deviceImeis: targetDevs.map(d => d.imei),
      deviceModels: targetDevs.map(d => `${d.brand} ${d.model} (${d.storage} / ${d.color})`),
      requestedBy: currentUser.name,
      requestedAt: new Date().toISOString(),
      status: 'APPROVED',
      approvedBy: currentUser.name,
      approvedAt: new Date().toISOString()
    };

    const targetStatus: DeviceStatus = toLocationId === 'main-warehouse' ? 'MAIN_WAREHOUSE' : 'STORE_STOCK';

    const updatedDevices = devices.map(d => {
      if (deviceIds.includes(d.id)) {
        return {
          ...d,
          status: targetStatus,
          locationId: toLocationId,
          locationName: toStore?.name || 'Склад',
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'TRANSFER',
              description: `Прямое перемещение: ${fromStore?.name} → ${toStore?.name}`,
              user: currentUser.name,
              storeName: toStore?.name
            }
          ]
        };
      }
      return d;
    });

    setTransfers(prev => [newReq, ...prev]);
    setDevices(updatedDevices);

    addLedgerEntry('TRANSFER', `Перемещение ${trNumber}: ${fromStore?.name} → ${toStore?.name} (${targetDevs.length} устройств)`);
    addAuditLog('TRANSFER', `Выполнено прямое перемещение ${trNumber}: ${targetDevs.length} устройств из ${fromStore?.name} в ${toStore?.name}`);

    return { success: true };
  };

  const approveTransfer = (transferId: string) => {
    if (!currentUser || currentUser.role === 'SELLER') {
      return { success: false, message: 'Только администратор может подтверждать перемещения' };
    }
    const targetTr = transfers.find(t => t.id === transferId);
    if (!targetTr) return { success: false, message: 'Запрос не найден' };

    const toStore = stores.find(s => s.id === targetTr.toLocationId);
    const targetStatus: DeviceStatus = targetTr.toLocationId === 'main-warehouse' ? 'MAIN_WAREHOUSE' : 'STORE_STOCK';

    const updatedTransfers = transfers.map(t => {
      if (t.id === transferId) {
        return {
          ...t,
          status: 'APPROVED' as const,
          approvedBy: currentUser.name,
          approvedAt: new Date().toISOString()
        };
      }
      return t;
    });

    const updatedDevices = devices.map(d => {
      if (targetTr.deviceIds.includes(d.id)) {
        return {
          ...d,
          status: targetStatus,
          locationId: targetTr.toLocationId,
          locationName: toStore?.name || 'Склад',
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'TRANSFER_APPROVED',
              description: `Перемещение ${targetTr.transferNumber} подтверждено (${targetTr.fromLocationName} → ${toStore?.name})`,
              user: currentUser.name,
              storeName: toStore?.name
            }
          ]
        };
      }
      return d;
    });

    // Resolve notifications
    setNotifications(prev => prev.map(n => n.targetId === transferId ? { ...n, resolved: true, read: true } : n));
    setTransfers(updatedTransfers);
    setDevices(updatedDevices);

    addAuditLog(
      'TRANSFER_APPROVAL',
      `Подтверждено перемещение ${targetTr.transferNumber} (${targetTr.deviceIds.length} устройств) в ${toStore?.name}`,
      { targetId: transferId }
    );

    return { success: true };
  };

  const rejectTransfer = (transferId: string, reason: string) => {
    if (!currentUser || currentUser.role === 'SELLER') {
      return { success: false, message: 'Только администратор может отклонять перемещения' };
    }
    const targetTr = transfers.find(t => t.id === transferId);
    if (!targetTr) return { success: false, message: 'Запрос не найден' };

    const fromStore = stores.find(s => s.id === targetTr.fromLocationId);
    const targetStatus: DeviceStatus = targetTr.fromLocationId === 'main-warehouse' ? 'MAIN_WAREHOUSE' : 'STORE_STOCK';

    const updatedTransfers = transfers.map(t => {
      if (t.id === transferId) {
        return {
          ...t,
          status: 'REJECTED' as const,
          approvedBy: currentUser.name,
          approvedAt: new Date().toISOString(),
          rejectedReason: reason
        };
      }
      return t;
    });

    // Return devices to original active status
    const updatedDevices = devices.map(d => {
      if (targetTr.deviceIds.includes(d.id)) {
        return {
          ...d,
          status: targetStatus,
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'TRANSFER_REJECTED',
              description: `Перемещение ${targetTr.transferNumber} отклонено: ${reason}`,
              user: currentUser.name,
              storeName: fromStore?.name
            }
          ]
        };
      }
      return d;
    });

    setNotifications(prev => prev.map(n => n.targetId === transferId ? { ...n, resolved: true, read: true } : n));
    setTransfers(updatedTransfers);
    setDevices(updatedDevices);

    addAuditLog('TRANSFER_REJECT', `Отклонено перемещение ${targetTr.transferNumber}. Причина: ${reason}`, { targetId: transferId });

    return { success: true };
  };

  // 6. REPAIRS
  const createRepairTicket = (data: {
    imei: string;
    imei2?: string;
    barcode?: string;
    brand: string;
    model: string;
    storage: string;
    color: string;
    saleReceiptNumber?: number;
    saleDate?: string;
    customerName?: string;
    customerPhone?: string;
    problemDescription: string;
    visualCondition?: string;
    equipmentPackage?: string;
    comment?: string;
    estimatedCostTjs?: number;
    repairCostTjs?: number;
  }) => {
    if (!currentUser) return { success: false, message: 'Необходима авторизация' };

    const maxTicket = repairs.reduce((max, r) => Math.max(max, r.ticketNumber || 0), 200);
    const ticketNumber = maxTicket + 1;
    const ticketId = `rep-${Date.now()}`;

    const matchingDev = devices.find(d => d.imei === data.imei.trim() || (data.barcode && d.barcode === data.barcode.trim()));
    const storeObj = currentUser.storeId ? stores.find(s => s.id === currentUser.storeId) : stores[1];
    const costTjs = data.repairCostTjs || data.estimatedCostTjs || 0;

    const newTicket: RepairTicket = {
      id: ticketId,
      ticketNumber,
      deviceId: matchingDev?.id,
      imei: data.imei.trim(),
      imei2: data.imei2?.trim() || matchingDev?.imei2,
      barcode: data.barcode?.trim() || matchingDev?.barcode,
      brand: data.brand,
      model: data.model,
      storage: data.storage,
      color: data.color,
      saleReceiptNumber: data.saleReceiptNumber,
      saleDate: data.saleDate,
      storeId: storeObj?.id || 'store-1',
      storeName: storeObj?.name || 'Магазин',
      intakeSeller: currentUser.name,
      customerName: data.customerName || '',
      customerPhone: data.customerPhone || '',
      problemDescription: data.problemDescription,
      visualCondition: data.visualCondition || 'Без видимых повреждений',
      equipmentPackage: data.equipmentPackage || 'Только телефон',
      comment: data.comment,
      estimatedCostTjs: costTjs,
      finalCostTjs: costTjs,
      status: 'ACCEPTED',
      statusHistory: [
        {
          status: 'ACCEPTED',
          updatedAt: new Date().toISOString(),
          updatedBy: currentUser.name,
          note: 'Прием телефона на ремонт'
        }
      ],
      createdAt: new Date().toISOString()
    };

    setRepairs(prev => [newTicket, ...prev]);

    // Automatically record expense in store accounting if repair cost > 0
    if (costTjs > 0) {
      createExpense({
        category: 'REPAIR_PARTS',
        amountTjs: costTjs,
        storeId: storeObj?.id || 'store-1',
        comment: `Затраты на ремонт по квитанции #${ticketNumber} (${data.brand} ${data.model}, IMEI: ${data.imei})`,
        paidFromCashRegister: true
      });
    }

    // If device exists in system, log to device timeline
    if (matchingDev) {
      setDevices(prev => prev.map(d => {
        if (d.id === matchingDev.id) {
          return {
            ...d,
            timeline: [
              ...d.timeline,
              {
                id: `t-${Date.now()}`,
                date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
                type: 'REPAIR_INTAKE',
                description: `Принят на ремонт (Квитанция #${ticketNumber}): ${data.problemDescription}`,
                user: currentUser.name,
                storeName: storeObj?.name
              }
            ]
          };
        }
        return d;
      }));
    }

    addAuditLog(
      'REPAIR_INTAKE',
      `Принят на ремонт телефон ${data.brand} ${data.model} (IMEI ${data.imei}), квитанция #${ticketNumber}. Неисправность: ${data.problemDescription}`,
      { imei: data.imei, targetId: ticketId }
    );

    return { success: true, ticketNumber };
  };

  const updateRepairStatus = (ticketId: string, newStatus: RepairStatus, note?: string, costTjs?: number) => {
    if (!currentUser) return { success: false, message: 'Необходима авторизация' };
    const ticket = repairs.find(r => r.id === ticketId);
    if (!ticket) return { success: false, message: 'Квитанция ремонта не найдена' };

    const updatedRepairs = repairs.map(r => {
      if (r.id === ticketId) {
        return {
          ...r,
          status: newStatus,
          finalCostTjs: costTjs ?? r.finalCostTjs,
          statusHistory: [
            ...r.statusHistory,
            {
              status: newStatus,
              updatedAt: new Date().toISOString(),
              updatedBy: currentUser.name,
              note
            }
          ]
        };
      }
      return r;
    });

    setRepairs(updatedRepairs);
    addAuditLog(
      'REPAIR_STATUS_CHANGE',
      `Ремонт #${ticket.ticketNumber} (${ticket.model}): изменен статус на "${newStatus}" (${note || 'без примечания'})`,
      { imei: ticket.imei, targetId: ticketId }
    );

    return { success: true };
  };

  // 7. SUPPLIER PAYMENT WITH FIFO
  const paySupplier = ({
    supplierId,
    amountUsd,
    sourceAccount,
    sourceAccountId,
    storeId,
    note
  }: {
    supplierId: string;
    amountUsd: number;
    sourceAccount?: 'MAIN_ACCOUNT' | 'STORE_CASH' | string;
    sourceAccountId?: string;
    storeId?: string;
    note?: string;
  }) => {
    if (!currentUser || currentUser.role === 'SELLER') {
      return { success: false, message: 'У вас нет прав для проведения выплат поставщикам' };
    }
    const supplier = suppliers.find(s => s.id === supplierId);
    if (!supplier) return { success: false, message: 'Поставщик не найден' };

    let remainingToPay = amountUsd;
    const appliedAllocations: { invoiceId: string; invoiceNumber: string; allocatedAmountUsd: number }[] = [];

    // Find unpaid invoices sorted oldest first (FIFO)
    const unpaidInvoices = invoices
      .filter(inv => inv.supplierId === supplierId && inv.remainingAmountUsd > 0)
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

    const updatedInvoices = invoices.map(inv => {
      if (inv.supplierId === supplierId && inv.remainingAmountUsd > 0 && remainingToPay > 0) {
        const payForThis = Math.min(inv.remainingAmountUsd, remainingToPay);
        const newPaid = inv.paidAmountUsd + payForThis;
        const newRemaining = inv.remainingAmountUsd - payForThis;
        remainingToPay -= payForThis;

        appliedAllocations.push({
          invoiceId: inv.id,
          invoiceNumber: inv.invoiceNumber,
          allocatedAmountUsd: payForThis
        });

        return {
          ...inv,
          paidAmountUsd: newPaid,
          remainingAmountUsd: newRemaining,
          status: (newRemaining === 0 ? 'PAID' : 'PARTIALLY_PAID') as SupplierInvoice['status']
        };
      }
      return inv;
    });

    const updatedSuppliers = suppliers.map(s => {
      if (s.id === supplierId) {
        return {
          ...s,
          totalPaidUsd: s.totalPaidUsd + amountUsd,
          totalDebtUsd: Math.max(0, s.totalDebtUsd - amountUsd)
        };
      }
      return s;
    });

    // If paid from store cash, convert and deduct
    const resolvedStoreId = storeId || (sourceAccountId && sourceAccountId !== 'owner-funds' ? sourceAccountId : undefined);
    if (resolvedStoreId) {
      const rate = todayRate?.rate || 9.50;
      const tjsDeduct = +(amountUsd * rate).toFixed(2);
      setStores(prev => prev.map(s => s.id === resolvedStoreId ? { ...s, cashBalanceTjs: s.cashBalanceTjs - tjsDeduct } : s));
    }

    setInvoices(updatedInvoices);
    setSuppliers(updatedSuppliers);

    addLedgerEntry(
      'SUPPLIER_PAYMENT',
      `Оплата поставщику ${supplier.name}: $${amountUsd} (${note || 'Погашение долга FIFO'})`,
      undefined,
      amountUsd,
      resolvedStoreId
    );

    addAuditLog(
      'SUPPLIER_PAYMENT',
      `Проведена оплата поставщику ${supplier.name} на сумму $${amountUsd}. Распределено по FIFO: ${appliedAllocations.map(a => `${a.invoiceNumber} ($${a.allocatedAmountUsd})`).join(', ')}`,
      { financialDetails: { amountUsd } }
    );

    return { success: true };
  };

  const createSupplier = ({
    name,
    phone,
    contactPerson
  }: {
    name: string;
    phone?: string;
    contactPerson?: string;
  }) => {
    if (!name.trim()) return { success: false, message: 'Укажите название поставщика' };
    const newSupplier: Supplier = {
      id: `sup-${Date.now()}`,
      name: name.trim(),
      phone: phone?.trim() || undefined,
      contactPerson: contactPerson?.trim() || undefined,
      totalPurchasedUsd: 0,
      totalPaidUsd: 0,
      totalDebtUsd: 0,
      active: true
    };
    setSuppliers(prev => [...prev, newSupplier]);
    addAuditLog('SUPPLIER_CREATE', `Добавлен поставщик: ${newSupplier.name}`);
    return { success: true };
  };

  const createSupplierBonus = ({
    supplierId,
    campaignTitle,
    bonusType,
    amountUsd,
    freeDevices,
    destinationLocationId
  }: {
    supplierId: string;
    campaignTitle?: string;
    bonusType: 'FREE_DEVICES' | 'CASH_DISCOUNT';
    amountUsd?: number;
    freeDevices?: {
      brand: string;
      model: string;
      storage: string;
      color: string;
      imei: string;
      costBasisUsd: number;
    }[];
    destinationLocationId?: string;
  }) => {
    const supplier = suppliers.find(s => s.id === supplierId);
    const supplierName = supplier?.name || 'Поставщик';
    const targetLocation = destinationLocationId || 'main-warehouse';
    const locationObj = stores.find(s => s.id === targetLocation);
    const locationName = locationObj?.name || 'Главный склад';

    const bonusTitle = campaignTitle?.trim() || `Бонус от ${supplierName}`;

    const newBonus: SupplierBonus = {
      id: `bon-${Date.now()}`,
      supplierId,
      supplierName,
      campaignName: bonusTitle,
      campaignTitle: bonusTitle,
      bonusType,
      amountUsd,
      status: 'IN_STOCK',
      dateReceived: new Date().toISOString().split('T')[0],
      date: new Date().toISOString().split('T')[0],
      freeDevices,
      estimatedValueUsd: amountUsd || 0,
      brand: freeDevices?.[0]?.brand || '',
      model: freeDevices?.[0]?.model || '',
      storage: freeDevices?.[0]?.storage || '',
      color: freeDevices?.[0]?.color || '',
      imei: freeDevices?.[0]?.imei || '',
      deviceId: ''
    };

    if (bonusType === 'FREE_DEVICES' && freeDevices && freeDevices.length > 0) {
      const newDevs: Device[] = freeDevices.map(d => ({
        id: `dev-bonus-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        imei: d.imei,
        brand: d.brand,
        model: d.model,
        storage: d.storage,
        color: d.color,
        status: targetLocation === 'main-warehouse' ? 'MAIN_WAREHOUSE' : 'STORE_STOCK',
        locationId: targetLocation,
        locationName,
        supplierId,
        supplierName,
        purchaseCostUsd: 0,
        costBasisUsd: d.costBasisUsd || 0,
        isBonus: true,
        bonusCampaign: bonusTitle,
        createdAt: new Date().toISOString(),
        timeline: [
          {
            id: `t-${Date.now()}`,
            date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
            type: 'BONUS',
            description: `Получен бонус ($${d.costBasisUsd || 0})`,
            user: currentUser?.name || 'Администратор'
          }
        ]
      }));

      setDevices(prev => [...newDevs, ...prev]);
    }

    if (bonusType === 'CASH_DISCOUNT' && amountUsd && amountUsd > 0) {
      setOwners(prev => prev.map(o => {
        const share = o.profitSharePercent / 100;
        const profitPart = +(amountUsd * share).toFixed(2);
        return {
          ...o,
          totalAccruedProfitUsd: +(o.totalAccruedProfitUsd + profitPart).toFixed(2),
          availableProfitUsd: +(o.availableProfitUsd + profitPart).toFixed(2)
        };
      }));
    }

    setBonuses(prev => [newBonus, ...prev]);
    addAuditLog('SUPPLIER_BONUS', `Зафиксирован денежный бонус от ${supplierName}${amountUsd ? `: +$${amountUsd} (100% в чистую прибыль учредителей)` : ''}`);
    return { success: true };
  };

  // 8. EXPENSES
  const createExpense = ({
    category,
    amountTjs,
    targetType,
    storeId,
    sourceAccount,
    comment,
    description,
    paidFromCashRegister,
    employeeId,
    employeeName,
    isEmployeeAdvance
  }: {
    category: ExpenseCategory;
    amountTjs: number;
    targetType?: 'STORE' | 'BUSINESS';
    storeId?: string;
    sourceAccount?: string;
    comment?: string;
    description?: string;
    paidFromCashRegister?: boolean;
    employeeId?: string;
    employeeName?: string;
    isEmployeeAdvance?: boolean;
  }) => {
    if (!currentUser) return { success: false, message: 'Необходима авторизация' };
    const rate = todayRate?.rate || 9.50;
    const amountUsd = +(amountTjs / rate).toFixed(2);
    const storeObj = storeId ? stores.find(s => s.id === storeId) : undefined;
    const resolvedComment = comment || description || 'Расход';
    const resolvedSource = sourceAccount || (paidFromCashRegister ? (storeObj ? `Касса ${storeObj.name}` : 'Касса') : 'Счет компании');
    const resolvedTargetType = targetType || (storeId ? 'STORE' : 'BUSINESS');

    const targetEmployee = employeeId ? users.find(u => u.id === employeeId) : undefined;
    const resolvedEmployeeName = employeeName || targetEmployee?.name;
    const isAdvance = isEmployeeAdvance || category === 'EMPLOYEE_ADVANCE' || category === 'Аванс сотрудника';

    const newExpense: Expense = {
      id: `exp-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      category,
      amountTjs,
      exchangeRate: rate,
      amountUsd,
      targetType: resolvedTargetType,
      storeId,
      storeName: storeObj?.name,
      sourceAccount: resolvedSource,
      comment: resolvedComment,
      description: resolvedComment,
      createdByName: currentUser.name,
      paidFromCashRegister: paidFromCashRegister ?? true,
      employeeId: employeeId || undefined,
      employeeName: resolvedEmployeeName || undefined,
      isEmployeeAdvance: isAdvance
    };

    // Deduct from store cash if from store cash
    if (storeId && (paidFromCashRegister || resolvedSource.toLowerCase().includes('касса'))) {
      setStores(prev => prev.map(s => s.id === storeId ? { ...s, cashBalanceTjs: s.cashBalanceTjs - amountTjs } : s));
    }

    // Deduct from owner available profit (net profit reduces)
    setOwners(prev => prev.map(o => {
      const share = o.profitSharePercent / 100;
      const part = +(amountUsd * share).toFixed(2);
      return {
        ...o,
        totalAccruedProfitUsd: +(o.totalAccruedProfitUsd - part).toFixed(2),
        availableProfitUsd: +(o.availableProfitUsd - part).toFixed(2)
      };
    }));

    setExpenses(prev => [newExpense, ...prev]);

    addLedgerEntry(
      category === 'Зарплата' ? 'SALARY' : 'EXPENSE',
      `Расход (${category}): ${resolvedComment} (-${amountTjs} TJS / -$${amountUsd})`,
      -amountTjs,
      -amountUsd,
      storeId,
      newExpense.id
    );

    addAuditLog(
      'EXPENSE',
      `Зарегистрирован расход [${category}]: ${amountTjs} TJS ($${amountUsd}) (${storeObj?.name || 'Бизнес'}). Комментарий: ${resolvedComment}`,
      { financialDetails: { amountTjs, amountUsd, exchangeRate: rate }, targetId: newExpense.id }
    );

    return { success: true };
  };

  // 9. OWNER TRANSACTIONS
  const createOwnerTransaction = ({
    ownerId,
    type,
    amountUsd,
    note
  }: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST';
    amountUsd: number;
    note?: string;
  }) => {
    if (type === 'INVESTMENT') {
      return ownerInvestment(ownerId, amountUsd, 'Главный счет', note);
    } else if (type === 'WITHDRAWAL') {
      return ownerCapitalWithdrawal(ownerId, amountUsd, 'Главный счет', note);
    } else if (type === 'PROFIT_PAYOUT') {
      return ownerProfitPayout(ownerId, amountUsd, 'Главный счет', note);
    } else if (type === 'REINVEST') {
      return ownerReinvest(ownerId, amountUsd, note);
    }
    return { success: false, message: 'Неизвестный тип операции' };
  };

  const ownerInvestment = (ownerId: string, amountUsd: number, destination: string, note?: string) => {
    if (!currentUser || currentUser.role === 'SELLER') return { success: false, message: 'Нет прав' };
    const owner = owners.find(o => o.id === ownerId);
    if (!owner) return { success: false, message: 'Владелец не найден' };

    setOwners(prev => prev.map(o => o.id === ownerId ? { ...o, capitalBalanceUsd: o.capitalBalanceUsd + amountUsd } : o));

    const newTx: OwnerTransaction = {
      id: `ot-${Date.now()}`,
      ownerId,
      ownerName: owner.name,
      type: 'INVESTMENT',
      amountUsd,
      date: new Date().toISOString().split('T')[0],
      sourceOrDestination: destination,
      createdByName: currentUser.name,
      note
    };
    setOwnerTransactions(prev => [newTx, ...prev]);

    addLedgerEntry('OWNER_INVESTMENT', `Вложение капитала: ${owner.name} (+$${amountUsd}) → ${destination}`, undefined, amountUsd);
    addAuditLog('OWNER_INVESTMENT', `${owner.name} вложил $${amountUsd} в капитал (${destination})`, { financialDetails: { amountUsd } });

    return { success: true };
  };

  const ownerCapitalWithdrawal = (ownerId: string, amountUsd: number, source: string, note?: string) => {
    if (!currentUser || currentUser.role === 'SELLER') return { success: false, message: 'Нет прав' };
    const owner = owners.find(o => o.id === ownerId);
    if (!owner) return { success: false, message: 'Владелец не найден' };
    if (owner.capitalBalanceUsd < amountUsd) return { success: false, message: 'Сумма изъятия превышает текущий капитал' };

    setOwners(prev => prev.map(o => o.id === ownerId ? { ...o, capitalBalanceUsd: o.capitalBalanceUsd - amountUsd } : o));

    const newTx: OwnerTransaction = {
      id: `ot-${Date.now()}`,
      ownerId,
      ownerName: owner.name,
      type: 'WITHDRAWAL',
      amountUsd,
      date: new Date().toISOString().split('T')[0],
      sourceOrDestination: source,
      createdByName: currentUser.name,
      note
    };
    setOwnerTransactions(prev => [newTx, ...prev]);

    addLedgerEntry('OWNER_CAPITAL_WITHDRAWAL', `Изъятие капитала: ${owner.name} (-$${amountUsd}) из ${source}`, undefined, -amountUsd);
    addAuditLog('OWNER_WITHDRAWAL', `${owner.name} изъял $${amountUsd} из капитала`, { financialDetails: { amountUsd } });

    return { success: true };
  };

  const ownerProfitPayout = (ownerId: string, amountUsd: number, source: string, note?: string) => {
    if (!currentUser || currentUser.role === 'SELLER') return { success: false, message: 'Нет прав' };
    const owner = owners.find(o => o.id === ownerId);
    if (!owner) return { success: false, message: 'Владелец не найден' };
    if (owner.availableProfitUsd < amountUsd) return { success: false, message: 'Сумма выплаты превышает доступную прибыль' };

    setOwners(prev => prev.map(o => o.id === ownerId ? {
      ...o,
      totalPaidProfitUsd: o.totalPaidProfitUsd + amountUsd,
      availableProfitUsd: o.availableProfitUsd - amountUsd
    } : o));

    const newTx: OwnerTransaction = {
      id: `ot-${Date.now()}`,
      ownerId,
      ownerName: owner.name,
      type: 'PROFIT_PAYOUT',
      amountUsd,
      date: new Date().toISOString().split('T')[0],
      sourceOrDestination: source,
      createdByName: currentUser.name,
      note
    };
    setOwnerTransactions(prev => [newTx, ...prev]);

    addLedgerEntry('OWNER_PROFIT_PAYOUT', `Выплата прибыли: ${owner.name} ($${amountUsd}) из ${source}`, undefined, -amountUsd);
    addAuditLog('PROFIT_PAYOUT', `Выплачена прибыль ${owner.name}: $${amountUsd}`, { financialDetails: { amountUsd } });

    return { success: true };
  };

  const ownerReinvest = (ownerId: string, amountUsd: number, note?: string) => {
    if (!currentUser || currentUser.role === 'SELLER') return { success: false, message: 'Нет прав' };
    const owner = owners.find(o => o.id === ownerId);
    if (!owner) return { success: false, message: 'Владелец не найден' };
    if (owner.availableProfitUsd < amountUsd) return { success: false, message: 'Сумма реинвестирования превышает доступную прибыль' };

    setOwners(prev => prev.map(o => o.id === ownerId ? {
      ...o,
      availableProfitUsd: o.availableProfitUsd - amountUsd,
      totalReinvestedUsd: o.totalReinvestedUsd + amountUsd,
      capitalBalanceUsd: o.capitalBalanceUsd + amountUsd
    } : o));

    const newTx: OwnerTransaction = {
      id: `ot-${Date.now()}`,
      ownerId,
      ownerName: owner.name,
      type: 'REINVEST',
      amountUsd,
      date: new Date().toISOString().split('T')[0],
      sourceOrDestination: 'Оборот бизнеса',
      createdByName: currentUser.name,
      note
    };
    setOwnerTransactions(prev => [newTx, ...prev]);

    addLedgerEntry('OWNER_REINVESTMENT', `Реинвестирование прибыли: ${owner.name} ($${amountUsd} переведено в капитал)`);
    addAuditLog('REINVEST', `${owner.name} реинвестировал $${amountUsd} доступной прибыли в капитал`, { financialDetails: { amountUsd } });

    return { success: true };
  };

  const updateOwnerProfitShares = (owner1ShareOrShares: number | { ownerId: string; sharePercent: number }[], owner2Share?: number) => {
    if (Array.isArray(owner1ShareOrShares)) {
      const total = owner1ShareOrShares.reduce((acc, s) => acc + s.sharePercent, 0);
      if (Math.abs(total - 100) > 0.01) {
        return { success: false, message: `Сумма долей должна быть строго 100% (сейчас ${total}%)` };
      }
      setOwners(prev => prev.map(o => {
        const found = owner1ShareOrShares.find(s => s.ownerId === o.id);
        return found ? { ...o, profitSharePercent: found.sharePercent } : o;
      }));
      addAuditLog('PROFIT_SHARE_CHANGE', `Изменены доли партнеров: ${owner1ShareOrShares.map(s => `${s.sharePercent}%`).join(', ')}`);
      return { success: true };
    }

    const s1 = owner1ShareOrShares;
    const s2 = owner2Share ?? (100 - s1);
    if (s1 + s2 !== 100) {
      return { success: false, message: `Сумма долей должна быть строго 100% (сейчас ${s1 + s2}%)` };
    }
    setOwners(prev => [
      { ...prev[0], profitSharePercent: s1 },
      { ...prev[1], profitSharePercent: s2 }
    ]);
    addAuditLog('PROFIT_SHARE_CHANGE', `Изменены доли владельцев: ${owners[0]?.name} (${s1}%), ${owners[1]?.name} (${s2}%)`);
    return { success: true };
  };

  // 10. EMPLOYEES / USERS
  const createUser = (userData: Omit<User, 'id' | 'createdAt'>) => {
    if (users.some(u => u.login.toLowerCase() === userData.login.toLowerCase())) {
      return { success: false, message: 'Пользователь с таким логином уже существует' };
    }
    const storeObj = userData.storeId ? stores.find(s => s.id === userData.storeId) : undefined;
    const newUser: User = {
      ...userData,
      id: `user-${Date.now()}`,
      storeName: storeObj?.name,
      createdAt: new Date().toISOString()
    };
    setUsers(prev => [...prev, newUser]);
    addAuditLog('USER_CREATE', `Создан сотрудник: ${newUser.name} (${newUser.role}, ${newUser.storeName || 'Все магазины'})`);
    return { success: true };
  };

  const updateUser = (userData: User) => {
    const storeObj = userData.storeId ? stores.find(s => s.id === userData.storeId) : undefined;
    const updatedUser = { ...userData, storeName: storeObj?.name };

    setUsers(prev => {
      const nextUsers = prev.map(u => u.id === userData.id ? updatedUser : u);
      saveStorage(STORAGE_KEYS.USERS, nextUsers);
      return nextUsers;
    });

    // Sync active logged-in user state immediately
    if (currentUser?.id === userData.id || currentUser?.login === userData.login) {
      setCurrentUser(updatedUser);
      saveStorage(STORAGE_KEYS.USER, updatedUser);
      useAuthStore.getState().setAuth(updatedUser, useAuthStore.getState().token || 'mock-jwt-token-session');
    }

    // Sync corresponding Owner name if user is ADMIN or PARTNER
    setOwners(prev => {
      const nextOwners = prev.map(o => {
        if ((userData.id === 'user-admin' || userData.role === 'ADMIN') && o.id === 'owner-1') {
          return { ...o, name: userData.name };
        }
        if ((userData.id === 'user-partner' || userData.role === 'PARTNER') && o.id === 'owner-2') {
          return { ...o, name: userData.name };
        }
        return o;
      });
      saveStorage(STORAGE_KEYS.OWNERS, nextOwners);
      return nextOwners;
    });

    addAuditLog('USER_UPDATE', `Обновлены данные сотрудника: ${userData.name} (${userData.role})`);
    return { success: true };
  };

  const resetUserPassword = (userId: string, newPass: string) => {
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, passwordHash: newPass } : u));
    const user = users.find(u => u.id === userId);
    addAuditLog('PASSWORD_RESET', `Сброшен пароль сотрудника: ${user?.name}`);
    return { success: true };
  };

  const toggleUserActive = (userId: string) => {
    const target = users.find(u => u.id === userId);
    if (!target) return { success: false };
    const newActive = !target.active;
    setUsers(prev => prev.map(u => u.id === userId ? { ...u, active: newActive } : u));
    addAuditLog('USER_STATUS_CHANGE', `Сотрудник ${target.name} ${newActive ? 'активирован' : 'деактивирован'}`);
    return { success: true };
  };

  const deleteUser = (userId: string) => {
    if (currentUser?.id === userId) {
      return { success: false, message: 'Нельзя удалить собственный профиль во время активной сессии' };
    }
    const targetUser = users.find(u => u.id === userId);
    if (!targetUser) return { success: false, message: 'Сотрудник не найден' };

    const updated = users.filter(u => u.id !== userId);
    setUsers(updated);
    saveStorage(STORAGE_KEYS.USERS, updated);
    addAuditLog('USER_DELETE', `Удален сотрудник: ${targetUser.name} (${targetUser.role})`);
    return { success: true };
  };

  // 11. NOTIFICATIONS
  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true, isRead: true } : n));
  };

  const markNotificationAsRead = (id: string) => {
    markNotificationRead(id);
  };

  const markAllNotificationsAsRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true, isRead: true })));
  };

  const resolveNotification = (id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, resolved: true, read: true, isRead: true } : n));
  };

  const openDailyRateModal = () => {
    setIsRateModalOpen(true);
    useUIStore.getState().setDailyRateModalOpen(true);
  };

  const setTodayExchangeRate = (newRate: number) => {
    setDailyRate(newRate);
    return { success: true };
  };

  const createStore = (name: string, address?: string) => {
    if (!name.trim()) return { success: false, message: 'Укажите название магазина' };
    const newStore: Store = {
      id: `store-${Date.now()}`,
      name: name.trim(),
      address: address?.trim() || undefined,
      isMainWarehouse: false,
      cashBalanceTjs: 0,
      active: true
    };
    setStores(prev => [...prev, newStore]);
    addAuditLog('STORE_CREATE', `Создан новый магазин: ${newStore.name}`);
    return { success: true };
  };

  const updateStore = (storeId: string, name: string, address?: string) => {
    if (!name.trim()) return { success: false, message: 'Укажите название филиала' };
    setStores(prev => prev.map(s => s.id === storeId ? { ...s, name: name.trim(), address: address?.trim() || undefined } : s));
    addAuditLog('STORE_UPDATE', `Обновлены данные магазина: ${name}`);
    return { success: true };
  };

  const deleteStore = (storeId: string) => {
    const target = stores.find(s => s.id === storeId);
    if (!target) return { success: false, message: 'Магазин не найден' };
    if (target.isMainWarehouse || target.id === 'store-main') {
      return { success: false, message: 'Центральный (Главный) склад нельзя удалить. Он всегда остается в системе.' };
    }

    const mainStore = stores.find(s => s.isMainWarehouse || s.id === 'store-main') || stores[0];
    const mainStoreId = mainStore.id;
    const mainStoreName = mainStore.name;

    // Automatically transfer all devices from this deleted store to Main Warehouse
    setDevices(prev => prev.map(d => {
      if (d.locationId === storeId) {
        return {
          ...d,
          locationId: mainStoreId,
          locationName: mainStoreName,
          status: d.status === 'STORE_STOCK' ? 'MAIN_WAREHOUSE' : d.status,
          timeline: [
            ...d.timeline,
            {
              id: `t-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              date: new Date().toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }),
              type: 'TRANSFER',
              description: `Автоматический перенос на ${mainStoreName} при удалении филиала «${target.name}»`,
              user: currentUser?.name || 'Система',
              storeName: mainStoreName
            }
          ]
        };
      }
      return d;
    }));

    setStores(prev => prev.filter(s => s.id !== storeId));
    addAuditLog('STORE_DELETE', `Удален филиал: ${target.name}. Все товары филиала автоматически перенесены на ${mainStoreName}`);
    return { success: true };
  };

  const resetToDemo = () => {
    setCurrentUser(INITIAL_USERS[0]);
    setTodayRateState(INITIAL_RATE);
    setStores(INITIAL_STORES);
    setUsers(INITIAL_USERS);
    setSuppliers(INITIAL_SUPPLIERS);
    setInvoices(INITIAL_INVOICES);
    setDevices(INITIAL_DEVICES);
    setSales(INITIAL_SALES);
    setTransfers(INITIAL_TRANSFERS);
    setRepairs(INITIAL_REPAIRS);
    setBonuses(INITIAL_BONUSES);
    setExpenses(INITIAL_EXPENSES);
    setOwners(INITIAL_OWNERS);
    setOwnerTransactions(INITIAL_OWNER_TRANSACTIONS);
    setNotifications(INITIAL_NOTIFICATIONS);
    setAuditLogs(INITIAL_AUDIT_LOGS);
    setLedger(INITIAL_LEDGER);
    setActivePageState('SALE');
    setSelectedStoreIdState('all');
    localStorage.clear();
  };

  const resetAllCashBalances = () => {
    setStores(prev => {
      const updated = prev.map(s => ({ ...s, cashBalanceTjs: 0 }));
      saveStorage(STORAGE_KEYS.STORES, updated);
      return updated;
    });
    addAuditLog('CASH_REGISTER_RESET', 'Остатки наличных средств во всех кассах магазинов обнулены (0 TJS)');
  };

  const resetAllOwnerCapital = () => {
    setOwners(prev => {
      const updated = prev.map(o => ({
        ...o,
        capitalBalanceUsd: 0,
        totalAccruedProfitUsd: 0,
        totalPaidProfitUsd: 0,
        totalReinvestedUsd: 0,
        availableProfitUsd: 0
      }));
      saveStorage(STORAGE_KEYS.OWNERS, updated);
      return updated;
    });
    setOwnerTransactions([]);
    saveStorage(STORAGE_KEYS.OWNER_TXS, []);
    addAuditLog('OWNERS_CAPITAL_RESET', 'Капитал и история операций всех партнеров обнулены ($0 USD / 0 TJS)');
  };

  const closeQuarterPeriod = ({
    quarterName,
    transferRemainingToCapital
  }: {
    quarterName: string;
    transferRemainingToCapital: boolean;
  }) => {
    if (!currentUser || currentUser.role === 'SELLER') return { success: false, message: 'Нет прав' };

    setOwners(prev => {
      const updated = prev.map(o => {
        const remaining = o.availableProfitUsd || 0;
        const newCapital = transferRemainingToCapital ? o.capitalBalanceUsd + remaining : o.capitalBalanceUsd;
        return {
          ...o,
          capitalBalanceUsd: newCapital,
          totalAccruedProfitUsd: 0,
          totalPaidProfitUsd: 0,
          totalReinvestedUsd: transferRemainingToCapital ? o.totalReinvestedUsd + remaining : o.totalReinvestedUsd,
          availableProfitUsd: transferRemainingToCapital ? 0 : o.availableProfitUsd
        };
      });
      saveStorage(STORAGE_KEYS.OWNERS, updated);
      return updated;
    });

    addAuditLog(
      'QUARTER_CLOSE',
      `Закрыт квартальный период (${quarterName}): сформирован отчет${transferRemainingToCapital ? ', остаток зачислен в капитал' : ''}, обнулены начисления квартала`,
      {}
    );

    return { success: true };
  };

  const resetEntireSystemDataToZero = () => {
    localStorage.clear();
    setDevices([]);
    setSales([]);
    setInvoices([]);
    setSuppliers([]);
    setTransfers([]);
    setRepairs([]);
    setBonuses([]);
    setExpenses([]);
    setOwnerTransactions([]);
    setNotifications([]);
    setLedger([]);
    setStores(prev => {
      const updated = prev.map(s => ({ ...s, cashBalanceTjs: 0 }));
      saveStorage(STORAGE_KEYS.STORES, updated);
      return updated;
    });
    setOwners(prev => {
      const updated = prev.map(o => ({
        ...o,
        capitalBalanceUsd: 0,
        totalAccruedProfitUsd: 0,
        totalPaidProfitUsd: 0,
        totalReinvestedUsd: 0,
        availableProfitUsd: 0
      }));
      saveStorage(STORAGE_KEYS.OWNERS, updated);
      return updated;
    });
    setAuditLogs([
      {
        id: `aud-zero-${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: 'SYSTEM_ZERO_RESET',
        userName: currentUser?.name || 'Администратор',
        userRole: currentUser?.role || 'ADMIN',
        details: 'Абсолютно все данные приложения, остатки касс и стоимость бизнеса обнулены (0 TJS / $0.00 USD).'
      }
    ]);

    saveStorage(STORAGE_KEYS.DEVICES, []);
    saveStorage(STORAGE_KEYS.SALES, []);
    saveStorage(STORAGE_KEYS.INVOICES, []);
    saveStorage(STORAGE_KEYS.SUPPLIERS, []);
    saveStorage(STORAGE_KEYS.TRANSFERS, []);
    saveStorage(STORAGE_KEYS.REPAIRS, []);
    saveStorage(STORAGE_KEYS.BONUSES, []);
    saveStorage(STORAGE_KEYS.EXPENSES, []);
    saveStorage(STORAGE_KEYS.OWNER_TXS, []);
    saveStorage(STORAGE_KEYS.NOTIFICATIONS, []);
    saveStorage(STORAGE_KEYS.LEDGER, []);
  };

  const switchToRealDataMode = () => {
    resetEntireSystemDataToZero();
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        todayRate,
        activePage,
        selectedStoreId,
        stores,
        devices,
        sales,
        transfers,
        repairs,
        suppliers,
        invoices,
        supplierInvoices: invoices,
        bonuses,
        supplierBonuses: bonuses,
        expenses,
        owners,
        ownerTransactions,
        users,
        notifications,
        auditLogs,
        ledger,
        isRateModalOpen,
        isScannerOpen,
        scannerCallback,
        drawerOpen,
        login,
        logout,
        setDailyRate,
        openDailyRateModal,
        setTodayExchangeRate,
        setActivePage,
        setSelectedStoreId,
        setDrawerOpen,
        openScanner,
        closeScanner,
        createSale,
        processExchange,
        processRefund,
        createPurchase,
        createSupplier,
        createSupplierBonus,
        createTransferRequest,
        directTransfer,
        approveTransfer,
        approveTransferRequest: approveTransfer,
        rejectTransfer,
        rejectTransferRequest: rejectTransfer,
        createRepairTicket,
        updateRepairStatus,
        paySupplier,
        createExpense,
        createOwnerTransaction,
        ownerInvestment,
        ownerCapitalWithdrawal,
        ownerProfitPayout,
        ownerReinvest,
        updateOwnerProfitShares,
        createUser,
        updateUser,
        resetUserPassword,
        toggleUserActive,
        deleteUser,
        markNotificationRead,
        markNotificationAsRead,
        markAllNotificationsAsRead,
        resolveNotification,
        createStore,
        updateStore,
        deleteStore,
        resetToDemo,
        switchToRealDataMode,
        resetAllCashBalances,
        resetAllOwnerCapital,
        closeQuarterPeriod,
        resetEntireSystemDataToZero,
        theme,
        setTheme,
        toggleTheme
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within AppProvider');
  return context;
};
