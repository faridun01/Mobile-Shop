import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import { DataLoadRecovery } from '../services/dataLoadRecovery';

export const DataLoadRecoveryContext = createContext<DataLoadRecovery | null>(null);

/** Keep forms mounted, but never present missing/unverified data as an empty business result. */
export function useDataLoadStatus() {
  const recovery = useContext(DataLoadRecoveryContext);
  if (!recovery) throw new Error('DataLoadGate должен быть внутри AppProvider');
  const state = useSyncExternalStore(recovery.subscribe, recovery.snapshot, recovery.snapshot);
  return { ...state, retry: recovery.retry };
}

export function DataLoadGate({ children }: { children: ReactNode }) {
  const state = useDataLoadStatus();
  const blocked = state.failed > 0 || state.retrying;
  return <>
    {blocked && <section role="alert" data-testid="data-load-error" className="m-4 rounded-xl border border-danger/40 bg-surface p-4 text-fg">
      <p className="font-semibold">Не удалось загрузить данные</p>
      <p className="mt-2 text-sm text-fg-muted">Проверьте соединение и повторите попытку. Данные раздела пока недоступны. Введённые значения сохранены.</p>
      <button type="button" disabled={state.retrying} onClick={() => { void state.retry(); }} className="mt-3 min-h-11 rounded-xl bg-accent px-4 py-2 font-medium text-accent-fg disabled:opacity-50">
        {state.retrying ? 'Повторная загрузка…' : 'Повторить'}
      </button>
    </section>}
    <div style={{ display: blocked ? 'none' : 'contents' }} inert={blocked} aria-hidden={blocked || undefined}>{children}</div>
  </>;
}
