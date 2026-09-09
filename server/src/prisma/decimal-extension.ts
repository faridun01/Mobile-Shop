import { Prisma } from '@prisma/client';

/**
 * Every money/rate column in the schema is stored as `Decimal` (exact Postgres NUMERIC,
 * not IEEE-754 float) for correct storage precision. Prisma's client returns those as
 * `Decimal.js` instances by default, which don't support `+`/`-`/`*` operators and
 * serialize to JSON as *strings* — that would silently break every arithmetic
 * expression and API response in the app, which is written throughout as plain
 * `number`. This extension converts every Decimal field back to a `number` at the
 * client boundary, so every existing service/route/mapper keeps working unchanged —
 * only the on-disk storage gained exact precision, application code did not need to
 * change.
 */
function d2n(v: Prisma.Decimal | null | undefined): number | null | undefined {
  if (v === null || v === undefined) return v;
  return v.toNumber();
}

export const decimalExtension = Prisma.defineExtension({
  name: 'decimal-to-number',
  result: {
    store: {
      cashBalanceTjs: {
        needs: { cashBalanceTjs: true },
        compute: (data) => d2n(data.cashBalanceTjs) as number,
      },
    },
    user: {
      baseSalaryTjs: {
        needs: { baseSalaryTjs: true },
        compute: (data) => d2n(data.baseSalaryTjs),
      },
    },
    device: {
      purchasePriceUsd: {
        needs: { purchasePriceUsd: true },
        compute: (data) => d2n(data.purchasePriceUsd) as number,
      },
      costBasisUsd: {
        needs: { costBasisUsd: true },
        compute: (data) => d2n(data.costBasisUsd) as number,
      },
      retailPriceTjs: {
        needs: { retailPriceTjs: true },
        compute: (data) => d2n(data.retailPriceTjs),
      },
    },
    deviceTimelineEvent: {
      priceTjs: {
        needs: { priceTjs: true },
        compute: (data) => d2n(data.priceTjs),
      },
      priceUsd: {
        needs: { priceUsd: true },
        compute: (data) => d2n(data.priceUsd),
      },
    },
    sale: {
      totalTjs: {
        needs: { totalTjs: true },
        compute: (data) => d2n(data.totalTjs) as number,
      },
      totalUsd: {
        needs: { totalUsd: true },
        compute: (data) => d2n(data.totalUsd) as number,
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate),
      },
      cashAmountTjs: {
        needs: { cashAmountTjs: true },
        compute: (data) => d2n(data.cashAmountTjs) as number,
      },
      cardAmountTjs: {
        needs: { cardAmountTjs: true },
        compute: (data) => d2n(data.cardAmountTjs) as number,
      },
      debtAmountTjs: {
        needs: { debtAmountTjs: true },
        compute: (data) => d2n(data.debtAmountTjs) as number,
      },
      exchangeTradeInCreditTjs: {
        needs: { exchangeTradeInCreditTjs: true },
        compute: (data) => d2n(data.exchangeTradeInCreditTjs),
      },
      penaltyFeeTjs: {
        needs: { penaltyFeeTjs: true },
        compute: (data) => d2n(data.penaltyFeeTjs),
      },
      penaltyFeeUsd: {
        needs: { penaltyFeeUsd: true },
        compute: (data) => d2n(data.penaltyFeeUsd),
      },
      actualRefundAmountTjs: {
        needs: { actualRefundAmountTjs: true },
        compute: (data) => d2n(data.actualRefundAmountTjs),
      },
    },
    saleItem: {
      salePriceTjs: {
        needs: { salePriceTjs: true },
        compute: (data) => d2n(data.salePriceTjs) as number,
      },
      salePriceUsd: {
        needs: { salePriceUsd: true },
        compute: (data) => d2n(data.salePriceUsd) as number,
      },
      purchaseCostUsd: {
        needs: { purchaseCostUsd: true },
        compute: (data) => d2n(data.purchaseCostUsd) as number,
      },
      costBasisUsd: {
        needs: { costBasisUsd: true },
        compute: (data) => d2n(data.costBasisUsd) as number,
      },
    },
    exchangeEvent: {
      exchangeInValueTjs: {
        needs: { exchangeInValueTjs: true },
        compute: (data) => d2n(data.exchangeInValueTjs) as number,
      },
      exchangeInValueUsd: {
        needs: { exchangeInValueUsd: true },
        compute: (data) => d2n(data.exchangeInValueUsd) as number,
      },
      newPriceTjs: {
        needs: { newPriceTjs: true },
        compute: (data) => d2n(data.newPriceTjs) as number,
      },
      newPriceUsd: {
        needs: { newPriceUsd: true },
        compute: (data) => d2n(data.newPriceUsd) as number,
      },
      differenceTjs: {
        needs: { differenceTjs: true },
        compute: (data) => d2n(data.differenceTjs) as number,
      },
      cashAmountTjs: {
        needs: { cashAmountTjs: true },
        compute: (data) => d2n(data.cashAmountTjs),
      },
      cardAmountTjs: {
        needs: { cardAmountTjs: true },
        compute: (data) => d2n(data.cardAmountTjs),
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate) as number,
      },
    },
    supplier: {
      totalPurchasedUsd: {
        needs: { totalPurchasedUsd: true },
        compute: (data) => d2n(data.totalPurchasedUsd) as number,
      },
      totalPaidUsd: {
        needs: { totalPaidUsd: true },
        compute: (data) => d2n(data.totalPaidUsd) as number,
      },
      totalDebtUsd: {
        needs: { totalDebtUsd: true },
        compute: (data) => d2n(data.totalDebtUsd) as number,
      },
    },
    supplierInvoice: {
      totalAmountUsd: {
        needs: { totalAmountUsd: true },
        compute: (data) => d2n(data.totalAmountUsd) as number,
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate) as number,
      },
      paidAmountUsd: {
        needs: { paidAmountUsd: true },
        compute: (data) => d2n(data.paidAmountUsd) as number,
      },
    },
    invoiceGroup: {
      purchasePriceUsd: {
        needs: { purchasePriceUsd: true },
        compute: (data) => d2n(data.purchasePriceUsd) as number,
      },
    },
    supplierPayment: {
      amountUsd: {
        needs: { amountUsd: true },
        compute: (data) => d2n(data.amountUsd) as number,
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate) as number,
      },
    },
    supplierPaymentAllocation: {
      allocatedAmountUsd: {
        needs: { allocatedAmountUsd: true },
        compute: (data) => d2n(data.allocatedAmountUsd) as number,
      },
    },
    customer: {
      totalDebtTjs: {
        needs: { totalDebtTjs: true },
        compute: (data) => d2n(data.totalDebtTjs) as number,
      },
      totalPaidTjs: {
        needs: { totalPaidTjs: true },
        compute: (data) => d2n(data.totalPaidTjs) as number,
      },
    },
    customerPayment: {
      amountTjs: {
        needs: { amountTjs: true },
        compute: (data) => d2n(data.amountTjs) as number,
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate) as number,
      },
    },
    customerPaymentAllocation: {
      allocatedAmountTjs: {
        needs: { allocatedAmountTjs: true },
        compute: (data) => d2n(data.allocatedAmountTjs) as number,
      },
    },
    supplierBonus: {
      amountUsd: {
        needs: { amountUsd: true },
        compute: (data) => d2n(data.amountUsd),
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate) as number,
      },
    },
    supplierBonusDevice: {
      costBasisUsd: {
        needs: { costBasisUsd: true },
        compute: (data) => d2n(data.costBasisUsd) as number,
      },
    },
    repairTicket: {
      prepaymentTjs: {
        needs: { prepaymentTjs: true },
        compute: (data) => d2n(data.prepaymentTjs),
      },
      estimatedCostTjs: {
        needs: { estimatedCostTjs: true },
        compute: (data) => d2n(data.estimatedCostTjs),
      },
      finalCostTjs: {
        needs: { finalCostTjs: true },
        compute: (data) => d2n(data.finalCostTjs),
      },
      estimatedCostUsd: {
        needs: { estimatedCostUsd: true },
        compute: (data) => d2n(data.estimatedCostUsd),
      },
      finalCostUsd: {
        needs: { finalCostUsd: true },
        compute: (data) => d2n(data.finalCostUsd),
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate),
      },
    },
    expense: {
      amountTjs: {
        needs: { amountTjs: true },
        compute: (data) => d2n(data.amountTjs) as number,
      },
      amountUsd: {
        needs: { amountUsd: true },
        compute: (data) => d2n(data.amountUsd),
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate),
      },
    },
    owner: {
      capitalBalanceUsd: {
        needs: { capitalBalanceUsd: true },
        compute: (data) => d2n(data.capitalBalanceUsd) as number,
      },
      totalAccruedProfitUsd: {
        needs: { totalAccruedProfitUsd: true },
        compute: (data) => d2n(data.totalAccruedProfitUsd) as number,
      },
      totalPaidProfitUsd: {
        needs: { totalPaidProfitUsd: true },
        compute: (data) => d2n(data.totalPaidProfitUsd) as number,
      },
      totalReinvestedUsd: {
        needs: { totalReinvestedUsd: true },
        compute: (data) => d2n(data.totalReinvestedUsd) as number,
      },
      availableProfitUsd: {
        needs: { availableProfitUsd: true },
        compute: (data) => d2n(data.availableProfitUsd) as number,
      },
    },
    ownerTransaction: {
      amountUsd: {
        needs: { amountUsd: true },
        compute: (data) => d2n(data.amountUsd) as number,
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate) as number,
      },
    },
    exchangeRate: {
      rate: {
        needs: { rate: true },
        compute: (data) => d2n(data.rate) as number,
      },
    },
    ledgerEntry: {
      amountTjs: {
        needs: { amountTjs: true },
        compute: (data) => d2n(data.amountTjs),
      },
      amountUsd: {
        needs: { amountUsd: true },
        compute: (data) => d2n(data.amountUsd),
      },
      exchangeRate: {
        needs: { exchangeRate: true },
        compute: (data) => d2n(data.exchangeRate),
      },
    },
  },
});
