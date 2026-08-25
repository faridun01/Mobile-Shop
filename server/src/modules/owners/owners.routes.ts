import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { OwnersService } from './owners.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerOwnerRoutes(app: Express) {
  app.get('/api/owners', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req, res, next) => {
    try {
      res.json(await prisma.owner.findMany());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/owner-transactions', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req, res, next) => {
    try {
      res.json(await prisma.ownerTransaction.findMany({ orderBy: { createdAt: 'desc' } }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/investment', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, destination, note } = req.body ?? {};
      const owner = await OwnersService.investment(req.params.id, Number(amountUsd), destination ?? 'Главный счет', note, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/withdrawal', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, source, note } = req.body ?? {};
      const owner = await OwnersService.withdrawal(req.params.id, Number(amountUsd), source ?? 'Главный счет', note, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/payout', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, source, note } = req.body ?? {};
      const owner = await OwnersService.payout(req.params.id, Number(amountUsd), source ?? 'Главный счет', note, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/:id/reinvest', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amountUsd, note } = req.body ?? {};
      const owner = await OwnersService.reinvest(req.params.id, Number(amountUsd), note, req.user!.userId);
      RealtimeSyncGateway.broadcast('OWNER_TX', { ownerId: owner.id });
      res.json(owner);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/profit-shares', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const shares = req.body?.shares;
      if (!Array.isArray(shares) || shares.length === 0) {
        res.status(400).json({ message: 'shares обязателен и должен быть непустым массивом' });
        return;
      }
      const owners = await OwnersService.updateProfitShares(shares, req.user!.userId);
      res.json(owners);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/quarter-close', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { quarterName, transferRemainingToCapital } = req.body ?? {};
      if (!quarterName) {
        res.status(400).json({ message: 'quarterName обязателен' });
        return;
      }
      const owners = await OwnersService.closeQuarter(quarterName, Boolean(transferRemainingToCapital), req.user!.userId);
      res.json(owners);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/owners/reset-capital', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const owners = await OwnersService.resetAllCapital(req.user!.userId);
      res.json(owners);
    } catch (error) {
      next(error);
    }
  });
}
