import React from 'react';
import { cn } from '../../utils/cn';

export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'accent' | 'neutral';

const TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'bg-success/10 text-success border-success/30',
  warning: 'bg-warning/10 text-warning border-warning/30',
  danger: 'bg-danger/10 text-danger border-danger/30',
  info: 'bg-info/10 text-info border-info/30',
  accent: 'bg-accent/10 text-accent border-accent/30',
  neutral: 'bg-surface-raised text-fg-muted border-border',
};

interface BadgeProps {
  tone?: BadgeTone;
  children: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ tone = 'neutral', children, className }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] font-semibold leading-none',
      TONE_CLASSES[tone],
      className
    )}
  >
    {children}
  </span>
);
