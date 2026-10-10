import { TransferRequest, Device } from '../types';
import { formatMoney } from './money';
import { getPhoneColorHex, formatRam, isRamInStorage } from './phoneSpecs';

export interface TransferInvoiceItem {
  index: number;
  deviceId?: string;
  imei: string;
  brand: string;
  model: string;
  fullName: string;
  storage?: string;
  ram?: string;
  color?: string;
  colorHex?: string;
  costUsd: number;
  retailPriceTjs?: number;
}

/**
 * Extracts and normalizes transfer items with full device specifications and cost basis.
 */
export function getTransferInvoiceItems(
  transfer: TransferRequest,
  devicesById: Map<string, Device>,
  devicesByImei: Map<string, Device>
): TransferInvoiceItem[] {
  const count = Math.max(
    transfer.deviceIds?.length || 0,
    transfer.deviceImeis?.length || 0,
    transfer.deviceModels?.length || 0
  );

  const items: TransferInvoiceItem[] = [];

  for (let i = 0; i < count; i++) {
    const deviceId = transfer.deviceIds?.[i];
    const imei = transfer.deviceImeis?.[i] || '—';
    const foundDevice = (deviceId ? devicesById.get(deviceId) : null) || (imei !== '—' ? devicesByImei.get(imei) : null);
    const brand = transfer.deviceBrands?.[i] || foundDevice?.brand || '';
    const model = transfer.deviceModels?.[i] || foundDevice?.model || 'Устройство';
    const fullName = brand ? `${brand} ${model}` : (foundDevice ? `${foundDevice.brand} ${foundDevice.model}` : model);
    const color = foundDevice?.color;
    const colorHex = getPhoneColorHex(color);
    const storage = foundDevice?.storage;
    const rawRam = formatRam(foundDevice?.ram);
    const ram = rawRam && !isRamInStorage(storage, foundDevice?.ram) ? rawRam : undefined;
    const costUsd = foundDevice?.costBasisUsd ?? foundDevice?.purchaseCostUsd ?? 0;
    const retailPriceTjs = foundDevice?.retailPriceTjs;

    items.push({
      index: i + 1,
      deviceId,
      imei,
      brand,
      model,
      fullName,
      storage,
      ram,
      color,
      colorHex: colorHex || undefined,
      costUsd,
      retailPriceTjs,
    });
  }

  return items;
}

/**
 * Plain-text waybill summary for copying to Telegram, WhatsApp, or printing directly.
 */
export function formatTransferInvoiceText(
  transfer: TransferRequest,
  devicesById: Map<string, Device>,
  devicesByImei: Map<string, Device>
): string {
  const items = getTransferInvoiceItems(transfer, devicesById, devicesByImei);
  const totalCostUsd = items.reduce((sum, item) => sum + item.costUsd, 0);
  const dateFormatted = new Date(transfer.requestedAt).toLocaleString('ru-RU');

  const statusLabel =
    transfer.status === 'APPROVED'
      ? 'Выполнено (Принято)'
      : transfer.status === 'PENDING_APPROVAL'
      ? 'Ожидает приёмки'
      : 'Отклонено';

  const lines = [
    `═══════════════════════════════════════`,
    `НАКЛАДНАЯ НА ПЕРЕМЕЩЕНИЕ №${transfer.transferNumber || transfer.id.slice(-6)}`,
    `═══════════════════════════════════════`,
    `Дата составления: ${dateFormatted}`,
    `Статус: ${statusLabel}`,
    ``,
    `ОТПРАВИТЕЛЬ: ${transfer.fromLocationName || '—'}`,
    `Сдал: ${transfer.requestedBy || '—'}`,
    ``,
    `ПОЛУЧАТЕЛЬ: ${transfer.toLocationName || '—'}`,
    `Принял: ${transfer.approvedBy || (transfer.status === 'PENDING_APPROVAL' ? 'Ожидает приёмки' : '—')}`,
    ...(transfer.approvedAt ? [`Дата приёмки: ${new Date(transfer.approvedAt).toLocaleString('ru-RU')}`] : []),
    ...(transfer.status === 'REJECTED' && transfer.rejectedReason ? [`Причина отказа: ${transfer.rejectedReason}`] : []),
    ``,
    `СПИСОК ТОВАРОВ (${items.length} шт.):`,
    `───────────────────────────────────────`,
    ...items.flatMap((item) => [
      `${item.index}. ${item.fullName}${item.storage ? ` ${item.storage}` : ''}${item.color ? ` (${item.color})` : ''}`,
      `   IMEI: ${item.imei}`,
      ...(item.costUsd > 0 ? [`   Оценочная стоимость: $${formatMoney(item.costUsd)}`] : []),
    ]),
    `───────────────────────────────────────`,
    `Всего позиций: ${items.length} шт.`,
    ...(totalCostUsd > 0 ? [`Общая сумма: $${formatMoney(totalCostUsd)}`] : []),
    ``,
    `Отпустил (Сдал): ________________ / ${transfer.requestedBy || '—'} /`,
    `Принял:           ________________ / ${transfer.approvedBy || '____________'} /`,
    `═══════════════════════════════════════`,
  ];

  return lines.join('\n');
}
