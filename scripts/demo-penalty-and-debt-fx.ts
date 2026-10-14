import { D, roundMoney } from '../server/src/common/money';
import { prisma } from '../server/src/prisma/prisma.service';
import { SalesService } from '../server/src/modules/sales/sales.service';
import { RefundService } from '../server/src/modules/sales/refund.service';
import { CustomersService } from '../server/src/modules/customers/customers.service';
import { computeReportsSummary } from '../server/src/modules/reports/reports.service';

async function main() {
  console.log('=====================================================');
  console.log('🧪 ДЕМОНСТРАЦИЯ И АНАЛИЗ ОПЕРАЦИЙ:');
  console.log('1. «Удержано при возвратах» (Штраф / Restocking Fee)');
  console.log('2. «Разница при погашении долгов (TJS по курсу дня оплаты)» (Debt FX)');
  console.log('=====================================================\n');

  // Убеждаемся, что смена сегодня открыта
  await prisma.dailyCashClosing.deleteMany({
    where: { storeId: 'store-siyoma', businessDate: '2026-10-14' },
  });

  // -------------------------------------------------------------------------
  // ТЕСТ 1: УДЕРЖАНИЕ ПРИ ВОЗВРАТЕ (PENALTY FEE)
  // -------------------------------------------------------------------------
  console.log('--- ТЕСТ 1: УДЕРЖАНИЕ ПРИ ВОЗВРАТЕ ---');
  // 1.1 Находим свободный телефон в «Сиёма»
  const devForRefund = await prisma.device.findFirstOrThrow({
    where: { storeId: 'store-siyoma', status: 'STORE_STOCK' },
  });

  // 1.2 Оформляем продажу за 6 000 TJS
  const sale1 = await SalesService.executeSale({
    storeId: 'store-siyoma',
    userId: 'user-admin',
    items: [{ deviceId: devForRefund.id, salePriceTjs: 6000 }],
    paymentMethod: 'CASH',
    customerName: 'Давлат Тестов',
  });
  console.log(`   ✓ Создана продажа #${sale1.receiptNumber} на сумму 6 000 TJS (${devForRefund.brand} ${devForRefund.model})`);

  // 1.3 Оформляем возврат с удержанием 400 TJS (например, за распечатанную коробку)
  // Клиент получает 5 600 TJS, а 400 TJS (≈ $42.78) остаётся магазину как прибыль
  const refundResult = await RefundService.refund({
    saleId: sale1.id,
    reason: 'Возврат товара надлежащего качества (удержание 400 TJS за вскрытие)',
    refundAmountTjs: 5600,
    penaltyFeeTjs: 400,
    paymentMethod: 'CASH',
    refundedByUserId: 'user-admin',
  });
  console.log(`   ✓ Оформлен возврат чека #${sale1.receiptNumber}:`);
  console.log(`     - Выдано клиенту: 5 600 TJS`);
  console.log(`     - УДЕРЖАНО МАГАЗИНОМ: 400 TJS ($${Number(refundResult.penaltyFeeUsd).toFixed(2)} USD)`);

  // -------------------------------------------------------------------------
  // ТЕСТ 2: КУРСОВАЯ РАЗНИЦА ПРИ ПОГАШЕНИИ ДОЛГА (DEBT FX GAIN / LOSS)
  // -------------------------------------------------------------------------
  console.log('\n--- ТЕСТ 2: КУРСОВАЯ РАЗНИЦА ПРИ ПОГАШЕНИИ ДОЛГА ---');
  // 2.1 Находим телефон для продажи в долг
  const devForDebt = await prisma.device.findFirstOrThrow({
    where: { storeId: 'store-siyoma', status: 'STORE_STOCK' },
  });

  // Создаем или берем клиента
  const customer = await prisma.customer.upsert({
    where: { phone: '+992938887766' },
    update: {},
    create: {
      name: 'Умед Должников',
      phone: '+992938887766',
    },
  });

  // 2.2 Продажа в долг на 9 200 TJS в Августе при курсе 9.20 (эквивалент $1 000 USD)
  const saleDebt = await SalesService.executeSale({
    storeId: 'store-siyoma',
    userId: 'user-admin',
    items: [{ deviceId: devForDebt.id, salePriceTjs: 9200 }],
    paymentMethod: 'DEBT',
    customerId: customer.id,
    customerName: customer.name,
    customerPhone: customer.phone,
    debtAmountTjs: 9200,
  });

  const augustRate = 9.20;
  const augustDate = new Date('2026-08-15T10:00:00Z');

  // Датируем продажу августом по курсу 9.20 (долг клиента $1000)
  await prisma.sale.update({
    where: { id: saleDebt.id },
    data: {
      createdAt: augustDate,
      exchangeRate: augustRate,
      totalUsd: 1000,
    },
  });
  console.log(`   ✓ [15 Августа 2026] Оформлена продажа в долг #${saleDebt.receiptNumber}:`);
  console.log(`     - Сумма долга: 9 200 TJS при курсе 1 USD = 9.20 TJS (Долг в долларах: $1 000.00 USD)`);

  // 2.3 Клиент приходит СЕГОДНЯ (Октябрь 2026, курс 9.35) и гасит весь долг 9 200 TJS!
  // В кассу поступает 9 200 TJS. По курсу 9.35 это: 9200 / 9.35 = $983.96 USD.
  // Разница: $983.96 - $1000.00 = -$16.04 USD (курсовой убыток из-за ослабления сомони)!
  const payment = await CustomersService.recordPayment({
    customerId: customer.id,
    amountTjs: 9200,
    paymentMethod: 'CASH',
    storeId: 'store-siyoma',
    userId: 'user-admin',
    comment: 'Полное погашение долга за август',
  });
  console.log(`   ✓ [14 Октября 2026] Клиент погасил долг 9 200 TJS наличными (Курс 1 USD = 9.35 TJS):`);
  console.log(`     - Поступило в кассу: 9 200 TJS ($${Number(payment.amountUsd).toFixed(2)} USD)`);
  console.log(`     - Курсовая разница (FX): ${Number(payment.fxGainUsd) >= 0 ? '+' : ''}$${Number(payment.fxGainUsd).toFixed(2)} USD`);

  // -------------------------------------------------------------------------
  // 3. ПРОВЕРКА ОТЧЕТА (КАК ЭТО ОТОБРАЖАЕТСЯ)
  // -------------------------------------------------------------------------
  console.log('\n=====================================================');
  console.log('📊 ОТОБРАЖЕНИЕ В ФИНАНСОВОМ ОТЧЕТЕ P&L:');
  console.log('=====================================================');

  const report = await computeReportsSummary({
    startDate: '2026-08-01',
    endDate: '2026-10-31',
  });

  console.log(`• Удержано при возвратах: +$${Number(report.periodRefundPenaltiesUsd).toFixed(2)} USD (${Number(report.periodRefundPenaltiesTjs).toFixed(2)} TJS)`);
  console.log(`• Разница при погашении долгов (TJS по курсу дня оплаты): ${Number(report.periodDebtFxUsd) >= 0 ? '+' : ''}$${Number(report.periodDebtFxUsd).toFixed(2)} USD`);
  console.log(`• Влияние на чистую прибыль:`);
  console.log(`  - Неустойка при возврате УВЕЛИЧИВАЕТ прибыль на +$${Number(report.periodRefundPenaltiesUsd).toFixed(2)} USD`);
  console.log(`  - Курсовая разница при погашении долга учитывается как ${Number(report.periodDebtFxUsd) >= 0 ? 'доход' : 'расход'} (${Number(report.periodDebtFxUsd).toFixed(2)} USD)`);
  console.log(`• Итоговая чистая прибыль бизнеса с учетом этих факторов: $${Number(report.netProfitUsd).toFixed(2)} USD`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
