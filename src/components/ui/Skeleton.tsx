import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse rounded-md bg-surface-raised', className)} />
);

export const SkeletonRows: React.FC<{ count?: number; className?: string }> = ({ count = 6, className }) => (
  <div className={cn('space-y-2 p-3', className)}>
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className="h-14 w-full" />
    ))}
  </div>
);

/** Centered spinner for a section still waiting on its first data fetch. */
export const LoadingState: React.FC<{ label?: string; className?: string }> = ({ label = 'Загрузка…', className }) => (
  <div className={cn('flex flex-1 flex-col items-center justify-center gap-3 py-12 text-fg-subtle', className)}>
    <Loader2 className="w-6 h-6 animate-spin text-accent" />
    <span className="text-xs">{label}</span>
  </div>
);
