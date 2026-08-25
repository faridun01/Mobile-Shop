import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import {
  User,
  Store,
  Device,
  DeviceStatus,
  Sale,
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
import { useUIStore } from '../stores/useUIStore';
import { apiClient } from '../api/client';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import {
  buildNameLookup,
  mapDevice,
  mapSale,
  mapTransfer,
  mapRepair,
  mapSupplier,
  mapSupplierInvoice,
  mapSupplierBonus,
  mapExpense,
  mapOwner,
  mapOwnerTransaction,
  mapUser,
  mapStore,
  mapNotification,
  mapAuditLog,
  mapLedgerEntry,
  mapDailyRate,
} from '../api/mappers';

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
  login: (login: string, pass: string) => Promise<{ success: boolean; message?: string }>;
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
  }) => Promise<{ success: boolean; receiptNumber?: number; message?: string }>;

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
  }) => Promise<{ success: boolean; message?: string }>;

  processRefund: (params: {
    saleId: string;
    reason: string;
    refundAmountTjs: number;
    penaltyFeeTjs?: number;
    paymentMethod: 'CASH' | 'CARD';
  }) => Promise<{ success: boolean; message?: string }>;

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
  }) => Promise<{ success: boolean; message?: string }>;

  createSupplier: (params: {
    name: string;
    phone?: string;
    contactPerson?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  updateSupplier: (id: string, data: { name?: string; phone?: string; contactPerson?: string }) => Promise<{ success: boolean; message?: string }>;
  deleteSupplier: (id: string) => Promise<{ success: boolean; message?: string }>;
  updateSupplierInvoice: (id: string, data: { invoiceNumber?: string; date?: string; totalAmountUsd?: number }) => Promise<{ success: boolean; message?: string }>;
  deleteSupplierInvoice: (id: string) => Promise<{ success: boolean; message?: string }>;

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
  }) => Promise<{ success: boolean; message?: string }>;

  createTransferRequest: (toLocationIdOrParams: string | { fromLocationId?: string; toLocationId: string; deviceIds: string[] }, deviceIds?: string[]) => Promise<{ success: boolean; message?: string }>;
  directTransfer: (fromLocationId: string, toLocationId: string, deviceIds: string[]) => Promise<{ success: boolean; message?: string }>;
  approveTransfer: (transferId: string) => Promise<{ success: boolean; message?: string }>;
  approveTransferRequest: (transferId: string) => Promise<{ success: boolean; message?: string }>;
  rejectTransfer: (transferId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
  rejectTransferRequest: (transferId: string, reason: string) => Promise<{ success: boolean; message?: string }>;

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
  }) => Promise<{ success: boolean; ticketNumber?: number; message?: string }>;

  updateRepairStatus: (ticketId: string, newStatus: RepairStatus, note?: string, costTjs?: number) => Promise<{ success: boolean; message?: string }>;

  paySupplier: (params: {
    supplierId: string;
    amountUsd: number;
    sourceAccount?: 'MAIN_ACCOUNT' | 'STORE_CASH' | string;
    sourceAccountId?: string;
    storeId?: string;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;

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
  }) => Promise<{ success: boolean; message?: string }>;

  createOwnerTransaction: (params: {
    ownerId: string;
    type: 'INVESTMENT' | 'WITHDRAWAL' | 'PROFIT_PAYOUT' | 'REINVEST';
    amountUsd: number;
    note?: string;
  }) => Promise<{ success: boolean; message?: string }>;

  ownerInvestment: (ownerId: string, amountUsd: number, destination: string, note?: string) => Promise<{ success: boolean; message?: string }>;
  ownerCapitalWithdrawal: (ownerId: string, amountUsd: number, source: string, note?: string) => Promise<{ success: boolean; message?: string }>;
  ownerProfitPayout: (ownerId: string, amountUsd: number, source: string, note?: string) => Promise<{ success: boolean; message?: string }>;
  ownerReinvest: (ownerId: string, amountUsd: number, note?: string) => Promise<{ success: boolean; message?: string }>;
  updateOwnerProfitShares: (owner1Share: number | { ownerId: string; sharePercent: number }[], owner2Share?: number) => Promise<{ success: boolean; message?: string }>;

  createUser: (user: Omit<User, 'id' | 'createdAt'>) => Promise<{ success: boolean; message?: string }>;
  updateUser: (user: User) => Promise<{ success: boolean; message?: string }>;
  resetUserPassword: (userId: string, newPass: string) => Promise<{ success: boolean; message?: string }>;
  toggleUserActive: (userId: string) => Promise<{ success: boolean; message?: string }>;
  deleteUser: (userId: string) => Promise<{ success: boolean; message?: string }>;

  markNotificationRead: (id: string) => void;
  markNotificationAsRead: (id: string) => void;
  markAllNotificationsAsRead: () => void;
  resolveNotification: (id: string) => void;
  openDailyRateModal: () => void;
  setTodayExchangeRate: (rate: number) => Promise<{ success: boolean; message?: string }>;
  createStore: (name: string, address?: string) => Promise<{ success: boolean; message?: string }>;
  updateStore: (storeId: string, name: string, address?: string) => Promise<{ success: boolean; message?: string }>;
  deleteStore: (storeId: string) => Promise<{ success: boolean; message?: string }>;
  resetToDemo: () => void;
  switchToRealDataMode: () => void;
  resetAllCashBalances: () => void;
  resetAllOwnerCapital: () => void;
  closeQuarterPeriod: (params: { quarterName: string; transferRemainingToCapital: boolean }) => Promise<{ success: boolean; message?: string }>;
  resetEntireSystemDataToZero: () => void;
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  toggleTheme: () => void;
}

const AppContext = createContext<AppContextType | null>(null);

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

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authUser = useAuthStore((s) => s.currentUser);
  const authToken = useAuthStore((s) => s.token);

  const [currentUser, setCurrentUserState] = useState<User | null>(authUser);
  const [todayRate, setTodayRateState] = useState<DailyRate | null>(null);
  const [activePage, setActivePageState] = useState<PageId>('SALE');
  const [selectedStoreId, setSelectedStoreIdState] = useState<string>(authUser?.role === 'SELLER' && authUser.storeId ? authUser.storeId : 'all');
  const [drawerOpen, setDrawerOpen] = useState(false);

  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [invoices, setInvoices] = useState<SupplierInvoice[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
  const [repairs, setRepairs] = useState<RepairTicket[]>([]);
  const [bonuses, setBonuses] = useState<SupplierBonus[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [owners, setOwners] = useState<Owner[]>([]);
  const [ownerTransactions, setOwnerTransactions] = useState<OwnerTransaction[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);

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

  const setTheme = (newTheme: ThemeMode) => setThemeState(newTheme);
  const toggleTheme = () => setThemeState((prev) => (prev === 'dark' ? 'light' : 'dark'));

  // Keep local currentUser mirrored to the auth store (source of truth for the session)
  useEffect(() => {
    setCurrentUserState(authUser);
  }, [authUser]);

  const checkRatePrompt = useCallback((rate: DailyRate | null) => {
    const todayStr = new Date().toISOString().split('T')[0];
    if (!rate || rate.date !== todayStr) {
      setIsRateModalOpen(true);
    }
  }, []);

  // ---- Data fetching: the API/Postgres is the single source of truth ----
  const namesRef = useRef(buildNameLookup([]));
  const storeNamesRef = useRef(buildNameLookup([]));
  const ownerNamesRef = useRef(new Map<string, string>());

  const fetchUsers = useCallback(async () => {
    const raw = await apiClient<any[]>('/users');
    namesRef.current = buildNameLookup(raw);
    setUsers(raw.map((u) => mapUser(u, storeNamesRef.current)));
  }, []);

  const fetchStores = useCallback(async () => {
    const raw = await apiClient<any[]>('/stores');
    storeNamesRef.current = new Map(raw.map((s) => [s.id, s.name]));
    setStores(raw.map(mapStore));
  }, []);

  const fetchDevices = useCallback(async () => {
    const raw = await apiClient<any[]>('/devices');
    setDevices(raw.map(mapDevice));
  }, []);

  const fetchSales = useCallback(async () => {
    const raw = await apiClient<any[]>('/sales');
    setSales(raw.map((s) => mapSale(s, namesRef.current)));
  }, []);

  const fetchTransfers = useCallback(async () => {
    const raw = await apiClient<any[]>('/transfers');
    setTransfers(raw.map((t) => mapTransfer(t, namesRef.current)));
  }, []);

  const fetchRepairs = useCallback(async () => {
    const raw = await apiClient<any[]>('/repairs');
    setRepairs(raw.map((r) => mapRepair(r, namesRef.current)));
  }, []);

  const fetchSuppliers = useCallback(async () => {
    const raw = await apiClient<any[]>('/suppliers');
    setSuppliers(raw.map(mapSupplier));
  }, []);

  const fetchInvoices = useCallback(async () => {
    const raw = await apiClient<any[]>('/supplier-invoices');
    setInvoices(raw.map(mapSupplierInvoice).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
  }, []);

  const fetchBonuses = useCallback(async () => {
    const raw = await apiClient<any[]>('/supplier-bonuses');
    setBonuses(raw.map(mapSupplierBonus));
  }, []);

  const fetchExpenses = useCallback(async () => {
    const raw = await apiClient<any[]>('/expenses');
    setExpenses(raw.map((e) => mapExpense(e, namesRef.current)));
  }, []);

  const fetchOwners = useCallback(async () => {
    try {
      const raw = await apiClient<any[]>('/owners');
      ownerNamesRef.current = new Map(raw.map((o) => [o.id, o.name]));
      setOwners(raw.map(mapOwner));
    } catch {
      // SELLER role is forbidden from this endpoint — leave owners empty, not an error.
    }
  }, []);

  const fetchOwnerTransactions = useCallback(async () => {
    try {
      const raw = await apiClient<any[]>('/owner-transactions');
      setOwnerTransactions(raw.map((t) => mapOwnerTransaction(t, ownerNamesRef.current, namesRef.current)));
    } catch {
      // ADMIN/PARTNER only
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    const raw = await apiClient<any[]>('/notifications');
    setNotifications(raw.map(mapNotification));
  }, []);

  const fetchAuditLogs = useCallback(async () => {
    try {
      const raw = await apiClient<any[]>('/audit-logs');
      setAuditLogs(raw.map(mapAuditLog));
    } catch {
      // ADMIN only
    }
  }, []);

  const fetchExchangeRate = useCallback(async () => {
    const raw = await apiClient<any>('/exchange-rate/today');
    const mapped = mapDailyRate(raw);
    setTodayRateState(mapped);
    return mapped;
  }, []);

  const refetchAll = useCallback(async () => {
    // Users/stores first: everything else resolves display names/store labels from them.
    await Promise.all([fetchUsers(), fetchStores()]);
    await Promise.all([
      fetchDevices(),
      fetchSales(),
      fetchTransfers(),
      fetchRepairs(),
      fetchSuppliers(),
      fetchInvoices(),
      fetchBonuses(),
      fetchExpenses(),
      fetchOwners(),
      fetchOwnerTransactions(),
      fetchNotifications(),
      fetchAuditLogs(),
      fetchExchangeRate(),
    ]);
  }, [fetchUsers, fetchStores, fetchDevices, fetchSales, fetchTransfers, fetchRepairs, fetchSuppliers, fetchInvoices, fetchBonuses, fetchExpenses, fetchOwners, fetchOwnerTransactions, fetchNotifications, fetchAuditLogs, fetchExchangeRate]);

  // Load everything once a session exists (fresh login, or a restored session on page reload)
  useEffect(() => {
    if (!authToken || !authUser) return;
    refetchAll()
      .then(() => fetchExchangeRate())
      .then((rate) => checkRatePrompt(rate))
      .catch((e) => console.error('Initial data load failed', e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authToken, authUser?.id]);

  // Realtime: any broadcast from another terminal simply triggers a full resync.
  // Simpler and safer than fine-grained cache invalidation, and the dataset is small
  // enough for a shop POS that this is cheap.
  useRealtimeSync(authToken, () => {
    refetchAll().catch((e) => console.error('Realtime resync failed', e));
  });

  const login = async (loginStr: string, passStr: string) => {
    try {
      const result = await apiClient<{ token: string; user: any }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ login: loginStr.trim(), password: passStr }),
      });
      const mappedUser: User = { ...result.user, storeName: undefined };
      useAuthStore.getState().setAuth(mappedUser, result.token);
      setCurrentUserState(mappedUser);
      if (mappedUser.role === 'SELLER' && mappedUser.storeId) {
        setSelectedStoreIdState(mappedUser.storeId);
      } else {
        setSelectedStoreIdState('all');
      }
      setActivePageState('SALE');
      await refetchAll();
      const freshRate = await fetchExchangeRate();
      checkRatePrompt(freshRate);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Неверный логин или пароль') };
    }
  };

  const logout = () => {
    apiClient('/auth/logout', { method: 'POST' }).catch(() => {});
    useAuthStore.getState().logout();
    setCurrentUserState(null);
  };

  const setDailyRate = (rate: number) => {
    apiClient('/exchange-rate/today', { method: 'POST', body: JSON.stringify({ rate }) })
      .then(() => {
        setIsRateModalOpen(false);
        useUIStore.getState().setDailyRateModalOpen(false);
        return fetchExchangeRate();
      })
      .catch((e) => console.error('Failed to set exchange rate', e));
  };

  const setActivePage = (page: PageId, _navTargetId?: string) => {
    setActivePageState(page);
    setDrawerOpen(false);
  };

  const setSelectedStoreId = (storeId: string) => {
    if (currentUser?.role === 'SELLER') return;
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

  // ---- Business operations: call the API, then resync from it ----

  const createSale: AppContextType['createSale'] = async ({ items, paymentMethod, cashAmountTjs, cardAmountTjs, customerName }) => {
    const storeId = currentUser?.role === 'SELLER' ? currentUser.storeId : (selectedStoreId !== 'all' ? selectedStoreId : items[0]?.device.locationId);
    if (!storeId) return { success: false, message: 'Не удалось определить магазин для продажи' };

    try {
      const sale = await apiClient<any>('/sales', {
        method: 'POST',
        body: JSON.stringify({
          storeId,
          items: items.map((i) => ({ deviceId: i.device.id, salePriceTjs: i.salePriceTjs })),
          paymentMethod,
          cashAmountTjs,
          cardAmountTjs,
          customerName: customerName?.trim() || undefined,
        }),
      });
      await refetchAll();
      return { success: true, receiptNumber: sale.receiptNumber };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить продажу') };
    }
  };

  const processExchange: AppContextType['processExchange'] = async (params) => {
    const returnedImeiStr = (params.returnedImei || params.returnedItem?.imei || '').trim();
    const exchangeInValueTjs = params.exchangeInValueTjs ?? params.returnedItem?.exchangeInValueTjs ?? 0;

    let targetReceiptNum: number | undefined;
    if (typeof params.originalSaleReceiptNumber === 'number') {
      targetReceiptNum = params.originalSaleReceiptNumber;
    } else if (typeof params.originalSaleReceiptNumber === 'string') {
      targetReceiptNum = parseInt(params.originalSaleReceiptNumber.replace('#', ''), 10);
    } else if (params.originalSaleId) {
      targetReceiptNum = parseInt(params.originalSaleId.replace('#', ''), 10);
    }

    let targetSale = sales.find((s) =>
      (targetReceiptNum && !isNaN(targetReceiptNum) && s.receiptNumber === targetReceiptNum) ||
      s.id === params.originalSaleId ||
      s.receiptNumber.toString() === params.originalSaleId?.toString().replace('#', '')
    );
    if (!targetSale && returnedImeiStr) {
      targetSale = sales.find((s) => s.items.some((i) => i.imei === returnedImeiStr));
    }
    if (!targetSale) {
      return { success: false, message: `Продажа с указанным чеком/IMEI не найдена` };
    }

    const returnedItem = params.returnedItem;
    try {
      const sale = await apiClient<any>('/exchanges', {
        method: 'POST',
        body: JSON.stringify({
          saleId: targetSale.id,
          returnedImei: returnedImeiStr,
          returnedBrand: returnedItem?.brand ?? 'Apple',
          returnedModel: returnedItem?.model ?? 'iPhone',
          returnedStorage: returnedItem?.storage,
          returnedColor: returnedItem?.color,
          exchangeInValueTjs,
          replacementDeviceId: params.replacementDeviceId,
          newPriceTjs: params.newPriceTjs,
          differenceTjs: params.differenceTjs,
          paymentMethod: params.paymentMethod,
          cashAmountTjs: params.cashAmountTjs,
          cardAmountTjs: params.cardAmountTjs,
        }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить обмен') };
    }
  };

  const processRefund: AppContextType['processRefund'] = async ({ saleId, reason, refundAmountTjs, penaltyFeeTjs, paymentMethod }) => {
    try {
      await apiClient(`/sales/${saleId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason, refundAmountTjs, penaltyFeeTjs, paymentMethod }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить возврат') };
    }
  };

  const createPurchase: AppContextType['createPurchase'] = async ({ supplierId, invoiceNumber, date, isStorePurchase, storeId, groups }) => {
    const destStoreId = isStorePurchase && storeId ? storeId : 'main-warehouse';
    try {
      await apiClient('/purchases', {
        method: 'POST',
        body: JSON.stringify({ supplierId, invoiceNumber, date, isStorePurchase, storeId: destStoreId, groups }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось создать приход') };
    }
  };

  const createSupplier: AppContextType['createSupplier'] = async ({ name, phone, contactPerson }) => {
    try {
      await apiClient('/suppliers', { method: 'POST', body: JSON.stringify({ name, phone, contactPerson }) });
      await fetchSuppliers();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось добавить поставщика') };
    }
  };

  const updateSupplier: AppContextType['updateSupplier'] = async (id, data) => {
    try {
      await apiClient(`/suppliers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить поставщика') };
    }
  };

  const deleteSupplier: AppContextType['deleteSupplier'] = async (id) => {
    try {
      await apiClient(`/suppliers/${id}`, { method: 'DELETE' });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить поставщика') };
    }
  };

  const updateSupplierInvoice: AppContextType['updateSupplierInvoice'] = async (id, data) => {
    try {
      await apiClient(`/supplier-invoices/${id}`, { method: 'PUT', body: JSON.stringify(data) });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить накладную') };
    }
  };

  const deleteSupplierInvoice: AppContextType['deleteSupplierInvoice'] = async (id) => {
    try {
      await apiClient(`/supplier-invoices/${id}`, { method: 'DELETE' });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить накладную') };
    }
  };

  const createSupplierBonus: AppContextType['createSupplierBonus'] = async ({ supplierId, campaignTitle, bonusType, amountUsd, freeDevices, destinationLocationId }) => {
    try {
      await apiClient('/supplier-bonuses', {
        method: 'POST',
        body: JSON.stringify({ supplierId, campaignTitle, bonusType, amountUsd, freeDevices, destinationStoreId: destinationLocationId }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось зарегистрировать бонус') };
    }
  };

  const createTransferRequest: AppContextType['createTransferRequest'] = async (toLocationIdOrParams, deviceIdsParam) => {
    let fromLocId = currentUser?.storeId || 'main-warehouse';
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

    try {
      await apiClient('/transfers', {
        method: 'POST',
        body: JSON.stringify({ fromStoreId: fromLocId, toStoreId: toLocationId, deviceIds }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось создать перемещение') };
    }
  };

  const directTransfer: AppContextType['directTransfer'] = async (fromLocationId, toLocationId, deviceIds) => {
    try {
      await apiClient('/transfers/direct', {
        method: 'POST',
        body: JSON.stringify({ fromStoreId: fromLocationId, toStoreId: toLocationId, deviceIds }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить перемещение') };
    }
  };

  const approveTransfer: AppContextType['approveTransfer'] = async (transferId) => {
    try {
      await apiClient(`/transfers/${transferId}/approve`, { method: 'POST' });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось подтвердить перемещение') };
    }
  };

  const rejectTransfer: AppContextType['rejectTransfer'] = async (transferId, reason) => {
    try {
      await apiClient(`/transfers/${transferId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось отклонить перемещение') };
    }
  };

  const createRepairTicket: AppContextType['createRepairTicket'] = async (data) => {
    const storeId = currentUser?.storeId || stores.find((s) => !s.isMainWarehouse)?.id || stores[0]?.id;
    if (!storeId) return { success: false, message: 'Не удалось определить магазин' };

    try {
      const ticket = await apiClient<any>('/repairs', {
        method: 'POST',
        body: JSON.stringify({ ...data, storeId }),
      });
      await refetchAll();
      return { success: true, ticketNumber: ticket.ticketNumber };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось оформить ремонт') };
    }
  };

  const updateRepairStatus: AppContextType['updateRepairStatus'] = async (ticketId, newStatus, note, costTjs) => {
    try {
      await apiClient(`/repairs/${ticketId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: newStatus, note, finalCostTjs: costTjs }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить статус ремонта') };
    }
  };

  const paySupplier: AppContextType['paySupplier'] = async ({ supplierId, amountUsd, storeId, sourceAccountId, note }) => {
    const resolvedStoreId = storeId || (sourceAccountId && sourceAccountId !== 'owner-funds' ? sourceAccountId : undefined);
    try {
      await apiClient(`/suppliers/${supplierId}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amountUsd,
          sourceAccount: resolvedStoreId ? 'STORE_CASH' : 'MAIN_ACCOUNT',
          storeId: resolvedStoreId,
          note,
        }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось провести оплату поставщику') };
    }
  };

  const createExpense: AppContextType['createExpense'] = async ({ category, amountTjs, targetType, storeId, sourceAccount, comment, description, paidFromCashRegister, employeeId, isEmployeeAdvance }) => {
    try {
      await apiClient('/expenses', {
        method: 'POST',
        body: JSON.stringify({ category, amountTjs, targetType, storeId, sourceAccount, comment, description, paidFromCashRegister, employeeId, isEmployeeAdvance }),
      });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось зарегистрировать расход') };
    }
  };

  const ownerInvestment: AppContextType['ownerInvestment'] = async (ownerId, amountUsd, destination, note) => {
    try {
      await apiClient(`/owners/${ownerId}/investment`, { method: 'POST', body: JSON.stringify({ amountUsd, destination, note }) });
      await Promise.all([fetchOwners(), fetchOwnerTransactions()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Нет прав') };
    }
  };

  const ownerCapitalWithdrawal: AppContextType['ownerCapitalWithdrawal'] = async (ownerId, amountUsd, source, note) => {
    try {
      await apiClient(`/owners/${ownerId}/withdrawal`, { method: 'POST', body: JSON.stringify({ amountUsd, source, note }) });
      await Promise.all([fetchOwners(), fetchOwnerTransactions()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма изъятия превышает текущий капитал') };
    }
  };

  const ownerProfitPayout: AppContextType['ownerProfitPayout'] = async (ownerId, amountUsd, source, note) => {
    try {
      await apiClient(`/owners/${ownerId}/payout`, { method: 'POST', body: JSON.stringify({ amountUsd, source, note }) });
      await Promise.all([fetchOwners(), fetchOwnerTransactions()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма выплаты превышает доступную прибыль') };
    }
  };

  const ownerReinvest: AppContextType['ownerReinvest'] = async (ownerId, amountUsd, note) => {
    try {
      await apiClient(`/owners/${ownerId}/reinvest`, { method: 'POST', body: JSON.stringify({ amountUsd, note }) });
      await Promise.all([fetchOwners(), fetchOwnerTransactions()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма реинвестирования превышает доступную прибыль') };
    }
  };

  const createOwnerTransaction: AppContextType['createOwnerTransaction'] = async ({ ownerId, type, amountUsd, note }) => {
    if (type === 'INVESTMENT') return ownerInvestment(ownerId, amountUsd, 'Главный счет', note);
    if (type === 'WITHDRAWAL') return ownerCapitalWithdrawal(ownerId, amountUsd, 'Главный счет', note);
    if (type === 'PROFIT_PAYOUT') return ownerProfitPayout(ownerId, amountUsd, 'Главный счет', note);
    if (type === 'REINVEST') return ownerReinvest(ownerId, amountUsd, note);
    return { success: false, message: 'Неизвестный тип операции' };
  };

  const updateOwnerProfitShares: AppContextType['updateOwnerProfitShares'] = async (owner1ShareOrShares, owner2Share) => {
    const shares = Array.isArray(owner1ShareOrShares)
      ? owner1ShareOrShares
      : [
          { ownerId: owners[0]?.id, sharePercent: owner1ShareOrShares },
          { ownerId: owners[1]?.id, sharePercent: owner2Share ?? 100 - owner1ShareOrShares },
        ];
    try {
      await apiClient('/owners/profit-shares', { method: 'POST', body: JSON.stringify({ shares }) });
      await fetchOwners();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Сумма долей должна равняться 100%') };
    }
  };

  const createUser: AppContextType['createUser'] = async (userData) => {
    try {
      await apiClient('/users', {
        method: 'POST',
        body: JSON.stringify({
          login: userData.login,
          password: userData.passwordHash || userData.pin,
          name: userData.name,
          role: userData.role,
          storeId: userData.storeId,
          baseSalaryTjs: userData.baseSalaryTjs,
          salesCommissionPercent: userData.salesCommissionPercent,
        }),
      });
      await fetchUsers();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Пользователь с таким логином уже существует') };
    }
  };

  const updateUser: AppContextType['updateUser'] = async (userData) => {
    try {
      const updated = await apiClient<any>(`/users/${userData.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: userData.name,
          role: userData.role,
          storeId: userData.storeId ?? null,
          baseSalaryTjs: userData.baseSalaryTjs,
          salesCommissionPercent: userData.salesCommissionPercent,
        }),
      });
      await fetchUsers();
      if (currentUser?.id === userData.id) {
        const mapped = mapUser(updated, storeNamesRef.current);
        useAuthStore.getState().setAuth(mapped, authToken || '');
      }
      await fetchOwners();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось обновить данные сотрудника') };
    }
  };

  const resetUserPassword: AppContextType['resetUserPassword'] = async (userId, newPass) => {
    try {
      await apiClient(`/users/${userId}/reset-password`, { method: 'POST', body: JSON.stringify({ newPassword: newPass }) });
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось сбросить пароль') };
    }
  };

  const toggleUserActive: AppContextType['toggleUserActive'] = async (userId) => {
    const target = users.find((u) => u.id === userId);
    if (!target) return { success: false };
    try {
      await apiClient(`/users/${userId}/status`, { method: 'PATCH', body: JSON.stringify({ active: !target.active }) });
      await fetchUsers();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось изменить статус сотрудника') };
    }
  };

  const deleteUser: AppContextType['deleteUser'] = async (userId) => {
    try {
      await apiClient(`/users/${userId}`, { method: 'DELETE' });
      await fetchUsers();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить сотрудника (возможно, у него есть история операций)') };
    }
  };

  const markNotificationRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true, isRead: true } : n)));
    apiClient(`/notifications/${id}/read`, { method: 'PATCH' }).catch((e) => console.error(e));
  };
  const markNotificationAsRead = (id: string) => markNotificationRead(id);
  const markAllNotificationsAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true, isRead: true })));
    apiClient('/notifications/read-all', { method: 'POST' }).catch((e) => console.error(e));
  };
  const resolveNotification = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, resolved: true, read: true, isRead: true } : n)));
    apiClient(`/notifications/${id}/resolve`, { method: 'PATCH' }).catch((e) => console.error(e));
  };

  const openDailyRateModal = () => {
    setIsRateModalOpen(true);
    useUIStore.getState().setDailyRateModalOpen(true);
  };

  const setTodayExchangeRate: AppContextType['setTodayExchangeRate'] = async (rate) => {
    try {
      await apiClient('/exchange-rate/today', { method: 'POST', body: JSON.stringify({ rate }) });
      setIsRateModalOpen(false);
      useUIStore.getState().setDailyRateModalOpen(false);
      await fetchExchangeRate();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось установить курс') };
    }
  };

  const createStore: AppContextType['createStore'] = async (name, address) => {
    try {
      await apiClient('/stores', { method: 'POST', body: JSON.stringify({ name, address }) });
      await fetchStores();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Укажите название магазина') };
    }
  };

  const updateStore: AppContextType['updateStore'] = async (storeId, name, address) => {
    try {
      await apiClient(`/stores/${storeId}`, { method: 'PATCH', body: JSON.stringify({ name, address }) });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Укажите название филиала') };
    }
  };

  const deleteStore: AppContextType['deleteStore'] = async (storeId) => {
    try {
      await apiClient(`/stores/${storeId}`, { method: 'DELETE' });
      await refetchAll();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось удалить магазин') };
    }
  };

  const closeQuarterPeriod: AppContextType['closeQuarterPeriod'] = async ({ quarterName, transferRemainingToCapital }) => {
    try {
      await apiClient('/owners/quarter-close', { method: 'POST', body: JSON.stringify({ quarterName, transferRemainingToCapital }) });
      await fetchOwners();
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Нет прав') };
    }
  };

  const resetAllOwnerCapital = () => {
    apiClient('/owners/reset-capital', { method: 'POST' })
      .then(() => Promise.all([fetchOwners(), fetchOwnerTransactions()]))
      .catch((e) => console.error('Failed to reset owner capital', e));
  };

  const resetAllCashBalances = () => {
    apiClient('/stores/reset-cash', { method: 'POST' })
      .then(() => fetchStores())
      .catch((e) => console.error('Failed to reset cash balances', e));
  };

  // The app is always backed by real PostgreSQL now — these demo/local-only reset
  // helpers from the pre-migration mock no longer have a meaningful, safe server
  // equivalent (a full destructive wipe of production data isn't something a UI
  // button should trigger silently). They resync from the real data instead.
  const resetToDemo = () => {
    console.warn('resetToDemo: приложение работает на реальной базе данных, демо-данные недоступны.');
    refetchAll().catch((e) => console.error(e));
  };
  const switchToRealDataMode = () => {
    refetchAll().catch((e) => console.error(e));
  };
  const resetEntireSystemDataToZero = () => {
    console.warn('Полный сброс данных недоступен в реальном режиме — обратитесь к администратору базы данных.');
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
        updateSupplier,
        deleteSupplier,
        updateSupplierInvoice,
        deleteSupplierInvoice,
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
