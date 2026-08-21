import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  FileText,
  Search,
  Shield,
  Clock,
  User,
  Filter,
  CheckCircle2
} from 'lucide-react';

export const AuditLogPage: React.FC = () => {
  const {
    currentUser,
    auditLogs
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-zinc-500">
        <p className="text-sm font-medium">Доступ ограничен</p>
        <p className="text-xs text-zinc-600 mt-1">Журнал аудита доступен только Администраторам и Партнерам</p>
      </div>
    );
  }

  const filteredLogs = auditLogs.filter(log => {
    if (filterAction !== 'ALL' && log.action !== filterAction) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      return (
        log.action.toLowerCase().includes(q) ||
        log.details.toLowerCase().includes(q) ||
        log.userName.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="flex-1 flex flex-col h-[calc(100vh-3.5rem)] overflow-hidden bg-zinc-950 text-zinc-100">
      {/* Header */}
      <div className="p-4 border-b border-zinc-800 bg-zinc-900/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
        <div>
          <h3 className="text-sm font-bold text-zinc-100 flex items-center space-x-2">
            <Shield className="w-4 h-4 text-emerald-400" />
            <span>Неизменяемый журнал аудита безопасности (Audit Log)</span>
          </h3>
          <p className="text-xs text-zinc-400 mt-0.5">
            Фиксация каждого действия персонала, перемещения товара и финансовых транзакций
          </p>
        </div>

        <div className="flex items-center space-x-2 text-xs">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 w-3.5 h-3.5 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Поиск по действиям / персоналу..."
              className="rounded bg-zinc-950 border border-zinc-700 pl-8 pr-3 py-1.5 text-xs text-zinc-200 placeholder-zinc-500 focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <select
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
            className="rounded bg-zinc-950 border border-zinc-700 px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
          >
            <option value="ALL">Все события</option>
            <option value="SALE_CREATED">Продажи</option>
            <option value="PURCHASE_INTAKE">Приходы</option>
            <option value="TRANSFER_REQUEST">Запросы перемещений</option>
            <option value="TRANSFER_APPROVED">Подтверждения</option>
            <option value="EXCHANGE_PROCESSED">Обмены</option>
            <option value="REFUND_PROCESSED">Возвраты</option>
            <option value="SUPPLIER_PAYMENT">Выплаты поставщикам</option>
            <option value="EXPENSE_CREATED">Расходы</option>
            <option value="DAILY_RATE_SET">Курс валют</option>
          </select>
        </div>
      </div>

      {/* Log Feed */}
      <div className="flex-1 overflow-y-auto divide-y divide-zinc-800/80 bg-zinc-950">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center text-zinc-500 text-xs">
            Записи аудита не найдены
          </div>
        ) : (
          filteredLogs.map((log) => (
            <div key={log.id} className="p-4 hover:bg-zinc-900/60 transition-colors flex items-start justify-between text-xs">
              <div className="space-y-1">
                <div className="flex items-center space-x-2">
                  <span className="font-mono text-[11px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-800/60 px-1.5 py-0.2 rounded">
                    {log.action}
                  </span>
                  <span className="text-zinc-200 font-medium">
                    {log.userName}
                  </span>
                </div>
                <p className="text-xs text-zinc-300 font-mono">
                  {log.details}
                </p>
              </div>

              <div className="text-right shrink-0 text-[11px] font-mono text-zinc-500">
                {new Date(log.timestamp).toLocaleString('ru-RU')}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
