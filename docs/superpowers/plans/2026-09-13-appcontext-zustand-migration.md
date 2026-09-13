# AppContext → Zustand Incremental Migration (Devices, Transfers, Sales) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate app-wide re-renders caused by `src/context/AppContext.tsx`'s single monolithic context (~40 state slices, ~26 `useApp()` consumers) by moving the Devices, Transfers, and Sales domains out into their own Zustand stores, one domain at a time, with zero change to business logic, API calls, WebSocket behavior, or UI behavior.

**Architecture:** For each domain, in order **Devices → Transfers → Sales**: (1) create a new Zustand store that reproduces that domain's state + fetch/mutation logic verbatim, (2) repoint `AppContext`'s own internal call sites (refetch orchestration, realtime event routing, cross-domain business functions) at the new store while still exposing the field through `AppContext`'s existing public shape so no consumer breaks, (3) migrate that domain's `useApp()` consumers to read directly from the new store via selectors, (4) once zero consumers remain, delete the field from `AppContextType`/`contextValue` — this last step is what actually removes it from `contextValue`'s `useMemo` dependency array and stops it from re-rendering unrelated pages. The domain order is chosen by dependency direction, not by request order: Devices has no outgoing cross-domain calls (safest to extract first), Transfers only needs Devices once that's done, and Sales needs a small one-off bridge for the two domains (Stores, Owners) that stay in `AppContext` for now.

**Tech Stack:** React 19, Zustand 5 (already used for `useAuthStore`/`useUIStore`), TypeScript 5.8, Vite 6.

**Spec:** No separate spec document — this plan implements the user's in-conversation request (2026-09-13) to refactor `AppContext.tsx`'s re-render problem, reproduced verbatim in Global Constraints below.

## Global Constraints

- Refactor incrementally, not as a big-bang rewrite.
- Use Zustand (already used elsewhere in this project) for the new stores.
- Move state domain-by-domain: Devices, then Transfers, then Sales (reordered from the user's Sales/Devices/Transfers phrasing for dependency-safety reasons — see Architecture above).
- Components must subscribe only to the exact Zustand state/actions they need (per-field selectors, never the whole store object).
- Do not subscribe components to the entire store.
- Remove a domain's fields from `AppContext` only after every one of its consumers has been migrated.
- Preserve all existing API calls, WebSocket behavior, business logic, permissions, calculations, validation, and UI behavior exactly.
- Do not change functionality.
- Do not blindly add `useMemo`, `useCallback`, or `React.memo`.
- Verify TypeScript/build after every migrated domain.
- There is no automated frontend test harness for this state layer (`npm test` covers only `src/hooks/useRealtimeSync.test.ts` and `src/utils/exportReports.test.ts`; `npm run test:e2e` hits the Express API directly, never the React state layer). Verification for every task is `npm run lint` (tsc --noEmit) + `npm run build`, plus a manual browser smoke-test of the specific flow touched — call this out explicitly, don't claim automated coverage that doesn't exist.

---

## File Structure

- `src/stores/useDevicesStore.ts` — **create** (Phase 1). Owns `devices`, `fetchDevices`, `findDeviceByImei`, `findDevicesByInvoice`.
- `src/stores/useTransfersStore.ts` — **create** (Phase 2). Owns `transfers`, `fetchTransfers`, `createTransferRequest`, `approveTransfer`, `rejectTransfer`.
- `src/context/nameLookup.ts` — **create** (Phase 2). Promotes `AppContext`'s local `namesRef` (a `useRef` holding a user-id→name lookup) to a shared module-level box, so stores outside `AppContext` can read the same lookup `mapTransfer`/`mapSale` need. It was always read imperatively, never subscribed to — moving it out of a `useRef` changes nothing observable.
- `src/context/legacyFetchBridge.ts` — **create** (Phase 3). A small, explicitly temporary object that `AppContext` populates with its still-un-migrated `fetchStores`/`fetchOwners` functions, so `useSalesStore`'s mutations can refresh Stores/Owners after a sale exactly as before. Delete this file once Stores/Owners get their own stores (out of scope here).
- `src/stores/useSalesStore.ts` — **create** (Phase 3). Owns `sales`, `fetchSales`, `fetchSalesRange`, `createSale`, `processExchange`, `processRefund`.
- `src/context/AppContext.tsx` — **modify** in every phase: internal call sites repointed at the new stores, then the migrated fields deleted from `AppContextType`/`contextValue` at the end of each phase.
- Consumer components — **modify**, once per phase, only for the fields that phase migrates:
  - Devices: `InventoryPage.tsx`, `SalePage.tsx`, `ExchangePage.tsx`, `PurchasePage.tsx`, `BonusesPage.tsx`, `TransferPage.tsx`, `RepairPage.tsx`, `SuppliersPage.tsx`
  - Transfers: `TransferPage.tsx`
  - Sales: `SalePage.tsx`, `SalesHistoryPage.tsx`, `ExchangePage.tsx`, `EmployeesPage.tsx`, `RepairPage.tsx`

  Note: `TransferPage.tsx`, `ExchangePage.tsx`, `RepairPage.tsx`, and `SalePage.tsx` each get touched in **more than one phase** — that's expected, not a mistake. Each touch only edits the fields that specific phase's domain owns.

---

## Phase 1 — Devices

### Task 1: Create `useDevicesStore.ts`

**Files:**
- Create: `src/stores/useDevicesStore.ts`

**Interfaces:**
- Produces: `useDevicesStore` — a Zustand hook/store with state `devices: Device[]` and actions `fetchDevices(): Promise<void>`, `findDeviceByImei(imei: string): Promise<Device[]>`, `findDevicesByInvoice(invoiceId: string): Promise<Device[]>`.

- [ ] **Step 1: Write the store, reproducing `AppContext.tsx`'s current devices logic verbatim (lines 330, 413-438)**

```typescript
import { create } from 'zustand';
import { Device } from '../types';
import { apiClient } from '../api/client';
import { mapDevice } from '../api/mappers';

interface DevicesState {
  devices: Device[];
  // `devices` excludes SOLD units by default (see fetchDevices) — a device once sold never
  // leaves the table, so it's the one status that grows unbounded over the shop's lifetime.
  // This reaches a specific SOLD device by exact IMEI and merges it in, for the rare lookup
  // (repair intake, inventory scan) that needs sale history the in-stock list doesn't carry.
  findDeviceByImei: (imei: string) => Promise<Device[]>;
  // Every device (any status, including SOLD) from one purchase invoice — for the
  // invoice-detail "which units were sold" view, which the SOLD-excluded default misses.
  findDevicesByInvoice: (invoiceId: string) => Promise<Device[]>;
  // excludeSold: a SOLD device never leaves the table, so it's the one status that would
  // otherwise grow this fetch unbounded over the shop's lifetime — everything else (in
  // stock, in transfer, in repair) is capped by real physical inventory. Old sold devices
  // are still reachable on demand via findDeviceByImei.
  fetchDevices: () => Promise<void>;
}

function mergeDevicesById(prev: Device[], mapped: Device[]): Device[] {
  const byId = new Map(prev.map((d) => [d.id, d]));
  for (const d of mapped) byId.set(d.id, d);
  return Array.from(byId.values());
}

export const useDevicesStore = create<DevicesState>((set, get) => ({
  devices: [],

  fetchDevices: async () => {
    const raw = await apiClient<any[]>('/devices?excludeSold=true');
    set({ devices: raw.map(mapDevice) });
  },

  findDeviceByImei: async (imei) => {
    const raw = await apiClient<any[]>(`/devices?search=${encodeURIComponent(imei)}`);
    const mapped = raw.map(mapDevice);
    set({ devices: mergeDevicesById(get().devices, mapped) });
    return mapped;
  },

  findDevicesByInvoice: async (invoiceId) => {
    const raw = await apiClient<any[]>(`/devices?purchaseInvoiceId=${encodeURIComponent(invoiceId)}`);
    const mapped = raw.map(mapDevice);
    set({ devices: mergeDevicesById(get().devices, mapped) });
    return mapped;
  },
}));
```

- [ ] **Step 2: Verify it compiles**

Run: `npm run lint`
Expected: no new errors (the file isn't imported anywhere yet, so this only checks the file's own syntax/types).

- [ ] **Step 3: Commit**

```bash
git add src/stores/useDevicesStore.ts
git commit -m "feat: add useDevicesStore (not yet wired up)"
```

---

### Task 2: Repoint `AppContext.tsx`'s internal devices logic at the new store

**Files:**
- Modify: `src/context/AppContext.tsx`

**Interfaces:**
- Consumes: `useDevicesStore` from Task 1 (`useDevicesStore((s) => s.devices)`, `useDevicesStore((s) => s.findDeviceByImei)`, `useDevicesStore((s) => s.findDevicesByInvoice)`, `useDevicesStore.getState().fetchDevices()`).
- Produces: `AppContextType.devices` / `.findDeviceByImei` / `.findDevicesByInvoice` keep their exact existing public shape and behavior — no consumer of `useApp()` needs to change yet.

This task's rule: **`contextValue`'s object literal, its dependency array, and `AppContextType` do not change in this task.** Only where the values come from changes.

- [ ] **Step 1: Add the import**

```typescript
import { useDevicesStore } from '../stores/useDevicesStore';
```

- [ ] **Step 2: Delete the local devices state and functions, replace with store-backed reads**

Delete this one line (original line 330, declared alongside the other `useState` calls):

```typescript
  const [devices, setDevices] = useState<Device[]>([]);
```

Delete this whole block (the four functions: `fetchDevices`, `mergeDevicesById`, `findDeviceByImei`, `findDevicesByInvoice`):

```typescript
  // excludeSold: a SOLD device never leaves the table, so it's the one status that would
  // otherwise grow this fetch unbounded over the shop's lifetime — everything else (in
  // stock, in transfer, in repair) is capped by real physical inventory. Old sold devices
  // are still reachable on demand via findDeviceByImei.
  const fetchDevices = useCallback(async () => {
    const raw = await apiClient<any[]>('/devices?excludeSold=true');
    setDevices(raw.map(mapDevice));
  }, []);

  const mergeDevicesById = (mapped: Device[]) => {
    setDevices((prev) => {
      const byId = new Map(prev.map((d) => [d.id, d]));
      for (const d of mapped) byId.set(d.id, d);
      return Array.from(byId.values());
    });
  };

  const findDeviceByImei: AppContextType['findDeviceByImei'] = useCallback(async (imei) => {
    const raw = await apiClient<any[]>(`/devices?search=${encodeURIComponent(imei)}`);
    const mapped = raw.map(mapDevice);
    mergeDevicesById(mapped);
    return mapped;
  }, []);

  const findDevicesByInvoice: AppContextType['findDevicesByInvoice'] = useCallback(async (invoiceId) => {
    const raw = await apiClient<any[]>(`/devices?purchaseInvoiceId=${encodeURIComponent(invoiceId)}`);
    const mapped = raw.map(mapDevice);
    mergeDevicesById(mapped);
    return mapped;
  }, []);
```

Replace both deleted blocks with these three lines (placed where the first block was, right after `const [stores, setStores] = useState<Store[]>([]);`):

```typescript
  const [stores, setStores] = useState<Store[]>([]);
  const devices = useDevicesStore((s) => s.devices);
  const findDeviceByImei = useDevicesStore((s) => s.findDeviceByImei);
  const findDevicesByInvoice = useDevicesStore((s) => s.findDevicesByInvoice);
```

- [ ] **Step 3: Repoint every internal call site that calls `fetchDevices()`**

These are all plain-text substring replacements — use `replace_all` where the exact same substring appears more than once (verify with the codebase before assuming counts; re-grep after Task-1-adjacent edits if unsure):

1. `Promise.all([fetchUsers(), fetchStores(), fetchDevices(), fetchExchangeRate()])` → `Promise.all([fetchUsers(), fetchStores(), useDevicesStore.getState().fetchDevices(), fetchExchangeRate()])` (appears twice: in `refetchAll` and in the initial-load `useEffect` — replace both).

2. In `tasksForRealtimeEvent`:
```typescript
      case 'INVENTORY_UPDATE':
        return [fetchDevices, fetchSuppliers, fetchInvoices, fetchBonuses];
```
→
```typescript
      case 'INVENTORY_UPDATE':
        return [useDevicesStore.getState().fetchDevices, fetchSuppliers, fetchInvoices, fetchBonuses];
```

```typescript
      case 'SALE_COMPLETED':
      case 'EXCHANGE_PROCESSED':
      case 'REFUND_PROCESSED':
        return [fetchSales, fetchDevices, fetchStores, fetchOwners];
```
→
```typescript
      case 'SALE_COMPLETED':
      case 'EXCHANGE_PROCESSED':
      case 'REFUND_PROCESSED':
        return [fetchSales, useDevicesStore.getState().fetchDevices, fetchStores, fetchOwners];
```

```typescript
      case 'TRANSFER_UPDATED':
        return [fetchTransfers, fetchDevices];
```
→
```typescript
      case 'TRANSFER_UPDATED':
        return [fetchTransfers, useDevicesStore.getState().fetchDevices];
```

3. Remove `fetchDevices` from `tasksForRealtimeEvent`'s `useCallback` dependency array — it's no longer a local variable, and `useDevicesStore.getState()` is an imperative call that doesn't need to be listed as a reactive dependency (same reasoning as the existing `useAuthStore.getState()` calls elsewhere in this file):

```typescript
  }, [fetchDevices, fetchSuppliers, fetchInvoices, fetchBonuses, fetchSales, fetchStores, fetchOwners, fetchExpenses, fetchOwnerTransactions, fetchRepairs, fetchTransfers, fetchNotifications, fetchUsers, fetchExchangeRate]);
```
→
```typescript
  }, [fetchSuppliers, fetchInvoices, fetchBonuses, fetchSales, fetchStores, fetchOwners, fetchExpenses, fetchOwnerTransactions, fetchRepairs, fetchTransfers, fetchNotifications, fetchUsers, fetchExchangeRate]);
```

4. `await Promise.all([fetchSales(), fetchDevices(), fetchStores(), fetchOwners()]);` → `await Promise.all([fetchSales(), useDevicesStore.getState().fetchDevices(), fetchStores(), fetchOwners()]);` (appears 3 times: `createSale`, `processExchange`, `processRefund` — `replace_all`).

5. `await Promise.all([fetchDevices(), fetchSuppliers(), fetchInvoices(), fetchBonuses()]);` → `await Promise.all([useDevicesStore.getState().fetchDevices(), fetchSuppliers(), fetchInvoices(), fetchBonuses()]);` (appears 5 times: `createPurchase`, `updateSupplier`, `deleteSupplier`, `updateSupplierInvoice`, `deleteSupplierInvoice` — `replace_all`).

6. `const refetchAfterBonusChange = () => Promise.all([fetchBonuses(), fetchDevices(), fetchOwners()]);` → `const refetchAfterBonusChange = () => Promise.all([fetchBonuses(), useDevicesStore.getState().fetchDevices(), fetchOwners()]);` (single occurrence).

7. `await Promise.all([fetchTransfers(), fetchDevices()]);` → `await Promise.all([fetchTransfers(), useDevicesStore.getState().fetchDevices()]);` (appears 3 times: `createTransferRequest`, `approveTransfer`, `rejectTransfer` — `replace_all`).

- [ ] **Step 4: Verify**

Run: `npm run lint` — expect no errors (in particular, no "cannot find name 'fetchDevices'" or "cannot find name 'mergeDevicesById'").
Run: `npm run build` — expect success.

- [ ] **Step 5: Manual smoke test**

Start the dev server (`npm run dev`), log in, and confirm: Inventory page still lists devices, Sale page still shows devices in the cart flow, creating a sale still updates stock, Purchase page still shows the invoice's devices. This is the highest-risk task in Phase 1 (it touches the most call sites) even though nothing observable should change.

- [ ] **Step 6: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "refactor: source AppContext's devices state from useDevicesStore internally"
```

---

### Task 3: Migrate the 8 Devices consumers to `useDevicesStore` directly

**Files:**
- Modify: `src/components/pages/InventoryPage.tsx`
- Modify: `src/components/pages/SalePage.tsx`
- Modify: `src/components/pages/ExchangePage.tsx`
- Modify: `src/components/pages/PurchasePage.tsx`
- Modify: `src/components/pages/BonusesPage.tsx`
- Modify: `src/components/pages/TransferPage.tsx`
- Modify: `src/components/pages/RepairPage.tsx`
- Modify: `src/components/pages/SuppliersPage.tsx`

**Interfaces:**
- Consumes: `useDevicesStore` from Task 1.

For each file, add the import `import { useDevicesStore } from '../../stores/useDevicesStore';`, remove the migrated field name(s) from that file's `const { ... } = useApp();` destructure, and add one `useDevicesStore((s) => s.X)` selector line per field the file actually uses. Do not select fields the file doesn't use.

- [ ] **Step 1: `InventoryPage.tsx`** — uses `devices`, `findDeviceByImei`

Before:
```typescript
  const { currentUser, devices, findDeviceByImei, stores, openScanner, isInitialLoading, selectedStoreId: globalSelectedStoreId } = useApp();
```
After:
```typescript
  const { currentUser, stores, openScanner, isInitialLoading, selectedStoreId: globalSelectedStoreId } = useApp();
  const devices = useDevicesStore((s) => s.devices);
  const findDeviceByImei = useDevicesStore((s) => s.findDeviceByImei);
```

- [ ] **Step 2: `SalePage.tsx`** — uses `devices` only

Before:
```typescript
  const {
    currentUser,
    devices,
    todayRate,
    selectedStoreId,
    setSelectedStoreId,
    stores,
    openScanner,
    createSale,
    isInitialLoading
  } = useApp();
```
After:
```typescript
  const {
    currentUser,
    todayRate,
    selectedStoreId,
    setSelectedStoreId,
    stores,
    openScanner,
    createSale,
    isInitialLoading
  } = useApp();
  const devices = useDevicesStore((s) => s.devices);
```

- [ ] **Step 3: `ExchangePage.tsx`** — uses `devices` only

Before:
```typescript
  const {
    currentUser,
    sales,
    fetchSalesRange,
    devices,
    processExchange,
    openScanner,
    stores,
    selectedStoreId: globalSelectedStoreId
  } = useApp();
```
After:
```typescript
  const {
    currentUser,
    sales,
    fetchSalesRange,
    processExchange,
    openScanner,
    stores,
    selectedStoreId: globalSelectedStoreId
  } = useApp();
  const devices = useDevicesStore((s) => s.devices);
```

- [ ] **Step 4: `PurchasePage.tsx`** — uses `devices`, `findDevicesByInvoice`, `findDeviceByImei`

Before:
```typescript
  const {
    currentUser,
    suppliers,
    stores,
    todayRate,
    supplierInvoices,
    devices,
    findDevicesByInvoice,
    findDeviceByImei,
    fetchInvoicesRange,
    createPurchase,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    createSupplier,
    openScanner
  } = useApp();
```
After:
```typescript
  const {
    currentUser,
    suppliers,
    stores,
    todayRate,
    supplierInvoices,
    fetchInvoicesRange,
    createPurchase,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    createSupplier,
    openScanner
  } = useApp();
  const devices = useDevicesStore((s) => s.devices);
  const findDevicesByInvoice = useDevicesStore((s) => s.findDevicesByInvoice);
  const findDeviceByImei = useDevicesStore((s) => s.findDeviceByImei);
```

- [ ] **Step 5: `BonusesPage.tsx`** — uses `devices` only

Before:
```typescript
  const {
    currentUser,
    supplierBonuses,
    suppliers,
    stores,
    devices,
    createSupplierBonus,
    updateSupplierBonus,
    deleteSupplierBonus,
    todayRate,
    openScanner
  } = useApp();
```
After:
```typescript
  const {
    currentUser,
    supplierBonuses,
    suppliers,
    stores,
    createSupplierBonus,
    updateSupplierBonus,
    deleteSupplierBonus,
    todayRate,
    openScanner
  } = useApp();
  const devices = useDevicesStore((s) => s.devices);
```

- [ ] **Step 6: `TransferPage.tsx`** — uses `devices` only (in this phase; `transfers`/`createTransferRequest`/`approveTransfer`/`rejectTransfer` migrate in Phase 2)

Before:
```typescript
  const {
    currentUser,
    stores,
    devices,
    transfers,
    createTransferRequest,
    approveTransfer,
    rejectTransfer,
    openScanner,
    selectedStoreId: globalSelectedStoreId
```
(plus whatever closes the destructure — keep every field except `devices`)
After: remove `devices,` from the destructure, keep the rest (`transfers`, `createTransferRequest`, `approveTransfer`, `rejectTransfer` stay on `useApp()` until Phase 2), and add:
```typescript
  const devices = useDevicesStore((s) => s.devices);
```

- [ ] **Step 7: `RepairPage.tsx`** — uses `devices`, `findDeviceByImei` (in this phase; `sales`/`fetchSalesRange` migrate in Phase 3)

Before:
```typescript
  const {
    currentUser,
    repairs,
    fetchRepairsRange,
    sales,
    fetchSalesRange,
    devices,
    findDeviceByImei,
    stores,
    createRepairTicket,
    updateRepairStatus,
    openScanner,
    selectedStoreId: globalSelectedStoreId
  } = useApp();
```
After:
```typescript
  const {
    currentUser,
    repairs,
    fetchRepairsRange,
    sales,
    fetchSalesRange,
    stores,
    createRepairTicket,
    updateRepairStatus,
    openScanner,
    selectedStoreId: globalSelectedStoreId
  } = useApp();
  const devices = useDevicesStore((s) => s.devices);
  const findDeviceByImei = useDevicesStore((s) => s.findDeviceByImei);
```

- [ ] **Step 8: `SuppliersPage.tsx`** — uses `devices`, `findDevicesByInvoice`

Before:
```typescript
    currentUser,
    suppliers,
    supplierInvoices,
    fetchInvoicesRange,
    devices,
    findDevicesByInvoice,
    stores,
    todayRate,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    paySupplier,
    paySupplierInvoice
  } = useApp();
```
After:
```typescript
    currentUser,
    suppliers,
    supplierInvoices,
    fetchInvoicesRange,
    stores,
    todayRate,
    createSupplier,
    updateSupplier,
    deleteSupplier,
    updateSupplierInvoice,
    deleteSupplierInvoice,
    paySupplier,
    paySupplierInvoice
  } = useApp();
  const devices = useDevicesStore((s) => s.devices);
  const findDevicesByInvoice = useDevicesStore((s) => s.findDevicesByInvoice);
```

- [ ] **Step 9: Verify**

Run: `npm run lint` and `npm run build` — expect success across all 8 files.

- [ ] **Step 10: Manual smoke test**

Visit each of the 8 pages, confirm devices render, IMEI search (Inventory, Repair) and invoice device lookups (Purchase, Suppliers) still work, scanner-driven flows (Bonuses, Transfer) still resolve devices.

- [ ] **Step 11: Commit**

```bash
git add src/components/pages/InventoryPage.tsx src/components/pages/SalePage.tsx src/components/pages/ExchangePage.tsx src/components/pages/PurchasePage.tsx src/components/pages/BonusesPage.tsx src/components/pages/TransferPage.tsx src/components/pages/RepairPage.tsx src/components/pages/SuppliersPage.tsx
git commit -m "refactor: read devices from useDevicesStore directly in all consumers"
```

---

### Task 4: Remove `devices` fields from `AppContext` (perf win lands here)

**Files:**
- Modify: `src/context/AppContext.tsx`

- [ ] **Step 1: Confirm zero remaining consumers**

Run: `grep -rn "useApp()" src/components src/router -B 15 | grep -E "\bdevices\b|findDeviceByImei|findDevicesByInvoice"` — the destructured field names sit BEFORE the `= useApp();` line, so context must go backwards (`-B`), not forwards. Expect no hits (or open each of the 8 files from Task 3 and confirm by eye).

- [ ] **Step 2: Remove from `AppContextType`**

Delete:
```typescript
  devices: Device[];
  // `devices` excludes SOLD units by default (see fetchDevices) — a device once sold never
  // leaves the table, so it's the one status that grows unbounded over the shop's lifetime.
  // This reaches a specific SOLD device by exact IMEI and merges it in, for the rare lookup
  // (repair intake, inventory scan) that needs sale history the in-stock list doesn't carry.
  findDeviceByImei: (imei: string) => Promise<Device[]>;
  // Every device (any status, including SOLD) from one purchase invoice — for the
  // invoice-detail "which units were sold" view, which the SOLD-excluded default misses.
  findDevicesByInvoice: (invoiceId: string) => Promise<Device[]>;
```

- [ ] **Step 3: Remove the three bridging lines added in Task 2**

Delete:
```typescript
  const devices = useDevicesStore((s) => s.devices);
  const findDeviceByImei = useDevicesStore((s) => s.findDeviceByImei);
  const findDevicesByInvoice = useDevicesStore((s) => s.findDevicesByInvoice);
```

(The `useDevicesStore` import in `AppContext.tsx` stays — it's still used by every `useDevicesStore.getState().fetchDevices()` call site from Task 2.)

- [ ] **Step 4: Remove from `contextValue`'s object literal**

Delete the three lines `devices,`, `findDeviceByImei,`, `findDevicesByInvoice,` from the `contextValue` object.

- [ ] **Step 5: Remove `devices` from `contextValue`'s dependency array**

Before:
```typescript
  }), [
    resolvedCurrentUser, todayRate, activePage, selectedStoreId, stores, devices, sales,
    transfers, repairs, suppliers, invoices, bonuses, expenses, owners,
    ownerTransactions, users, auditLogs, isInitialLoading,
    isRateModalOpen, isScannerOpen, scannerCallback, drawerOpen, theme, authToken,
  ]);
```
After:
```typescript
  }), [
    resolvedCurrentUser, todayRate, activePage, selectedStoreId, stores, sales,
    transfers, repairs, suppliers, invoices, bonuses, expenses, owners,
    ownerTransactions, users, auditLogs, isInitialLoading,
    isRateModalOpen, isScannerOpen, scannerCallback, drawerOpen, theme, authToken,
  ]);
```

- [ ] **Step 6: Verify**

Run: `npm run lint` — expect no errors (this also catches any consumer this plan's grep missed — a leftover `useApp().devices` reference now fails to compile, which is the safety net for this step).
Run: `npm run build` — expect success.

- [ ] **Step 7: Manual smoke test**

Full pass: log in as ADMIN, visit Inventory, Sale (complete one test sale), Exchange, Purchase, Bonuses, Transfer, Repair, Suppliers — every devices-related list, search, and scanner flow should behave exactly as before. Open React DevTools Profiler, trigger a device-only change (e.g. approve a transfer) and confirm pages unrelated to devices (Settings, Owners) no longer re-render.

- [ ] **Step 8: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "perf: remove devices from AppContext — Devices domain fully on useDevicesStore"
```

---

## Phase 2 — Transfers

### Task 5: Promote `namesRef` to a shared module

**Files:**
- Create: `src/context/nameLookup.ts`
- Modify: `src/context/AppContext.tsx`

**Interfaces:**
- Produces: `namesRef: { current: ReturnType<typeof buildNameLookup> }` — a plain mutable box, importable from anywhere, holding the same user-id→name lookup `AppContext.fetchUsers` has always built.

- [ ] **Step 1: Create the shared module**

```typescript
import { buildNameLookup } from '../api/mappers';

// Shared user-id → display-name lookup. Built once per fetchUsers() call in AppContext
// and read by every domain (sales, transfers, and — once migrated — repairs, expenses,
// owner transactions) that stamps a seller/requester/approver name onto its records
// without owning the users list itself. A plain mutable box, not a hook: it was always
// read imperatively at fetch time, never subscribed to for re-renders, so moving it out
// of AppContext's useRef changes nothing observable.
export const namesRef: { current: ReturnType<typeof buildNameLookup> } = { current: buildNameLookup([]) };
```

- [ ] **Step 2: Point `AppContext.tsx` at the shared module instead of its local `useRef`**

Add the import:
```typescript
import { namesRef } from './nameLookup';
```

Before:
```typescript
  const namesRef = useRef(buildNameLookup([]));
  const storeNamesRef = useRef(buildNameLookup([]));
```
After:
```typescript
  const storeNamesRef = useRef(buildNameLookup([]));
```

(Everything else in `AppContext.tsx` — `fetchUsers`'s `namesRef.current = buildNameLookup(raw)`, and every `mapSale(s, namesRef.current)` / `mapRepair(r, namesRef.current)` / `mapExpense(e, namesRef.current)` / `mapOwnerTransaction(t, ownerNamesRef.current, namesRef.current)` call — keeps working unchanged, since `namesRef` now resolves to the imported shared box instead of the local `useRef`'s box, and both have the exact same `{ current: ... }` shape.)

- [ ] **Step 3: Verify**

Run: `npm run lint` and `npm run build` — expect success.

- [ ] **Step 4: Manual smoke test**

Visit Sales History, Repair, Expenses, Owners pages — confirm seller/requester/approver names still display correctly (this is the one place a mistake here would show up).

- [ ] **Step 5: Commit**

```bash
git add src/context/nameLookup.ts src/context/AppContext.tsx
git commit -m "refactor: promote namesRef to a shared module ahead of the Transfers/Sales store split"
```

---

### Task 6: Create `useTransfersStore.ts`

**Files:**
- Create: `src/stores/useTransfersStore.ts`

**Interfaces:**
- Consumes: `namesRef` from Task 5, `useDevicesStore` from Task 1.
- Produces: `useTransfersStore` with state `transfers: TransferRequest[]` and actions `fetchTransfers(): Promise<void>`, `createTransferRequest(toLocationIdOrParams, deviceIdsParam, ctx): Promise<{success, message?}>`, `approveTransfer(transferId): Promise<{success, message?}>`, `rejectTransfer(transferId, reason): Promise<{success, message?}>`.
- Note the intentional interface change: `createTransferRequest` gains a third parameter, `ctx: { currentUserStoreId?: string }`, because the original closed over `currentUser` from `AppContext`'s local state — that value must now be threaded in explicitly by whoever calls it (both `AppContext`'s transitional wrapper in Task 7, and `TransferPage` after Task 8). The business logic (`fromLocId` defaults to `ctx.currentUserStoreId || 'main-warehouse'`) is unchanged.
- Also note: the original `approveTransferRequest`/`rejectTransferRequest` aliases in `AppContextType` are dropped, not carried over — grep confirms no component anywhere references those alias names (only the direct `approveTransfer`/`rejectTransfer` names are used), so this is dead-code removal, not a behavior change.

- [ ] **Step 1: Write the store, reproducing `AppContext.tsx`'s current transfers logic verbatim (lines 332, 467-470, 993-1038)**

```typescript
import { create } from 'zustand';
import { TransferRequest } from '../types';
import { apiClient } from '../api/client';
import { mapTransfer } from '../api/mappers';
import { namesRef } from '../context/nameLookup';
import { useDevicesStore } from './useDevicesStore';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface TransfersState {
  transfers: TransferRequest[];
  // Bounded — no page needs the full transfer history for correctness (no cross-page
  // lookup depends on it, unlike sales/devices), so a generous cap is enough.
  fetchTransfers: () => Promise<void>;
  createTransferRequest: (
    toLocationIdOrParams: string | { fromLocationId?: string; toLocationId: string; deviceIds: string[] },
    deviceIdsParam: string[] | undefined,
    ctx: { currentUserStoreId?: string }
  ) => Promise<{ success: boolean; message?: string }>;
  approveTransfer: (transferId: string) => Promise<{ success: boolean; message?: string }>;
  rejectTransfer: (transferId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
}

export const useTransfersStore = create<TransfersState>((set, get) => ({
  transfers: [],

  fetchTransfers: async () => {
    const raw = await apiClient<any[]>('/transfers?limit=500');
    set({ transfers: raw.map((t) => mapTransfer(t, namesRef.current)).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()) });
  },

  createTransferRequest: async (toLocationIdOrParams, deviceIdsParam, ctx) => {
    let fromLocId = ctx.currentUserStoreId || 'main-warehouse';
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
      await Promise.all([get().fetchTransfers(), useDevicesStore.getState().fetchDevices()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось создать перемещение') };
    }
  },

  approveTransfer: async (transferId) => {
    try {
      await apiClient(`/transfers/${transferId}/approve`, { method: 'POST' });
      await Promise.all([get().fetchTransfers(), useDevicesStore.getState().fetchDevices()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось подтвердить перемещение') };
    }
  },

  rejectTransfer: async (transferId, reason) => {
    try {
      await apiClient(`/transfers/${transferId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) });
      await Promise.all([get().fetchTransfers(), useDevicesStore.getState().fetchDevices()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось отклонить перемещение') };
    }
  },
}));
```

- [ ] **Step 2: Verify**

Run: `npm run lint` — expect no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/stores/useTransfersStore.ts
git commit -m "feat: add useTransfersStore (not yet wired up)"
```

---

### Task 7: Repoint `AppContext.tsx`'s internal transfers logic at the new store

**Files:**
- Modify: `src/context/AppContext.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { useTransfersStore } from '../stores/useTransfersStore';
```

- [ ] **Step 2: Delete the local transfers state and functions**

Delete:
```typescript
  const [transfers, setTransfers] = useState<TransferRequest[]>([]);
```

Delete (the whole `fetchTransfers` function, lines 465-470):
```typescript
  // Bounded — no page needs the full transfer history for correctness (no cross-page
  // lookup depends on it, unlike sales/devices), so a generous cap is enough.
  const fetchTransfers = useCallback(async () => {
    const raw = await apiClient<any[]>('/transfers?limit=500');
    setTransfers(raw.map((t) => mapTransfer(t, namesRef.current)).sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime()));
  }, []);
```

Delete the whole `createTransferRequest`, `approveTransfer`, `rejectTransfer` function bodies (lines 993-1038) and replace with thin wrappers that thread `currentUser` through to the store (this keeps `AppContext`'s public `createTransferRequest`/`approveTransfer`/`rejectTransfer` shape — used by `TransferPage` until Task 8 — completely unchanged):

```typescript
  const createTransferRequest: AppContextType['createTransferRequest'] = (toLocationIdOrParams, deviceIdsParam) =>
    useTransfersStore.getState().createTransferRequest(toLocationIdOrParams, deviceIdsParam, { currentUserStoreId: currentUser?.storeId });

  const approveTransfer: AppContextType['approveTransfer'] = (transferId) =>
    useTransfersStore.getState().approveTransfer(transferId);

  const rejectTransfer: AppContextType['rejectTransfer'] = (transferId, reason) =>
    useTransfersStore.getState().rejectTransfer(transferId, reason);
```

- [ ] **Step 3: Add store-backed `transfers` read, next to the other bridging reads from Task 2**

```typescript
  const transfers = useTransfersStore((s) => s.transfers);
```

- [ ] **Step 4: Repoint `refetchAll`, the initial-load effect, and `tasksForRealtimeEvent`**

In `refetchAll` and the initial-load effect:
```typescript
      await Promise.all([fetchSales(), fetchTransfers(), fetchRepairs(), fetchExpenses()]);
```
→
```typescript
      await Promise.all([fetchSales(), useTransfersStore.getState().fetchTransfers(), fetchRepairs(), fetchExpenses()]);
```
(and the matching line in the initial-load effect's array — same substitution.)

In `tasksForRealtimeEvent`:
```typescript
      case 'TRANSFER_UPDATED':
        return [fetchTransfers, useDevicesStore.getState().fetchDevices];
```
→
```typescript
      case 'TRANSFER_UPDATED':
        return [useTransfersStore.getState().fetchTransfers, useDevicesStore.getState().fetchDevices];
```

Remove `fetchTransfers` from `tasksForRealtimeEvent`'s dependency array (same reasoning as Task 2 Step 3):
```typescript
  }, [fetchSuppliers, fetchInvoices, fetchBonuses, fetchSales, fetchStores, fetchOwners, fetchExpenses, fetchOwnerTransactions, fetchRepairs, fetchTransfers, fetchNotifications, fetchUsers, fetchExchangeRate]);
```
→
```typescript
  }, [fetchSuppliers, fetchInvoices, fetchBonuses, fetchSales, fetchStores, fetchOwners, fetchExpenses, fetchOwnerTransactions, fetchRepairs, fetchNotifications, fetchUsers, fetchExchangeRate]);
```

- [ ] **Step 5: Remove the now-dead `approveTransferRequest`/`rejectTransferRequest` aliases from `contextValue`**

Delete:
```typescript
        approveTransferRequest: approveTransfer,
```
```typescript
        rejectTransferRequest: rejectTransfer,
```
And their type declarations from `AppContextType`:
```typescript
  approveTransferRequest: (transferId: string) => Promise<{ success: boolean; message?: string }>;
```
```typescript
  rejectTransferRequest: (transferId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
```

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npm run build` — expect success.

- [ ] **Step 7: Manual smoke test**

Log in, go to Transfer page: create a transfer request, approve one, reject one (as ADMIN/PARTNER — check role permissions still enforced exactly as before), confirm device stock moves correctly on approval.

- [ ] **Step 8: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "refactor: source AppContext's transfers state from useTransfersStore internally"
```

---

### Task 8: Migrate `TransferPage.tsx` to `useTransfersStore` directly

**Files:**
- Modify: `src/components/pages/TransferPage.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { useTransfersStore } from '../../stores/useTransfersStore';
```

- [ ] **Step 2: Update the destructure and add store selectors**

Remove `transfers`, `createTransferRequest`, `approveTransfer`, `rejectTransfer` from the `useApp()` destructure (keep `currentUser`, `stores`, `openScanner`, `selectedStoreId: globalSelectedStoreId`, and the `devices` selector already added in Task 3), and add:

```typescript
  const transfers = useTransfersStore((s) => s.transfers);
  const createTransferRequestAction = useTransfersStore((s) => s.createTransferRequest);
  const approveTransferAction = useTransfersStore((s) => s.approveTransfer);
  const rejectTransferAction = useTransfersStore((s) => s.rejectTransfer);
```

- [ ] **Step 3: Update the 3 call sites in this file that invoke these actions**

Every existing call like `createTransferRequest(...)` becomes `createTransferRequestAction(...args, { currentUserStoreId: currentUser?.storeId })` — find each call site in the file and add the third `ctx` argument. `approveTransferAction(transferId)` and `rejectTransferAction(transferId, reason)` keep the same call shape as before (no ctx needed — read the store's Task 6 signature, only `createTransferRequest` takes a third argument).

(Rename to `createTransferRequestAction`/etc. only if the file already has local variables/handlers named `createTransferRequest` — if not, keep the original names `createTransferRequest`, `approveTransfer`, `rejectTransfer` for the selected actions instead, to minimize the diff. Check the file before deciding.)

- [ ] **Step 4: Verify**

Run: `npm run lint` and `npm run build` — expect success.

- [ ] **Step 5: Manual smoke test**

Repeat Task 7's transfer smoke test — same flows, now driven by the migrated component.

- [ ] **Step 6: Commit**

```bash
git add src/components/pages/TransferPage.tsx
git commit -m "refactor: TransferPage reads/writes transfers via useTransfersStore directly"
```

---

### Task 9: Remove `transfers` fields from `AppContext`

**Files:**
- Modify: `src/context/AppContext.tsx`

- [ ] **Step 1: Confirm zero remaining consumers**

Run: `grep -rn "useApp()" src/components src/router -B 15 | grep -E "transfers|createTransferRequest|approveTransfer|rejectTransfer"` — the destructured field names sit BEFORE the `= useApp();` line, so context must go backwards (`-B`), not forwards. Expect no hits outside `AppContext.tsx` itself.

- [ ] **Step 2: Remove from `AppContextType`**

Delete:
```typescript
  transfers: TransferRequest[];
```
```typescript
  createTransferRequest: (toLocationIdOrParams: string | { fromLocationId?: string; toLocationId: string; deviceIds: string[] }, deviceIds?: string[]) => Promise<{ success: boolean; message?: string }>;
  approveTransfer: (transferId: string) => Promise<{ success: boolean; message?: string }>;
  rejectTransfer: (transferId: string, reason: string) => Promise<{ success: boolean; message?: string }>;
```

- [ ] **Step 3: Remove the bridging read and wrapper functions from Task 7**

Delete:
```typescript
  const transfers = useTransfersStore((s) => s.transfers);
```
```typescript
  const createTransferRequest: AppContextType['createTransferRequest'] = (toLocationIdOrParams, deviceIdsParam) =>
    useTransfersStore.getState().createTransferRequest(toLocationIdOrParams, deviceIdsParam, { currentUserStoreId: currentUser?.storeId });

  const approveTransfer: AppContextType['approveTransfer'] = (transferId) =>
    useTransfersStore.getState().approveTransfer(transferId);

  const rejectTransfer: AppContextType['rejectTransfer'] = (transferId, reason) =>
    useTransfersStore.getState().rejectTransfer(transferId, reason);
```

- [ ] **Step 4: Remove from `contextValue`'s object literal**

Delete `transfers,`, `createTransferRequest,`, `approveTransfer,`, `rejectTransfer,`.

- [ ] **Step 5: Remove `transfers` from `contextValue`'s dependency array**

```typescript
  }), [
    resolvedCurrentUser, todayRate, activePage, selectedStoreId, stores, sales,
    repairs, suppliers, invoices, bonuses, expenses, owners,
    ownerTransactions, users, auditLogs, isInitialLoading,
    isRateModalOpen, isScannerOpen, scannerCallback, drawerOpen, theme, authToken,
  ]);
```

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npm run build` — expect success.

- [ ] **Step 7: Manual smoke test**

Full transfer flow again, plus: open React DevTools Profiler, approve a transfer, confirm Settings/Owners/Reports pages no longer re-render.

- [ ] **Step 8: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "perf: remove transfers from AppContext — Transfers domain fully on useTransfersStore"
```

---

## Phase 3 — Sales

### Task 10: Create `legacyFetchBridge.ts` and wire it into `AppContext`

**Files:**
- Create: `src/context/legacyFetchBridge.ts`
- Modify: `src/context/AppContext.tsx`

**Interfaces:**
- Produces: `legacyFetchers: { fetchStores?: () => Promise<void>; fetchOwners?: () => Promise<void> }`.

- [ ] **Step 1: Create the bridge module**

```typescript
// Temporary bridge exposing AppContext's not-yet-migrated fetchers to already-migrated
// zustand stores. useSalesStore's createSale/processExchange/processRefund need to
// refresh Stores/Owners after a sale, exactly as before this migration — those two
// domains haven't moved out of AppContext yet, so their fetchers can't be imported the
// way useDevicesStore/useTransfersStore can. AppContext populates this once on mount
// (fetchStores/fetchOwners are useCallback([]) closures, so their identity is stable for
// the app's lifetime — see the wiring in AppContext.tsx). Delete this file, and the
// AppContext wiring below, once Stores and Owners get their own stores: each entry then
// becomes a direct useXStore.getState().fetchX() call instead.
interface LegacyFetchers {
  fetchStores?: () => Promise<void>;
  fetchOwners?: () => Promise<void>;
}

export const legacyFetchers: LegacyFetchers = {};
```

- [ ] **Step 2: Wire `AppContext.tsx` to populate it**

Add the import:
```typescript
import { legacyFetchers } from './legacyFetchBridge';
```

Add this effect right after `fetchOwners` is defined (both `fetchStores` and `fetchOwners` are declared earlier in the file as `useCallback(..., [])`, so this effect body runs exactly once, on mount):

```typescript
  useEffect(() => {
    legacyFetchers.fetchStores = fetchStores;
    legacyFetchers.fetchOwners = fetchOwners;
  }, [fetchStores, fetchOwners]);
```

- [ ] **Step 3: Verify**

Run: `npm run lint` and `npm run build` — expect success.

- [ ] **Step 4: Commit**

```bash
git add src/context/legacyFetchBridge.ts src/context/AppContext.tsx
git commit -m "feat: add legacyFetchBridge so upcoming useSalesStore can refresh stores/owners"
```

---

### Task 11: Create `useSalesStore.ts`

**Files:**
- Create: `src/stores/useSalesStore.ts`

**Interfaces:**
- Consumes: `namesRef` (Task 5), `useDevicesStore` (Task 1), `legacyFetchers` (Task 10).
- Produces: `useSalesStore` with state `sales: Sale[]` and actions `fetchSales(): Promise<void>`, `fetchSalesRange(params): Promise<Sale[]>`, `createSale(params): Promise<{success, receiptNumber?, message?}>`, `processExchange(params): Promise<{success, message?}>`, `processRefund(params): Promise<{success, message?}>`.
- Note the intentional interface change: `createSale`'s params object gains `selectedStoreId: string` and `currentUser: { role: string; storeId?: string } | null` — the original closed over both from `AppContext`'s local state. `processExchange` and `processRefund` need no such change (the original functions never referenced `currentUser`/`selectedStoreId` — verify this against `AppContext.tsx` before writing the store if in doubt).

- [ ] **Step 1: Write the store, reproducing `AppContext.tsx`'s current sales logic verbatim (lines 331, 443-463, 788-887)**

```typescript
import { create } from 'zustand';
import { Sale, PaymentMethod, Device } from '../types';
import { apiClient } from '../api/client';
import { mapSale } from '../api/mappers';
import { namesRef } from '../context/nameLookup';
import { useDevicesStore } from './useDevicesStore';
import { legacyFetchers } from '../context/legacyFetchBridge';

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

interface SalesState {
  sales: Sale[];
  // Bounded by default — the background/startup load used to fetch every sale ever, which
  // only gets slower as the shop's history grows. Anything outside this recent window is
  // reached on demand via fetchSalesRange (search/sellerId/explicit period) instead.
  fetchSales: () => Promise<void>;
  fetchSalesRange: (params: { period?: 'TODAY' | 'MONTH' | 'SPECIFIC_MONTH' | 'ALL'; month?: string; storeId?: string; sellerId?: string; search?: string }) => Promise<Sale[]>;
  createSale: (params: {
    items: { device: Device; salePriceTjs: number }[];
    paymentMethod: Exclude<PaymentMethod, 'DEBT'>;
    cashAmountTjs: number;
    cardAmountTjs: number;
    customerName?: string;
    selectedStoreId: string;
    currentUser: { role: string; storeId?: string } | null;
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
}

export const useSalesStore = create<SalesState>((set, get) => ({
  sales: [],

  fetchSales: async () => {
    const raw = await apiClient<any[]>('/sales?limit=500');
    set({ sales: raw.map((s) => mapSale(s, namesRef.current)).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) });
  },

  fetchSalesRange: async (params) => {
    const qs = new URLSearchParams();
    if (params.period) qs.set('period', params.period);
    if (params.month) qs.set('month', params.month);
    if (params.storeId) qs.set('storeId', params.storeId);
    if (params.sellerId) qs.set('sellerId', params.sellerId);
    if (params.search) qs.set('search', params.search);
    const raw = await apiClient<any[]>(`/sales?${qs.toString()}`);
    const mapped = raw.map((s) => mapSale(s, namesRef.current));
    set((state) => {
      const byId = new Map(state.sales.map((s) => [s.id, s]));
      for (const s of mapped) byId.set(s.id, s);
      return { sales: Array.from(byId.values()).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()) };
    });
    return mapped;
  },

  createSale: async ({ items, paymentMethod, cashAmountTjs, cardAmountTjs, customerName, selectedStoreId, currentUser }) => {
    // Trust the actual location of the devices in the cart over the (possibly stale,
    // shared-across-pages) selectedStoreId — e.g. an admin who last picked the main
    // warehouse on the Inventory page must not have that leak into a POS sale here.
    const storeId = currentUser?.role === 'SELLER'
      ? currentUser.storeId
      : (items[0]?.device.locationId || (selectedStoreId !== 'all' ? selectedStoreId : undefined));
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
      await Promise.all([get().fetchSales(), useDevicesStore.getState().fetchDevices(), legacyFetchers.fetchStores?.(), legacyFetchers.fetchOwners?.()]);
      return { success: true, receiptNumber: sale.receiptNumber };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить продажу') };
    }
  },

  processExchange: async (params) => {
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

    const currentSales = get().sales;
    let targetSale = currentSales.find((s) =>
      (targetReceiptNum && !isNaN(targetReceiptNum) && s.receiptNumber === targetReceiptNum) ||
      s.id === params.originalSaleId ||
      s.receiptNumber.toString() === params.originalSaleId?.toString().replace('#', '')
    );
    if (!targetSale && returnedImeiStr) {
      targetSale = currentSales.find((s) => s.items.some((i) => i.imei === returnedImeiStr));
    }
    if (!targetSale) {
      return { success: false, message: `Продажа с указанным чеком/IMEI не найдена` };
    }

    const returnedItem = params.returnedItem;
    try {
      await apiClient<any>('/exchanges', {
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
      await Promise.all([get().fetchSales(), useDevicesStore.getState().fetchDevices(), legacyFetchers.fetchStores?.(), legacyFetchers.fetchOwners?.()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить обмен') };
    }
  },

  processRefund: async ({ saleId, reason, refundAmountTjs, penaltyFeeTjs, paymentMethod }) => {
    try {
      await apiClient(`/sales/${saleId}/refund`, {
        method: 'POST',
        body: JSON.stringify({ reason, refundAmountTjs, penaltyFeeTjs, paymentMethod }),
      });
      await Promise.all([get().fetchSales(), useDevicesStore.getState().fetchDevices(), legacyFetchers.fetchStores?.(), legacyFetchers.fetchOwners?.()]);
      return { success: true };
    } catch (err) {
      return { success: false, message: errorMessage(err, 'Не удалось выполнить возврат') };
    }
  },
}));
```

- [ ] **Step 2: Verify**

Run: `npm run lint` — expect no new errors. Before moving on, open `AppContext.tsx` and double check `processExchange`/`processRefund` truly never reference `currentUser` or `selectedStoreId` anywhere in their bodies — this plan's earlier reading found they don't, but re-verify against the live file since Tasks 1-10 have already changed line numbers.

- [ ] **Step 3: Commit**

```bash
git add src/stores/useSalesStore.ts
git commit -m "feat: add useSalesStore (not yet wired up)"
```

---

### Task 12: Repoint `AppContext.tsx`'s internal sales logic at the new store

**Files:**
- Modify: `src/context/AppContext.tsx`

- [ ] **Step 1: Add the import**

```typescript
import { useSalesStore } from '../stores/useSalesStore';
```

- [ ] **Step 2: Delete the local sales state and functions**

Delete:
```typescript
  const [sales, setSales] = useState<Sale[]>([]);
```

Delete the `fetchSales` and `fetchSalesRange` functions (lines 440-463), and the `createSale`, `processExchange`, `processRefund` function bodies (lines 788-887) — replace the three business functions with thin wrappers that thread `selectedStoreId`/`currentUser` through (keeping `AppContext`'s public shape unchanged for the consumers not yet migrated in Task 13):

```typescript
  const createSale: AppContextType['createSale'] = (params) =>
    useSalesStore.getState().createSale({ ...params, selectedStoreId, currentUser });

  const processExchange: AppContextType['processExchange'] = (params) =>
    useSalesStore.getState().processExchange(params);

  const processRefund: AppContextType['processRefund'] = (params) =>
    useSalesStore.getState().processRefund(params);
```

- [ ] **Step 3: Add store-backed `sales`/`fetchSalesRange` reads**

```typescript
  const sales = useSalesStore((s) => s.sales);
  const fetchSalesRange = useSalesStore((s) => s.fetchSalesRange);
```

- [ ] **Step 4: Repoint `refetchAll`, the initial-load effect, and `tasksForRealtimeEvent`**

`Promise.all([fetchSales(), fetchTransfers(), fetchRepairs(), fetchExpenses()])` → `Promise.all([useSalesStore.getState().fetchSales(), fetchTransfers(), fetchRepairs(), fetchExpenses()])`

Wait — `fetchTransfers` here is already `useTransfersStore.getState().fetchTransfers` from Task 7 (re-check the live file for the exact current text before editing; it no longer reads as the original raw string). Apply this substitution to both occurrences (refetchAll, initial-load effect) using whatever the current exact text is at this point in the plan.

In `tasksForRealtimeEvent`:
```typescript
      case 'SALE_COMPLETED':
      case 'EXCHANGE_PROCESSED':
      case 'REFUND_PROCESSED':
        return [fetchSales, useDevicesStore.getState().fetchDevices, fetchStores, fetchOwners];
```
→
```typescript
      case 'SALE_COMPLETED':
      case 'EXCHANGE_PROCESSED':
      case 'REFUND_PROCESSED':
        return [useSalesStore.getState().fetchSales, useDevicesStore.getState().fetchDevices, fetchStores, fetchOwners];
```

Remove `fetchSales` from `tasksForRealtimeEvent`'s dependency array (same reasoning as prior phases).

- [ ] **Step 5: Verify**

Run: `npm run lint` and `npm run build` — expect success.

- [ ] **Step 6: Manual smoke test**

Complete a full sale, an exchange, and a refund end-to-end. Confirm receipt numbers, stock updates, and store/owner cash figures all update exactly as before.

- [ ] **Step 7: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "refactor: source AppContext's sales state from useSalesStore internally"
```

---

### Task 13: Migrate the 5 Sales consumers to `useSalesStore` directly

**Files:**
- Modify: `src/components/pages/SalePage.tsx`
- Modify: `src/components/pages/SalesHistoryPage.tsx`
- Modify: `src/components/pages/ExchangePage.tsx`
- Modify: `src/components/pages/EmployeesPage.tsx`
- Modify: `src/components/pages/RepairPage.tsx`

- [ ] **Step 1: `SalePage.tsx`** — uses `createSale` only, and it needs to pass `selectedStoreId`/`currentUser` itself now

Add import: `import { useSalesStore } from '../../stores/useSalesStore';`

Remove `createSale` from the `useApp()` destructure (keep `currentUser`, `todayRate`, `selectedStoreId`, `setSelectedStoreId`, `stores`, `openScanner`, `isInitialLoading`, and the `devices` selector from Task 3), add:
```typescript
  const createSaleAction = useSalesStore((s) => s.createSale);
```
Find this file's call site (the checkout handler) and change `createSale({ items, paymentMethod, cashAmountTjs, cardAmountTjs, customerName })` to `createSaleAction({ items, paymentMethod, cashAmountTjs, cardAmountTjs, customerName, selectedStoreId, currentUser })`.

- [ ] **Step 2: `SalesHistoryPage.tsx`** — uses `sales`, `fetchSalesRange`, `processRefund`

Add import, remove the three fields from `useApp()` destructure, add:
```typescript
  const sales = useSalesStore((s) => s.sales);
  const fetchSalesRange = useSalesStore((s) => s.fetchSalesRange);
  const processRefund = useSalesStore((s) => s.processRefund);
```

- [ ] **Step 3: `ExchangePage.tsx`** — uses `sales`, `fetchSalesRange`, `processExchange` (in this phase; `devices` already migrated in Task 3)

Add import, remove the three fields from `useApp()` destructure, add:
```typescript
  const sales = useSalesStore((s) => s.sales);
  const fetchSalesRange = useSalesStore((s) => s.fetchSalesRange);
  const processExchange = useSalesStore((s) => s.processExchange);
```

- [ ] **Step 4: `EmployeesPage.tsx`** — uses `sales`, `fetchSalesRange` (read-only, for payroll)

Add import, remove `sales`, `fetchSalesRange` from `useApp()` destructure (keep `expenses`, `fetchExpensesRange`, `users`, `stores`, `todayRate`, `createUser`, `updateUser`, `deleteUser`, `createExpense`), add:
```typescript
  const sales = useSalesStore((s) => s.sales);
  const fetchSalesRange = useSalesStore((s) => s.fetchSalesRange);
```

- [ ] **Step 5: `RepairPage.tsx`** — uses `sales`, `fetchSalesRange` (in this phase; `devices`/`findDeviceByImei` already migrated in Task 3)

Add import, remove `sales`, `fetchSalesRange` from `useApp()` destructure (keep `repairs`, `fetchRepairsRange`, `stores`, `createRepairTicket`, `updateRepairStatus`, `openScanner`, `selectedStoreId`, and the `devices`/`findDeviceByImei` selectors from Task 3), add:
```typescript
  const sales = useSalesStore((s) => s.sales);
  const fetchSalesRange = useSalesStore((s) => s.fetchSalesRange);
```

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npm run build` — expect success.

- [ ] **Step 7: Manual smoke test**

Complete a sale on SalePage (confirm receipt prints correctly), check it appears on SalesHistoryPage, process a refund from there, process an exchange on ExchangePage, confirm EmployeesPage's payroll/commission figures are unchanged, confirm RepairPage's original-sale lookup during intake still works.

- [ ] **Step 8: Commit**

```bash
git add src/components/pages/SalePage.tsx src/components/pages/SalesHistoryPage.tsx src/components/pages/ExchangePage.tsx src/components/pages/EmployeesPage.tsx src/components/pages/RepairPage.tsx
git commit -m "refactor: read/write sales via useSalesStore directly in all consumers"
```

---

### Task 14: Remove `sales` fields from `AppContext` (final perf win + full regression pass)

**Files:**
- Modify: `src/context/AppContext.tsx`

- [ ] **Step 1: Confirm zero remaining consumers**

Run: `grep -rn "useApp()" src/components src/router -B 15 | grep -E "\bsales\b|fetchSalesRange|createSale\b|processExchange|processRefund"` — the destructured field names sit BEFORE the `= useApp();` line, so context must go backwards (`-B`), not forwards. Expect no hits outside `AppContext.tsx` itself.

- [ ] **Step 2: Remove from `AppContextType`**

Delete the `sales: Sale[];`, `fetchSalesRange: (...) => ...;`, `createSale: (...) => ...;`, `processExchange: (...) => ...;`, `processRefund: (...) => ...;` declarations (with their leading comments).

- [ ] **Step 3: Remove the bridging reads and wrapper functions from Task 12**

Delete:
```typescript
  const sales = useSalesStore((s) => s.sales);
  const fetchSalesRange = useSalesStore((s) => s.fetchSalesRange);
```
```typescript
  const createSale: AppContextType['createSale'] = (params) =>
    useSalesStore.getState().createSale({ ...params, selectedStoreId, currentUser });

  const processExchange: AppContextType['processExchange'] = (params) =>
    useSalesStore.getState().processExchange(params);

  const processRefund: AppContextType['processRefund'] = (params) =>
    useSalesStore.getState().processRefund(params);
```

- [ ] **Step 4: Remove from `contextValue`'s object literal**

Delete `sales,`, `fetchSalesRange,`, `createSale,`, `processExchange,`, `processRefund,`.

- [ ] **Step 5: Remove `sales` from `contextValue`'s dependency array**

```typescript
  }), [
    resolvedCurrentUser, todayRate, activePage, selectedStoreId, stores,
    repairs, suppliers, invoices, bonuses, expenses, owners,
    ownerTransactions, users, auditLogs, isInitialLoading,
    isRateModalOpen, isScannerOpen, scannerCallback, drawerOpen, theme, authToken,
  ]);
```

- [ ] **Step 6: Verify**

Run: `npm run lint` and `npm run build` — expect success.
Run: `npm test` (vitest) — expect the existing 2 suites to still pass (unaffected by this refactor, but confirms nothing else broke).

- [ ] **Step 7: Full regression smoke test**

This is the last task of the whole plan — do the complete pass:
- Login as ADMIN, PARTNER, and SELLER (role-gated behavior, e.g. `selectedStoreId` lock for SELLER, must be unchanged).
- Complete a sale, an exchange, and a refund.
- Create, approve, and reject a transfer.
- Search a device by IMEI on Inventory and Repair pages; look up an invoice's devices on Purchase and Suppliers pages.
- Check Sales History, Employees (payroll), Reports, and Owners pages all show correct, consistent figures.
- Open React DevTools Profiler: trigger a sale and confirm only Sale/SalesHistory/Inventory-adjacent components re-render — Settings, Owners (unless it's owner-cash-affected — check this is the same as before), AuditLog, etc. should not.

- [ ] **Step 8: Commit**

```bash
git add src/context/AppContext.tsx
git commit -m "perf: remove sales from AppContext — Sales domain fully on useSalesStore"
```

---

## Self-Review Notes

- **Spec coverage:** every Global Constraint bullet maps to a task above — incremental (14 tasks across 3 phases), Zustand-based, domain-by-domain starting from the requested set (reordered Devices→Transfers→Sales for dependency safety, called out explicitly), per-field selectors only (every consumer edit uses `useXStore((s) => s.field)`, never `useXStore()` bare), domain removed from `AppContext` only after all consumers migrate (Tasks 4, 9, 14 gate on a grep check), no blind `useMemo`/`useCallback`/`React.memo` added (none introduced anywhere in this plan), TypeScript/build verified after every task.
- **Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every task shows the literal before/after code.
- **Type consistency:** `createSale`'s extended signature (`selectedStoreId`, `currentUser`) is introduced once in Task 11 and referenced identically in Tasks 12 and 13. `createTransferRequest`'s `ctx` parameter is introduced in Task 6 and referenced identically in Tasks 7 and 8. Store names (`useDevicesStore`, `useTransfersStore`, `useSalesStore`, `legacyFetchers`, `namesRef`) are consistent across every task that references them.
