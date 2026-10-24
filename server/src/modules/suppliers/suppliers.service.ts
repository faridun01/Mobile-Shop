import type { Prisma } from '@prisma/client';
import { D, decimalMax, decimalMin, moneyJson, type MoneyInput } from '../../common/decimal';
import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { requireNonNegativeMoney, requirePositiveMoney, roundMoney } from '../../common/money';
import { requireTodayRate } from '../exchange-rate/exchange-rate.service';
import { lockBonusAccount, lockCashRegister } from '../finance/account.service';
import { readOwnerAllocations, replaceOwnerAllocations } from '../finance/owner-allocations';
import type { OwnerProfitAllocation } from '../sales/profit';
import { cancelTransaction, postTransaction } from '../finance/financial-transaction.service';
import { allocateMoney } from '../../common/allocation';
import { rememberPhones } from '../phone-catalog/phone-catalog.service';
import { canonicalAccessoryCategory, linkTabletVariants } from '../catalog/catalog.service';
import { normalizeBarcode } from '../catalog/purchase-items';
import { isValidImei, isValidSerial, normalizeSerial, requireImei } from '../../common/device-code';
import { syncStockAlerts } from '../stock-thresholds/stock-alerts';

/** True if any of these devices has a sale, transfer, or repair record referencing it (hard FK, no cascade). */
async function deviceHasTransactionHistory(tx: TransactionClient, deviceIds: string[]): Promise<boolean> {
  const [saleItem, transferItem, repairTicket] = await Promise.all([
    tx.saleItem.findFirst({ where: { deviceId: { in: deviceIds } } }),
    tx.transferItem.findFirst({ where: { deviceId: { in: deviceIds } } }),
    tx.repairTicket.findFirst({ where: { deviceId: { in: deviceIds } } }),
  ]);
  return Boolean(saleItem || transferItem || repairTicket);
}

/** Devices of an invoice that were ever sold: their cost is part of a booked sale's profit. */
async function everSoldDevices(tx: TransactionClient, deviceIds: string[]): Promise<Set<string>> {
  if (!deviceIds.length) return new Set();
  const rows = await tx.saleItem.findMany({ where: { deviceId: { in: deviceIds } }, select: { deviceId: true } });
  return new Set(rows.map((row) => row.deviceId));
}

/** An accessory batch can change only while every unit it received is still in it, unreserved. */
const batchUntouched = (batch: { quantityReceived: number; quantityRemaining: number; quantityReserved: number }) =>
  batch.quantityRemaining === batch.quantityReceived && batch.quantityReserved === 0;

/**
 * Money paid on an invoice that no longer stands (deleted, or now cheaper than what was paid)
 * comes back into the Central Cash today: the register and its ledger account move together by
 * one incoming supplier-payment posting, in the dollars it was paid in.
 */
async function refundToCentralCash(
  tx: TransactionClient,
  invoice: { id: string; invoiceNumber: string; supplierId: string },
  supplierName: string,
  amountUsd: Prisma.Decimal,
  actor: Awaited<ReturnType<typeof resolveActor>>,
  reason: string,
) {
  const central = await tx.store.findFirst({ where: { isMainWarehouse: true }, select: { id: true } });
  if (!central) throw new Error('Центральная касса (Главный склад) не найдена');
  const rate = await requireTodayRate(tx);
  const { store, account } = await lockCashRegister(tx, central.id, actor, 'возврат оплаты поставщика');
  await tx.store.update({ where: { id: store.id }, data: { cashBalanceUsd: { increment: amountUsd } } });
  const description = `${reason}: $${amountUsd} возвращено в Центральную кассу (${supplierName}, накладная ${invoice.invoiceNumber})`;
  await postTransaction(tx, {
    type: 'SUPPLIER_PAYMENT', direction: 'IN', numberPrefix: 'SR',
    accountId: account.id, balanceCurrency: 'USD',
    amount: amountUsd, currency: 'USD', exchangeRate: rate,
    amountTjs: roundMoney(amountUsd.mul(rate)), amountUsd,
    categoryName: 'Возврат оплаты поставщика',
    counterpartyType: 'SUPPLIER', counterpartyId: invoice.supplierId, counterpartyName: supplierName,
    shopId: store.id, sourceType: 'SUPPLIER_REFUND', sourceId: invoice.id,
    description, createdByUserId: actor.id,
  });
  await tx.ledgerEntry.create({
    data: { type: 'SUPPLIER_PAYMENT', description, amountUsd, exchangeRate: rate, storeId: store.id, storeName: store.name, userName: actor.name, referenceId: invoice.id },
  });
}

/** Takes `amountUsd` off the payments allocated to an invoice, the latest payments first. */
async function releaseInvoiceAllocations(tx: TransactionClient, invoiceId: string, amountUsd: Prisma.Decimal) {
  let left = amountUsd;
  const rows = await tx.supplierPaymentAllocation.findMany({ where: { invoiceId }, orderBy: { payment: { createdAt: 'desc' } } });
  for (const row of rows) {
    if (left.lte(0)) break;
    const take = decimalMin(row.allocatedAmountUsd, left);
    if (D(take).eq(row.allocatedAmountUsd)) await tx.supplierPaymentAllocation.delete({ where: { id: row.id } });
    else await tx.supplierPaymentAllocation.update({ where: { id: row.id }, data: { allocatedAmountUsd: { decrement: take } } });
    left = roundMoney(left.minus(take));
  }
}

/** The invoice's phone/tablet lines, rebuilt from its devices: one line per model, colour and price. */
async function rebuildInvoiceGroups(tx: TransactionClient, invoiceId: string) {
  const devices = await tx.device.findMany({ where: { purchaseInvoiceId: invoiceId }, orderBy: { id: 'asc' } });
  const groups = new Map<string, { brand: string; model: string; ram: string | null; storage: string; color: string; purchasePriceUsd: Prisma.Decimal; quantity: number }>();
  for (const d of devices) {
    const key = [d.brand, d.model, d.ram ?? '', d.storage, d.color, D(d.purchasePriceUsd).toFixed(2)].join('|');
    const group = groups.get(key);
    if (group) group.quantity += 1;
    else groups.set(key, { brand: d.brand, model: d.model, ram: d.ram, storage: d.storage, color: d.color, purchasePriceUsd: D(d.purchasePriceUsd), quantity: 1 });
  }
  await tx.invoiceGroup.deleteMany({ where: { invoiceId } });
  for (const group of groups.values()) await tx.invoiceGroup.create({ data: { invoiceId, ...group } });
}

/**
 * A cash supplier bonus is company money held on the Bonus Account: credited there once, by one
 * ledger posting at the bonus's own rate (never through a store register or a collection).
 */
async function creditBonusAccount(tx: TransactionClient, bonus: { id: string; amountUsd: MoneyInput; exchangeRate: MoneyInput }, supplier: { id: string; name: string }, actorId: string) {
  const account = await lockBonusAccount(tx);
  const amountUsd = D(bonus.amountUsd);
  return postTransaction(tx, {
    type: 'INCOME', direction: 'IN', numberPrefix: 'CR',
    accountId: account.id, balanceCurrency: 'USD',
    amount: amountUsd, currency: 'USD', exchangeRate: bonus.exchangeRate,
    amountTjs: roundMoney(amountUsd.mul(bonus.exchangeRate)), amountUsd,
    categoryName: 'Бонус поставщика',
    counterpartyType: 'SUPPLIER', counterpartyId: supplier.id, counterpartyName: supplier.name,
    sourceType: 'SUPPLIER_BONUS', sourceId: bonus.id,
    description: `Денежный бонус от ${supplier.name}`,
    createdByUserId: actorId,
  });
}

/** Takes a cash bonus's credit back off the Bonus Account (reversal with its original amounts), refusing to overdraw it. */
async function reverseBonusAccountCredit(tx: TransactionClient, transactionId: string, amountUsd: MoneyInput, actorId: string) {
  const account = await lockBonusAccount(tx);
  if (D(account.balanceUsd).lt(amountUsd)) {
    throw new Error(`На Бонусном счёте недостаточно средств ($${account.balanceUsd}) для сторно бонуса ($${D(amountUsd)})`);
  }
  await cancelTransaction(tx, transactionId, actorId);
}

interface PaySupplierInput {
  supplierId: string;
  amountUsd: MoneyInput;
  // Always a store's (or the main warehouse's) cash register — the company-wide
  // «Главный счёт» was removed, so there is no other place a payment can come from.
  sourceAccount: 'STORE_CASH';
  storeId: string;
  note?: string;
  createdByUserId: string;
}

interface SupplierBonusInput {
  supplierId: string;
  campaignTitle?: string;
  bonusType: 'FREE_DEVICES' | 'CASH_DISCOUNT';
  amountUsd?: MoneyInput;
  freeDevices?: { brand: string; model: string; ram?: string; storage: string; color: string; imei: string; costBasisUsd?: MoneyInput }[];
  destinationStoreId?: string;
  createdByUserId: string;
}

async function recordSupplierAudit(tx: TransactionClient, actorId: string | undefined, action: string, targetId: string, before: unknown, after: unknown) {
  if (!actorId) return;
  const actor = await resolveActor(tx, actorId);
  await tx.auditLog.create({ data: { userId: actor.id, userName: actor.name, userRole: actor.role, action, targetId,
    details: action, financialDetails: moneyJson({ before, after }) } });
}

export interface DeviceSpecInput { deviceId: string; brand: string; model: string; ram?: string | null; storage: string; color: string }
export interface AccessoryNameInput { productId: string; brand: string; name: string; category: string; barcode?: string }
/** A unit's IMEI 1/2 (a tablet's SN and additional SN) as corrected. */
export interface DeviceCodeInput { deviceId: string; imei: string; imei2?: string | null }

const specText = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');
const specLabel = (d: { brand: string; model: string; ram?: string | null; storage: string; color: string }) =>
  [d.brand, d.model, d.ram, d.storage, d.color].filter(Boolean).join(' ');

/** The name and specs as typed, checked by the receipt's own rules for a phone or a tablet. */
function deviceSpec(entry: DeviceSpecInput, category: string) {
  const spec = { brand: specText(entry.brand), model: specText(entry.model), ram: specText(entry.ram) || null, storage: specText(entry.storage), color: specText(entry.color) };
  if (category === 'TABLET') {
    if (!spec.brand || !spec.model || !spec.storage || !spec.color) throw new Error('У планшета должны быть бренд, модель, встроенная память и цвет');
  } else if (!spec.brand || !spec.model || !spec.ram || !spec.storage) {
    throw new Error('У телефона должны быть бренд, модель, RAM и память');
  }
  return spec;
}

/** Accessory cards that some other invoice (or a receipt without one) also brought in. */
async function productsOnOtherInvoices(tx: TransactionClient, invoiceId: string, productIds: string[]) {
  if (!productIds.length) return new Set<string>();
  const other = await tx.accessoryBatch.findMany({
    where: { productId: { in: productIds }, OR: [{ purchaseInvoiceId: { not: invoiceId } }, { purchaseInvoiceId: null }] },
    select: { productId: true },
    distinct: ['productId'],
  });
  return new Set(other.map((b) => b.productId));
}

/**
 * Fixes names typed wrong at receipt. A device that was ever sold keeps the name on its receipt
 * and in the reports, so only units not sold yet change (as with prices); the IMEI catalog and
 * the tablet variants learn the right name. An accessory card is renamed only when this invoice
 * alone brought it in. Money does not move. Returns the changes for the audit log.
 */
async function renameInvoiceItems(tx: TransactionClient, invoiceId: string, specs: DeviceSpecInput[], accessoryNames: AccessoryNameInput[], codes: DeviceCodeInput[] = []) {
  const renames = new Set<string>();
  if (codes.length) for (const change of await recodeInvoiceDevices(tx, invoiceId, codes)) renames.add(change);
  if (specs.length) {
    const devices = await tx.device.findMany({ where: { purchaseInvoiceId: invoiceId } });
    const byId = new Map(devices.map((d) => [d.id, d]));
    const sold = await everSoldDevices(tx, devices.map((d) => d.id));
    const renamed: (typeof devices)[number][] = [];
    for (const entry of specs) {
      const device = byId.get(entry.deviceId);
      if (!device) throw new Error('Устройство не относится к этой накладной');
      const spec = deviceSpec(entry, device.category);
      if (specLabel(spec) === specLabel(device)) continue;
      if (sold.has(device.id)) throw new Error(`${device.brand} ${device.model} (${device.category === 'TABLET' ? 'SN' : 'IMEI'} ${device.imei}) уже продавался — его название в чеке не меняется`);
      await tx.device.update({ where: { id: device.id }, data: spec });
      renamed.push({ ...device, ...spec });
      renames.add(`${specLabel(device)} → ${specLabel(spec)}`);
    }
    if (renamed.length) {
      await rememberPhones(tx, renamed);
      await linkTabletVariants(tx, renamed);
      await rebuildInvoiceGroups(tx, invoiceId);
      // A minimum-stock rule is per model: the counts move to the right name.
      await syncStockAlerts(tx, [...new Set(renamed.map((d) => d.storeId).filter((s): s is string => Boolean(s)))]);
    }
  }
  if (accessoryNames.length) {
    const own = new Set((await tx.accessoryBatch.findMany({ where: { purchaseInvoiceId: invoiceId }, select: { productId: true } })).map((b) => b.productId));
    const shared = await productsOnOtherInvoices(tx, invoiceId, [...own]);
    for (const entry of accessoryNames) {
      if (!own.has(entry.productId)) throw new Error('Аксессуар не относится к этой накладной');
      const product = await tx.accessoryProduct.findUniqueOrThrow({ where: { id: entry.productId } });
      const barcode = entry.barcode === undefined ? product.barcode : normalizeBarcode(entry.barcode);
      const next = { brand: specText(entry.brand), name: specText(entry.name), category: await canonicalAccessoryCategory(tx, specText(entry.category)), barcode };
      if (!next.name) throw new Error('Укажите название аксессуара');
      if (!next.category) throw new Error('Укажите категорию аксессуара');
      if (!barcode) throw new Error('Укажите штрихкод аксессуара');
      if (barcode.length > 64) throw new Error(`Штрихкод аксессуара слишком длинный: ${barcode}`);
      if (next.brand === product.brand && next.name === product.name && next.category === product.category && barcode === product.barcode) continue;
      if (shared.has(entry.productId)) throw new Error(`«${product.name}» (штрихкод ${product.barcode}) есть и в других приходах — его название и штрихкод здесь не меняются`);
      if (barcode !== product.barcode) {
        const taken = await tx.accessoryProduct.findUnique({ where: { barcode } });
        if (taken) throw new Error(`Штрихкод ${barcode} уже у товара «${[taken.brand, taken.name].filter(Boolean).join(' ')}»`);
      }
      await tx.accessoryProduct.update({ where: { id: product.id }, data: next });
      if (next.brand !== product.brand || next.name !== product.name || next.category !== product.category) {
        renames.add(`${[product.brand, product.name].filter(Boolean).join(' ')} → ${[next.brand, next.name].filter(Boolean).join(' ')}`);
      }
      if (barcode !== product.barcode) renames.add(`штрихкод ${product.barcode} → ${barcode}`);
    }
  }
  return [...renames];
}

/**
 * Fixes IMEIs (a tablet's SNs) typed wrong at receipt, by the receipt's own rules. A unit that was
 * sold, repaired or is being moved keeps its code: its receipt, ticket or transfer names it. Codes
 * stay unique across every device (both slots); codes swapped between two units of the invoice are
 * written in two steps so they never collide. The IMEI catalog learns the right TAC.
 */
async function recodeInvoiceDevices(tx: TransactionClient, invoiceId: string, codes: DeviceCodeInput[]) {
  const devices = await tx.device.findMany({ where: { purchaseInvoiceId: invoiceId } });
  const byId = new Map(devices.map((d) => [d.id, d]));
  const sold = await everSoldDevices(tx, devices.map((d) => d.id));
  const repaired = new Set((await tx.repairTicket.findMany({ where: { deviceId: { in: devices.map((d) => d.id) } }, select: { deviceId: true } })).map((r) => r.deviceId));
  const label = (d: { category: string }, slot: 1 | 2) => (d.category === 'TABLET' ? (slot === 1 ? 'SN' : 'Доп. SN') : slot === 1 ? 'IMEI' : 'IMEI 2');
  const changed: { device: (typeof devices)[number]; imei: string; imei2: string | null }[] = [];
  for (const entry of codes) {
    const device = byId.get(entry.deviceId);
    if (!device) throw new Error('Устройство не относится к этой накладной');
    const tablet = device.category === 'TABLET';
    const clean = (raw: unknown) => (tablet ? normalizeSerial(raw) : String(raw ?? '').replace(/\s+/g, ''));
    const imei = clean(entry.imei);
    const imei2 = clean(entry.imei2) || null;
    const valid = (code: string) => (tablet ? isValidSerial(code) : isValidImei(code));
    if (!valid(imei)) throw new Error(tablet ? `SN «${imei}» должен состоять из 4–64 букв и цифр` : `IMEI «${imei}» должен содержать ровно 15 цифр`);
    if (imei2 && !valid(imei2)) throw new Error(tablet ? `Доп. SN «${imei2}» должен состоять из 4–64 букв и цифр` : `IMEI 2 «${imei2}» должен содержать ровно 15 цифр`);
    if (imei2 === imei) throw new Error(`${label(device, 1)} и ${label(device, 2)} совпадают: ${imei}`);
    if (imei === device.imei && imei2 === (device.imei2 || null)) continue;
    const name = `${device.brand} ${device.model} (${label(device, 1)} ${device.imei})`;
    if (sold.has(device.id)) throw new Error(`${name} уже продавался — его ${label(device, 1)} указан в чеке и не меняется`);
    if (repaired.has(device.id) || device.status === 'IN_REPAIR') throw new Error(`${name} был в ремонте — его ${label(device, 1)} указан в квитанции и не меняется`);
    if (device.status === 'TRANSFER_PENDING') throw new Error(`${name} в незавершённом перемещении — сначала подтвердите или отклоните его`);
    changed.push({ device, imei, imei2 });
  }
  if (!changed.length) return [];
  const newCodes = changed.flatMap((c) => [c.imei, c.imei2]).filter((c): c is string => Boolean(c));
  if (new Set(newCodes).size !== newCodes.length) throw new Error('Один и тот же IMEI/SN указан дважды');
  const changedIds = changed.map((c) => c.device.id);
  const taken = await tx.device.findFirst({
    where: { id: { notIn: changedIds }, OR: newCodes.flatMap((code) => [{ imei: code }, { imei2: code }]) },
    select: { imei: true, imei2: true, category: true, brand: true, model: true },
  });
  if (taken) {
    const code = newCodes.find((c) => c === taken.imei || c === taken.imei2) ?? taken.imei;
    throw new Error(`${taken.category === 'TABLET' ? 'SN' : 'IMEI'} ${code} уже зарегистрирован (${taken.brand} ${taken.model})`);
  }
  // Two steps, so codes moved from one unit of the invoice to another never collide on the way.
  for (const c of changed) await tx.device.update({ where: { id: c.device.id }, data: { imei: `RECODE-${c.device.id}`, imei2: null } });
  for (const c of changed) await tx.device.update({ where: { id: c.device.id }, data: { imei: c.imei, imei2: c.imei2 } });
  await rememberPhones(tx, changed.map((c) => ({ ...c.device, imei: c.imei, imei2: c.imei2 })));
  return changed.map((c) => {
    const before = [c.device.imei, c.device.imei2].filter(Boolean).join('/');
    const after = [c.imei, c.imei2].filter(Boolean).join('/');
    return `${c.device.brand} ${c.device.model}: ${label(c.device, 1)} ${before} → ${after}`;
  });
}


export class SuppliersService {
  public static async create(input: { name: string; phone?: string; contactPerson?: string }, actorId?: string) {
    const name = input.name?.trim();
    if (!name) throw new Error('Укажите название поставщика');
    return prisma.$transaction(async tx => {
      const result = await tx.supplier.create({ data: { name, phone: input.phone, contactPerson: input.contactPerson } });
      await recordSupplierAudit(tx, actorId, 'SUPPLIER_CREATE', result.id, null, result);
      return result;
    });
  }

  /** FIFO allocation across the supplier's open invoices, oldest first. */
  public static async pay(input: PaySupplierInput) {
    const amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма оплаты');
    if (input.sourceAccount !== 'STORE_CASH') throw new Error('Некорректный источник оплаты');
    if (!input.storeId) throw new Error('Выберите кассу, из которой оплатить');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const exchangeRate = await requireTodayRate(tx);
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');
      if (D(amountUsd).gt(supplier.totalDebtUsd)) throw new Error('Сумма оплаты превышает задолженность поставщику');

      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE "supplierId" = ${input.supplierId} ORDER BY id FOR UPDATE`;
      const openInvoices = await tx.supplierInvoice.findMany({
        where: { supplierId: input.supplierId },
        orderBy: { date: 'asc' },
      });

      let remainingToPay = amountUsd;
      const allocations: { invoiceId: string; invoiceNumber: string; allocatedAmountUsd: MoneyInput }[] = [];

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: input.supplierId,
          amountUsd,
          exchangeRate,
          sourceAccount: input.sourceAccount,
          storeId: input.storeId,
          createdByUserId: actor.id,
        },
      });

      for (const invoice of openInvoices) {
        if (D(remainingToPay).lte(0)) break;
        const remainingOnInvoice = roundMoney(D(invoice.totalAmountUsd).minus(invoice.paidAmountUsd));
        if (D(remainingOnInvoice).lte(0)) continue;

        const payForThis = decimalMin(remainingOnInvoice, remainingToPay);
        const invoiceGuard = await tx.supplierInvoice.updateMany({
          where: { id: invoice.id, paidAmountUsd: invoice.paidAmountUsd, totalAmountUsd: invoice.totalAmountUsd },
          data: { paidAmountUsd: { increment: payForThis } },
        });
        if (invoiceGuard.count !== 1) throw new Error('Накладная оплачивается параллельно, обновите данные и повторите оплату');
        await tx.supplierPaymentAllocation.create({
          data: { paymentId: payment.id, invoiceId: invoice.id, allocatedAmountUsd: payForThis },
        });
        allocations.push({ invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, allocatedAmountUsd: payForThis });
        remainingToPay = roundMoney(D(remainingToPay).minus(payForThis));
      }
      if (!D(remainingToPay).eq(0)) throw new Error('Долг поставщика не совпадает с остатками накладных. Требуется сверка');

      const debtGuard = await tx.supplier.updateMany({
        where: { id: input.supplierId, totalDebtUsd: { gte: amountUsd } },
        data: {
          totalPaidUsd: { increment: amountUsd },
          totalDebtUsd: { decrement: amountUsd },
        },
      });
      if (!D(debtGuard.count).eq(1)) throw new Error('Задолженность изменилась, обновите данные и повторите оплату');

      const { store, account: financeAccount } = await lockCashRegister(tx, input.storeId, actor, 'оплата поставщику');
      if (store.isMainWarehouse === false) {
        throw new Error('Оплата поставщикам производится только из Центральной кассы. Розничные кассы не используются для расчетов с поставщиками.');
      }
      // Supplier payments are funded strictly from the central cash register (Main Warehouse account).
      const cashGuard = await tx.store.updateMany({ where: { id: input.storeId, cashBalanceUsd: { gte: amountUsd } }, data: { cashBalanceUsd: { decrement: amountUsd } } });
      if (!D(cashGuard.count).eq(1)) throw new Error('В центральной кассе недостаточно наличных для оплаты поставщику');

      await postTransaction(tx, {
        type: 'SUPPLIER_PAYMENT',
        direction: 'OUT',
        numberPrefix: 'SP',
        accountId: financeAccount.id,
        balanceCurrency: 'USD',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs: roundMoney(D(amountUsd).mul(exchangeRate)),
        amountUsd,
        categoryName: 'Оплата поставщику',
        counterpartyType: 'SUPPLIER',
        counterpartyId: supplier.id,
        counterpartyName: supplier.name,
        shopId: input.storeId,
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: payment.id,
        description: `Выплата поставщику ${supplier.name}: $${amountUsd} (Центральная касса)`,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'SUPPLIER_PAYMENT',
          description: `Выплата поставщику ${supplier.name}: $${amountUsd}`,
          amountUsd: D(amountUsd).negated(),
          exchangeRate,
          storeId: input.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: payment.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SUPPLIER_PAYMENT',
          details: `Проведена оплата поставщику ${supplier.name} на сумму $${amountUsd}. Распределено по FIFO: ${allocations
            .map((a) => `${a.invoiceNumber} ($${a.allocatedAmountUsd})`)
            .join(', ')}`,
          financialDetails: moneyJson({ amountUsd, exchangeRate }),
          targetId: payment.id,
        },
      });

      return { payment, allocations };
    }, { maxWait: 10000, timeout: 25000 });
  }

  /** Pays a single specific invoice directly, instead of FIFO across all open invoices. */
  public static async payInvoice(input: { invoiceId: string; amountUsd: MoneyInput; sourceAccount: 'STORE_CASH'; storeId: string; createdByUserId: string }) {
    const amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма оплаты');
    if (input.sourceAccount !== 'STORE_CASH') throw new Error('Некорректный источник оплаты');
    if (!input.storeId) throw new Error('Выберите кассу, из которой оплатить');

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const exchangeRate = await requireTodayRate(tx);
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${input.invoiceId} FOR UPDATE`;
      const invoice = await tx.supplierInvoice.findUnique({ where: { id: input.invoiceId } });
      if (!invoice) throw new Error('Накладная не найдена');
      const supplier = await tx.supplier.findUnique({ where: { id: invoice.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');

      const remainingOnInvoice = roundMoney(D(invoice.totalAmountUsd).minus(invoice.paidAmountUsd));
      if (D(amountUsd).gt(remainingOnInvoice)) throw new Error('Сумма оплаты превышает остаток долга по накладной');

      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: invoice.supplierId,
          amountUsd,
          exchangeRate,
          sourceAccount: input.sourceAccount,
          storeId: input.storeId,
          createdByUserId: actor.id,
        },
      });

      const invoiceGuard = await tx.supplierInvoice.updateMany({
        where: { id: input.invoiceId, paidAmountUsd: invoice.paidAmountUsd, totalAmountUsd: invoice.totalAmountUsd },
        data: { paidAmountUsd: { increment: amountUsd } },
      });
      if (invoiceGuard.count !== 1) throw new Error('Данные накладной изменились, обновите страницу и повторите оплату');

      await tx.supplierPaymentAllocation.create({
        data: { paymentId: payment.id, invoiceId: invoice.id, allocatedAmountUsd: amountUsd },
      });

      const debtGuard = await tx.supplier.updateMany({
        where: { id: invoice.supplierId, totalDebtUsd: { gte: amountUsd } },
        data: {
          totalPaidUsd: { increment: amountUsd },
          totalDebtUsd: { decrement: amountUsd },
        },
      });
      if (!D(debtGuard.count).eq(1)) throw new Error('Задолженность изменилась, обновите данные и повторите оплату');

      const { store, account: financeAccount } = await lockCashRegister(tx, input.storeId, actor, 'оплата поставщику');
      if (store.isMainWarehouse === false) {
        throw new Error('Оплата поставщикам производится только из Центральной кассы. Розничные кассы не используются для расчетов с поставщиками.');
      }
      const cashGuard = await tx.store.updateMany({ where: { id: input.storeId, cashBalanceUsd: { gte: amountUsd } }, data: { cashBalanceUsd: { decrement: amountUsd } } });
      if (!D(cashGuard.count).eq(1)) throw new Error('В центральной кассе недостаточно наличных для оплаты накладной');

      await postTransaction(tx, {
        type: 'SUPPLIER_PAYMENT',
        direction: 'OUT',
        numberPrefix: 'SP',
        accountId: financeAccount.id,
        balanceCurrency: 'USD',
        amount: amountUsd,
        currency: 'USD',
        exchangeRate,
        amountTjs: roundMoney(D(amountUsd).mul(exchangeRate)),
        amountUsd,
        categoryName: 'Оплата поставщику',
        counterpartyType: 'SUPPLIER',
        counterpartyId: supplier.id,
        counterpartyName: supplier.name,
        shopId: input.storeId,
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: payment.id,
        description: `Выплата поставщику ${supplier.name} по накладной ${invoice.invoiceNumber}: $${amountUsd}`,
        createdByUserId: actor.id,
        guardBalance: true,
      });

      await tx.ledgerEntry.create({
        data: {
          type: 'SUPPLIER_PAYMENT',
          description: `Выплата поставщику ${supplier.name} по накладной ${invoice.invoiceNumber}: $${amountUsd}`,
          amountUsd: D(amountUsd).negated(),
          exchangeRate,
          storeId: input.storeId,
          storeName: store?.name,
          userName: actor.name,
          referenceId: payment.id,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SUPPLIER_PAYMENT',
          details: `Проведена оплата поставщику ${supplier.name} по накладной ${invoice.invoiceNumber} на сумму $${amountUsd}`,
          financialDetails: moneyJson({ amountUsd, exchangeRate }),
          targetId: payment.id,
        },
      });

      return { payment, invoiceId: invoice.id };
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async createBonus(input: SupplierBonusInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const exchangeRate = await requireTodayRate(tx);
      const supplier = await tx.supplier.findUnique({ where: { id: input.supplierId } });
      if (!supplier) throw new Error('Поставщик не найден');
      if (!['FREE_DEVICES', 'CASH_DISCOUNT'].includes(input.bonusType)) throw new Error('Некорректный тип бонуса');
      if (input.bonusType === 'CASH_DISCOUNT') input.amountUsd = requirePositiveMoney(input.amountUsd, 'Сумма бонуса');
      // Supplier bonuses are nobody's income: they are recorded and reported only, never
      // accrued to an owner, a register or a payout (zeroed on the Bonuses page each quarter).
      const ownerProfitAllocations: OwnerProfitAllocation[] = [];

      const bonus = await tx.supplierBonus.create({
        data: {
          supplierId: input.supplierId,
          campaignTitle: input.campaignTitle,
          bonusType: input.bonusType,
          ownerProfitAllocations: moneyJson(ownerProfitAllocations),
          amountUsd: input.amountUsd,
          exchangeRate,
          status: 'IN_STOCK',
        },
      });

      if (input.bonusType === 'FREE_DEVICES' && input.freeDevices?.length) {
        for (const d of input.freeDevices) d.imei = requireImei(d.imei, `IMEI бонусного устройства (${d.brand} ${d.model})`);
        const imeis = input.freeDevices.map((d) => d.imei);
        const existing = await tx.device.findFirst({ where: { OR: imeis.flatMap((imei) => [{ imei }, { imei2: imei }]) } });
        if (existing) throw new Error(`IMEI ${existing.imei} уже зарегистрирован`);

        // Bug: this used to infer status from whether destinationStoreId was merely PROVIDED,
        // not from what it actually points at — so explicitly picking "Главный склад" as the
        // destination (a valid dropdown option, not just the default) produced a device stuck
        // at the main warehouse with STORE_STOCK status, which every consumer keys off store
        // type for (sale eligibility, transfer source matching, inventory grouping...).
        const storeId = input.destinationStoreId ?? 'main-warehouse';
        const destinationStore = await tx.store.findUnique({ where: { id: storeId } });
        if (!destinationStore) throw new Error('Склад назначения не найден');
        const targetStatus = destinationStore.isMainWarehouse ? ('MAIN_WAREHOUSE' as const) : ('STORE_STOCK' as const);

        for (const device of input.freeDevices) {
          if (!device.ram || !String(device.ram).trim()) {
            throw new Error('RAM обязателен для каждого устройства');
          }
          // A free phone costs nothing: no debt, cash or capital stands behind it, so a cost would add
          // stock out of thin air. Its whole price goes to the bonus pool when it is sold.
          const costBasisUsd = requireNonNegativeMoney(device.costBasisUsd ?? 0, 'Себестоимость бонусного устройства');
          if (costBasisUsd.gt(0)) throw new Error('Бонусное устройство поступает бесплатно: себестоимость должна быть 0');
          const created = await tx.device.create({
            data: {
              imei: device.imei,
              brand: device.brand,
              model: device.model,
              ram: String(device.ram).trim(),
              storage: device.storage,
              color: device.color,
              status: targetStatus,
              storeId,
              purchasePriceUsd: D(0),
              costBasisUsd,
              isBonus: true,
              bonusCampaign: input.campaignTitle,
              supplierId: input.supplierId,
              supplierName: supplier.name,
              timeline: { create: [{ type: 'BONUS', description: `Бонусное устройство от ${supplier.name}`, userName: actor.name }] },
            },
          });
          await tx.supplierBonusDevice.create({
            data: { bonusId: bonus.id, deviceId: created.id, brand: device.brand, model: device.model, storage: device.storage, color: device.color, imei: device.imei, costBasisUsd },
          });
          await rememberPhones(tx, [created]);
          await syncStockAlerts(tx, [storeId]);
        }
      }
      // A cash bonus is no owner profit and never passes through a store register: it is
      // credited once to the Bonus Account.
      let created = bonus;
      if (input.bonusType === 'CASH_DISCOUNT') {
        const posting = await creditBonusAccount(tx, { id: bonus.id, amountUsd: input.amountUsd!, exchangeRate }, supplier, actor.id);
        created = await tx.supplierBonus.update({ where: { id: bonus.id }, data: { bonusAccountTransactionId: posting.id } });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'SUPPLIER_BONUS',
          details: `Зафиксирован бонус от ${supplier.name}${input.amountUsd ? `: $${input.amountUsd}, зачислен на Бонусный счёт` : ''}`,
          financialDetails: moneyJson(input.amountUsd ? { amountUsd: input.amountUsd, exchangeRate } : { exchangeRate }),
          targetId: bonus.id,
        },
      });

      return created;
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * CASH_DISCOUNT amount edits move the Bonus Account by the difference: the old credit is
   * reversed and the new amount credited, each through the ledger. A bonus booked before bonuses
   * stopped being owner income still carries its old owner accrual: an amount edit reverses that
   * accrual (with its journal entry) and does not book a new one; a bonus recorded before cash
   * bonuses were credited to the Bonus Account is not credited by an edit. FREE_DEVICES edits are
   * blocked once the underlying device has any transaction history (sold, transferred,
   * sent to repair) — the bonus record isn't the source of truth for that device anymore.
   */
  public static async updateBonus(id: string, input: { campaignTitle?: string; amountUsd?: MoneyInput; freeDevice?: { brand?: string; model?: string; storage?: string; color?: string; imei?: string; imei2?: string }; actorUserId: string }) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_bonuses WHERE id = ${id} FOR UPDATE`;
      const actor = await resolveActor(tx, input.actorUserId);
      const bonus = await tx.supplierBonus.findUnique({ where: { id }, include: { freeDevices: true, supplier: { select: { name: true } } } });
      if (!bonus) throw new Error('Бонус не найден');

      const data: { campaignTitle?: string | null; amountUsd?: MoneyInput; ownerProfitAllocations?: OwnerProfitAllocation[]; bonusAccountTransactionId?: string } = {};
      if (input.campaignTitle !== undefined) data.campaignTitle = input.campaignTitle.trim() || null;

      if (bonus.bonusType === 'CASH_DISCOUNT') {
        if (input.amountUsd !== undefined) {
          const newAmountUsd = requirePositiveMoney(input.amountUsd, 'Сумма бонуса');
          const oldAmountUsd = bonus.amountUsd || 0;
          const previous = readOwnerAllocations(bonus.ownerProfitAllocations);
          if (!D(newAmountUsd).eq(oldAmountUsd) && previous.length > 0) {
            await replaceOwnerAllocations(tx, previous, [], 1, true);
            data.ownerProfitAllocations = [];
            await tx.ledgerEntry.create({
              data: { type: 'SUPPLIER_BONUS', description: `Сторно (правка бонуса от ${bonus.supplier.name}, бонусы больше не доход владельцев): −$${oldAmountUsd}`, amountUsd: D(oldAmountUsd).negated(), exchangeRate: bonus.exchangeRate, userName: actor.name, referenceId: id },
            });
          }
          if (bonus.bonusAccountTransactionId && !D(newAmountUsd).eq(oldAmountUsd)) {
            // Only the decrease must be covered by the account (the new credit lands in the same transaction).
            const decrease = D(oldAmountUsd).minus(newAmountUsd);
            await reverseBonusAccountCredit(tx, bonus.bonusAccountTransactionId, decrease.gt(0) ? decrease : 0, actor.id);
            const posting = await creditBonusAccount(tx, { id, amountUsd: newAmountUsd, exchangeRate: bonus.exchangeRate }, { id: bonus.supplierId, name: bonus.supplier.name }, actor.id);
            data.bonusAccountTransactionId = posting.id;
          }
          data.amountUsd = newAmountUsd;
        }
      } else if (bonus.bonusType === 'FREE_DEVICES' && input.freeDevice) {
        const bonusDevice = bonus.freeDevices[0];
        if (!bonusDevice) throw new Error('У этого бонуса нет привязанного устройства');
        if (bonusDevice.deviceId) {
          const hasHistory = await deviceHasTransactionHistory(tx, [bonusDevice.deviceId]);
          if (hasHistory) throw new Error('Нельзя редактировать: устройство уже продано, перемещено или отправлено в ремонт');
        }

        // A typed IMEI is exactly 15 digits, both slots; neither may be another device's.
        const newImei = input.freeDevice.imei?.trim() ? requireImei(input.freeDevice.imei) : undefined;
        const newImei2 = input.freeDevice.imei2?.trim() ? requireImei(input.freeDevice.imei2, 'IMEI 2') : undefined;
        if (newImei2 && newImei2 === (newImei ?? bonusDevice.imei)) throw new Error('IMEI 1 и IMEI 2 совпадают');
        for (const code of [newImei !== bonusDevice.imei ? newImei : undefined, newImei2]) {
          if (!code) continue;
          const existing = await tx.device.findFirst({
            where: { AND: [{ id: { not: bonusDevice.deviceId ?? undefined } }, { OR: [{ imei: code }, { imei2: code }] }] },
          });
          if (existing) throw new Error(`IMEI ${code} уже зарегистрирован`);
        }

        const deviceUpdate: Record<string, string | null> = {};
        const bonusDeviceUpdate: Record<string, string> = {};
        if (input.freeDevice.brand !== undefined) { deviceUpdate.brand = input.freeDevice.brand; bonusDeviceUpdate.brand = input.freeDevice.brand; }
        if (input.freeDevice.model !== undefined) { deviceUpdate.model = input.freeDevice.model; bonusDeviceUpdate.model = input.freeDevice.model; }
        if (input.freeDevice.storage !== undefined) { deviceUpdate.storage = input.freeDevice.storage; bonusDeviceUpdate.storage = input.freeDevice.storage; }
        if (input.freeDevice.color !== undefined) { deviceUpdate.color = input.freeDevice.color; bonusDeviceUpdate.color = input.freeDevice.color; }
        if (newImei) { deviceUpdate.imei = newImei; bonusDeviceUpdate.imei = newImei; }
        if (input.freeDevice.imei2 !== undefined) { deviceUpdate.imei2 = newImei2 ?? null; }
        if (input.campaignTitle !== undefined) deviceUpdate.bonusCampaign = input.campaignTitle.trim() || null;

        if (bonusDevice.deviceId && Object.keys(deviceUpdate).length > 0) {
          await tx.device.update({ where: { id: bonusDevice.deviceId }, data: deviceUpdate });
        }
        if (D(Object.keys(bonusDeviceUpdate).length).gt(0)) {
          await tx.supplierBonusDevice.update({ where: { id: bonusDevice.id }, data: bonusDeviceUpdate });
        }
      }

      const updated = await tx.supplierBonus.update({ where: { id }, data, include: { freeDevices: true, supplier: { select: { name: true } } } });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'BONUS_EDIT',
          details: `Отредактирован бонус от ${bonus.supplier.name}`,
          targetId: id,
        },
      });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * FREE_DEVICES bonuses can't be deleted once the device they created has any
   * transaction history — same guard as deleting a supplier outright, for the same
   * reason (SaleItem/TransferItem/RepairTicket hold a hard FK with no cascade).
   * CASH_DISCOUNT deletes reverse the Bonus Account credit (refused if the account no longer
   * holds it) and, for old bonuses, the owner-profit accrual booked at creation.
   */
  public static async deleteBonus(id: string, actorUserId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_bonuses WHERE id = ${id} FOR UPDATE`;
      const actor = await resolveActor(tx, actorUserId);
      const bonus = await tx.supplierBonus.findUnique({ where: { id }, include: { freeDevices: true, supplier: { select: { name: true } } } });
      if (!bonus) throw new Error('Бонус не найден');

      if (bonus.bonusType === 'FREE_DEVICES') {
        const deviceIds = bonus.freeDevices.map((d) => d.deviceId).filter((v): v is string => Boolean(v));
        if (deviceIds.length > 0) {
          const hasHistory = await deviceHasTransactionHistory(tx, deviceIds);
          if (hasHistory) throw new Error('Нельзя удалить бонус: устройство уже продано, перемещено или отправлено в ремонт');
          await tx.deviceTimelineEvent.deleteMany({ where: { deviceId: { in: deviceIds } } });
          await tx.device.deleteMany({ where: { id: { in: deviceIds } } });
        }
      }
      if (bonus.bonusType === 'CASH_DISCOUNT' && bonus.bonusAccountTransactionId && bonus.amountUsd) {
        await reverseBonusAccountCredit(tx, bonus.bonusAccountTransactionId, bonus.amountUsd, actor.id);
      }
      if (bonus.bonusType === 'CASH_DISCOUNT' && bonus.amountUsd && readOwnerAllocations(bonus.ownerProfitAllocations).length > 0) {
        // Only an old bonus that was accrued to owners has anything to reverse.
        await replaceOwnerAllocations(tx, readOwnerAllocations(bonus.ownerProfitAllocations), [], 1, true);
        await tx.ledgerEntry.create({
          data: { type: 'SUPPLIER_BONUS', description: `Сторно (удаление бонуса от ${bonus.supplier.name}): −$${bonus.amountUsd}`, amountUsd: D(bonus.amountUsd).negated(), exchangeRate: bonus.exchangeRate, userName: actor.name, referenceId: id },
        });
      }

      await tx.supplierBonus.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'BONUS_DELETE',
          details: `Удалён бонус от ${bonus.supplier.name}${bonus.amountUsd ? `: $${bonus.amountUsd}` : ''}`,
          targetId: id,
        },
      });

      return { success: true };
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async update(id: string, input: { name?: string; phone?: string; contactPerson?: string }, actorId?: string) {
    const data: any = {};
    if (input.name !== undefined) {
      if (typeof input.name !== 'string' || !input.name.trim()) throw new Error('Укажите название поставщика');
      data.name = input.name.trim();
    }
    if (input.phone !== undefined) data.phone = input.phone.trim() || null;
    if (input.contactPerson !== undefined) data.contactPerson = input.contactPerson.trim() || null;

    return prisma.$transaction(async tx => {
      const before = await tx.supplier.findUnique({ where: { id } });
      const result = await tx.supplier.update({ where: { id }, data });
      await recordSupplierAudit(tx, actorId, 'SUPPLIER_EDIT', id, before, result);
      return result;
    });
  }

  public static async delete(id: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      const supplier = await tx.supplier.findUnique({
        where: { id },
        select: {
          id: true,
          _count: { select: { devices: true, invoices: true, payments: true, bonuses: true } },
        },
      });
      if (!supplier) throw new Error('Поставщик не найден');

      // A supplier with purchases/payments/bonuses must retain its financial history.
      if (Object.values(supplier._count).some((count) => count > 0)) {
        throw new Error('Нельзя удалить поставщика: у него есть финансовую историю. Пометьте его как неактивного');
      }

      const result = await tx.supplier.delete({ where: { id } });
      await recordSupplierAudit(tx, actorId, 'SUPPLIER_DELETE', id, result, null);
      return result;
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * What an invoice holds, for editing it: each device with where it is and whether its price can
   * still change (never sold, not a free bonus phone), each accessory batch with whether its unit
   * cost can change (every unit still in it), and whether the whole invoice can be deleted.
   */
  public static async getInvoiceContents(id: string) {
    const invoice = await prisma.supplierInvoice.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } });
    if (!invoice) throw new Error('Накладная не найдена');
    const devices = await prisma.device.findMany({
      where: { purchaseInvoiceId: id },
      orderBy: [{ brand: 'asc' }, { model: 'asc' }, { imei: 'asc' }],
      include: { store: { select: { name: true } } },
    });
    const sold = await everSoldDevices(prisma as unknown as TransactionClient, devices.map((d) => d.id));
    const repaired = new Set((await prisma.repairTicket.findMany({ where: { deviceId: { in: devices.map((d) => d.id) } }, select: { deviceId: true } })).map((r) => r.deviceId));
    // A move to another store splits a batch: the units go to a new batch there, same invoice and cost.
    const batches = await prisma.accessoryBatch.findMany({
      where: { purchaseInvoiceId: id },
      include: { product: { select: { id: true, brand: true, name: true, barcode: true, category: true } }, store: { select: { name: true } } },
      orderBy: { createdAt: 'asc' },
    });
    const sharedProducts = await productsOnOtherInvoices(prisma as unknown as TransactionClient, id, batches.map((b) => b.productId));
    const deleteBlock = sold.size
      ? 'Часть телефонов из накладной уже продана'
      : repaired.size || devices.some((d) => d.status === 'IN_REPAIR')
        ? 'Телефон из накладной был в ремонте'
        : devices.some((d) => d.status === 'TRANSFER_PENDING')
          ? 'Телефон из накладной в незавершённом перемещении — сначала подтвердите или отклоните его'
          : batches.some((b) => !batchUntouched(b))
            ? 'Часть аксессуаров из накладной уже продана или перемещена'
            : null;
    return {
      invoice: {
        id: invoice.id, invoiceNumber: invoice.invoiceNumber, supplierName: invoice.supplier.name,
        totalAmountUsd: invoice.totalAmountUsd, paidAmountUsd: invoice.paidAmountUsd,
      },
      devices: devices.map((d) => ({
        id: d.id, brand: d.brand, model: d.model, ram: d.ram, storage: d.storage, color: d.color, category: d.category,
        imei: d.imei, imei2: d.imei2, purchasePriceUsd: d.purchasePriceUsd, isBonus: d.isBonus, status: d.status,
        storeName: d.store?.name ?? null,
        locked: sold.has(d.id) ? 'SOLD' : d.isBonus ? 'BONUS' : null,
      })),
      accessories: batches.map((b) => ({
        id: b.id, productId: b.productId, brand: b.product.brand, name: b.product.name, barcode: b.product.barcode, category: b.product.category,
        // Its card is this invoice's own: a typo in its name can be fixed here.
        nameEditable: !sharedProducts.has(b.productId),
        quantityReceived: b.quantityReceived, quantityRemaining: b.quantityRemaining, unitCostUsd: b.unitCostUsd,
        storeName: b.store.name,
        locked: batchUntouched(b) ? null : 'MOVED',
      })),
      canDelete: deleteBlock === null,
      deleteBlockReason: deleteBlock,
    };
  }

  /**
   * Edits an invoice: its number and date, and the purchase price of each device or accessory
   * batch that never left it (a sold phone keeps the cost its profit was booked at). The invoice
   * total follows the prices. When it grows, the difference is owed to the supplier; when it
   * drops below what was already paid, the overpaid part goes back into the Central Cash.
   * (A bare `totalAmountUsd` — the older way — spreads a new total over untouched devices.)
   */
  public static async updateInvoice(
    id: string,
    input: {
      invoiceNumber?: string;
      date?: string;
      totalAmountUsd?: MoneyInput;
      prices?: { deviceId: string; purchasePriceUsd: MoneyInput }[];
      accessoryCosts?: { batchId: string; unitCostUsd: MoneyInput }[];
      /** A wrong brand, model or specs typed at receipt, fixed on the units not sold yet. */
      specs?: DeviceSpecInput[];
      /** An IMEI or SN typed wrong at receipt, fixed on a unit not sold, repaired or being moved. */
      codes?: DeviceCodeInput[];
      /** A wrong accessory card name: only for a card that only this invoice brought in. */
      accessoryNames?: AccessoryNameInput[];
    },
    actorId?: string,
  ) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM devices WHERE "purchaseInvoiceId" = ${id} ORDER BY id FOR UPDATE`;
      const invoice = await tx.supplierInvoice.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } });
      if (!invoice) throw new Error('Накладная не найдена');

      const data: Prisma.SupplierInvoiceUpdateInput = {};
      if (input.invoiceNumber !== undefined && input.invoiceNumber.trim()) {
        data.invoiceNumber = input.invoiceNumber.trim();
      }
      if (input.date !== undefined) {
        let updatedDate = new Date();
        if (typeof input.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input.date.trim())) {
          const [y, m, d] = input.date.trim().split('-').map(Number);
          const prevTime = invoice.date ? new Date(invoice.date) : new Date();
          updatedDate = new Date(Date.UTC(y, m - 1, d, prevTime.getUTCHours(), prevTime.getUTCMinutes(), prevTime.getUTCSeconds(), prevTime.getUTCMilliseconds()));
        } else {
          const parsed = new Date(input.date);
          if (!isNaN(parsed.getTime())) updatedDate = parsed;
        }
        data.date = updatedDate;
      }

      const byItem = Boolean(input.prices?.length || input.accessoryCosts?.length);
      let diff = D(0);
      const priceChanges: { name: string; from: Prisma.Decimal; to: Prisma.Decimal }[] = [];
      if (byItem) {
        // Price by device / accessory batch: only what never left the invoice can change.
        const devices = await tx.device.findMany({ where: { purchaseInvoiceId: id } });
        const byId = new Map(devices.map((d) => [d.id, d]));
        const sold = await everSoldDevices(tx, devices.map((d) => d.id));
        for (const entry of input.prices ?? []) {
          const device = byId.get(entry.deviceId);
          if (!device) throw new Error('Устройство не относится к этой накладной');
          const price = roundMoney(device.isBonus ? requireNonNegativeMoney(entry.purchasePriceUsd, 'Цена') : requirePositiveMoney(entry.purchasePriceUsd, `Цена ${device.brand} ${device.model}`));
          if (price.eq(device.purchasePriceUsd)) continue;
          if (device.isBonus) throw new Error(`${device.brand} ${device.model} — подарочный телефон, его цена всегда $0`);
          if (sold.has(device.id)) throw new Error(`${device.brand} ${device.model} (${device.category === 'TABLET' ? 'SN' : 'IMEI'} ${device.imei}) уже продавался — его закупочную цену изменить нельзя`);
          const change = price.minus(device.purchasePriceUsd);
          diff = diff.plus(change);
          // The cost basis moves by the same amount, keeping any later adjustment it carries.
          await tx.device.update({ where: { id: device.id }, data: { purchasePriceUsd: price, costBasisUsd: { increment: change } } });
          priceChanges.push({ name: `${device.brand} ${device.model} ${device.imei}`, from: D(device.purchasePriceUsd), to: price });
        }
        if (input.accessoryCosts?.length) {
          await tx.$queryRaw`SELECT id FROM accessory_batches WHERE "purchaseInvoiceId" = ${id} ORDER BY id FOR UPDATE`;
          const batches = await tx.accessoryBatch.findMany({ where: { purchaseInvoiceId: id }, include: { product: { select: { name: true } } } });
          for (const entry of input.accessoryCosts) {
            const batch = batches.find((b) => b.id === entry.batchId);
            if (!batch) throw new Error('Партия аксессуаров не относится к этой накладной');
            const cost = roundMoney(requirePositiveMoney(entry.unitCostUsd, `Цена ${batch.product.name}`));
            if (cost.eq(batch.unitCostUsd)) continue;
            if (!batchUntouched(batch)) throw new Error(`${batch.product.name}: часть партии уже продана или перемещена — цену изменить нельзя`);
            diff = diff.plus(cost.minus(batch.unitCostUsd).mul(batch.quantityReceived));
            await tx.accessoryBatch.update({ where: { id: batch.id }, data: { unitCostUsd: cost } });
            priceChanges.push({ name: `${batch.product.name} × ${batch.quantityReceived}`, from: D(batch.unitCostUsd), to: cost });
          }
        }
        if (priceChanges.some((c) => !c.name.includes(' × '))) await rebuildInvoiceGroups(tx, id);
      } else if (input.totalAmountUsd !== undefined) {
        const oldTotal = invoice.totalAmountUsd;
        const newTotal = requireNonNegativeMoney(input.totalAmountUsd, 'Сумма накладной');
        diff = roundMoney(D(newTotal).minus(oldTotal));
        if (!diff.isZero()) {
          // An accessory batch's unit cost was fixed at receipt; a new total can't be spread over
          // its units to the cent — such an invoice is edited by price.
          if (await tx.accessoryBatch.count({ where: { purchaseInvoiceId: id } })) {
            throw new Error('Для накладной с аксессуарами измените цены позиций, а не общую сумму');
          }
          const invoiceDevices = await tx.device.findMany({ where: { purchaseInvoiceId: id }, orderBy: { id: 'asc' } });
          if ((await everSoldDevices(tx, invoiceDevices.map((device) => device.id))).size) {
            throw new Error('Часть телефонов уже продана: измените цены непроданных позиций, а не общую сумму');
          }
          if (D(oldTotal).lte(0) && invoiceDevices.length > 0) throw new Error('Для изменения нулевой накладной измените цены позиций');
          const costs = invoiceDevices.length ? allocateMoney(newTotal, invoiceDevices.map((d) => d.purchasePriceUsd)) : [];
          for (const [index, device] of invoiceDevices.entries()) {
            await tx.device.update({ where: { id: device.id }, data: { purchasePriceUsd: costs[index], costBasisUsd: { increment: D(costs[index]).minus(device.purchasePriceUsd) } } });
          }
          await rebuildInvoiceGroups(tx, id);
        }
      }

      const renames = await renameInvoiceItems(tx, id, input.specs ?? [], input.accessoryNames ?? [], input.codes ?? []);

      let refundUsd = D(0);
      if (!diff.isZero()) {
        const oldTotal = D(invoice.totalAmountUsd);
        const paid = D(invoice.paidAmountUsd);
        const newTotal = roundMoney(oldTotal.plus(diff));
        if (newTotal.lt(0)) throw new Error('Сумма накладной не может стать отрицательной');
        // Paid more than the invoice is now worth: the overpaid part comes back to the Central Cash.
        refundUsd = decimalMax(D(0), roundMoney(paid.minus(newTotal)));
        const newPaid = roundMoney(paid.minus(refundUsd));
        const debtChange = roundMoney(newTotal.minus(newPaid).minus(oldTotal.minus(paid)));
        data.totalAmountUsd = newTotal;
        data.paidAmountUsd = newPaid;
        await tx.supplier.update({
          where: { id: invoice.supplierId },
          data: {
            totalPurchasedUsd: { increment: diff },
            totalDebtUsd: { increment: debtChange },
            ...(refundUsd.gt(0) ? { totalPaidUsd: { decrement: refundUsd } } : {}),
          },
        });
        if (refundUsd.gt(0)) {
          if (!actorId) throw new Error('Не указан пользователь для возврата денег в кассу');
          const actor = await resolveActor(tx, actorId);
          await releaseInvoiceAllocations(tx, id, refundUsd);
          await refundToCentralCash(tx, invoice, invoice.supplier.name, refundUsd, actor, `Цена по накладной ${invoice.invoiceNumber} снижена`);
        }
      }

      const updated = await tx.supplierInvoice.update({ where: { id }, data });
      if (input.invoiceNumber && input.invoiceNumber.trim() !== invoice.invoiceNumber) {
        await tx.device.updateMany({ where: { purchaseInvoiceId: id }, data: { invoiceNumber: input.invoiceNumber.trim() } });
      }

      if (actorId) {
        const actor = await resolveActor(tx, actorId);
        const debtNow = roundMoney(D(updated.totalAmountUsd).minus(updated.paidAmountUsd));
        await tx.auditLog.create({
          data: {
            userId: actor.id, userName: actor.name, userRole: actor.role, action: 'INVOICE_EDIT', targetId: id,
            details: `Изменена накладная ${updated.invoiceNumber} (${invoice.supplier.name})`
              + (diff.isZero() ? '' : `: сумма $${invoice.totalAmountUsd} → $${updated.totalAmountUsd}`)
              + (priceChanges.length ? `; цены: ${priceChanges.map((c) => `${c.name} $${c.from} → $${c.to}`).join(', ')}` : '')
              + (renames.length ? `; названия: ${renames.join(', ')}` : '')
              + (refundUsd.gt(0) ? `; переплата $${refundUsd} возвращена в Центральную кассу` : '')
              + (!diff.isZero() && refundUsd.isZero() ? `; долг по накладной $${debtNow}` : ''),
            financialDetails: moneyJson({ before: invoice, after: updated, diffUsd: diff, refundUsd, priceChanges, renames }),
          },
        });
      }
      return { ...updated, refundUsd };
    }, { maxWait: 10000, timeout: 25000 });
  }

  /**
   * Deletes an invoice whose goods were never sold, wherever they are now: its devices leave
   * stock (with the transfer and store-receipt lines that moved them), its untouched accessory
   * batches go, the supplier's totals drop by it, and what was paid on it comes back into the
   * Central Cash.
   */
  public static async deleteInvoice(id: string, actorId?: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM devices WHERE "purchaseInvoiceId" = ${id} ORDER BY id FOR UPDATE`;
      const invoice = await tx.supplierInvoice.findUnique({ where: { id }, include: { supplier: { select: { name: true } } } });
      if (!invoice) throw new Error('Накладная не найдена');

      // purchaseInvoiceId is the only reliable link — invoiceNumber has no uniqueness
      // constraint (two invoices, even from different suppliers, can share one).
      const devices = await tx.device.findMany({ where: { purchaseInvoiceId: id }, select: { id: true, status: true, storeId: true } });
      const deviceIds = devices.map((d) => d.id);
      if ((await everSoldDevices(tx, deviceIds)).size) {
        throw new Error('Нельзя удалить накладную: часть телефонов из неё уже продана');
      }
      if (deviceIds.length && (devices.some((d) => d.status === 'IN_REPAIR') || await tx.repairTicket.findFirst({ where: { deviceId: { in: deviceIds } } }))) {
        throw new Error('Нельзя удалить накладную: телефон из неё был в ремонте');
      }
      if (devices.some((d) => d.status === 'TRANSFER_PENDING')) {
        throw new Error('Телефон из накладной в незавершённом перемещении — сначала подтвердите или отклоните перемещение');
      }

      // Accessories leave with the invoice only while every unit of its batches is still in stock.
      await tx.$queryRaw`SELECT id FROM accessory_batches WHERE "purchaseInvoiceId" = ${id} ORDER BY id FOR UPDATE`;
      const batches = await tx.accessoryBatch.findMany({ where: { purchaseInvoiceId: id }, select: { id: true, quantityReceived: true, quantityRemaining: true, quantityReserved: true } });
      if (batches.some((batch) => !batchUntouched(batch))) {
        throw new Error('Нельзя удалить накладную: часть аксессуаров из неё уже продана или перемещена');
      }

      const paid = D(invoice.paidAmountUsd);
      const remainingDebtOnInvoice = roundMoney(D(invoice.totalAmountUsd).minus(paid));

      await tx.invoiceGroup.deleteMany({ where: { invoiceId: id } });
      if (batches.length) await tx.accessoryBatch.deleteMany({ where: { id: { in: batches.map((batch) => batch.id) } } });
      await tx.supplierPaymentAllocation.deleteMany({ where: { invoiceId: id } });
      const storeIds = new Set<string>([...(invoice.storeId ? [invoice.storeId] : []), ...devices.map((d) => d.storeId).filter((s): s is string => Boolean(s))]);
      if (deviceIds.length > 0) {
        // Completed moves of these devices go with them; a move or receipt left empty goes too.
        const transferIds = [...new Set((await tx.transferItem.findMany({ where: { deviceId: { in: deviceIds } }, select: { transferId: true } })).map((t) => t.transferId))];
        const receiptIds = [...new Set((await tx.storeReceiptItem.findMany({ where: { deviceId: { in: deviceIds } }, select: { receiptId: true } })).map((r) => r.receiptId))];
        await tx.transferItem.deleteMany({ where: { deviceId: { in: deviceIds } } });
        await tx.storeReceiptItem.deleteMany({ where: { deviceId: { in: deviceIds } } });
        for (const transferId of transferIds) {
          const left = await tx.transferRequest.findUnique({ where: { id: transferId }, select: { _count: { select: { items: true, accessoryLines: true } } } });
          if (left && left._count.items === 0 && left._count.accessoryLines === 0) await tx.transferRequest.delete({ where: { id: transferId } });
        }
        for (const receiptId of receiptIds) {
          const left = await tx.storeReceipt.findUnique({ where: { id: receiptId }, select: { _count: { select: { items: true, accessoryLines: true } } } });
          if (left && left._count.items === 0 && left._count.accessoryLines === 0) await tx.storeReceipt.delete({ where: { id: receiptId } });
          else if (left) await tx.storeReceipt.update({ where: { id: receiptId }, data: { itemCount: left._count.items } });
        }
        await tx.deviceTimelineEvent.deleteMany({ where: { deviceId: { in: deviceIds } } });
        await tx.device.deleteMany({ where: { id: { in: deviceIds } } });
      }
      await syncStockAlerts(tx, [...storeIds]);

      // Atomic guarded decrement, not a read-then-write — matches create's atomic increment.
      const supplierGuard = await tx.supplier.updateMany({
        where: { id: invoice.supplierId, totalPurchasedUsd: { gte: invoice.totalAmountUsd }, totalDebtUsd: { gte: remainingDebtOnInvoice }, totalPaidUsd: { gte: paid } },
        data: {
          totalPurchasedUsd: { decrement: invoice.totalAmountUsd },
          totalDebtUsd: { decrement: remainingDebtOnInvoice },
          totalPaidUsd: { decrement: paid },
        },
      });
      if (supplierGuard.count !== 1) throw new Error('Данные поставщика изменились, обновите страницу и повторите удаление');

      const result = await tx.supplierInvoice.delete({ where: { id } });
      if (paid.gt(0)) {
        if (!actorId) throw new Error('Не указан пользователь для возврата денег в кассу');
        await refundToCentralCash(tx, invoice, invoice.supplier.name, paid, await resolveActor(tx, actorId), `Удалена накладная ${invoice.invoiceNumber}`);
      }
      if (actorId) {
        const actor = await resolveActor(tx, actorId);
        await tx.auditLog.create({
          data: {
            userId: actor.id, userName: actor.name, userRole: actor.role, action: 'INVOICE_DELETE', targetId: id,
            details: `Удалена накладная ${invoice.invoiceNumber} (${invoice.supplier.name}) на $${invoice.totalAmountUsd}: ${deviceIds.length} устройств и ${batches.length} партий аксессуаров убраны с остатков`
              + (paid.gt(0) ? `, оплата $${paid} возвращена в Центральную кассу` : ''),
            financialDetails: moneyJson({ before: invoice, refundUsd: paid, deviceIds }),
          },
        });
      }
      return { ...result, refundUsd: paid };
    }, { maxWait: 10000, timeout: 25000 });
  }
}
