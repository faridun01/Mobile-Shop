import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Standard confirmation used for every destructive/irreversible action app-wide
 * (deletes, cash-register reset, quarter close) — replaces native window.confirm()
 * calls and the handful of pages that had no confirmation at all.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  tone = 'danger',
  loading,
  onConfirm,
  onCancel,
}) => {
  const Icon = tone === 'danger' ? AlertTriangle : HelpCircle;
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      footer={
        <>
          <Button variant="secondary" fullWidth onClick={onCancel} disabled={loading}>
            {cancelLabel}
          </Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} fullWidth onClick={onConfirm} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex items-start gap-3">
        <Icon className={tone === 'danger' ? 'w-5 h-5 text-danger shrink-0 mt-0.5' : 'w-5 h-5 text-accent shrink-0 mt-0.5'} />
        <div className="text-sm text-fg-muted leading-relaxed">{message}</div>
      </div>
    </Dialog>
  );
};
