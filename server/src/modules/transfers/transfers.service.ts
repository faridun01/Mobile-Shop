import type { Prisma } from '@prisma/client';
import { prisma, type TransactionClient } from '../../prisma/prisma.service';
import { notifyAdmins } from '../notifications/notification.service';
import { onCommit } from '../../common/after-commit';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { resolveActor } from '../../common/actor';
import { syncStockAlerts } from '../stock-thresholds/stock-alerts';
import { moveAllocations, readAllocations, releaseReservation, takeFifo } from '../catalog/accessory-stock';
import crypto from 'node:crypto';

function nextTransferNumber(): string {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `TR-${stamp}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
}

/** Accessories in a transfer: a quantity of one card. */
export interface TransferAccessoryInput {
  productId: string;
  quantity: number;
}

interface TransferInput {
  fromStoreId: string;
  toStoreId: string;
  deviceIds: string[];
  accessories?: TransferAccessoryInput[];
  requestedByUserId: string;
}

function checkTransferInput(input: TransferInput) {
  const deviceIds = Array.isArray(input.deviceIds) ? input.deviceIds : [];
  const accessories = Array.isArray(input.accessories) ? input.accessories : [];
  if (deviceIds.length === 0 && accessories.length === 0) {
    throw new Error('Выберите устройства или аксессуары для перемещения');
  }
  const productIds = accessories.map((a) => a.productId);
  if (new Set(productIds).size !== productIds.length) throw new Error('Один аксессуар указан в перемещении дважды');
  return { deviceIds, accessories };
}

/**
 * Reserves the accessory units of a transfer in the source store's batches, oldest first. A
 * request keeps them reserved until it is approved or rejected; a direct transfer moves them at once.
 */
async function reserveAccessoryLines(tx: TransactionClient, fromStoreId: string, accessories: TransferAccessoryInput[]) {
  const lines = [];
  for (const entry of accessories) {
    const product = await tx.accessoryProduct.findUnique({ where: { id: String(entry.productId) } });
    if (!product) throw new Error('Аксессуар не найден');
    const quantity = Number(entry.quantity);
    const { allocations } = await takeFifo(tx, {
      storeId: fromStoreId, productId: product.id, quantity, mode: 'reserve',
      label: `${product.brand} ${product.name}`.trim(),
    });
    lines.push({
      productId: product.id, barcode: product.barcode, brand: product.brand, name: product.name,
      quantity, allocations: allocations as unknown as Prisma.InputJsonValue,
    });
  }
  return lines;
}

/** "3 устройства и 5 шт. аксессуаров" — what a transfer moves, for journal and audit texts. */
function describeContents(devices: number, accessoryUnits: number) {
  return [devices ? `${devices} устройств` : '', accessoryUnits ? `${accessoryUnits} шт. аксессуаров` : ''].filter(Boolean).join(' и ');
}

function destinationStatusForStore(isMainWarehouse: boolean): 'MAIN_WAREHOUSE' | 'STORE_STOCK' {
  return isMainWarehouse ? 'MAIN_WAREHOUSE' : 'STORE_STOCK';
}

// A retail store's available stock includes devices returned via Trade-In (they never left
// the store, just changed status) — matching TransferPage's own "available to pick" filter.
// The main warehouse only ever holds devices with MAIN_WAREHOUSE status.
function sourceStatusesForStore(isMainWarehouse: boolean): ('MAIN_WAREHOUSE' | 'STORE_STOCK' | 'IN_STOCK_AFTER_EXCHANGE')[] {
  return isMainWarehouse ? ['MAIN_WAREHOUSE'] : ['STORE_STOCK', 'IN_STOCK_AFTER_EXCHANGE'];
}

export class TransfersService {
  /**
   * Requests a transfer: devices are frozen as TRANSFER_PENDING (still physically at the
   * source store), accessory units are reserved in their batches, and the request sits at
   * PENDING_APPROVAL until an ADMIN/PARTNER approves it. This is what lets a SELLER pull stock
   * from the main warehouse into their own store without being able to move it themselves — an
   * admin confirms it remotely afterwards.
   */
  public static async create(input: TransferInput) {
    const { deviceIds, accessories } = checkTransferInput(input);

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.requestedByUserId);
      const fromStore = await tx.store.findUnique({ where: { id: input.fromStoreId } });
      const toStore = await tx.store.findUnique({ where: { id: input.toStoreId } });
      if (!fromStore || !toStore) {
        throw new Error('Магазин отправления или назначения не найден в базе данных');
      }
      if (input.fromStoreId === input.toStoreId) {
        throw new Error('Магазин отправления и назначения не могут совпадать');
      }

      const sourceStatuses = sourceStatusesForStore(fromStore.isMainWarehouse);
      const devices = deviceIds.length
        ? await tx.device.findMany({ where: { id: { in: deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } } })
        : [];
      if (devices.length !== deviceIds.length) {
        throw new Error('Одно или несколько устройств недоступны для перемещения (уже перемещаются, проданы или в ремонте)');
      }
      const accessoryLines = await reserveAccessoryLines(tx, input.fromStoreId, accessories);
      const accessoryUnits = accessoryLines.reduce((sum, line) => sum + line.quantity, 0);

      const transferNumber = nextTransferNumber();
      const transfer = await tx.transferRequest.create({
        data: {
          transferNumber,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          status: 'PENDING_APPROVAL',
          requestedByUserId: input.requestedByUserId,
          items: { create: devices.map((d) => ({ deviceId: d.id, imei: d.imei, brand: d.brand, model: d.model })) },
          accessoryLines: { create: accessoryLines },
        },
        include: { items: true, accessoryLines: true, fromStore: { select: { name: true } }, toStore: { select: { name: true } } },
      });

      if (deviceIds.length) {
        const holdResult = await tx.device.updateMany({
          where: { id: { in: deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } },
          data: { status: 'TRANSFER_PENDING' },
        });
        if (holdResult.count !== deviceIds.length) {
          throw new Error('Одно или несколько устройств стали недоступны во время перемещения');
        }
      }
      // Devices held for a transfer are no longer available at the source.
      await syncStockAlerts(tx, [input.fromStoreId]);

      await tx.deviceTimelineEvent.createMany({
        data: devices.map((device) => ({
          deviceId: device.id,
          type: 'TRANSFER_REQUESTED',
          description: `Запрошено перемещение ${transferNumber} в ${toStore.name}`,
          userName: actor.name,
        })),
      });

      const contents = describeContents(devices.length, accessoryUnits);
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER_REQUEST',
          details: `Запрошено перемещение ${transferNumber} (${contents}) из ${fromStore.name} в ${toStore.name}`,
          targetId: transfer.id,
        },
      });

      // The admin approves the request (always, when the main warehouse is involved). The
      // notification is ADMIN-only: a role-wide PARTNER copy showed every store's requests to
      // every partner. Approving or rejecting resolves it (targetType TRANSFER_REQUEST).
      await notifyAdmins(tx, {
        actionType: 'TRANSFER_REQUEST',
        dedupeKey: `TRANSFER_REQUEST:${transfer.id}`,
        title: 'Новый запрос на перемещение',
        message: `${actor.name} запрашивает перемещение ${contents} из ${fromStore.name} в ${toStore.name}`,
        store: { id: fromStore.id, name: fromStore.name },
        actor,
        documentRef: transferNumber,
        targetType: 'TRANSFER_REQUEST',
        targetId: transfer.id,
        targetRoute: '/transfer',
        details: { imeis: devices.map((d) => d.imei), accessories: accessoryLines.map((l) => ({ barcode: l.barcode, quantity: l.quantity })) },
      });

      onCommit(() => {
        RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId: transfer.id }, { storeIds: [input.fromStoreId, input.toStoreId] });
        RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [input.fromStoreId, input.toStoreId] });
      });

      return transfer;
    }, { maxWait: 10000, timeout: 25000 });
  }

  /** ADMIN/PARTNER-only immediate move that bypasses the approval step. */
  public static async createDirect(input: TransferInput) {
    const { deviceIds, accessories } = checkTransferInput(input);

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.requestedByUserId);
      const fromStore = await tx.store.findUnique({ where: { id: input.fromStoreId } });
      const toStore = await tx.store.findUnique({ where: { id: input.toStoreId } });
      if (!fromStore || !toStore) {
        throw new Error('Магазин отправления или назначения не найден в базе данных');
      }
      if (input.fromStoreId === input.toStoreId) {
        throw new Error('Магазин отправления и назначения не могут совпадать');
      }
      const sourceStatuses = sourceStatusesForStore(fromStore.isMainWarehouse);
      const destStatus = destinationStatusForStore(toStore.isMainWarehouse);

      const devices = deviceIds.length
        ? await tx.device.findMany({ where: { id: { in: deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } } })
        : [];
      if (devices.length !== deviceIds.length) {
        throw new Error('Одно или несколько устройств недоступны для перемещения');
      }
      // Accessories: reserved and moved in the same step, each unit at its own batch cost.
      const accessoryLines = await reserveAccessoryLines(tx, input.fromStoreId, accessories);
      for (const line of accessoryLines) {
        await moveAllocations(tx, readAllocations(line.allocations), input.toStoreId, true);
      }
      const accessoryUnits = accessoryLines.reduce((sum, line) => sum + line.quantity, 0);

      const transferNumber = nextTransferNumber();
      const transfer = await tx.transferRequest.create({
        data: {
          transferNumber,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          status: 'APPROVED',
          requestedByUserId: input.requestedByUserId,
          approvedByUserId: input.requestedByUserId,
          approvedAt: new Date(),
          items: { create: devices.map((d) => ({ deviceId: d.id, imei: d.imei, brand: d.brand, model: d.model })) },
          accessoryLines: { create: accessoryLines },
        },
        include: { items: true, accessoryLines: true, fromStore: { select: { name: true } }, toStore: { select: { name: true } } },
      });

      if (deviceIds.length) {
        const moveResult = await tx.device.updateMany({
          where: { id: { in: deviceIds }, storeId: input.fromStoreId, status: { in: sourceStatuses } },
          data: { storeId: input.toStoreId, status: destStatus },
        });
        if (moveResult.count !== deviceIds.length) {
          throw new Error('Одно или несколько устройств стали недоступны во время перемещения');
        }
      }
      await syncStockAlerts(tx, [input.fromStoreId, input.toStoreId]);

      await tx.deviceTimelineEvent.createMany({
        data: devices.map((device) => ({
          deviceId: device.id,
          type: 'TRANSFER',
          description: `Прямое перемещение ${transferNumber}`,
          userName: actor.name,
        })),
      });

      const contents = describeContents(devices.length, accessoryUnits);
      await tx.ledgerEntry.create({
        data: { type: 'TRANSFER', description: `Прямое перемещение ${transferNumber}: ${contents}`, userName: actor.name },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER',
          details: `Выполнено прямое перемещение ${transferNumber}: ${contents}`,
          targetId: transfer.id,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId: transfer.id }, { storeIds: [input.fromStoreId, input.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [input.fromStoreId, input.toStoreId] });

      return transfer;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async approve(transferId: string, approvedByUserId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, approvedByUserId);
      // Lock the request: a parallel approve/reject waits and then sees it already handled.
      await tx.$queryRaw`SELECT id FROM transfer_requests WHERE id = ${transferId} FOR UPDATE`;
      // .name (ledger description) and .isMainWarehouse (destination status) are the only
      // fields actually read below — narrowed from `true` to avoid pulling cashBalanceUsd
      // and the rest of the store row along for the ride.
      const transfer = await tx.transferRequest.findUnique({
        where: { id: transferId },
        include: { items: true, accessoryLines: true, fromStore: { select: { name: true, isMainWarehouse: true } }, toStore: { select: { name: true, isMainWarehouse: true } } },
      });
      if (!transfer) throw new Error('Запрос на перемещение не найден');
      if (transfer.status !== 'PENDING_APPROVAL') throw new Error('Этот запрос уже обработан');

      const deviceIds = transfer.items.map((i) => i.deviceId);
      const destStatus = destinationStatusForStore(transfer.toStore.isMainWarehouse);

      if (deviceIds.length) {
        const moveResult = await tx.device.updateMany({
          where: { id: { in: deviceIds }, status: 'TRANSFER_PENDING' },
          data: { storeId: transfer.toStoreId, status: destStatus },
        });
        if (moveResult.count !== deviceIds.length) {
          throw new Error('Состояние устройств изменилось, подтверждение невозможно');
        }
      }
      // The reserved accessory units leave their batches for new ones at the destination.
      for (const line of transfer.accessoryLines ?? []) {
        await moveAllocations(tx, readAllocations(line.allocations), transfer.toStoreId, true);
      }
      await syncStockAlerts(tx, [transfer.fromStoreId, transfer.toStoreId]);

      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'APPROVED', approvedByUserId, approvedAt: new Date() },
      });

      await tx.deviceTimelineEvent.createMany({
        data: transfer.items.map((item) => ({
          deviceId: item.deviceId,
          type: 'TRANSFER_APPROVED',
          description: `Перемещение ${transfer.transferNumber} подтверждено`,
          userName: actor.name,
        })),
      });

      const contents = describeContents(deviceIds.length, (transfer.accessoryLines ?? []).reduce((sum, l) => sum + l.quantity, 0));
      await tx.ledgerEntry.create({
        data: {
          type: 'TRANSFER',
          description: `Перемещение ${transfer.transferNumber}: ${contents} из ${transfer.fromStore.name} в ${transfer.toStore.name}`,
          userName: actor.name,
        },
      });

      await tx.notification.updateMany({
        where: { targetId: transferId, targetType: 'TRANSFER_REQUEST' },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER_APPROVAL',
          details: `Подтверждено перемещение ${transfer.transferNumber} (${contents})`,
          targetId: transferId,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId }, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async reject(transferId: string, rejectedByUserId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, rejectedByUserId);
      await tx.$queryRaw`SELECT id FROM transfer_requests WHERE id = ${transferId} FOR UPDATE`;
      // Only .isMainWarehouse is read below — narrowed from `true`.
      const transfer = await tx.transferRequest.findUnique({ where: { id: transferId }, include: { items: true, accessoryLines: true, fromStore: { select: { isMainWarehouse: true } } } });
      if (!transfer) throw new Error('Запрос на перемещение не найден');
      if (transfer.status !== 'PENDING_APPROVAL') throw new Error('Этот запрос уже обработан');

      const deviceIds = transfer.items.map((i) => i.deviceId);
      // Reverts to the generic in-stock status for that store type — a device that was
      // IN_STOCK_AFTER_EXCHANGE before the request comes back as STORE_STOCK, which is fine:
      // both statuses are treated identically everywhere else (sale/transfer eligibility).
      const revertStatus = destinationStatusForStore(transfer.fromStore.isMainWarehouse);

      // Revert both status AND location — this closes the latent inconsistency in the
      // original mock logic where rejection reverted status but left location stale.
      if (deviceIds.length) {
        const revertResult = await tx.device.updateMany({
          where: { id: { in: deviceIds }, status: 'TRANSFER_PENDING' },
          data: { storeId: transfer.fromStoreId, status: revertStatus },
        });
        if (revertResult.count !== deviceIds.length) {
          throw new Error('Состояние устройств изменилось, отклонение невозможно');
        }
      }
      // The reserved accessory units are free to sell or move again.
      for (const line of transfer.accessoryLines ?? []) {
        await releaseReservation(tx, readAllocations(line.allocations));
      }
      await syncStockAlerts(tx, [transfer.fromStoreId]);

      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'REJECTED', approvedByUserId: rejectedByUserId, approvedAt: new Date(), rejectedReason: reason },
      });

      await tx.deviceTimelineEvent.createMany({
        data: transfer.items.map((item) => ({
          deviceId: item.deviceId,
          type: 'TRANSFER_REJECTED',
          description: `Перемещение ${transfer.transferNumber} отклонено: ${reason}`,
          userName: actor.name,
        })),
      });

      await tx.notification.updateMany({
        where: { targetId: transferId, targetType: 'TRANSFER_REQUEST' },
        data: { resolved: true, read: true, resolvedAt: new Date(), readAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER_REJECT',
          details: `Отклонено перемещение ${transfer.transferNumber}. Причина: ${reason}`,
          targetId: transferId,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId }, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });

      return updated;
    }, { maxWait: 10000, timeout: 25000 });
  }
}
