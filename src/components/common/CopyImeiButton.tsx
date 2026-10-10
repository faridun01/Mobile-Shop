import React, { useState, useCallback } from 'react';
import { Copy, Check } from 'lucide-react';
import { cn } from '../../utils/cn';

export interface CopyImeiButtonProps {
  imei: string;
  className?: string;
  title?: string;
  size?: 'xs' | 'sm' | 'md';
}

/**
 * Universal one-click IMEI copy button.
 * Prevents event bubbling so clicking does not trigger parent row clicks, modals, or navigations.
 */
export const CopyImeiButton: React.FC<CopyImeiButtonProps> = ({
  imei,
  className,
  title = 'Скопировать IMEI',
  size = 'xs',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      if (!imei) return;

      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        void navigator.clipboard.writeText(imei);
      } else if (typeof document !== 'undefined') {
        const textarea = document.createElement('textarea');
        textarea.value = imei;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand('copy');
        } catch {
          // ignore
        }
        document.body.removeChild(textarea);
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    },
    [imei]
  );

  if (!imei) return null;

  const iconSizes = {
    xs: 'w-3 h-3',
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        'inline-flex items-center justify-center rounded transition-all active:scale-90 cursor-pointer shrink-0 select-none',
        copied
          ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-500/15 ring-1 ring-emerald-500/30'
          : 'text-fg-subtle hover:text-accent hover:bg-surface-raised/90 active:bg-accent/10',
        size === 'xs' ? 'p-0.5' : 'p-1',
        className
      )}
      title={copied ? 'Скопировано!' : title}
      aria-label={copied ? 'Скопировано!' : title}
    >
      {copied ? (
        <Check className={cn(iconSizes[size], 'text-emerald-600 dark:text-emerald-400')} />
      ) : (
        <Copy className={iconSizes[size]} />
      )}
    </button>
  );
};

export interface ImeiBadgeProps {
  imei: string;
  imei2?: string | null;
  className?: string;
}

/**
 * Chip showing styled IMEI (and optional IMEI 2) with instant copy buttons.
 */
export const ImeiBadge: React.FC<ImeiBadgeProps> = ({ imei, imei2, className }) => {
  if (!imei) return null;

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono text-[10px] sm:text-[11px] bg-surface-raised/80 px-2 py-0.5 rounded-md border border-border/60 text-fg-muted',
        className
      )}
    >
      <span className="text-[9px] font-bold text-fg-subtle uppercase tracking-wider select-none">IMEI</span>
      <span className="font-semibold text-fg tracking-wide select-all">{imei}</span>
      <CopyImeiButton imei={imei} title="Скопировать IMEI" />
      {imei2 && (
        <>
          <span className="opacity-40 select-none">/</span>
          <span className="font-semibold text-fg tracking-wide select-all">{imei2}</span>
          <CopyImeiButton imei={imei2} title="Скопировать IMEI 2" />
        </>
      )}
    </span>
  );
};
