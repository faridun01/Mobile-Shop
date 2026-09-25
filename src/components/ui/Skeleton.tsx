import React from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '../../utils/cn';

/** Centered spinner for a section still waiting on its first data fetch. */
export const LoadingState: React.FC<{ label?: string; className?: string }> = ({ label = 'Загрузка…', className }) => (
  <div className={cn('flex flex-1 flex-col items-center justify-center gap-3 py-12 text-fg-subtle', className)}>
    <Loader2 className="w-6 h-6 animate-spin text-accent" />
    <span className="text-xs">{label}</span>
  </div>
);
