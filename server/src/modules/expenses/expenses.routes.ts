import type { Express } from 'express';
import { authenticateJwt, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { createExpenseStandalone } from './expenses.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

export function registerExpenseRoutes(app: Express) {
  app.get('/api/expenses', authenticateJwt, async (_req, res, next) => {
    try {
      const expenses = await prisma.expense.findMany({ include: { store: true }, orderBy: { createdAt: 'desc' } });
      res.json(expenses);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/expenses', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
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
