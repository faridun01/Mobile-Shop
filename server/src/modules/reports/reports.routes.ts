import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { computeReportsSummary, computeCashFlowReport, computeAccountStatement, computeIncomeExpenseReport, type ReportPeriod } from './reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

function parsePeriodQuery(req: AuthenticatedRequest, res: any): { period: ReportPeriod; month?: string } | null {
  const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'TODAY';
  const month = typeof req.query.month === 'string' ? req.query.month : undefined;
  if (period === 'SPECIFIC_MONTH' && !month) {
    res.status(400).json({ message: 'month обязателен для периода SPECIFIC_MONTH' });
    return null;
  }
  return { period, month };
}

export function registerReportRoutes(app: Express) {
  // Computes the whole "Финансовый и балансовый отчет" dataset server-side, scoped to the
  // requested period/store at the DB level — this is what used to be a client-side useMemo
  // filtering the FULL, ever-growing sales/expenses history fetched on every login.
  app.get('/api/reports/summary', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'TODAY';
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      if (period === 'SPECIFIC_MONTH' && !month) {
        res.status(400).json({ message: 'month обязателен для периода SPECIFIC_MONTH' });
        return;
      }
      const summary = await computeReportsSummary({ period, month, storeId });
      res.json(summary);
    } catch (error) {
      next(error);
    }
  });

  // The three Finance-module reports (Phase 2) — first reports in this file built on
  // FinancialTransaction/FinancialAccount rather than Sale/Expense/Store.cashBalanceTjs.
  app.get('/api/reports/cash-flow', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = parsePeriodQuery(req, res);
      if (!parsed) return;
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      res.json(await computeCashFlowReport({ ...parsed, storeId }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/reports/account-statement', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const accountId = typeof req.query.accountId === 'string' ? req.query.accountId : undefined;
      if (!accountId) {
        res.status(400).json({ message: 'accountId обязателен' });
        return;
      }
      const parsed = parsePeriodQuery(req, res);
      if (!parsed) return;
      res.json(await computeAccountStatement({ ...parsed, accountId }));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/reports/income-expense', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const parsed = parsePeriodQuery(req, res);
      if (!parsed) return;
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      res.json(await computeIncomeExpenseReport({ ...parsed, storeId }));
    } catch (error) {
      next(error);
    }
  });
}
