import React from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Dialog } from './Dialog';
import { Button } from './Button';
import { cn } from '../../utils/cn';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
  loading?: boolean;
  confirmDisabled?: boolean;
  icon?: React.ElementType;
  hideIcon?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Standard confirmation used for every destructive/irreversible action app-wide
 * (deletes, cash-register reset, quarter close) — replaces native window.confirm()
 * calls with a polished, accessible modal.
 */
export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  message,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  tone = 'danger',
  loading,
  confirmDisabled = false,
  icon,
  hideIcon = false,
  onConfirm,
  onCancel,
}) => {
  const Icon = icon || (tone === 'danger' ? AlertTriangle : HelpCircle);

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title={title}
      maxWidth="sm"
      footer={
        <div className="grid grid-cols-2 gap-2.5 w-full">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={loading}
            className="w-full h-9 font-medium"
          >
            {cancelLabel}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
            disabled={confirmDisabled}
            className="w-full h-9 font-semibold shadow-xs"
          >
            {confirmLabel}
          </Button>
        </div>
      }
    >
      <div className="flex items-start gap-3.5">
        {!hideIcon && (
          <div
            className={cn(
              'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-2xs',
              tone === 'danger'
                ? 'bg-danger/15 border border-danger/30 text-danger'
                : 'bg-accent/15 border border-accent/30 text-accent'
            )}
          >
            <Icon className="w-5 h-5" />
          </div>
        )}
        <div className="flex-1 min-w-0 text-sm text-fg leading-relaxed">{message}</div>
      </div>
    </Dialog>
  );
};

