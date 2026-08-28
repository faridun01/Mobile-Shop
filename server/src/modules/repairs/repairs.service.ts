import { prisma } from '../../prisma/prisma.service';
import { resolveActor } from '../../common/actor';
import { createExpense } from '../expenses/expenses.service';

export interface CreateRepairInput {
  storeId: string;
  userId: string;
  imei: string;
  imei2?: string;
  brand: string;
  model: string;
  storage?: string;
  color?: string;
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
}

export class RepairsService {
  public static async create(input: CreateRepairInput) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.userId);
      const matchedDevice = await tx.device.findFirst({
        where: { imei: input.imei },
      });

      const ticket = await tx.repairTicket.create({
        data: {
          storeId: input.storeId,
          userId: input.userId,
          deviceId: matchedDevice?.id,
          imei: input.imei,
          imei2: input.imei2,
          brand: input.brand,
          model: input.model,
          storage: input.storage,
          color: input.color,
          saleReceiptNumber: input.saleReceiptNumber,
          saleDate: input.saleDate ? new Date(input.saleDate) : undefined,
          customerName: input.customerName,
          customerPhone: input.customerPhone,
          problemDescription: input.problemDescription,
          visualCondition: input.visualCondition,
          equipmentPackage: input.equipmentPackage,
          comment: input.comment,
          estimatedCostTjs: input.estimatedCostTjs,
          statusHistory: {
            create: [{ status: 'ACCEPTED', updatedByUserId: input.userId, note: 'Прием телефона на ремонт' }],
          },
        },
      });

      // No expense is booked at intake: estimatedCostTjs here is a rough quote, not a
      // confirmed spend. The real REPAIR_PARTS expense is recorded once, in updateStatus,
      // when the ticket is marked ISSUED with the actual final cost — booking it here too
      // used to double-charge the cash register for every repair with a non-zero estimate.
      if (matchedDevice) {
        await tx.deviceTimelineEvent.create({
          data: {
            deviceId: matchedDevice.id,
            type: 'REPAIR_INTAKE',
            description: `Принят на ремонт, квитанция #${ticket.ticketNumber}`,
            userName: actor.name,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'REPAIR_INTAKE',
          details: `Принят на ремонт телефон ${input.brand} ${input.model} (IMEI ${input.imei}), квитанция #${ticket.ticketNumber}. Неисправность: ${input.problemDescription}`,
          imei: input.imei,
          targetId: ticket.id,
        },
      });

      return ticket;
    });
  }

  public static async updateStatus(ticketId: string, newStatus: string, updatedByUserId: string, note?: string, finalCostTjs?: number) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, updatedByUserId);
      const ticket = await tx.repairTicket.findUnique({ where: { id: ticketId } });
      if (!ticket) throw new Error('Ремонт не найден');
      // Idempotency guard: issuing books a real cash-register expense, so re-issuing an
      // already-ISSUED ticket (double-click, retried request) must not book it twice.
      if (newStatus === 'ISSUED' && ticket.status === 'ISSUED') {
        throw new Error('Этот ремонт уже был выдан клиенту');
      }

      const costVal = finalCostTjs !== undefined && finalCostTjs !== null ? Number(finalCostTjs) : (ticket.finalCostTjs || ticket.estimatedCostTjs || 0);

      const updated = await tx.repairTicket.update({
        where: { id: ticketId },
        data: {
          status: newStatus as any,
          finalCostTjs: costVal > 0 ? costVal : ticket.finalCostTjs,
          statusHistory: { create: [{ status: newStatus as any, updatedByUserId, note }] },
        },
      });

      if (costVal > 0 && newStatus === 'ISSUED') {
        await createExpense(tx, {
          category: 'REPAIR_PARTS',
          amountTjs: costVal,
          storeId: ticket.storeId,
          comment: `Выдача ремонта #${ticket.ticketNumber}: ${ticket.brand} ${ticket.model}`,
          paidFromCashRegister: true,
          createdByUserId: updatedByUserId,
        });
      }

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'REPAIR_STATUS_CHANGE',
          details: `Ремонт #${ticket.ticketNumber} (${ticket.model}): статус "${newStatus}". Расход: ${costVal} TJS списан со счета магазина.`,
          targetId: ticketId,
        },
      });

      return updated;
    });
  }
}
