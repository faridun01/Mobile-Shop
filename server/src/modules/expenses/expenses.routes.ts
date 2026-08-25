import type { Express } from 'express';
import { authenticateJwt, enforceBodyStoreScope, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { createExpenseStandalone } from './expenses.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerExpenseRoutes(app: Express) {
  app.get('/api/expenses', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      // Mirrors ExpensesPage's existing client-side seller filter (storeId must match
      // their own store) — enforced server-side too, since the API must not trust
      // a client to withhold data on its own.
      const storeScope = req.user!.role === 'SELLER' ? { storeId: req.user!.storeId ?? '__none__' } : undefined;
      const expenses = await prisma.expense.findMany({ where: storeScope, include: { store: true }, orderBy: { createdAt: 'desc' } });
      res.json(expenses);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/expenses', authenticateJwt, enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { category, amountTjs, targetType, storeId, sourceAccount, comment, description, paidFromCashRegister, employeeId, isEmployeeAdvance } =
        req.body ?? {};
      if (!category || !amountTjs) {
        res.status(400).json({ message: 'category и amountTjs обязательны' });
        return;
      }

      const expense = await createExpenseStandalone({
        category,
        amountTjs: Number(amountTjs),
        targetType,
        storeId,
        sourceAccount,
        comment,
        description,
        paidFromCashRegister,
        employeeId,
        isEmployeeAdvance,
        createdByUserId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('EXPENSE_CREATED', { expenseId: expense.id }, storeId ? { storeIds: [storeId] } : undefined);
      res.status(201).json(expense);
    } catch (error) {
      next(error);
    }
  });
}
