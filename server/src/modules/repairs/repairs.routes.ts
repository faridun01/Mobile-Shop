import type { Express } from 'express';
import { authenticateJwt, enforceBodyStoreScope, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RepairsService } from './repairs.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerRepairRoutes(app: Express) {
  app.get('/api/repairs', authenticateJwt, async (_req, res, next) => {
    try {
      const repairs = await prisma.repairTicket.findMany({
        include: { statusHistory: { orderBy: { updatedAt: 'asc' } }, store: true, user: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(repairs);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/repairs', authenticateJwt, enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      if (!body.storeId || !body.imei || !body.brand || !body.model || !body.problemDescription) {
        res.status(400).json({ message: 'storeId, imei, brand, model и problemDescription обязательны' });
        return;
      }
      const ticket = await RepairsService.create({ ...body, userId: req.user!.userId });
      RealtimeSyncGateway.broadcast('REPAIR_UPDATED', { ticketId: ticket.id }, { storeIds: [body.storeId] });
      res.status(201).json(ticket);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/repairs/:id/status', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { status, note, finalCostTjs } = req.body ?? {};
      if (!status) {
        res.status(400).json({ message: 'status обязателен' });
        return;
      }
      const ticket = await RepairsService.updateStatus(req.params.id, status, req.user!.userId, note, finalCostTjs);
      RealtimeSyncGateway.broadcast('REPAIR_UPDATED', { ticketId: ticket.id }, { storeIds: [ticket.storeId] });
      res.json(ticket);
    } catch (error) {
      next(error);
    }
  });
}
