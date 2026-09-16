# Unpaid cash-register expenses — design

## Problem

On the Expenses page (`src/components/pages/ExpensesPage.tsx`), creating an
expense with "Списать сумму из наличной кассы" (`paidFromCashRegister: true`)
against a store whose `cashBalanceTjs` doesn't cover the amount currently
fails outright: `expenses.service.ts`'s `createExpense` throws
`"В кассе недостаточно наличных для расхода"` inside the transaction, so
nothing is saved — not the expense, not the owner-profit accrual, nothing.

The business wants this case to succeed instead: the expense is recorded as
unpaid, admins are notified, and someone manually marks it paid once the
register actually has the cash — at which point (and only then) the cash and
partner profit are actually affected.

This only concerns the cash-register path. An expense paid from "Счёт
компании" (`paidFromCashRegister: false`) is unaffected by this design — it
keeps behaving exactly as it does today (immediate, always succeeds, no cash
balance touched, profit debited immediately).

## Goals

- Creating a cash-register expense that exceeds the store's current cash
  balance succeeds and produces an `UNPAID` expense instead of an error.
- Owner profit (`totalAccruedProfitUsd` / `availableProfitUsd`) is only
  affected at the moment cash actually leaves a register — not when an
  `UNPAID` expense is recorded, and not fictitiously reversed/reapplied for
  something that was never applied.
- An admin/partner can manually mark an `UNPAID` expense as paid from the
  Expenses page once the register has enough cash; this is a deliberate
  manual action — nothing pays itself automatically when a sale or any other
  cash-in event happens.
- Admins/partners get a notification when an expense becomes `UNPAID`, and a
  second one when it's actually paid (mirroring the existing
  `TransferRequest` notify → resolve pattern in `transfers.service.ts`).
- The "Итого за период" total on the Expenses page reflects only money that
  has actually left a register — `UNPAID` expenses are excluded from it
  until paid.

## Non-goals

- No automatic settlement when a store's cash balance increases (no hooking
  into sales/refunds/exchanges/owner-investment/manual cash adjustments).
  Paying an `UNPAID` expense is always an explicit admin click.
- No partial payment of a single expense. An `UNPAID` expense is paid in
  full or not at all (mirrors the existing all-or-nothing cash guard, unlike
  `SupplierInvoice`'s `PARTIALLY_PAID`).
- No FIFO auto-ordering across multiple `UNPAID` expenses — admin picks
  whichever one to pay.
- No change to the `paidFromCashRegister: false` ("Счёт компании") path.

## Data model

Add to `Expense` (`prisma/schema.prisma`):

```prisma
status String   @default("PAID") // 'PAID' | 'UNPAID'
paidAt DateTime?
```

Migration backfills `status = 'PAID'` and `paidAt = createdAt` for all
existing rows (they were all created under the old always-succeeds-or-throws
behavior, i.e. already effectively paid).

`src/types/index.ts`'s `Expense` interface and `mapExpense` in
`src/api/mappers.ts` gain `status: 'PAID' | 'UNPAID'` and `paidAt?: string`.

## Backend flow

### `createExpense` (`server/src/modules/expenses/expenses.service.ts`)

Only the `paidFromCashRegister && input.storeId` branch changes. Today it's:

```ts
if (input.storeId && store && (paidFromCashRegister || resolvedSource.includes('касса'))) {
  if (store.isMainWarehouse) throw ...;
  const cashGuard = await tx.store.updateMany({ where: { id, cashBalanceTjs: { gte: amountTjs } }, data: { decrement } });
  if (cashGuard.count !== 1) throw new Error('В кассе недостаточно наличных для расхода');
}
```

New shape: the `cashGuard.count !== 1` branch no longer throws. Instead:

- `status` for the new `Expense` row is decided by the guard's outcome:
  `'PAID'` (with `paidAt: now`) when the decrement succeeded, `'UNPAID`
  (`paidAt: null`) when it didn't.
- The owner-profit decrement loop (currently unconditional right after the
  cash block) only runs when the expense ends up `PAID`.
- The `ledgerEntry.create` call (currently unconditional) only runs when the
  expense ends up `PAID` — ledger entries are cash-basis bookkeeping, and
  today nothing reads them back (verified: no `ledgerEntry.findMany` in the
  server), so deferring them to actual payment is safe.
- The `auditLog.create` still always runs, message adjusted to note
  `(не оплачено — недостаточно средств)` when unpaid.
- When the expense ends up `UNPAID`, create one `Notification` per
  `ADMIN`/`PARTNER` role (same fan-out as `transfers.service.ts:100-112`):
  title `"Расход не оплачен"`, message naming the category/amount/store,
  `targetType: 'EXPENSE'`, `targetId: expense.id`, `targetRoute: 'EXPENSES'`.
  Broadcast `NOTIFICATION_CREATED` for each, same as transfers.

The `paidFromCashRegister: false` branch and the no-`storeId` (`BUSINESS`)
branch are untouched — they never entered the cash-guard block, so they
keep creating `PAID` expenses immediately exactly as today.

Internal refactor while touching this: the owner-profit
increment/decrement loop is duplicated across `createExpense`,
`updateExpense`, and `deleteExpense`. Extract it into one
`applyOwnerProfitDelta(tx, amountUsd, sign: 1 | -1)` helper in the same
file and call it from all three plus the new pay action, instead of adding
a fourth copy.

### New: `payExpense` (`server/src/modules/expenses/expenses.service.ts`)

```ts
export async function payExpense(id: string, actorId: string) {
  // load expense, 404 if missing, throw if status !== 'UNPAID'
  // re-run the same store lookup + isMainWarehouse guard + updateMany cash-guard
  //   as createExpense; count !== 1 => throw 'В кассе всё ещё недостаточно наличных'
  // on success: expense.update({ status: 'PAID', paidAt: now })
  // applyOwnerProfitDelta(tx, expense.amountUsd, -1) — using the *stored*
  //   amountUsd/exchangeRate snapshot from creation time, never re-derived
  //   from today's rate (matches the existing per-record USD convention)
  // ledgerEntry.create — same shape createExpense would have made, now
  // notification.updateMany({ where: { targetId: id, targetType: 'EXPENSE' }, data: resolved:true, read:true, ... })
  // notification.create (+broadcast) per ADMIN/PARTNER: "Расход оплачен"
  // auditLog.create: 'EXPENSE_PAID'
}
```

Runs in its own `prisma.$transaction`, same `maxWait`/`timeout` convention
as the other expense mutations.

### `updateExpense` / `deleteExpense`

Both currently touch store cash and owner profit unconditionally whenever
`existing.paidFromCashRegister || sourceAccount.includes('касса')`. Both
gate that on `existing.status === 'PAID'` now — an `UNPAID` expense never
took cash or profit, so editing/deleting it before payment must not
revert/reapply either. Editing an `UNPAID` expense's amount just updates
the stored row; the new amount is what `payExpense` will check against cash
and debit profit for, later. Deleting an `UNPAID` expense also resolves any
open notification for it (`notification.updateMany` as above) so it
doesn't linger in the bell as actionable.

### Route (`server/src/modules/expenses/expenses.routes.ts`)

```
PATCH /api/expenses/:id/pay   (ADMIN, PARTNER)  → payExpense(id, actorId)
  → RealtimeSyncGateway.broadcast('EXPENSE_UPDATED', { expenseId })
```

Mirrors the existing PUT/DELETE handlers' shape exactly.

## Frontend

- `AppContext.tsx`: new `payExpense(id)` following the same
  try/apiClient/refetch/`errorMessage` shape as `updateExpense` /
  `deleteExpense` (refetches `fetchExpenses`, `fetchStores`, `fetchOwners`).
- `ExpensesPage.tsx`:
  - `totalExpensesTjs`/`totalExpensesUsd` filter to `e.status !== 'UNPAID'`
    before summing (legacy rows without a `status` field are treated as
    paid).
  - Each list row: when `exp.status === 'UNPAID'`, show a
    `<Badge tone="danger">Не оплачено</Badge>` next to the category label,
    and (ADMIN/PARTNER only) an "Оплатить" `IconButton`/button next to
    Edit/Delete that calls `payExpense(exp.id)` and shows the existing
    `StatusBanner` success/error message.
  - No new filter pill for "only unpaid" — out of scope per YAGNI; the badge
    is enough to spot them in the existing list.

## Notifications

Reuses the existing `Notification` model/routes/`NotificationsContext` —
no frontend notification plumbing needed, exactly like `TransferRequest`
already demonstrates end-to-end (create → broadcast → bell auto-refetches →
click navigates via `targetRoute`).

## Testing

- Unit/integration (server): extend
  `server/src/modules/financial-regressions.test.ts` or add
  `expenses.service.test.ts` covering: (a) sufficient cash → `PAID` as
  today; (b) insufficient cash → `UNPAID`, no cash delta, no profit delta,
  notification created; (c) `payExpense` on an `UNPAID` row with now-
  sufficient cash → cash debited, profit debited once, notification
  resolved + new one created; (d) `payExpense` still insufficient → throws,
  nothing changes; (e) delete/update of an `UNPAID` row never touches
  cash/profit.
- Manual: run the app, reproduce the original report (create an expense
  against a store with an empty register), confirm it saves as "Не
  оплачено", confirm the admin notification appears, top up the store's
  cash via a sale, click "Оплатить", confirm cash/profit/notification all
  update.
