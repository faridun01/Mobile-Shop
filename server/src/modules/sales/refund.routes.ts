import { D } from '../../common/decimal';
import { roundMoney } from '../../common/money';
import type { Express } from 'express';
import type { Prisma } from '@prisma/client';
import { authenticateJwt, requireRoles, enforceStoreScope, type AuthenticatedRequest } from '../../auth/auth.middleware';
import { prisma } from '../../prisma/prisma.service';
import { AnnulmentService } from './annulment.service';
import { CancellationService } from './cancellation.service';
import { activeRefundLogs } from './cancellation-audit';
import { RefundService } from './refund.service';
import { SaleEditService } from './edit.service';
import { ReturnsService } from './returns.service';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';
import { calculateRecognizedProfit, reversedProfitByReturn } from './profit';
import { hideSaleCosts } from './sale-visibility';
import { deviceCodeCandidates } from '../../common/device-code';
import { dateRangeForPeriod, dateRangeForCustomDates, type ReportPeriod } from '../reports/reports.service';

const VALID_PERIODS: ReportPeriod[] = ['TODAY', 'MONTH', 'SPECIFIC_MONTH', 'ALL'];

/** The names and quantities of accessory units an exchange took back, without their prices or costs. */
const returnedLineNames = (lines: Prisma.JsonValue) => (Array.isArray(lines)
  ? lines.map((line) => ({ name: String((line as { name?: unknown })?.name ?? ''), quantity: Number((line as { quantity?: unknown })?.quantity) || 0 }))
  : []);

export function registerRefundRoutes(app: Express) {
  app.get('/api/sales', authenticateJwt, enforceStoreScope, async (req: AuthenticatedRequest, res, next) => {
    try {
      const storeId = typeof req.query.storeId === 'string' ? req.query.storeId : undefined;
      // A caller looking up one specific sale (refund/exchange/repair-intake scanning a
      // receipt or IMEI) needs to reach any point in history, not just the default/period
      // window — so it runs its own targeted, indexed lookup instead of being bounded by
      // `limit` or `period`. receiptNumber and Device.imei are both unique-indexed; the IMEI
      // branch goes through saleItems.deviceId (indexed) rather than needing a new index.
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : undefined;
      // sellerId powers a single employee's full sales history (Employees page) — naturally
      // bounded to that one person's lifetime sales, not the whole business's.
      const sellerId = typeof req.query.sellerId === 'string' ? req.query.sellerId : undefined;
      // Explicit opt-in cap for the app's background/startup load — existing callers that
      // don't pass it (e.g. the Reports export preview's period=ALL) keep today's behavior.
      const limit = req.query.limit !== undefined ? Math.min(Math.max(Number(req.query.limit) || 0, 1), 2000) : undefined;

      let where: Prisma.SaleWhereInput;
      if (search) {
        // receiptNumber is a Postgres Int32 — an IMEI (14-15 digits) parses as a valid
        // number but overflows it, so cap what's treated as a candidate receipt number
        // to what the column can actually hold (also rules out IMEIs by length in practice).
        const parsedReceipt = /^\d+$/.test(search) ? Number(search) : NaN;
        const receiptNumber = Number.isSafeInteger(parsedReceipt) && parsedReceipt <= 2147483647 ? parsedReceipt : undefined;
        where = {
          ...(storeId ? { storeId } : {}),
          OR: [
            ...(receiptNumber !== undefined ? [{ receiptNumber }] : []),
            // A phone's IMEI or a tablet's SN (any letter case); an accessory's barcode.
            { saleItems: { some: { OR: [{ imei: { in: deviceCodeCandidates(search) } }, { imei2: { in: deviceCodeCandidates(search) } }] } } },
            { accessoryItems: { some: { barcode: search.replace(/\s+/g, '').toUpperCase() } } },
          ],
        };
      } else {
        // period/month let the Reports export preview ask for exactly the range it's showing,
        // instead of the client filtering the entire sales history it used to fetch in full.
        const period = VALID_PERIODS.includes(req.query.period as ReportPeriod) ? (req.query.period as ReportPeriod) : 'ALL';
        const month = typeof req.query.month === 'string' ? req.query.month : undefined;
        const startDate = typeof req.query.startDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.startDate) ? req.query.startDate : undefined;
        const endDate = typeof req.query.endDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(req.query.endDate) ? req.query.endDate : undefined;
        const dateRange = startDate
          ? dateRangeForCustomDates(startDate, endDate)
          : dateRangeForPeriod(period, month);
        where = {
          ...(storeId ? { storeId } : {}),
          ...(sellerId ? { userId: sellerId } : {}),
          ...(dateRange ? { createdAt: dateRange } : {}),
        };
      }

      const sales = await prisma.sale.findMany({
        where: { ...where, annulledAt: null },
        // `user: true` used to pull the seller's full row — password hash and PIN
        // included — into every sales-history response. Only the display fields are
        // actually used (receipt "sold by"), so select those explicitly instead.
        include: {
          saleItems: { include: { device: { select: { ram: true } } } },
          accessoryItems: true,
          exchangeEvents: true,
          // Returns from this receipt (with the receipt an exchange went on to), and, for a
          // receipt opened by an exchange, the receipt the returned phone came from.
          returns: { orderBy: { createdAt: 'asc' }, include: { exchangeSale: { select: { id: true, receiptNumber: true } } } },
          exchangeReturn: {
            select: {
              id: true, createdAt: true, exchangeRate: true, bookedUsd: true, fxUsd: true, accessoryLines: true,
              creditTjs: true, creditUsd: true, withheldTjs: true, withheldUsd: true, payoutTjs: true, payoutUsd: true,
              items: { select: { brand: true, model: true } },
              sale: { select: { id: true, receiptNumber: true, createdAt: true, exchangeRate: true } },
            },
          },
          // Only the store's name is read (receipt header); not its full row with the cash balance.
          store: { select: { id: true, name: true, isMainWarehouse: true } },
          user: { select: { id: true, name: true, role: true } }
        },
        orderBy: { createdAt: 'desc' },
        ...(search ? { take: 20 } : limit ? { take: limit } : {}),
      });
      const saleIds = sales.map((sale) => sale.id);
      // An exchange receipt also needs the return log of the receipt its old goods came from.
      const logSaleIds = [...new Set([...saleIds, ...sales.flatMap((sale) => (sale.exchangeReturn ? [sale.exchangeReturn.sale.id] : []))])];
      const profitLogs = logSaleIds.length
        ? await prisma.auditLog.findMany({
            where: { targetId: { in: logSaleIds }, action: { in: ['SALE', 'SALE_BELOW_COST', 'EXCHANGE', 'REFUND', 'SALE_RETURN', 'SALE_RETURN_CANCEL', 'REFUND_CANCEL'] } },
            select: { id: true, targetId: true, action: true, financialDetails: true },
          })
        : [];
      const profits = new Map<string, typeof profitLogs>();
      for (const log of profitLogs) if (log.targetId) profits.set(log.targetId, [...(profits.get(log.targetId) ?? []), log]);
      // Purchase cost and profit are ADMIN-only, the same rule /api/devices applies; store
      // staff get the receipt itself without them.
      const showCost = req.user!.role === 'ADMIN';
      // The profit each return took back (booked on the sale's day), so a receipt can show its
      // profit day by day; derived from cost, so ADMIN-only too.
      const reversedByReturn = showCost ? reversedProfitByReturn(profitLogs) : new Map();
      const reversedProfitUsd = (returnId: string) => reversedByReturn.get(returnId);
      res.json(sales.map((sale) => {
        const fallbackCost = sale.saleItems.reduce((sum, item) => D(sum).plus(item.costBasisUsd), D(0))
          .plus(sale.accessoryItems.reduce((sum, line) => D(sum).plus(line.costUsd), D(0)));
        // The dollars that left the register on the refund (its own day's rate), as recorded then.
        const liveLogs = activeRefundLogs(profits.get(sale.id) ?? []);
        const refundDetails = liveLogs.find((log) => log.action === 'REFUND')?.financialDetails as Record<string, unknown> | undefined;
        const actualRefundUsd = typeof refundDetails?.amountUsd === 'number' ? refundDetails.amountUsd : undefined;
        // The owners' profit change on the day the whole receipt was refunded (its profit taken
        // back, plus what was withheld and the rate result), as posted; ADMIN-only like all profit.
        const refundAllocations = refundDetails?.ownerProfitAllocations;
        const refundProfitUsd = showCost && Array.isArray(refundAllocations)
          ? roundMoney(refundAllocations.reduce((sum: ReturnType<typeof D>, row: { amountUsd?: unknown }) => sum.plus(typeof row?.amountUsd === 'number' ? row.amountUsd : 0), D(0)))
          : undefined;
        return hideSaleCosts({
          ...sale,
          actualRefundUsd,
          refundProfitUsd,
          isCancelled: refundDetails?.isCancellation === true,
          saleItems: sale.saleItems.map((item: any) => ({
            ...item,
            ram: item.device?.ram || item.ram || undefined,
          })),
          recognizedProfitUsd: showCost
            ? calculateRecognizedProfit(liveLogs, D(sale.totalUsd).minus(fallbackCost))
            : undefined,
          returns: sale.returns.map((ret) => ({ ...ret, reversedProfitUsd: reversedProfitUsd(ret.id) })),
          exchangeReturn: sale.exchangeReturn
            ? { ...sale.exchangeReturn, accessoryLines: returnedLineNames(sale.exchangeReturn.accessoryLines), reversedProfitUsd: reversedProfitUsd(sale.exchangeReturn.id) }
            : null,
        }, req.user!.role);
      }));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/sales/:id/refund', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const saleRecord = await prisma.sale.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
        if (!saleRecord || saleRecord.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Нет доступа к возврату товаров другого магазина' });
          return;
        }
      }
      const { reason, refundAmountTjs, penaltyFeeTjs, paymentMethod } = req.body ?? {};
      if (!reason || refundAmountTjs == null || !paymentMethod) {
        res.status(400).json({ message: 'reason, refundAmountTjs и paymentMethod обязательны' });
        return;
      }
      // A zero penalty returns the full collected amount. The service validates negatives.
      const sale = await RefundService.refund({
        saleId: req.params.id,
        reason,
        // Validated (with a readable message) by RefundService — wrapping in D() here
        // turned a missing optional penalty into a raw DecimalError.
        refundAmountTjs,
        penaltyFeeTjs: penaltyFeeTjs ?? undefined,
        paymentMethod,
        refundedByUserId: req.user!.userId,
      });

      RealtimeSyncGateway.broadcast('REFUND_PROCESSED', { saleId: sale.id }, { storeIds: [sale.storeId] });
      res.json(sale);
    } catch (error) {
      next(error);
    }
  });

  // Corrections are admin/partner-only and always scoped to the receipt's store.
  app.post('/api/sales/:id/cancel-operation', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const sale = await prisma.sale.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
      if (!sale) throw new Error('Чек не найден');
      if (req.user!.role !== 'ADMIN' && sale.storeId !== req.user!.storeId) {
        res.status(403).json({ message: 'Нет доступа к отмене операций другого магазина' });
        return;
      }
      const { kind, returnId, reason } = req.body ?? {};
      if (kind !== 'ANNUL' && (typeof reason !== 'string' || !reason.trim())) throw new Error('Укажите причину отмены');
      if (!['SALE', 'RETURN', 'REFUND', 'ANNUL'].includes(kind)) throw new Error('Некорректная операция для отмены');
      if (kind === 'RETURN' && (typeof returnId !== 'string' || !returnId)) throw new Error('Выберите возврат для отмены');
      const result = kind === 'ANNUL'
        ? await AnnulmentService.annul(req.params.id, req.user!.userId, req.user!.role === 'ADMIN' ? undefined : req.user!.storeId)
        : kind === 'SALE'
        ? await CancellationService.cancelSale(req.params.id, req.user!.userId, reason)
        : await CancellationService.cancelReturn(req.params.id, kind === 'RETURN' ? returnId : undefined, req.user!.userId, reason);
      const annulledSaleIds = 'receiptIds' in result ? result.receiptIds : undefined;
      RealtimeSyncGateway.broadcast('REFUND_PROCESSED', { saleId: req.params.id, annulledSaleIds }, { storeIds: [result.storeId] });
      res.json({ success: true, annulledSaleIds });
    } catch (error) { next(error); }
  });

  // Admin corrections of a receipt's prices, a return's or refund's withheld amount, or an exchange:
  // recalculated at the operation's own rate and on its own day (see SaleEditService).
  app.post('/api/sales/:id/edit', authenticateJwt, requireRoles('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
    try {
      const body = req.body ?? {};
      const rows = (value: unknown) => (Array.isArray(value) ? value : undefined);
      const priced = {
        items: rows(body.items)?.map((row: any) => ({ saleItemId: String(row?.saleItemId ?? ''), salePriceTjs: row?.salePriceTjs })),
        accessories: rows(body.accessories)?.map((row: any) => ({ lineId: String(row?.lineId ?? ''), unitPriceTjs: row?.unitPriceTjs })),
        cashAmountTjs: body.cashAmountTjs ?? undefined,
        cardAmountTjs: body.cardAmountTjs ?? undefined,
      };
      const withheld = (items: unknown, accessories: unknown) => ({
        items: rows(items)?.map((row: any) => ({ saleItemId: String(row?.saleItemId ?? ''), withheldTjs: row?.withheldTjs })),
        accessories: rows(accessories)?.map((row: any) => ({ lineId: String(row?.lineId ?? ''), withheldTjs: row?.withheldTjs })),
      });
      const userId = req.user!.userId;
      let result: { storeId: string };
      if (body.kind === 'SALE') {
        result = await SaleEditService.editSale(req.params.id, priced, userId);
      } else if (body.kind === 'RETURN') {
        if (typeof body.returnId !== 'string' || !body.returnId) throw new Error('Выберите возврат для исправления');
        result = await SaleEditService.editReturn(req.params.id, body.returnId, { ...withheld(body.items, body.accessories), payoutMethod: body.payoutMethod ?? undefined }, userId);
      } else if (body.kind === 'REFUND') {
        result = await SaleEditService.editRefund(req.params.id, body.penaltyFeeTjs, userId);
      } else if (body.kind === 'EXCHANGE') {
        const ret = withheld(body.returnItems, body.returnAccessories);
        result = await SaleEditService.editExchange(req.params.id, {
          ...priced, returnItems: ret.items, returnAccessories: ret.accessories, returnWithheldTjs: body.returnWithheldTjs ?? undefined,
        }, userId);
      } else {
        throw new Error('Некорректная операция для исправления');
      }
      RealtimeSyncGateway.broadcast('REFUND_PROCESSED', { saleId: req.params.id }, { storeIds: [result.storeId] });
      res.json({ success: true });
    } catch (error) { next(error); }
  });

  // Return of chosen phones from a receipt, each with its own withheld amount (удержание).
  app.post('/api/sales/:id/return-items', authenticateJwt, requireRoles('ADMIN', 'PARTNER'), async (req: AuthenticatedRequest, res, next) => {
    try {
      if (req.user!.role === 'PARTNER') {
        const saleRecord = await prisma.sale.findUnique({ where: { id: req.params.id }, select: { storeId: true } });
        if (!saleRecord || saleRecord.storeId !== req.user!.storeId) {
          res.status(403).json({ message: 'Нет доступа к возврату товаров другого магазина' });
          return;
        }
      }
      const { reason, paymentMethod } = req.body ?? {};
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const accessories = Array.isArray(req.body?.accessories) ? req.body.accessories : [];
      if ((items.length === 0 && accessories.length === 0) || !paymentMethod) {
        res.status(400).json({ message: 'Выберите товары для возврата и способ возврата денег' });
        return;
      }
      // Zero withholding means a full refund for the selected goods.
      const result = await ReturnsService.returnItems({
        saleId: req.params.id,
        items: items.map((item: any) => ({ saleItemId: String(item?.saleItemId ?? ''), withheldTjs: item?.withheldTjs })),
        accessories: accessories.map((line: any) => ({ lineId: String(line?.lineId ?? ''), quantity: Number(line?.quantity), withheldTjs: line?.withheldTjs })),
        reason,
        payoutMethod: paymentMethod,
        userId: req.user!.userId,
      });
      RealtimeSyncGateway.broadcast('REFUND_PROCESSED', { saleId: req.params.id }, { storeIds: [result.storeId] });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
