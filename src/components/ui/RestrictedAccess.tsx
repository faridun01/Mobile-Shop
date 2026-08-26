import React from 'react';
import { Lock } from 'lucide-react';

interface RestrictedAccessProps {
  message?: string;
}

/** Standard "you don't have access to this page" gate — some pages previously redirected silently instead. */
export const RestrictedAccess: React.FC<RestrictedAccessProps> = ({
  message = 'У вас нет доступа к этому разделу.',
}) => (
  <div className="flex flex-1 flex-col items-center justify-center text-center px-6 py-12">
    <Lock className="w-9 h-9 text-fg-subtle opacity-40 mb-3" />
    <p className="text-sm font-semibold text-fg-muted">Доступ ограничен</p>
    <p className="text-xs text-fg-subtle mt-1 max-w-xs">{message}</p>
  </div>
);
