import React from 'react';
import { cn } from '../../utils/cn';
import { BadgeTone } from './Badge';

const TONE_TEXT: Record<BadgeTone, string> = {
  success: 'text-success',
  warning: 'text-warning',
  danger: 'text-danger',
  info: 'text-info',
  accent: 'text-accent',
  neutral: 'text-fg',
};

interface StatCardProps {
  label: string;
  value: string;
  subvalue?: string;
  icon?: React.ElementType;
  tone?: BadgeTone;
  className?: string;
}

export const StatCard: React.FC<StatCardProps> = ({ label, value, subvalue, icon: Icon, tone = 'neutral', className }) => (
  <div className={cn('rounded-lg border border-border bg-surface p-3', className)}>
    <div className="flex items-center justify-between mb-1.5">
      <span className="text-[11px] font-medium uppercase tracking-wide text-fg-subtle truncate">{label}</span>
      {Icon && <Icon className={cn('w-3.5 h-3.5 shrink-0', TONE_TEXT[tone])} />}
    </div>
    <div className={cn('text-lg font-bold leading-tight', TONE_TEXT[tone])}>{value}</div>
    {subvalue && <div className="text-xs text-fg-subtle mt-0.5">{subvalue}</div>}
  </div>
);
