import React from 'react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { formatMoney } from '../../utils/money';
import { IssueRepairModalProps } from './types';

/** Repairs are at the shop's expense: the parts cost is paid from Central Cash. */
export const IssueRepairModal: React.FC<IssueRepairModalProps> = ({
  selectedTicket,
  onClose,
  isSubmitting,
  issueFinalCost,
  setIssueFinalCost,
  onConfirmIssue,
}) => {
  const cost = parseFloat(issueFinalCost.replace(',', '.')) || 0;
  return (
    <Dialog
      open={selectedTicket !== null}
      onClose={() => { if (!isSubmitting) onClose(); }}
      title="Выдача ремонта"
      subtitle={selectedTicket ? `Квитанция #${selectedTicket.ticketNumber}` : undefined}
      footer={
        <div className="w-full grid grid-cols-2 gap-2">
          <Button variant="secondary" fullWidth disabled={isSubmitting} onClick={onClose}>Отмена</Button>
          <Button fullWidth loading={isSubmitting} onClick={onConfirmIssue}>
            {cost > 0 ? `Выдать · ${formatMoney(cost)} TJS` : 'Выдать'}
          </Button>
        </div>
      }
    >
      {selectedTicket && (
        <div className="space-y-3 text-sm">
          <div className="p-3 bg-surface-raised rounded-xl border border-border space-y-1">
            <p className="font-semibold text-fg-muted">{selectedTicket.deviceModel || selectedTicket.model}</p>
            <p className="text-xs text-fg-subtle">{selectedTicket.customerName}{selectedTicket.customerPhone ? ` · ${selectedTicket.customerPhone}` : ''}</p>
          </div>
          <label className="block">
            <span className="block text-fg-subtle mb-1 text-xs font-semibold">Стоимость ремонта, TJS · из Центральной кассы</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder="0"
              value={issueFinalCost}
              onChange={(e) => setIssueFinalCost(e.target.value)}
              className="w-full rounded-xl bg-surface-raised border border-border px-3 py-2 text-lg text-accent font-bold font-mono focus:border-accent focus:outline-none"
            />
          </label>
        </div>
      )}
    </Dialog>
  );
};
