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
      // Explicit opt-in cap for the app's background/startup load — existing callers that
      // don't pass it keep today's full-history-for-that-period behavior. employeeId powers
      // one employee's full advance/expense history (Employees page), naturally bounded to
      // that one person's own records rather than the whole business's.
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 2000) : undefined;
      const employeeId = typeof req.query.employeeId === 'string' ? req.query.employeeId : undefined;
      const expenses = await prisma.expense.findMany({
        where: {
          ...(storeScopeId ? { storeId: storeScopeId } : {}),
          ...(employeeId ? { employeeId } : dateRange ? { createdAt: dateRange } : {}),
        },
        // Only the store name is ever read (mapExpense) — `include: { store: true }` used
        // to pull the full row, cashBalanceTjs included, into every expense in the list.
        include: { store: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
        ...(employeeId ? {} : limit ? { take: limit } : {}),
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
