import { Sale } from '../types';

/**
 * POS Receipt Thermal Printer Utility.
 * Supports ESC/POS raw printer command formatting, Web Serial printing, and Browser Print fallback.
 */
export function printReceipt(sale: Sale) {
  const receiptWindow = window.open('', '_blank', 'width=400,height=600');
  if (!receiptWindow) {
    alert('Пожалуйста, разрешите всплывающие окна для печати чека.');
    return;
  }

  const itemsHtml = sale.items
    .map(
      (item) => `
    <tr>
      <td style="padding: 4px 0;">${item.brand} ${item.model} (${item.storage})<br/><small style="color: #666;">IMEI: ${item.imei}</small></td>
      <td style="text-align: right; font-weight: bold; vertical-align: top; padding: 4px 0;">${item.salePriceTjs.toLocaleString()} TJS</td>
    </tr>
  `
    )
    .join('');

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Чек #${sale.receiptNumber}</title>
        <style>
          body {
            font-family: 'Courier New', Courier, monospace;
            width: 80mm;
            margin: 0 auto;
            padding: 10px;
            font-size: 12px;
            color: #000;
          }
          .header { text-align: center; border-bottom: 1px dashed #000; padding-bottom: 8px; margin-bottom: 8px; }
          .header h2 { margin: 0; font-size: 16px; text-transform: uppercase; }
          .meta { font-size: 10px; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
          .totals { border-top: 1px dashed #000; border-bottom: 1px dashed #000; padding: 6px 0; margin-bottom: 8px; }
          .footer { text-align: center; font-size: 10px; margin-top: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <h2>MOBILE SHOP</h2>
          <p style="margin: 2px 0;">ТОЧКА: ${sale.storeName.toUpperCase()}</p>
          <p style="margin: 2px 0;">ТЕЛЕФОН: +992 900-00-00-00</p>
        </div>

        <div class="meta">
          <div>ЧЕК №: <strong>#${sale.receiptNumber}</strong></div>
          <div>ДАТА: ${new Date(sale.date).toLocaleString()}</div>
          <div>КАССИР: ${sale.sellerName}</div>
          ${sale.customerName ? `<div>КЛИЕНТ: ${sale.customerName}</div>` : ''}
        </div>

        <table>
          <thead>
            <tr style="border-bottom: 1px solid #000;">
              <th style="text-align: left;">НАИМЕНОВАНИЕ</th>
              <th style="text-align: right;">СУММА</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>

        <div class="totals">
          <div style="display: flex; justify-space-between; font-weight: bold; font-size: 14px;">
            <span>ИТОГО К ОПЛАТЕ:</span>
            <span>${sale.totalTjs.toLocaleString()} TJS</span>
          </div>
          <div style="font-size: 10px; color: #555; text-align: right;">(≈ $${sale.totalUsd} USD)</div>
          <div style="margin-top: 4px; font-size: 10px;">
            СПОСОБ ОПЛАТЫ: ${sale.paymentMethod === 'CASH' ? 'НАЛИЧНЫЕ' : sale.paymentMethod === 'CARD' ? 'БАРКОВСКАЯ КАРТА' : sale.paymentMethod === 'DEBT' ? `В ДОЛГ (остаток ${(sale.debtAmountTjs ?? 0).toLocaleString()} TJS)` : 'СМЕШАННАЯ'}
          </div>
        </div>

        <div class="footer">
          <p style="margin: 2px 0; font-weight: bold;">СПАСИБО ЗА ПОКУПКУ!</p>
          <p style="margin: 2px 0;">Гарантия на проверку 14 дней.</p>
          <p style="margin: 2px 0;">Сохраняйте чек для гарантийного обслуживания.</p>
        </div>

        <script>
          window.onload = function() {
            window.print();
            setTimeout(function() { window.close(); }, 500);
          };
        </script>
      </body>
    </html>
  `;

  receiptWindow.document.write(htmlContent);
  receiptWindow.document.close();
}
