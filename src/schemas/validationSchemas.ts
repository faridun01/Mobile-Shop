import { z } from 'zod';

export const saleFormSchema = z.object({
  customerName: z.string().optional(),
  paymentMethod: z.enum(['CASH', 'CARD', 'SPLIT']),
  cashAmountTjs: z.number().min(0, 'Amount cannot be negative'),
  cardAmountTjs: z.number().min(0, 'Amount cannot be negative'),
  items: z
    .array(
      z.object({
        deviceId: z.string().min(1, 'Device ID is required'),
        salePriceTjs: z.number().positive('Sale price must be positive'),
      })
    )
    .min(1, 'At least one device must be selected for sale'),
});

export const purchaseFormSchema = z.object({
  supplierId: z.string().min(1, 'Supplier is required'),
  invoiceNumber: z.string().min(1, 'Invoice number is required'),
  date: z.string().min(1, 'Date is required'),
  isStorePurchase: z.boolean(),
  storeId: z.string().optional(),
  groups: z
    .array(
      z.object({
        brand: z.string().min(1, 'Brand is required'),
        model: z.string().min(1, 'Model is required'),
        storage: z.string().min(1, 'Storage is required'),
        color: z.string().min(1, 'Color is required'),
        purchasePriceUsd: z.number().positive('Purchase price must be positive'),
        imeis: z
          .array(z.string().regex(/^[0-9A-Z]{14,18}$/i, 'Invalid IMEI format (14-18 alphanumeric)'))
          .min(1, 'At least one IMEI is required'),
      })
    )
    .min(1, 'At least one product group is required'),
});

export const repairFormSchema = z.object({
  imei: z.string().min(14, 'IMEI must be at least 14 characters'),
  brand: z.string().min(1, 'Brand is required'),
  model: z.string().min(1, 'Model is required'),
  storage: z.string().min(1, 'Storage is required'),
  color: z.string().min(1, 'Color is required'),
  customerName: z.string().optional(),
  customerPhone: z.string().optional(),
  problemDescription: z.string().min(3, 'Problem description is required'),
  visualCondition: z.string().min(1, 'Visual condition description is required'),
  equipmentPackage: z.string().min(1, 'Equipment package details required'),
  comment: z.string().optional(),
});

export type SaleFormValues = z.infer<typeof saleFormSchema>;
export type PurchaseFormValues = z.infer<typeof purchaseFormSchema>;
export type RepairFormValues = z.infer<typeof repairFormSchema>;
