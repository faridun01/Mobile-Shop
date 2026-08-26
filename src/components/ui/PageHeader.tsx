import React from 'react';

interface PageHeaderProps {
  icon?: React.ElementType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ icon: Icon, title, subtitle, action }) => (
  <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border bg-surface shrink-0">
    <div className="min-w-0 flex items-center gap-2.5">
      {Icon && <Icon className="w-4 h-4 text-fg-subtle shrink-0" />}
      <div className="min-w-0">
        <h1 className="text-sm font-semibold text-fg truncate">{title}</h1>
        {subtitle && <p className="text-xs text-fg-subtle truncate">{subtitle}</p>}
      </div>
    </div>
    {action && <div className="shrink-0">{action}</div>}
  </div>
);
