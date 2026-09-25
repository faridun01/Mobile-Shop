import { D, decimalMin, decimalMax, moneyJson, type MoneyInput } from '../../common/decimal';
import type { Express } from 'express';
import { authenticateJwt, requireRoles, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import type { ReportPeriod } from '../reports/reports.service';
import {
  listAccounts,
  listCategories,
  createCategory,
  createCashReceipt,
  createCashExpense,
  createTransfer,
  cancelFinancialTransaction,
  listTransactions,
  getTransactionById,
} from './finance.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

/** Best-effort — a missing or malformed header just means no dedupe protection for that
 * one request, never a rejected request (idempotency is hardening, not a required contract). */
function readIdempotencyKey(req: AuthenticatedRequest): string | undefined {
  const header = req.header('Idempotency-Key');
  return typeof header === 'string' && header.trim().length > 0 && header.length <= 200 ? header.trim() : undefined;
}

// Every route here is ADMIN/PARTNER-only — SELLER has no access to the Finance module at
// all in this phase (matches the existing Suppliers/Owners/Reports precedent), so unlike
// expenses.routes.ts there is no enforceBodyStoreScope/store-scoping logic to apply.
export function registerFinanceRoutes(app: Express) {
  app.get('/api/finance/accounts', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req, res, next) => {
    try {
      res.json(await listAccounts());
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/finance/categories', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (_req, res, next) => {
    try {
      res.json(await listCategories());
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/finance/categories', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { name, direction } = req.body ?? {};
      if (!name || !direction) {
        res.status(400).json({ message: 'name и direction обязательны' });
        return;
      }
      const category = await createCategory({ name, direction });
      RealtimeSyncGateway.broadcast('FINANCIAL_CATEGORY_CREATED', { categoryId: category.id });
      res.status(201).json(category);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/finance/transactions', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : undefined;
      const month = typeof req.query.month === 'string' ? req.query.month : undefined;
      if (period === 'SPECIFIC_MONTH' && !month) {
        res.status(400).json({ message: 'month обязателен для периода SPECIFIC_MONTH' });
        return;
      }
      const result = await listTransactions({
        cursor: typeof req.query.cursor === 'string' ? req.query.cursor : undefined,
        limit: req.query.limit !== undefined ? Number(req.query.limit) : undefined,
        period,
        month,
        type: typeof req.query.type === 'string' ? req.query.type : undefined,
        accountId: typeof req.query.accountId === 'string' ? req.query.accountId : undefined,
        shopId: typeof req.query.shopId === 'string' ? req.query.shopId : undefined,
        categoryId: typeof req.query.categoryId === 'string' ? req.query.categoryId : undefined,
        counterpartyType: typeof req.query.counterpartyType === 'string' ? req.query.counterpartyType : undefined,
        counterpartyId: typeof req.query.counterpartyId === 'string' ? req.query.counterpartyId : undefined,
        currency: typeof req.query.currency === 'string' ? req.query.currency : undefined,
        status: typeof req.query.status === 'string' ? req.query.status : undefined,
        search: typeof req.query.search === 'string' ? req.query.search : undefined,
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/finance/transactions/:id', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const transaction = await getTransactionById(req.params.id);
      if (!transaction) {
        res.status(404).json({ message: 'Операция не найдена' });
        return;
      }
      res.json(transaction);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/finance/cash-receipt', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { accountId, amount, currency, categoryId, categoryName, counterpartyType, counterpartyId, counterpartyName, shopId, description, comment } = req.body ?? {};
      if (!accountId || !amount || !currency || !description) {
        res.status(400).json({ message: 'accountId, amount, currency и description обязательны' });
        return;
      }
      const created = await createCashReceipt({
        accountId, amount: D(amount), currency, categoryId, categoryName,
        counterpartyType, counterpartyId, counterpartyName, shopId, description, comment,
        createdByUserId: req.user!.userId,
        idempotencyKey: readIdempotencyKey(req),
      });
      RealtimeSyncGateway.broadcast('FINANCIAL_TRANSACTION_CREATED', { transactionId: created.id, accountId: created.accountId }, created.shopId ? { storeIds: [created.shopId] } : undefined);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/finance/cash-expense', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { accountId, amount, currency, categoryId, categoryName, counterpartyType, counterpartyId, counterpartyName, shopId, description, comment } = req.body ?? {};
      if (!accountId || !amount || !currency || !description) {
        res.status(400).json({ message: 'accountId, amount, currency и description обязательны' });
        return;
      }
      const created = await createCashExpense({
        accountId, amount: D(amount), currency, categoryId, categoryName,
        counterpartyType, counterpartyId, counterpartyName, shopId, description, comment,
        createdByUserId: req.user!.userId,
        idempotencyKey: readIdempotencyKey(req),
      });
      RealtimeSyncGateway.broadcast('FINANCIAL_TRANSACTION_CREATED', { transactionId: created.id, accountId: created.accountId }, created.shopId ? { storeIds: [created.shopId] } : undefined);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/finance/transfer', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const { accountId, destinationAccountId, amount, currency, shopId, description, comment } = req.body ?? {};
      if (!accountId || !destinationAccountId || !amount || !currency || !description) {
        res.status(400).json({ message: 'accountId, destinationAccountId, amount, currency и description обязательны' });
        return;
      }
      const created = await createTransfer({
        accountId, destinationAccountId, amount: D(amount), currency, shopId, description, comment,
        createdByUserId: req.user!.userId,
        idempotencyKey: readIdempotencyKey(req),
      });
      RealtimeSyncGateway.broadcast('FINANCIAL_TRANSACTION_CREATED', { transactionId: created.id, accountId: created.accountId }, created.shopId ? { storeIds: [created.shopId] } : undefined);
      res.status(201).json(created);
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/finance/transactions/:id/cancel', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const reversal = await cancelFinancialTransaction(req.params.id, req.user!.userId, readIdempotencyKey(req));
      RealtimeSyncGateway.broadcast('FINANCIAL_TRANSACTION_CANCELLED', { transactionId: req.params.id, reversalId: reversal.id, accountId: reversal.accountId }, reversal.shopId ? { storeIds: [reversal.shopId] } : undefined);
      res.json(reversal);
    } catch (error) {
      next(error);
    }
  });
}
