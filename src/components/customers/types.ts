/** GET /customers/:id — money columns arrive as numbers or decimal strings. */
export interface CustomerDetailResponse {
  totalDebtTjs: number;
  totalPaidTjs: number;
  payments: Array<{
    id: string;
    amountTjs: number | string;
    createdAt: string;
    sourceAccount: string;
    allocations?: Array<{ sale?: { receiptNumber: number } | null }>;
  }>;
  sales: Array<{
    id: string;
    receiptNumber: number;
    totalTjs: number | string;
    debtAmountTjs: number | string;
    createdAt: string;
    store?: { name: string } | null;
  }>;
}

/** The customer a debt payment is being taken from. */
export interface PaymentTarget {
  id: string;
  name: string;
  totalDebtTjs: number;
}

export interface CustomerFormValues {
  name: string;
  phone: string;
  note: string;
  pushEnabled: boolean;
}

export const getInitials = (name: string) => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (name.slice(0, 2) || 'КЛ').toUpperCase();
};

/** wa.me link for a Tajik number (adds 992 when missing), or null when the number is too short. */
export const getWhatsAppLink = (phone?: string | null) => {
  if (!phone) return null;
  const digits = phone.replace(/[^\d]/g, '');
  if (digits.length < 9) return null;
  const full = digits.startsWith('992') ? digits : `992${digits}`;
  return `https://wa.me/${full}`;
};
