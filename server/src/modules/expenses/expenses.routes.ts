import type { Express } from 'express';
import { authenticateJwt, enforceBodyStoreScope, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { createExpenseStandalone, updateExpense, deleteExpense } from './expenses.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { dateRangeForPeriod, type ReportPeriod } from '../reports/reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

export function registerExpenseRoutes(app: Express) {
  app.get('/api/expenses', authenticateJwt, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeScopeId = req.user!.role === 'SELLER' ? req.user!.storeId ?? '__none__' : typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      // period/month let the Reports export preview ask for exactly the range it's showing,
      // instead of the client filtering the entire expense history it used to fetch in full.
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const dateRange = dateRangeForPeriod(period, month);
      const expenses = await prisma.expense.findMany({
        where: { ...(storeScopeId ? { storeId: storeScopeId } : {}), ...(dateRange ? { createdAt: dateRange } : {}) },
        include: { store: true },
        orderBy: { createdAt: 'desc' },
      });
      res.json(expenses);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/expenses', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), enforceBodyStoreScope, async (req: AuthenticatedRequest, res, next) => {
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

  app.put('/api/expenses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const expense = await updateExpense(req.params.id, req.body ?? {}, req.user!.userId);
      RealtimeSyncGateway.broadcast('EXPENSE_UPDATED', { expenseId: expense.id });
      res.json(expense);
    } catch (error) {
      next(error);
    }
  });

  app.delete('/api/expenses/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const result = await deleteExpense(req.params.id, req.user!.userId);
      RealtimeSyncGateway.broadcast('EXPENSE_DELETED', { expenseId: req.params.id });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
