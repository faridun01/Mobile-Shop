import React from 'react';
import { cn } from '../../utils/cn';

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon: Icon, title, description, action, className }) => (
  <div className={cn('flex flex-1 flex-col items-center justify-center text-center px-6 py-12', className)}>
    <Icon className="w-9 h-9 text-fg-subtle opacity-40 mb-3" />
    <p className="text-sm font-semibold text-fg-muted">{title}</p>
    {description && <p className="text-xs text-fg-subtle mt-1 max-w-xs">{description}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
