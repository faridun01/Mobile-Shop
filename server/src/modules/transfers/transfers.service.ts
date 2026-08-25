import { prisma } from '../../prisma/prisma.service';
import type { Prisma } from '@prisma/client';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { resolveActor } from '../../common/actor';

async function nextTransferNumber(tx: Prisma.TransactionClient): Promise<string> {
  const count = await tx.transferRequest.count();
  return `TR-${String(count + 1).padStart(4, '0')}`;
}

function statusForStore(storeId: string): 'MAIN_WAREHOUSE' | 'STORE_STOCK' {
  return storeId === 'main-warehouse' ? 'MAIN_WAREHOUSE' : 'STORE_STOCK';
}

export class TransfersService {
  /** Creates a pending transfer and immediately reserves the devices as TRANSFER_PENDING. */
  public static async create(input: { fromStoreId: string; toStoreId: string; deviceIds: string[]; requestedByUserId: string }) {
    if (!input.deviceIds || input.deviceIds.length === 0) {
      throw new Error('Выберите устройства для перемещения');
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.requestedByUserId);
      const sourceStatus = statusForStore(input.fromStoreId);
      const devices = await tx.device.findMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: sourceStatus },
      });
      if (devices.length !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств недоступны для перемещения (уже перемещаются, проданы или в ремонте)');
      }

      const transferNumber = await nextTransferNumber(tx);
      const transfer = await tx.transferRequest.create({
        data: {
          transferNumber,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          requestedByUserId: input.requestedByUserId,
          items: { create: devices.map((d) => ({ deviceId: d.id, imei: d.imei, model: d.model })) },
        },
        include: { items: true },
      });

      const reserveResult = await tx.device.updateMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: sourceStatus },
        data: { status: 'TRANSFER_PENDING' },
      });
      if (reserveResult.count !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств стали недоступны во время оформления перемещения');
      }

      for (const device of devices) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: device.id,
            type: 'TRANSFER_REQUEST',
            description: `Запрошено перемещение ${transferNumber} в другой магазин`,
            userName: actor.name,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER_REQUEST',
          details: `Создан запрос на перемещение ${transferNumber} (${devices.length} шт.)`,
          targetId: transfer.id,
        },
      });

      const notification = await tx.notification.create({
        data: {
          title: 'Новый запрос на перемещение',
          message: `${transferNumber}: ${devices.length} устройств(о) ожидает подтверждения`,
          targetType: 'TRANSFER_REQUEST',
          targetId: transfer.id,
          targetRole: 'ADMIN',
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId: transfer.id }, { storeIds: [input.fromStoreId, input.toStoreId] });
      RealtimeSyncGateway.broadcast('NOTIFICATION_CREATED', notification);

      return transfer;
    });
  }

  /** ADMIN/PARTNER-only immediate move that bypasses the approval step. */
  public static async createDirect(input: { fromStoreId: string; toStoreId: string; deviceIds: string[]; requestedByUserId: string }) {
    if (!input.deviceIds || input.deviceIds.length === 0) {
      throw new Error('Выберите устройства для перемещения');
    }

    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.requestedByUserId);
      const sourceStatus = statusForStore(input.fromStoreId);
      const destStatus = statusForStore(input.toStoreId);

      const devices = await tx.device.findMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: sourceStatus },
      });
      if (devices.length !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств недоступны для перемещения');
      }

      const transferNumber = await nextTransferNumber(tx);
      const transfer = await tx.transferRequest.create({
        data: {
          transferNumber,
          fromStoreId: input.fromStoreId,
          toStoreId: input.toStoreId,
          status: 'APPROVED',
          requestedByUserId: input.requestedByUserId,
          approvedByUserId: input.requestedByUserId,
          approvedAt: new Date(),
          items: { create: devices.map((d) => ({ deviceId: d.id, imei: d.imei, model: d.model })) },
        },
      });

      const moveResult = await tx.device.updateMany({
        where: { id: { in: input.deviceIds }, storeId: input.fromStoreId, status: sourceStatus },
        data: { storeId: input.toStoreId, status: destStatus },
      });
      if (moveResult.count !== input.deviceIds.length) {
        throw new Error('Одно или несколько устройств стали недоступны во время перемещения');
      }

      for (const device of devices) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: device.id,
            type: 'TRANSFER',
            description: `Прямое перемещение ${transferNumber}`,
            userName: actor.name,
          },
        });
      }

      await tx.ledgerEntry.create({
        data: { type: 'TRANSFER', description: `Прямое перемещение ${transferNumber}: ${devices.length} устройств`, userName: actor.name },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'TRANSFER',
          details: `Выполнено прямое перемещение ${transferNumber}: ${devices.length} устройств`,
          targetId: transfer.id,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId: transfer.id }, { storeIds: [input.fromStoreId, input.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [input.fromStoreId, input.toStoreId] });

      return transfer;
    });
  }

  public static async approve(transferId: string, approvedByUserId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, approvedByUserId);
      const transfer = await tx.transferRequest.findUnique({ where: { id: transferId }, include: { items: true } });
      if (!transfer) throw new Error('Запрос на перемещение не найден');
      if (transfer.status !== 'PENDING_APPROVAL') throw new Error('Этот запрос уже обработан');

      const deviceIds = transfer.items.map((i) => i.deviceId);
      const destStatus = statusForStore(transfer.toStoreId);

      const moveResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, status: 'TRANSFER_PENDING' },
        data: { storeId: transfer.toStoreId, status: destStatus },
      });
      if (moveResult.count !== deviceIds.length) {
        throw new Error('Состояние устройств изменилось, подтверждение невозможно');
      }

      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'APPROVED', approvedByUserId, approvedAt: new Date() },
      });

      for (const item of transfer.items) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: item.deviceId,
            type: 'TRANSFER_APPROVED',
            description: `Перемещение ${transfer.transferNumber} подтверждено`,
            userName: actor.name,
          },
        });
      }

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
          details: `Подтверждено перемещение ${transfer.transferNumber} (${deviceIds.length} устройств)`,
          targetId: transferId,
        },
      });

      RealtimeSyncGateway.broadcast('TRANSFER_UPDATED', { transferId }, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });
      RealtimeSyncGateway.broadcast('INVENTORY_UPDATE', {}, { storeIds: [transfer.fromStoreId, transfer.toStoreId] });

      return updated;
    });
  }

  public static async reject(transferId: string, rejectedByUserId: string, reason: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, rejectedByUserId);
      const transfer = await tx.transferRequest.findUnique({ where: { id: transferId }, include: { items: true } });
      if (!transfer) throw new Error('Запрос на перемещение не найден');
      if (transfer.status !== 'PENDING_APPROVAL') throw new Error('Этот запрос уже обработан');

      const deviceIds = transfer.items.map((i) => i.deviceId);
      const revertStatus = statusForStore(transfer.fromStoreId);

      // Revert both status AND location — this closes the latent inconsistency in the
      // original mock logic where rejection reverted status but left location stale.
      const revertResult = await tx.device.updateMany({
        where: { id: { in: deviceIds }, status: 'TRANSFER_PENDING' },
        data: { storeId: transfer.fromStoreId, status: revertStatus },
      });
      if (revertResult.count !== deviceIds.length) {
        throw new Error('Состояние устройств изменилось, отклонение невозможно');
      }

      const updated = await tx.transferRequest.update({
        where: { id: transferId },
        data: { status: 'REJECTED', approvedByUserId: rejectedByUserId, approvedAt: new Date(), rejectedReason: reason },
      });

      for (const item of transfer.items) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: item.deviceId,
            type: 'TRANSFER_REJECTED',
            description: `Перемещение ${transfer.transferNumber} отклонено: ${reason}`,
            userName: actor.name,
          },
        });
      }

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
    });
  }
}
