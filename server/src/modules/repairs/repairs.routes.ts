import type { Express } from 'express';
import { authenticateJwt, enforceBodyStoreScope, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { RepairsService } from './repairs.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerRepairRoutes(app: Express) {
  app.get('/api/repairs', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeScopeId = req.user!.role === 'SELLER' && req.user!.storeId ? req.user!.storeId : typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      // period/month let the Reports export preview ask for exactly the range it's showing,
      // instead of the client filtering the entire repairs history it used to fetch in full.
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const dateRange = dateRangeForPeriod(period, month);
      // estimatedCostUsd/finalCostUsd/exchangeRate are snapshotted directly on the ticket when
      // each cost is actually set (RepairsService.create / updateStatus), at that day's rate —
      // no per-request conversion needed here, unlike the old approach that re-derived them
      // from rate history on every read.
      const repairs = await prisma.repairTicket.findMany({
        where: { ...(storeScopeId ? { storeId: storeScopeId } : {}), ...(dateRange ? { createdAt: dateRange } : {}) },
        // `user: true` used to pull the technician's full row — password hash and PIN
        // included — into every repairs-list response. Only the display fields are
        // actually used, so select those explicitly instead.
        include: { statusHistory: { orderBy: { updatedAt: 'asc' } }, store: true, user: { select: { id: true, name: true, role: true } } },
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
      // A SELLER may only update tickets belonging to their own store.
      if (req.user!.role === 'SELLER') {
        const existing = await prisma.repairTicket.findUnique({ where: { id: req.params.id } });
        if (!existing || existing.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Эта квитанция на ремонт принадлежит другому магазину' });
          return;
        }
      }
      const parsedCost = finalCostTjs !== undefined && finalCostTjs !== null ? Number(finalCostTjs) : undefined;
      const ticket = await RepairsService.updateStatus(req.params.id, status, req.user!.userId, note, parsedCost);
      RealtimeSyncGateway.broadcast('REPAIR_UPDATED', { ticketId: ticket.id }, { storeIds: [ticket.storeId] });
      res.json(ticket);
    } catch (error) {
      next(error);
    }
  });
}
