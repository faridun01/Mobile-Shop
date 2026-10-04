import React, { useEffect } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export type StatusTone = 'success' | 'error' | 'warning' | 'info';

export interface StatusMessage {
  tone: StatusTone;
  text: string;
}

const TONE_CONFIG: Record<StatusTone, { icon: React.ElementType; classes: string; iconColor: string; autoDismissMs: number | null }> = {
  success: { icon: CheckCircle2, classes: 'bg-surface border-success/40 text-fg shadow-xl ring-1 ring-success/25', iconColor: 'text-success', autoDismissMs: 3500 },
  info: { icon: Info, classes: 'bg-surface border-info/40 text-fg shadow-xl ring-1 ring-info/25', iconColor: 'text-info', autoDismissMs: 3500 },
  warning: { icon: AlertTriangle, classes: 'bg-surface border-warning/40 text-fg shadow-xl ring-1 ring-warning/25', iconColor: 'text-warning', autoDismissMs: null },
  error: { icon: AlertCircle, classes: 'bg-surface border-danger/40 text-fg shadow-xl ring-1 ring-danger/25', iconColor: 'text-danger', autoDismissMs: null },
};

interface StatusBannerProps {
  message: StatusMessage | null;
  onDismiss: () => void;
}

/**
 * App-wide toast: fixed below the top bar and safe area so it never collides with
 * the iPhone notch / Dynamic Island or clock. Renders above all modals (z-[200]).
 */
export const StatusBanner: React.FC<StatusBannerProps> = ({ message, onDismiss }) => {
  const tone = message?.tone;

  useEffect(() => {
    if (!message) return;
    const ms = TONE_CONFIG[message.tone].autoDismissMs;
    if (ms == null) return;
    const t = setTimeout(onDismiss, ms);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [message]);

  if (!message || !tone) return null;
  const { icon: Icon, classes, iconColor } = TONE_CONFIG[tone];

  return (
    <div className="fixed top-[calc(max(4rem,env(safe-area-inset-top,0px)+3.75rem))] inset-x-3 sm:inset-x-auto sm:max-w-md mx-auto z-[200] flex justify-center pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
      <div
        role="status"
        className={cn(
          'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs sm:text-sm font-medium backdrop-blur-md max-w-md w-full shadow-2xl',
          classes
        )}
      >
        <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', iconColor)} />
        <span className="flex-1 min-w-0 leading-snug">{message.text}</span>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Закрыть"
          className="shrink-0 text-fg-subtle hover:text-fg p-0.5 rounded-md hover:bg-surface-raised transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
