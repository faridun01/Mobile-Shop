import React, { useEffect } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../utils/cn';
import { IconButton } from './IconButton';

type MaxWidth = 'sm' | 'md' | 'lg' | 'xl';

const MAX_WIDTH_CLASSES: Record<MaxWidth, string> = {
  sm: 'md:max-w-sm',
  md: 'md:max-w-md',
  lg: 'md:max-w-lg',
  xl: 'md:max-w-2xl',
};

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  maxWidth?: MaxWidth;
  /** Set false for a modal the user must act on (e.g. setting today's mandatory exchange rate) — hides the close button and disables backdrop/Escape dismissal. */
  dismissable?: boolean;
}

/**
 * One dialog shell for the whole app: a bottom sheet on phones (native, thumb-reachable
 * close/actions near the bottom of the screen) and a centered modal from tablet width up.
 * Replaces ~30 hand-rolled modal shells that previously each picked their own width,
 * backdrop opacity, and corner radius.
 */
export const Dialog: React.FC<DialogProps> = ({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  maxWidth = 'md',
  dismissable = true,
}) => {
  useEffect(() => {
    if (!open) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissable) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onClose, dismissable]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-60 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={dismissable ? onClose : undefined} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative w-full flex flex-col bg-surface border-t md:border border-border rounded-t-2xl md:rounded-2xl max-h-[92vh] md:max-h-[85vh] overflow-hidden',
          MAX_WIDTH_CLASSES[maxWidth]
        )}
      >
        <div className="md:hidden mx-auto mt-2 h-1 w-10 rounded-full bg-border shrink-0" />

        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border shrink-0">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-fg truncate">{title}</h2>
            {subtitle && <p className="text-xs text-fg-subtle truncate mt-0.5">{subtitle}</p>}
          </div>
          {dismissable && <IconButton icon={X} aria-label="Закрыть" onClick={onClose} size="sm" />}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4">{children}</div>

        {footer && <div className="shrink-0 flex gap-2 px-4 py-3 border-t border-border pb-[max(0.75rem,env(safe-area-inset-bottom))]">{footer}</div>}
      </div>
    </div>
  );
};
