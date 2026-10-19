import React from 'react';

/** A dedicated camera action: the caller always opens the fixed serial-number mode. */
export function SerialScanButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label="Сканировать SN"
    title="Сканировать серийный номер планшета"
    className="h-11 min-w-11 px-2 shrink-0 rounded-xl border border-accent/30 bg-accent/10 text-accent text-xs font-bold hover:bg-accent/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50 cursor-pointer"
  >SN</button>;
}
