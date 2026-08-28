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

      const costTjs = input.repairCostTjs || input.estimatedCostTjs || 0;

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

      if (costTjs > 0) {
        await createExpense(tx, {
          category: 'REPAIR_PARTS',
          amountTjs: costTjs,
          storeId: input.storeId,
          comment: `Ремонт #${ticket.ticketNumber}: ${input.brand} ${input.model}`,
          paidFromCashRegister: true,
          createdByUserId: input.userId,
        });
      }

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

      const updated = await tx.repairTicket.update({
        where: { id: ticketId },
        data: {
          status: newStatus as any,
          finalCostTjs: finalCostTjs ?? ticket.finalCostTjs,
          statusHistory: { create: [{ status: newStatus as any, updatedByUserId, note }] },
        },
      });

      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'REPAIR_STATUS_CHANGE',
          details: `Ремонт #${ticket.ticketNumber} (${ticket.model}): изменен статус на "${newStatus}" (${note || 'без примечания'})`,
          targetId: ticketId,
        },
      });

      return updated;
    });
  }
}
