import React, { useEffect, useState, useRef, useCallback } from 'react';
import { CheckCircle2, AlertCircle, AlertTriangle, Info, X } from 'lucide-react';
import { cn } from '../../utils/cn';

export type StatusTone = 'success' | 'error' | 'warning' | 'info';

export interface StatusMessage {
  tone: StatusTone;
  text: string;
}

const TONE_CONFIG: Record<StatusTone, { icon: React.ElementType; classes: string; iconColor: string; autoDismissMs: number }> = {
  success: { icon: CheckCircle2, classes: 'bg-surface border-success/40 text-fg shadow-xl ring-1 ring-success/25', iconColor: 'text-success', autoDismissMs: 3500 },
  info: { icon: Info, classes: 'bg-surface border-info/40 text-fg shadow-xl ring-1 ring-info/25', iconColor: 'text-info', autoDismissMs: 4000 },
  warning: { icon: AlertTriangle, classes: 'bg-surface border-warning/40 text-fg shadow-xl ring-1 ring-warning/25', iconColor: 'text-warning', autoDismissMs: 6000 },
  error: { icon: AlertCircle, classes: 'bg-surface border-danger/40 text-fg shadow-xl ring-1 ring-danger/25', iconColor: 'text-danger', autoDismissMs: 7000 },
};

interface StatusBannerProps {
  message: StatusMessage | null;
  onDismiss: () => void;
}

/**
 * App-wide toast notification:
 * - Positioned safely below the top bar and mobile notch (z-[200]).
 * - Multiple easy ways to dismiss:
 *   1. Large, comfortable close button (touch-friendly 32x32px).
 *   2. Tapping / clicking anywhere on the toast card.
 *   3. Swipe-to-dismiss gesture (swipe up or sideways on touch screens).
 *   4. Pressing Escape key on physical keyboard.
 *   5. Automatic dismiss with pause-on-hover.
 */
export const StatusBanner: React.FC<StatusBannerProps> = ({ message, onDismiss }) => {
  const [isExiting, setIsExiting] = useState(false);
  const [touchOffset, setTouchOffset] = useState<{ y: number; x: number }>({ y: 0, x: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const touchStartRef = useRef<{ y: number; x: number } | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isHoveredRef = useRef(false);

  const tone = message?.tone;

  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      onDismiss();
    }, 180);
  }, [onDismiss]);

  // Reset states when message changes
  useEffect(() => {
    if (message) {
      setIsExiting(false);
      setTouchOffset({ y: 0, x: 0 });
      setIsDragging(false);
    }
  }, [message]);

  // Keyboard shortcut: Escape to dismiss
  useEffect(() => {
    if (!message) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleDismiss();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [message, handleDismiss]);

  // Auto-dismiss timer with pause on hover
  useEffect(() => {
    if (!message || !tone) return;
    const ms = TONE_CONFIG[tone]?.autoDismissMs ?? 5000;

    const startTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        if (!isHoveredRef.current) {
          handleDismiss();
        }
      }, ms);
    };

    startTimer();

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [message, tone, handleDismiss]);

  const handleMouseEnter = () => {
    isHoveredRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleMouseLeave = () => {
    isHoveredRef.current = false;
    if (message && tone) {
      const ms = TONE_CONFIG[tone]?.autoDismissMs ?? 5000;
      timerRef.current = setTimeout(handleDismiss, Math.min(ms, 3000));
    }
  };

  // Touch swipe-to-dismiss handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0];
    touchStartRef.current = { y: touch.clientY, x: touch.clientX };
    setIsDragging(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartRef.current) return;
    const touch = e.touches[0];
    const dy = touch.clientY - touchStartRef.current.y;
    const dx = touch.clientX - touchStartRef.current.x;

    // Only allow upward drag or horizontal drag
    if (dy < 0 || Math.abs(dx) > Math.abs(dy)) {
      setTouchOffset({
        y: dy < 0 ? dy : 0,
        x: Math.abs(dx) > Math.abs(dy) ? dx : 0,
      });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (!touchStartRef.current) return;

    const dy = touchOffset.y;
    const dx = touchOffset.x;

    if (dy < -25 || Math.abs(dx) > 60) {
      handleDismiss();
    } else {
      setTouchOffset({ y: 0, x: 0 });
    }
    touchStartRef.current = null;
  };

  if (!message || !tone) return null;
  const { icon: Icon, classes, iconColor } = TONE_CONFIG[tone];

  return (
    <div className="fixed top-[calc(max(4rem,env(safe-area-inset-top,0px)+3.75rem))] inset-x-3 sm:inset-x-auto sm:max-w-md mx-auto z-[200] flex justify-center pointer-events-none">
      <div
        role="status"
        aria-live="polite"
        onClick={handleDismiss}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        title="Нажмите или смахните, чтобы закрыть"
        className={cn(
          'pointer-events-auto flex items-start gap-2.5 rounded-xl border px-3.5 py-3 text-xs sm:text-sm font-medium backdrop-blur-md max-w-md w-full shadow-2xl cursor-pointer select-none active:scale-[0.99] transition-all',
          isExiting
            ? 'opacity-0 -translate-y-3 scale-95 duration-200 ease-out pointer-events-none'
            : 'animate-in fade-in slide-in-from-top-2 duration-200',
          classes
        )}
        style={
          !isExiting && (touchOffset.y !== 0 || touchOffset.x !== 0)
            ? {
                transform: `translate3d(${touchOffset.x}px, ${touchOffset.y}px, 0)`,
                transition: isDragging ? 'none' : 'transform 0.2s ease-out',
                opacity: Math.max(0.2, 1 - Math.abs(touchOffset.y || touchOffset.x) / 150),
              }
            : undefined
        }
      >
        <Icon className={cn('w-4 h-4 shrink-0 mt-0.5', iconColor)} />
        <span className="flex-1 min-w-0 leading-snug break-words">{message.text}</span>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            handleDismiss();
          }}
          aria-label="Закрыть уведомление"
          title="Закрыть (Esc)"
          className="shrink-0 w-8 h-8 -mr-1.5 -my-1 flex items-center justify-center rounded-lg text-fg-subtle hover:text-fg hover:bg-surface-raised active:scale-90 transition-all cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
