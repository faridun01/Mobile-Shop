import type { Prisma } from '@prisma/client';
import { D } from '../../common/decimal';
import { requireNonNegativeMoney, requirePositiveMoney } from '../../common/money';
import { isValidImei, isValidSerial, normalizeSerial, type DeviceCategoryCode } from '../../common/device-code';

/** One serialized unit of a receipt: a phone (IMEI) or a tablet (SN). */
export interface PurchaseDevice {
  category: DeviceCategoryCode;
  imei: string;
  imei2: string | null;
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  connectivity: string | null;
  screenSize: string | null;
  purchasePriceUsd: Prisma.Decimal;
  isBonus: boolean;
  bonusCampaign: string | null;
}

/** One accessory line of a receipt: a quantity of one barcode at one unit cost. */
export interface PurchaseAccessory {
  barcode: string;
  brand: string;
  name: string;
  category: string;
  model: string;
  attributes: string;
  quantity: number;
  unitCostUsd: Prisma.Decimal;
}

/** One invoice position as InvoiceGroup stores it (phones and tablets). */
export interface PurchaseDeviceGroup {
  brand: string;
  model: string;
  ram: string;
  storage: string;
  color: string;
  quantity: number;
  purchasePriceUsd: Prisma.Decimal;
}

const text = (value: unknown) => String(value ?? '').trim();
const optionalText = (value: unknown) => text(value) || null;

/** Barcodes are matched as printed, without spaces, letters upper-cased. */
export function normalizeBarcode(raw: unknown): string {
  return typeof raw === 'string' ? raw.trim().replace(/\s+/g, '').toUpperCase() : '';
}

const MAX_ACCESSORY_QUANTITY = 100000;

function groupCategory(group: any): 'PHONE' | 'TABLET' | 'ACCESSORY' {
  return group?.category === 'TABLET' ? 'TABLET' : group?.category === 'ACCESSORY' ? 'ACCESSORY' : 'PHONE';
}

function priceOf(group: any, isBonus: boolean): Prisma.Decimal {
  return isBonus
    ? requireNonNegativeMoney(group.purchasePriceUsd ?? 0, 'Закупочная цена')
    : requirePositiveMoney(group.purchasePriceUsd, 'Закупочная цена');
}

/** Phones: exactly the rules the receipt always had (IMEI 1 / IMEI 2 split on "/" or ","). */
function phoneUnits(group: any): PurchaseDevice[] {
  const isBonus = Boolean(group.isBonus);
  const purchasePriceUsd = priceOf(group, isBonus);
  const bonusCampaign = isBonus ? (text(group.bonusCampaign) || 'Бонус от поставщика') : null;
  const base = {
    category: 'PHONE' as const,
    brand: text(group.brand), model: text(group.model), ram: text(group.ram),
    storage: text(group.storage), color: text(group.color),
    connectivity: null, screenSize: null, purchasePriceUsd, isBonus, bonusCampaign,
  };
  if (Array.isArray(group.items) && group.items.length > 0) {
    return group.items
      .filter((item: any) => item && typeof item.imei === 'string' && item.imei.trim().length > 0)
      .map((item: any) => {
        const [imei1, imei2] = String(item.imei).split(/[/,]/).map((part) => part.trim());
        const explicitImei2 = typeof item.imei2 === 'string' && item.imei2.trim() ? item.imei2.trim() : null;
        return { ...base, imei: imei1, imei2: explicitImei2 || imei2 || null };
      });
  }
  const imeis = Array.isArray(group.imeis) ? group.imeis : [];
  return imeis
    .filter((imei: unknown): imei is string => typeof imei === 'string' && imei.trim().length > 0)
    .map((imei: string) => {
      const [imei1, imei2] = imei.split(/[/,]/).map((part) => part.trim());
      return { ...base, imei: imei1, imei2: imei2 || null };
    });
}

/** Tablets: the main SN and an optional additional SN (e.g. the keyboard's) of one unit. */
function tabletUnits(group: any): PurchaseDevice[] {
  const purchasePriceUsd = priceOf(group, false);
  const items = Array.isArray(group.items) ? group.items : [];
  return items
    .filter((item: any) => item && normalizeSerial(item.imei))
    .map((item: any) => ({
      category: 'TABLET' as const,
      imei: normalizeSerial(item.imei),
      imei2: normalizeSerial(item.imei2) || null,
      brand: text(group.brand), model: text(group.model), ram: text(group.ram),
      storage: text(group.storage), color: text(group.color),
      connectivity: optionalText(group.connectivity), screenSize: optionalText(group.screenSize),
      purchasePriceUsd, isBonus: false, bonusCampaign: null,
    }));
}

function accessoryLine(group: any): PurchaseAccessory {
  const quantity = Number(group.quantity);
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ACCESSORY_QUANTITY) {
    throw new Error(`Количество аксессуара должно быть целым числом от 1 до ${MAX_ACCESSORY_QUANTITY}`);
  }
  const barcode = normalizeBarcode(group.barcode);
  if (!barcode) throw new Error('Укажите или отсканируйте штрихкод аксессуара');
  if (barcode.length > 64) throw new Error(`Штрихкод аксессуара слишком длинный: ${barcode}`);
  return {
    barcode,
    brand: text(group.brand),
    name: text(group.name),
    category: text(group.accessoryCategory),
    model: text(group.model),
    attributes: text(group.attributes),
    quantity,
    unitCostUsd: requirePositiveMoney(group.purchasePriceUsd, 'Закупочная цена'),
  };
}

/**
 * Splits a receipt's positions into serialized units (phones, tablets) and accessory lines,
 * validating each kind by its own rules. Phones keep the 15-digit IMEI rule; a tablet SN is
 * letters/digits; no code may repeat within the receipt across both slots.
 */
export function parsePurchaseGroups(groups: any[]) {
  const devices: PurchaseDevice[] = [];
  const accessories: PurchaseAccessory[] = [];
  const deviceGroups: PurchaseDeviceGroup[] = [];
  for (const group of groups) {
    const category = groupCategory(group);
    if (category === 'ACCESSORY') {
      accessories.push(accessoryLine(group));
      continue;
    }
    const units = category === 'TABLET' ? tabletUnits(group) : phoneUnits(group);
    devices.push(...units);
    // Only a priced position is an invoice group, as before (a phone group with no IMEIs counted 0).
    deviceGroups.push({
      brand: text(group.brand), model: text(group.model), ram: text(group.ram),
      storage: text(group.storage), color: text(group.color),
      quantity: units.length,
      purchasePriceUsd: priceOf(group, category === 'PHONE' && Boolean(group.isBonus)),
    });
  }

  for (const device of devices) {
    if (device.category === 'PHONE') {
      if (!device.imei || !device.brand || !device.model || !device.ram || !device.storage) {
        throw new Error('Каждое устройство должно содержать IMEI, бренд, модель, RAM и память');
      }
      if (!isValidImei(device.imei)) {
        throw new Error(`IMEI устройства (${device.brand} ${device.model}) должен содержать ровно 15 цифр (получено: "${device.imei}")`);
      }
      if (device.imei2 && !isValidImei(device.imei2)) {
        throw new Error(`IMEI 2 устройства (${device.brand} ${device.model}) должен содержать ровно 15 цифр (получено: "${device.imei2}")`);
      }
    } else {
      if (!device.brand || !device.model || !device.storage || !device.color) {
        throw new Error('Каждый планшет должен содержать SN, бренд, модель, встроенную память и цвет');
      }
      if (!isValidSerial(device.imei)) {
        throw new Error(`SN планшета (${device.brand} ${device.model}) должен состоять из 4–64 букв и цифр (получено: "${device.imei}")`);
      }
      if (device.imei2 && !isValidSerial(device.imei2)) {
        throw new Error(`Дополнительный SN планшета (${device.brand} ${device.model}) должен состоять из 4–64 букв и цифр (получено: "${device.imei2}")`);
      }
      if (device.imei2 === device.imei) {
        throw new Error(`Основной и дополнительный SN планшета ${device.imei} совпадают`);
      }
    }
  }
  for (const line of accessories) {
    if (!line.barcode) throw new Error('Укажите штрихкод аксессуара');
  }
  const barcodes = accessories.map((line) => line.barcode);
  if (new Set(barcodes).size !== barcodes.length) {
    throw new Error('Один и тот же штрихкод указан в приходе дважды: объедините количество в одну позицию');
  }

  return { devices, accessories, deviceGroups };
}

/** The receipt total: every unit's price plus every accessory line's quantity × unit cost. */
export function purchaseTotalUsd(devices: PurchaseDevice[], accessories: PurchaseAccessory[]): Prisma.Decimal {
  const devicesUsd = devices.reduce((sum, device) => sum.plus(device.purchasePriceUsd), D(0));
  return accessories.reduce((sum, line) => sum.plus(D(line.unitCostUsd).mul(line.quantity)), devicesUsd);
}
