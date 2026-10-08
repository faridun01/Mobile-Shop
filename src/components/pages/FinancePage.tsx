import React, { useState } from 'react';
import { useAppFields } from '../../context/AppContext';
import { RestrictedAccess } from '../ui/RestrictedAccess';
import { StatusBanner, StatusMessage } from '../ui/StatusBanner';
import { ProfitReport } from '../finance/ProfitReport';
import { getBusinessDateKey } from '../../utils/businessDate';

export const FinancePage: React.FC = () => {
  const { currentUser } = useAppFields('currentUser');

  const isSeller = currentUser?.role === 'SELLER';

  const [status, setStatus] = useState<StatusMessage | null>(null);

  // Date filter state for ProfitReport
  const todayKey = getBusinessDateKey();
  const currentMonth = todayKey.substring(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');

  const handleDateChange = (start: string, end: string, monthStr?: string) => {
    setStartDate(start);
    setEndDate(end);
    setSelectedMonth(monthStr || '');
  };

  const handleResetToCurrentMonth = () => {
    setSelectedMonth(currentMonth);
    setStartDate('');
    setEndDate('');
  };



  if (isSeller) {
    return (
      <div className="flex-1 flex flex-col bg-bg">
        <RestrictedAccess message="Раздел отчётов доступен только администраторам и партнёрам." />
      </div>
    );
  }

  return (
    <div className="work-screen flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg select-none">
      <StatusBanner message={status} onDismiss={() => setStatus(null)} />

      {/* Main Report Content */}
      <div className="flex-1 overflow-y-auto">
        <ProfitReport
          key="profit-report"
          view="summary"
          month={selectedMonth}
          startDate={startDate}
          endDate={endDate}
          onDateChange={handleDateChange}
          onResetToCurrentMonth={handleResetToCurrentMonth}
        />
      </div>
    </div>
  );
};
