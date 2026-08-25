import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { UsersService } from './users.service';

export function registerUserRoutes(app: Express) {
  // Readable by any authenticated role — every page needs to resolve colleague names
  // (sellers on receipts, assignees on tickets, etc.); only safe fields are exposed
  // (UsersService.list() never includes the password hash). Mutations stay ADMIN-only below.
  app.get('/api/users', authenticateJwt, async (_req, res, next) => {
    try {
      res.json(await UsersService.list());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/users', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { login, password, name, role, storeId, baseSalaryTjs, salesCommissionPercent } = req.body ?? {};
      if (!login || !password || !name || !role) {
        res.status(400).json({ message: 'login, password, name и role обязательны' });
        return;
      }
      const user = await UsersService.create({ login, password, name, role, storeId, baseSalaryTjs, salesCommissionPercent, createdByUserId: req.user!.userId });
      res.status(201).json(user);
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/users/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await UsersService.update(req.params.id, req.body ?? {}, req.user!.userId);
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/users/:id/reset-password', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const newPassword = req.body?.newPassword;
      if (!newPassword || String(newPassword).length < 4) {
        res.status(400).json({ message: 'Укажите новый пароль (минимум 4 символа)' });
        return;
      }
      await UsersService.resetPassword(req.params.id, newPassword, req.user!.userId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });

  app.patch('/api/users/:id/status', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const user = await UsersService.setActive(req.params.id, Boolean(req.body?.active), req.user!.userId);
      res.json(user);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/users/:id', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      await UsersService.remove(req.params.id, req.user!.userId);
      res.json({ success: true });
    } catch (error) {
      next(error);
    }
  });
}
