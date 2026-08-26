import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { User, Role } from '../../types';
import {
  Users,
  Plus,
  Shield,
  Store,
  KeyRound,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  X,
  UserCheck,
  UserX,
  DollarSign,
  Receipt,
  Wallet,
  Calendar,
  TrendingUp,
  CreditCard,
  Briefcase,
  Download,
  Eye,
  EyeOff
} from 'lucide-react';

const ROLE_CONFIG: Record<Role, { label: string; bg: string; color: string; border: string }> = {
  ADMIN: { label: 'Администратор', bg: 'bg-emerald-500/15', color: 'text-emerald-300', border: 'border-emerald-500/30' },
  PARTNER: { label: 'Партнер (Владелец)', bg: 'bg-sky-500/15', color: 'text-sky-300', border: 'border-sky-500/30' },
  SELLER: { label: 'Продавец-кассир', bg: 'bg-slate-800/80', color: 'text-slate-300', border: 'border-slate-700' }
};

export const EmployeesPage: React.FC = () => {
  const {
    currentUser,
    users,
    stores,
    expenses,
    sales,
    todayRate,
    createUser,
    updateUser,
    resetUserPassword,
    deleteUser,
    createExpense
  } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUserConfirm, setDeletingUserConfirm] = useState<User | null>(null);

  // Salary payout and advance dialog states
  const [salaryPayoutUser, setSalaryPayoutUser] = useState<User | null>(null);
  const [grossSalaryInput, setGrossSalaryInput] = useState<string>('');
  const [deductAdvancesChecked, setDeductAdvancesChecked] = useState<boolean>(true);
  const [payoutNote, setPayoutNote] = useState<string>('');

  const [advanceIssueUser, setAdvanceIssueUser] = useState<User | null>(null);
  const [advanceAmountInput, setAdvanceAmountInput] = useState<string>('');
  const [advanceNoteInput, setAdvanceNoteInput] = useState<string>('');

  // Financial History & Payroll Report state
  const [financialHistoryUser, setFinancialHistoryUser] = useState<User | null>(null);
  const [selectedHistoryMonth, setSelectedHistoryMonth] = useState<string>('ALL');
  const [isPayrollReportModalOpen, setIsPayrollReportModalOpen] = useState(false);
  const [selectedPayrollMonth, setSelectedPayrollMonth] = useState<string>(new Date().toISOString().substring(0, 7));

  // Form fields
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('SELLER');
  const [storeId, setStoreId] = useState<string>(stores[0]?.id || '');
  const [isActive, setIsActive] = useState(true);

  // Stores load asynchronously from the API — resync once they arrive rather than
  // being permanently stuck on the empty initial value.
  useEffect(() => {
    if (!storeId && stores.length > 0) {
      setStoreId(stores[0].id);
    }
  }, [stores, storeId]);
  const [baseSalaryTjs, setBaseSalaryTjs] = useState<string>('');
  const [salesCommissionPercent, setSalesCommissionPercent] = useState<string>('');

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDeleteUserClick = (u: User) => {
    if (currentUser?.id === u.id) {
      setStatusMessage({ type: 'error', text: 'Вы не можете удалить собственный текущий профиль.' });
      return;
    }
    setDeletingUserConfirm(u);
  };

  const handleConfirmDeleteUser = async () => {
    if (!deletingUserConfirm) return;
    const targetName = deletingUserConfirm.name;
    const res = await deleteUser(deletingUserConfirm.id);
    setDeletingUserConfirm(null);

    if (res.success) {
      setStatusMessage({ type: 'success', text: `Сотрудник ${targetName} успешно удален из системы.` });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления сотрудника' });
    }
  };

  if (currentUser?.role !== 'ADMIN') {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        <p className="font-bold text-slate-400">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Раздел управления сотрудниками доступен только Администратору</p>
      </div>
    );
  }

  const handleOpenAdd = () => {
    setEditingUser(null);
    setName('');
    setLogin('');
    setPassword('');
    setShowPassword(false);
    setRole('SELLER');
    setStoreId(stores[0]?.id || '');
    setIsActive(true);
    setBaseSalaryTjs('');
    setSalesCommissionPercent('');
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setName(u.name);
    setLogin(u.login);
    setPassword(u.passwordHash || (u as any).password || '');
    setShowPassword(false);
    setRole(u.role);
    setStoreId(u.storeId || stores[0]?.id || '');
    setIsActive(u.isActive ?? u.active);
    setBaseSalaryTjs(u.baseSalaryTjs?.toString() || '');
    setSalesCommissionPercent(u.salesCommissionPercent?.toString() || '');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);

    if (!name.trim() || !login.trim()) {
      setStatusMessage({ type: 'error', text: 'Заполните имя и логин' });
      return;
    }

    if (!editingUser && !password.trim()) {
      setStatusMessage({ type: 'error', text: 'Укажите пароль для входа нового сотрудника' });
      return;
    }

    const baseSal = parseFloat(baseSalaryTjs) || 0;
    const commPct = parseFloat(salesCommissionPercent) || 0;

    if (editingUser) {
      if (password.trim().length > 0 && password.trim() !== editingUser.passwordHash) {
        await resetUserPassword(editingUser.id, password.trim());
      }

      const res = await updateUser({
        ...editingUser,
        name: name.trim(),
        login: login.trim(),
        passwordHash: password.trim() ? password.trim() : editingUser.passwordHash,
        role,
        storeId: role === 'SELLER' ? storeId : undefined,
        isActive,
        baseSalaryTjs: baseSal,
        salesCommissionPercent: commPct
      });

      if (res.success) {
        setIsModalOpen(false);
        setStatusMessage({ type: 'success', text: `Данные сотрудника ${name} обновлены` });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления' });
      }
    } else {
      const res = await createUser({
        name: name.trim(),
        login: login.trim(),
        passwordHash: password.trim(),
        role,
        storeId: role === 'SELLER' ? storeId : undefined,
        active: true,
        baseSalaryTjs: baseSal,
        salesCommissionPercent: commPct
      });

      if (res.success) {
        setIsModalOpen(false);
        setStatusMessage({ type: 'success', text: `Сотрудник ${name} успешно добавлен` });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания' });
      }
    }
  };

  const handleIssueAdvance = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!advanceIssueUser) return;
    const val = parseFloat(advanceAmountInput) || 0;
    if (val <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите правильную сумму аванса' });
      return;
    }

    const res = await createExpense({
      category: 'EMPLOYEE_ADVANCE',
      amountTjs: val,
      storeId: advanceIssueUser.storeId || stores[0]?.id,
      description: `Аванс сотруднику ${advanceIssueUser.name}: ${advanceNoteInput.trim() || 'Выдан под отчет / в счет зарплаты'}`,
      paidFromCashRegister: true,
      employeeId: advanceIssueUser.id,
      employeeName: advanceIssueUser.name,
      isEmployeeAdvance: true
    });

    if (res.success) {
      setStatusMessage({ type: 'success', text: `Аванс ${val} TJS успешно выдан сотруднику ${advanceIssueUser.name}` });
      setAdvanceIssueUser(null);
      setAdvanceAmountInput('');
      setAdvanceNoteInput('');
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка выдачи аванса' });
    }
  };

  const handleExecuteSalaryPayout = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!salaryPayoutUser) return;
    const grossVal = parseFloat(grossSalaryInput) || 0;
    if (grossVal <= 0) {
      setStatusMessage({ type: 'error', text: 'Укажите сумму начисленной зарплаты' });
      return;
    }

    // Calculate advances to deduct
    const empExpenses = expenses.filter(e => e.employeeId === salaryPayoutUser.id || (e.isEmployeeAdvance && e.employeeName === salaryPayoutUser.name));
    const totalAdvances = empExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
    const advanceDeduction = deductAdvancesChecked ? totalAdvances : 0;
    const netPayout = Math.max(0, grossVal - advanceDeduction);

    const res = await createExpense({
      category: 'SALARY',
      amountTjs: netPayout > 0 ? netPayout : grossVal,
      storeId: salaryPayoutUser.storeId || stores[0]?.id,
      description: `Выплата зарплаты сотруднику ${salaryPayoutUser.name} (Начислено: ${grossVal} TJS, Удержано авансов: ${advanceDeduction} TJS, Выдано на руки: ${netPayout} TJS). ${payoutNote.trim()}`,
      paidFromCashRegister: true,
      employeeId: salaryPayoutUser.id,
      employeeName: salaryPayoutUser.name
    });

    if (res.success) {
      setStatusMessage({
        type: 'success',
        text: `Зарплата сотруднику ${salaryPayoutUser.name} успешно выплачена: ${netPayout} TJS ${advanceDeduction > 0 ? `(Удержано авансов: ${advanceDeduction} TJS)` : ''}`
      });
      setSalaryPayoutUser(null);
      setGrossSalaryInput('');
      setPayoutNote('');
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка выплаты зарплаты' });
    }
  };

  const handleExportPayrollReport = () => {
    const headers = ['Сотрудник', 'Должность', 'Торговая точка', 'Оклад (TJS)', 'Выручка продаж (TJS)', 'Комиссия %', 'Начислено (TJS)', 'Взято авансов (TJS)', 'Выплачено ЗП (TJS)', 'Остаток к выплате (TJS)'];
    
    const rows = users.filter(u => u.isActive ?? u.active).map(u => {
      const uSales = sales.filter(s => s.sellerId === u.id && s.status !== 'REFUNDED' && s.date.startsWith(selectedPayrollMonth));
      const salesRev = uSales.reduce((acc, s) => acc + s.totalTjs, 0);
      const baseSal = u.baseSalaryTjs || 0;
      const commPct = u.salesCommissionPercent || 0;
      const commAmt = Math.round(salesRev * (commPct / 100));
      const grossAccrued = baseSal + commAmt;

      const uExpenses = expenses.filter(e => (e.employeeId === u.id || (e.isEmployeeAdvance && e.employeeName === u.name)) && e.date.startsWith(selectedPayrollMonth));
      const advances = uExpenses.filter(e => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance).reduce((acc, e) => acc + (e.amountTjs || 0), 0);
      const paidSalary = uExpenses.filter(e => e.category === 'SALARY').reduce((acc, e) => acc + (e.amountTjs || 0), 0);
      const netPayable = Math.max(0, grossAccrued - advances - paidSalary);

      return [
        u.name,
        u.role,
        u.storeName || 'Все филиалы',
        baseSal,
        salesRev,
        `${commPct}% (${commAmt} TJS)`,
        grossAccrued,
        advances,
        paidSalary,
        netPayable
      ];
    });

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF'
      + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Зарплатная_ведомость_${selectedPayrollMonth}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-bg text-fg font-mono">
      {/* Header Bar */}
      <div className="p-3.5 border-b border-slate-800 bg-[#0F1219] flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center space-x-2 uppercase">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Сотрудники и оклады</span>
          </h3>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={() => setIsPayrollReportModalOpen(true)}
            className="flex items-center space-x-1.5 px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-bold transition-colors"
            title="Ежемесячная ведомость зарплат сотрудников"
          >
            <Briefcase className="w-4 h-4 text-amber-400" />
            <span className="hidden md:inline">ЗАРПЛАТНЫЙ ОТЧЕТ</span>
          </button>

          <button
            onClick={handleOpenAdd}
            className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-mono font-bold text-slate-950 uppercase tracking-wider flex items-center space-x-1.5 transition-colors shadow-[0_0_12px_rgba(16,185,129,0.3)] shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">ДОБАВИТЬ СОТРУДНИКА</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div className={`mx-3 sm:mx-4 mt-3 p-2.5 rounded-lg text-xs font-mono flex items-center space-x-2 shrink-0 ${
          statusMessage.type === 'success' ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30' : 'bg-rose-950/60 text-rose-300 border border-rose-800'
        }`}>
          {statusMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
          <span>{statusMessage.text}</span>
        </div>
      )}

      {/* Users List Grid of Individual Cards */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#0B0E14] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 auto-rows-max gap-3.5 sm:gap-4 items-start">
        {users.map((u) => {
          const roleConf = ROLE_CONFIG[u.role] || ROLE_CONFIG.SELLER;

          return (
            <div
              key={u.id}
              className={`p-4 rounded-xl border transition-all flex flex-col justify-between space-y-3 font-mono shadow-sm relative overflow-hidden group ${
                u.isActive 
                  ? 'bg-[#0F1219] border-slate-800 hover:border-emerald-500/40 hover:shadow-[0_4px_20px_rgba(0,0,0,0.5)]' 
                  : 'bg-[#0F1219]/60 border-slate-800/60 opacity-75'
              }`}
            >
              {/* Card Header: Avatar, Name, Status & Edit Button */}
              <div className="flex items-start justify-between gap-2 border-b border-slate-800/80 pb-3">
                <div className="flex items-center space-x-3 min-w-0">
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center font-bold text-base shrink-0 border shadow-inner ${
                    u.role === 'ADMIN' ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' :
                    u.role === 'PARTNER' ? 'bg-sky-500/10 text-sky-300 border-sky-500/30' :
                    'bg-slate-900 text-slate-300 border-slate-800'
                  }`}>
                    {u.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-sm font-bold text-slate-100 truncate group-hover:text-emerald-400 transition-colors">
                      {u.name}
                    </h4>
                    <span className={`inline-block text-[10px] px-2 py-0.5 rounded font-medium border mt-1 ${roleConf.bg} ${roleConf.color} ${roleConf.border}`}>
                      {roleConf.label}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-1 shrink-0">
                  <button
                    onClick={() => handleOpenEdit(u)}
                    className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-800 transition-colors"
                    title="Редактировать сотрудника"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  {currentUser?.id !== u.id && (
                    <button
                      onClick={() => handleDeleteUserClick(u)}
                      className="p-2 rounded-xl bg-slate-900 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 border border-slate-800 transition-colors"
                      title="Удалить сотрудника"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Card Details: Login, Password, PIN, Store, Status */}
              <div className="space-y-2 text-xs bg-[#0B0E14] p-3 rounded-lg border border-slate-800/80">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase">ЛОГИН:</span>
                  <strong className="text-slate-200 font-mono font-semibold">{u.login}</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase">ПАРОЛЬ ВХОДА:</span>
                  <strong className="text-slate-200 text-xs font-mono">••••••••</strong>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase">ТОЧКА ПРОДАЖИ:</span>
                  <span className="text-slate-300 font-mono text-[11px] truncate max-w-35 text-right">
                    {u.storeName ? (
                      <span className="text-emerald-400 font-medium flex items-center justify-end space-x-1">
                        <Store className="w-3 h-3 shrink-0" />
                        <span className="truncate">{u.storeName}</span>
                      </span>
                    ) : (
                      <span className="text-slate-400">Все филиалы</span>
                    )}
                  </span>
                </div>

                {/* Salary & Sales Stats */}
                {(() => {
                  const empExpenses = expenses.filter(e => e.employeeId === u.id || (e.isEmployeeAdvance && e.employeeName === u.name));
                  const totalAdvances = empExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
                  const empSales = sales.filter(s => s.sellerId === u.id && s.status !== 'REFUNDED');
                  const salesRevTjs = empSales.reduce((sum, s) => sum + s.totalTjs, 0);
                  const unitsSold = empSales.reduce((sum, s) => sum + s.items.length, 0);
                  const baseSal = u.baseSalaryTjs || 0;
                  const commPct = u.salesCommissionPercent || 0;

                  return (
                    <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px]">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">ОКЛАД / КОМИССИЯ:</span>
                        <span className="font-mono text-emerald-400 font-semibold">
                          {baseSal > 0 ? `${baseSal.toLocaleString()} TJS` : 'Без оклада'} {commPct > 0 ? `(+${commPct}%)` : ''}
                        </span>
                      </div>
                      {u.role === 'SELLER' && (
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-slate-400">ПРОДАЖИ:</span>
                          <span className="font-mono text-slate-200 font-bold">
                            {salesRevTjs.toLocaleString()} TJS ({unitsSold} шт)
                          </span>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-slate-400">АВАНСЫ / ВЫЧЕТЫ:</span>
                        <span className={`font-mono font-bold ${totalAdvances > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
                          {totalAdvances.toLocaleString()} TJS
                        </span>
                      </div>
                    </div>
                  );
                })()}

                <div className="flex items-center justify-between pt-1 border-t border-slate-800/60">
                  <span className="text-[10px] text-slate-500 uppercase">СТАТУС:</span>
                  {u.isActive ? (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/20 font-medium flex items-center space-x-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      <span>Активен</span>
                    </span>
                  ) : (
                    <span className="text-[10px] px-2 py-0.5 rounded bg-rose-500/15 text-rose-300 border border-rose-500/30 font-medium">
                      Заблокирован
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons: Advance, Salary Payout, Financial History */}
              <div className="space-y-1.5 pt-1">
                <div className="grid grid-cols-3 gap-1">
                  <button
                    type="button"
                    onClick={() => {
                      setAdvanceIssueUser(u);
                      setAdvanceAmountInput('');
                      setAdvanceNoteInput('');
                    }}
                    className="py-1.5 px-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold flex items-center justify-center space-x-1 transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>АВАНС</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const empSales = sales.filter(s => s.sellerId === u.id && s.status !== 'REFUNDED');
                      const salesRevTjs = empSales.reduce((sum, s) => sum + s.totalTjs, 0);
                      const baseSal = u.baseSalaryTjs || 0;
                      const commPct = u.salesCommissionPercent || 0;
                      const commAmount = Math.round(salesRevTjs * (commPct / 100));
                      const autoGross = baseSal + commAmount;

                      setSalaryPayoutUser(u);
                      setGrossSalaryInput(autoGross > 0 ? autoGross.toString() : '');
                      setPayoutNote('');
                      setDeductAdvancesChecked(true);
                    }}
                    className="py-1.5 px-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold flex items-center justify-center space-x-1 transition-colors"
                  >
                    <DollarSign className="w-3 h-3" />
                    <span>ЗАРПЛАТА</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setFinancialHistoryUser(u)}
                    className="py-1.5 px-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 text-[10px] font-bold flex items-center justify-center space-x-1 transition-colors"
                    title="Финансовая история выплат и авансов"
                  >
                    <Receipt className="w-3 h-3" />
                    <span>ИСТОРИЯ</span>
                  </button>
                </div>

                <div className="flex space-x-1.5">
                  <button
                    onClick={() => handleOpenEdit(u)}
                    className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] font-mono text-slate-300 hover:text-white flex items-center justify-center space-x-1 transition-colors"
                  >
                    <Edit2 className="w-3 h-3 text-emerald-400" />
                    <span>ИЗМЕНИТЬ</span>
                  </button>
                  {currentUser?.id !== u.id && (
                    <button
                      onClick={() => handleDeleteUserClick(u)}
                      className="py-1.5 px-2.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-[11px] font-mono text-rose-400 hover:text-rose-300 flex items-center justify-center transition-colors"
                      title="Удалить сотрудника"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL: Add / Edit User */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <form onSubmit={handleSubmit} className="w-full max-w-md rounded-xl bg-[#0F1219] border border-slate-800 p-5 text-slate-200 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center space-x-2">
                <Users className="w-4 h-4 text-emerald-400" />
                <span>{editingUser ? 'РЕДАКТИРОВАНИЕ СОТРУДНИКА' : 'НОВЫЙ СОТРУДНИК'}</span>
              </h4>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-500 hover:text-slate-300"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ФИО СОТРУДНИКА *</label>
                <input
                  type="text"
                  required
                  value={name ?? ''}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Саид Каримов"
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ЛОГИН ДЛЯ ВХОДА *</label>
                <input
                  type="text"
                  required
                  value={login ?? ''}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="seller3"
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1 flex items-center justify-between">
                  <span>{editingUser ? 'ПАРОЛЬ ДЛЯ ВХОДА (Остаётся прежним или новый)' : 'ПАРОЛЬ ДЛЯ ВХОДА *'}</span>
                  {editingUser && <span className="text-emerald-400 font-normal">Нажмите 👁 чтобы посмотреть</span>}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required={!editingUser}
                    value={password ?? ''}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={editingUser ? 'Пароль сотрудника' : 'Пароль для входа в систему'}
                    className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 pl-3 pr-10 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none font-mono text-xs"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-500 hover:text-slate-300 transition-colors"
                    title={showPassword ? 'Скрыть пароль' : 'Показать пароль сотрудника'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4 text-emerald-400" /> : <Eye className="w-4 h-4 text-slate-400 hover:text-emerald-400" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">РОЛЬ ДОСТУПА</label>
                {editingUser && (editingUser.id === 'user-admin' || editingUser.login === 'admin') ? (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold flex items-center justify-between">
                    <span>ГЛАВНЫЙ АДМИНИСТРАТОР ({name || editingUser.name})</span>
                    <Shield className="w-4 h-4 text-emerald-400 shrink-0" />
                  </div>
                ) : (
                  <select
                    value={role ?? 'SELLER'}
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="SELLER">Продавец (ограничен своим магазином, без себестоимости)</option>
                    <option value="PARTNER">Партнер (все магазины, финансы, отчеты)</option>
                    <option value="ADMIN">Администратор (полный доступ)</option>
                  </select>
                )}
              </div>

              {role === 'SELLER' && (
                <div>
                  <label className="block text-slate-400 text-[10px] uppercase mb-1">ПРИВЯЗКА К МАГАЗИНУ *</label>
                  <select
                    value={storeId ?? ''}
                    onChange={(e) => setStoreId(e.target.value)}
                    className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                  >
                    {stores.filter(s => !s.isMainWarehouse).map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Salary & Commission Settings */}
              <div className="grid grid-cols-2 gap-2.5 p-3 rounded-lg bg-[#0B0E14] border border-slate-800">
                <div>
                  <label className="block text-emerald-400 text-[10px] uppercase mb-1 font-bold">ОКЛАД (TJS/МЕС)</label>
                  <input
                    type="number"
                    min="0"
                    value={baseSalaryTjs}
                    onChange={(e) => setBaseSalaryTjs(e.target.value)}
                    placeholder="1500"
                    className="w-full rounded-lg bg-[#0F1219] border border-slate-800 px-3 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-emerald-400 text-[10px] uppercase mb-1 font-bold">КОМИССИЯ ПРОДАЖ (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={salesCommissionPercent}
                    onChange={(e) => setSalesCommissionPercent(e.target.value)}
                    placeholder="2.5"
                    className="w-full rounded-lg bg-[#0F1219] border border-slate-800 px-3 py-1.5 text-slate-100 font-mono text-xs focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              {editingUser && (
                <div className="pt-2 border-t border-slate-800">
                  <label className="flex items-center space-x-2 cursor-pointer text-slate-300">
                    <input
                      type="checkbox"
                      checked={isActive}
                      onChange={(e) => setIsActive(e.target.checked)}
                      className="rounded bg-[#0B0E14] border-slate-700 text-emerald-500 focus:ring-0"
                    />
                    <span>Активная учетная запись</span>
                  </label>
                </div>
              )}
            </div>

            <div className="flex space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold uppercase text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
              >
                {editingUser ? 'СОХРАНИТЬ' : 'СОЗДАТЬ'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: DELETE USER CONFIRMATION */}
      {deletingUserConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-md rounded-xl bg-[#0F1219] border border-rose-500/40 p-5 shadow-2xl space-y-4 text-slate-200">
            <div className="flex items-center space-x-3 text-rose-400 border-b border-slate-800 pb-3">
              <div className="p-2 rounded-lg bg-rose-500/20 text-rose-400 shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold uppercase text-white">УДАЛЕНИЕ СОТРУДНИКА</h3>
                <p className="text-[11px] text-slate-400 mt-0.5">{deletingUserConfirm.name} ({deletingUserConfirm.login})</p>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800 text-xs space-y-2">
              <p className="text-slate-200 font-semibold">
                Вы действительно хотите навсегда удалить учетную запись сотрудника «<span className="text-rose-400">{deletingUserConfirm.name}</span>»?
              </p>
              <p className="text-[11px] text-slate-400">
                Логин для входа: <strong className="text-slate-200">{deletingUserConfirm.login}</strong> | Роль: <strong className="text-slate-200">{deletingUserConfirm.role}</strong>
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setDeletingUserConfirm(null)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300 uppercase transition-colors"
              >
                ОТМЕНА
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="flex-1 py-2 rounded-lg bg-rose-500 hover:bg-rose-400 active:bg-rose-600 text-xs font-bold uppercase text-white shadow-lg shadow-rose-500/30 transition-colors"
              >
                УДАЛИТЬ СОТРУДНИКА
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ISSUE ADVANCE TO EMPLOYEE */}
      {advanceIssueUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <form onSubmit={handleIssueAdvance} className="w-full max-w-sm rounded-xl bg-[#0F1219] border border-amber-500/40 p-5 text-slate-200 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-2">
                <Plus className="w-4 h-4 text-amber-400" />
                <span>ВЫДАЧА АВАНСА / РАСХОДА</span>
              </h4>
              <button type="button" onClick={() => setAdvanceIssueUser(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs space-y-3">
              <div className="p-2.5 rounded-lg bg-[#0B0E14] border border-slate-800 space-y-1">
                <span className="text-[10px] text-slate-500 uppercase block">Сотрудник:</span>
                <strong className="text-sm text-slate-100">{advanceIssueUser.name}</strong>
                <p className="text-[10px] text-slate-400">{advanceIssueUser.storeName || 'Магазин'}</p>
              </div>

              <div>
                <label className="block text-amber-400 text-[10px] uppercase mb-1 font-bold">СУММА АВАНСА (TJS) *</label>
                <div className="relative">
                  <input
                    type="number"
                    min="1"
                    required
                    value={advanceAmountInput}
                    onChange={(e) => setAdvanceAmountInput(e.target.value)}
                    placeholder="300"
                    className="w-full rounded-lg bg-[#0B0E14] border border-amber-500/40 px-3 py-2 font-mono text-amber-400 text-sm font-bold focus:border-amber-500 focus:outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-slate-500 text-xs">TJS</span>
                </div>
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1 font-bold">ПРИМЕЧАНИЕ / НА ЧТО ВЫДАНО</label>
                <input
                  type="text"
                  value={advanceNoteInput}
                  onChange={(e) => setAdvanceNoteInput(e.target.value)}
                  placeholder="В счет зарплаты / На личные расходы"
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 text-xs focus:border-amber-500 focus:outline-none"
                />
              </div>

              <p className="text-[9px] text-slate-500 italic">
                ★ Сумма будет списана из кассы и учтена как удержанный аванс при выдаче зарплаты.
              </p>
            </div>

            <div className="flex space-x-2 pt-1">
              <button
                type="button"
                onClick={() => setAdvanceIssueUser(null)}
                className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300"
              >
                ОТМЕНА
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-xs font-bold uppercase text-slate-950 shadow-[0_0_10px_rgba(245,158,11,0.3)]"
              >
                ВЫДАТЬ АВАНС
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL: SALARY PAYOUT */}
      {salaryPayoutUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <form onSubmit={handleExecuteSalaryPayout} className="w-full max-w-md rounded-xl bg-[#0F1219] border border-emerald-500/40 p-5 text-slate-200 shadow-2xl space-y-3.5">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-2">
                <DollarSign className="w-4 h-4 text-emerald-400" />
                <span>ВЫПЛАТА ЗАРПЛАТЫ СОТРУДНИКУ</span>
              </h4>
              <button type="button" onClick={() => setSalaryPayoutUser(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {(() => {
              const empExpenses = expenses.filter(e => e.employeeId === salaryPayoutUser.id || (e.isEmployeeAdvance && e.employeeName === salaryPayoutUser.name));
              const totalAdvances = empExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);

              const empSales = sales.filter(s => s.sellerId === salaryPayoutUser.id && s.status !== 'REFUNDED');
              const salesRevTjs = empSales.reduce((sum, s) => sum + s.totalTjs, 0);
              const baseSal = salaryPayoutUser.baseSalaryTjs || 0;
              const commPct = salaryPayoutUser.salesCommissionPercent || 0;
              const commAmount = Math.round(salesRevTjs * (commPct / 100));
              const autoGross = baseSal + commAmount;

              const grossVal = parseFloat(grossSalaryInput) || 0;
              const advanceDeduction = deductAdvancesChecked ? totalAdvances : 0;
              const netPayout = Math.max(0, grossVal - advanceDeduction);

              return (
                <div className="text-xs space-y-3">
                  <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <strong className="text-sm text-slate-100 block">{salaryPayoutUser.name}</strong>
                        <span className="text-[10px] text-slate-500">{salaryPayoutUser.storeName || 'Магазин'}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] text-slate-400 block uppercase">Авансы / Вычеты:</span>
                        <strong className="text-amber-400 font-mono">{totalAdvances.toLocaleString()} TJS</strong>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-800/60 text-[11px] space-y-1">
                      <div className="flex justify-between text-slate-400">
                        <span>Оклад (фикс):</span>
                        <span className="text-slate-200">{baseSal.toLocaleString()} TJS</span>
                      </div>
                      <div className="flex justify-between text-slate-400">
                        <span>Продажи ({salesRevTjs.toLocaleString()} TJS × {commPct}%):</span>
                        <span className="text-amber-300">+{commAmount.toLocaleString()} TJS</span>
                      </div>
                      <div className="flex justify-between font-bold text-emerald-400 pt-1 border-t border-slate-800/40">
                        <span>Расчетное начисление:</span>
                        <span>{autoGross.toLocaleString()} TJS</span>
                      </div>
                    </div>

                    {autoGross > 0 && grossSalaryInput !== autoGross.toString() && (
                      <button
                        type="button"
                        onClick={() => setGrossSalaryInput(autoGross.toString())}
                        className="w-full py-1.5 px-2 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 font-mono text-[10px] font-bold border border-emerald-500/40 flex items-center justify-center space-x-1 transition-colors"
                      >
                        <span>⚡ Применить авторасчет ({autoGross.toLocaleString()} TJS)</span>
                      </button>
                    )}
                  </div>

                  <div>
                    <label className="block text-emerald-400 text-[10px] uppercase mb-1 font-bold font-mono">НАЧИСЛЕНО ЗАРПЛАТЫ / БОНУСОВ (TJS) *</label>
                    <div className="relative">
                      <input
                        type="number"
                        min="1"
                        required
                        value={grossSalaryInput}
                        onChange={(e) => setGrossSalaryInput(e.target.value)}
                        placeholder="Например: 1500"
                        className="w-full rounded-lg bg-[#0B0E14] border border-emerald-500/40 px-3 py-2 font-mono text-emerald-400 text-sm font-bold focus:border-emerald-500 focus:outline-none"
                      />
                      <span className="absolute right-3 top-2.5 text-slate-500 text-xs">TJS</span>
                    </div>
                  </div>

                  {totalAdvances > 0 && (
                    <div className="p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 space-y-1">
                      <label className="flex items-center space-x-2 cursor-pointer text-slate-200">
                        <input
                          type="checkbox"
                          checked={deductAdvancesChecked}
                          onChange={(e) => setDeductAdvancesChecked(e.target.checked)}
                          className="rounded bg-[#0B0E14] border-slate-700 text-amber-500 focus:ring-0"
                        />
                        <span className="font-bold">Удержать накопленные авансы ({totalAdvances.toLocaleString()} TJS)</span>
                      </label>
                    </div>
                  )}

                  {/* Summary Box */}
                  <div className="p-3 rounded-lg bg-[#0B0E14] border border-slate-800 space-y-1.5 font-mono">
                    <div className="flex justify-between text-slate-400">
                      <span>Начислено всего:</span>
                      <span>{grossVal.toLocaleString()} TJS</span>
                    </div>
                    <div className="flex justify-between text-amber-400">
                      <span>Удержано авансов:</span>
                      <span>-{advanceDeduction.toLocaleString()} TJS</span>
                    </div>
                    <div className="flex justify-between pt-1 border-t border-slate-800 text-sm font-bold text-emerald-400">
                      <span>К выгрузке / на руки:</span>
                      <span>{netPayout.toLocaleString()} TJS</span>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-400 text-[10px] uppercase mb-1 font-bold">ПРИМЕЧАНИЕ</label>
                    <input
                      type="text"
                      value={payoutNote}
                      onChange={(e) => setPayoutNote(e.target.value)}
                      placeholder="Выплата за текущий месяц"
                      className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 text-xs focus:border-emerald-500 focus:outline-none"
                    />
                  </div>

                  <div className="flex space-x-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setSalaryPayoutUser(null)}
                      className="flex-1 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300"
                    >
                      ОТМЕНА
                    </button>
                    <button
                      type="submit"
                      className="flex-1 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold uppercase text-slate-950 shadow-[0_0_10px_rgba(16,185,129,0.3)]"
                    >
                      ВЫПЛАТИТЬ ЗАРПЛАТУ
                    </button>
                  </div>
                </div>
              );
            })()}
          </form>
        </div>
      )}

      {/* MODAL: Employee Financial History */}
      {financialHistoryUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-3xl rounded-xl bg-[#0F1219] border border-sky-500/40 p-5 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <h4 className="text-xs sm:text-sm font-bold text-sky-400 uppercase tracking-wider flex items-center space-x-2">
                  <Receipt className="w-4 h-4 text-sky-400" />
                  <span>ФИНАНСОВАЯ ИСТОРИЯ И ОПЕРАЦИИ: {financialHistoryUser.name}</span>
                </h4>
                <span className="text-[10px] text-slate-500">{financialHistoryUser.storeName || 'Все филиалы'}</span>
              </div>
              <button type="button" onClick={() => setFinancialHistoryUser(null)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive Month Selector Bar */}
            <div className="bg-[#0B0E14] p-3 rounded-lg border border-slate-800 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="text-xs font-bold text-slate-300 uppercase flex items-center space-x-1.5">
                  <Calendar className="w-4 h-4 text-amber-400" />
                  <span>ФИЛЬТР ПО МЕСЯЦУ:</span>
                </label>
                <div className="flex items-center space-x-2">
                  <input
                    type="month"
                    value={selectedHistoryMonth === 'ALL' ? '' : selectedHistoryMonth}
                    onChange={(e) => setSelectedHistoryMonth(e.target.value || 'ALL')}
                    className="rounded-md bg-[#0F1219] border border-slate-800 px-3 py-1 text-xs text-amber-300 font-bold focus:border-amber-500 focus:outline-none"
                  />
                  {selectedHistoryMonth !== 'ALL' && (
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryMonth('ALL')}
                      className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px] text-slate-300 font-bold"
                    >
                      СБРОСИТЬ ФИЛЬТР
                    </button>
                  )}
                </div>
              </div>

              {/* Month Quick Filter Chips */}
              {(() => {
                const allEmpExpenses = expenses.filter(e => e.employeeId === financialHistoryUser.id || (e.isEmployeeAdvance && e.employeeName === financialHistoryUser.name));
                const allEmpSales = sales.filter(s => s.sellerId === financialHistoryUser.id && s.status !== 'REFUNDED');
                
                const datesSet = new Set<string>();
                allEmpExpenses.forEach(e => datesSet.add(e.date.substring(0, 7)));
                allEmpSales.forEach(s => datesSet.add(s.date.substring(0, 7)));
                const availableMonths = Array.from(datesSet).sort().reverse();

                return (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setSelectedHistoryMonth('ALL')}
                      className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                        selectedHistoryMonth === 'ALL'
                          ? 'bg-amber-500 text-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                          : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                      }`}
                    >
                      🌐 ВСЕ МЕСЯЦЫ
                    </button>
                    {availableMonths.map(m => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => setSelectedHistoryMonth(m)}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-colors ${
                          selectedHistoryMonth === m
                            ? 'bg-amber-500 text-slate-950 shadow-[0_0_8px_rgba(245,158,11,0.4)]'
                            : 'bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200 border border-slate-800'
                        }`}
                      >
                        📅 {m}
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>

            {/* Calculations & Breakdown for Selected Month / All */}
            {(() => {
              const allExpenses = expenses.filter(e => e.employeeId === financialHistoryUser.id || (e.isEmployeeAdvance && e.employeeName === financialHistoryUser.name));
              const allSales = sales.filter(s => s.sellerId === financialHistoryUser.id && s.status !== 'REFUNDED');

              const filteredExpenses = selectedHistoryMonth === 'ALL'
                ? allExpenses
                : allExpenses.filter(e => e.date.startsWith(selectedHistoryMonth));

              const filteredSales = selectedHistoryMonth === 'ALL'
                ? allSales
                : allSales.filter(s => s.date.startsWith(selectedHistoryMonth));

              const salaryExpenses = filteredExpenses.filter(e => e.category === 'SALARY');
              const advanceExpenses = filteredExpenses.filter(e => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance);

              const totalSalaryPaid = salaryExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
              const totalAdvancesTaken = advanceExpenses.reduce((sum, e) => sum + (e.amountTjs || 0), 0);
              const totalSalesRev = filteredSales.reduce((sum, s) => sum + s.totalTjs, 0);

              const baseSal = financialHistoryUser.baseSalaryTjs || 0;
              const commPct = financialHistoryUser.salesCommissionPercent || 0;
              const commAmount = Math.round(totalSalesRev * (commPct / 100));
              const grossAccrued = baseSal + commAmount;

              return (
                <div className="space-y-3">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 bg-[#0B0E14] p-3 rounded-lg border border-slate-800 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">ВЫРУЧКА ПРОДАЖ:</span>
                      <strong className="text-slate-100 text-xs font-bold">{totalSalesRev.toLocaleString()} TJS ({filteredSales.length} шт)</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">НАЧИСЛЕНО (ОКЛАД+PROFIT):</span>
                      <strong className="text-emerald-400 text-xs font-bold">{grossAccrued.toLocaleString()} TJS</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">ВЫДАННО АВАНСОВ:</span>
                      <strong className="text-amber-400 text-xs font-bold">{totalAdvancesTaken.toLocaleString()} TJS</strong>
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-500 uppercase block">ВЫПЛАЧЕНО ЗАРПЛАТЫ:</span>
                      <strong className="text-sky-400 text-xs font-bold">{totalSalaryPaid.toLocaleString()} TJS</strong>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-slate-200 uppercase">
                        Все операции за {selectedHistoryMonth === 'ALL' ? 'весь период' : `месяц ${selectedHistoryMonth}`} ({filteredExpenses.length + filteredSales.length}):
                      </span>
                    </div>
                    
                    <div className="max-h-72 overflow-y-auto rounded-lg border border-slate-800 bg-[#0B0E14]">
                      {filteredExpenses.length === 0 && filteredSales.length === 0 ? (
                        <div className="p-4 text-center text-slate-500 text-xs">Операций за выбранный месяц не найдено</div>
                      ) : (
                        <table className="w-full text-left text-xs font-mono">
                          <thead className="bg-[#0F1219] text-[10px] text-slate-400 uppercase border-b border-slate-800">
                            <tr>
                              <th className="p-2">Дата</th>
                              <th className="p-2">Тип операции</th>
                              <th className="p-2">Детали / Описание</th>
                              <th className="p-2 text-right">Сумма (TJS)</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 text-[11px]">
                            {/* Salary & Advance Expenses */}
                            {filteredExpenses.map(e => (
                              <tr key={e.id} className="hover:bg-slate-900/40">
                                <td className="p-2 text-slate-400 whitespace-nowrap">{new Date(e.date).toLocaleDateString()}</td>
                                <td className="p-2">
                                  {e.category === 'SALARY' ? (
                                    <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 text-[10px] font-bold">ЗАРПЛАТА</span>
                                  ) : (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 text-[10px] font-bold">АВАНС</span>
                                  )}
                                </td>
                                <td className="p-2 text-slate-300 truncate max-w-55">{e.description || e.comment || '-'}</td>
                                <td className={`p-2 text-right font-bold ${e.category === 'SALARY' ? 'text-emerald-400' : 'text-amber-400'}`}>
                                  {e.amountTjs.toLocaleString()} TJS
                                </td>
                              </tr>
                            ))}
                            {/* Sales */}
                            {filteredSales.map(s => (
                              <tr key={s.id} className="hover:bg-slate-900/40">
                                <td className="p-2 text-slate-400 whitespace-nowrap">{new Date(s.date).toLocaleDateString()}</td>
                                <td className="p-2">
                                  <span className="px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-300 border border-sky-500/30 text-[10px] font-bold">ПРОДАЖА #{s.receiptNumber}</span>
                                </td>
                                <td className="p-2 text-slate-300 truncate max-w-55">
                                  {s.items.map(i => `${i.brand} ${i.model}`).join(', ')} ({s.customerName || 'Покупатель'})
                                </td>
                                <td className="p-2 text-right font-bold text-slate-100">
                                  +{s.totalTjs.toLocaleString()} TJS
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              );
            })()}

            <div className="pt-2 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setFinancialHistoryUser(null)}
                className="py-2 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-bold text-slate-300"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Monthly Payroll Summary Report */}
      {isPayrollReportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-xs font-mono">
          <div className="w-full max-w-4xl rounded-xl bg-[#0F1219] border border-amber-500/40 p-5 text-slate-200 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h4 className="text-xs sm:text-sm font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-2">
                <Briefcase className="w-4 h-4 text-amber-400" />
                <span>📊 ЕЖЕМЕСЯЧНАЯ ЗАРПЛАТНАЯ ВЕДОМОСТЬ СОТРУДНИКОВ</span>
              </h4>
              <button type="button" onClick={() => setIsPayrollReportModalOpen(false)} className="text-slate-500 hover:text-slate-300">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Month Selector */}
            <div className="flex items-center space-x-3 bg-[#0B0E14] p-3 rounded-lg border border-slate-800">
              <label className="text-xs font-bold text-slate-400 uppercase">ОТЧЕТНЫЙ МЕСЯЦ:</label>
              <input
                type="month"
                value={selectedPayrollMonth}
                onChange={(e) => setSelectedPayrollMonth(e.target.value)}
                className="rounded-md bg-[#0F1219] border border-slate-800 px-3 py-1.5 text-xs text-amber-300 font-bold focus:border-amber-500 focus:outline-none"
              />
            </div>

            {/* Payroll Table */}
            <div className="overflow-x-auto rounded-lg border border-slate-800 bg-[#0B0E14]">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#0F1219] text-[10px] text-slate-400 uppercase border-b border-slate-800">
                  <tr>
                    <th className="p-2.5">Сотрудник</th>
                    <th className="p-2.5">Точка</th>
                    <th className="p-2.5 text-right">Оклад (TJS)</th>
                    <th className="p-2.5 text-right">Продажи (TJS)</th>
                    <th className="p-2.5 text-right">Комиссия (TJS)</th>
                    <th className="p-2.5 text-right">Начислено (TJS)</th>
                    <th className="p-2.5 text-right text-amber-400">Авансы (TJS)</th>
                    <th className="p-2.5 text-right text-sky-400">Выплачено (TJS)</th>
                    <th className="p-2.5 text-right text-emerald-400 font-bold">К выдаче (TJS)</th>
                    <th className="p-2.5 text-center">Все операции</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-[11px]">
                  {users.filter(u => u.isActive ?? u.active).map(u => {
                    const uSales = sales.filter(s => s.sellerId === u.id && s.status !== 'REFUNDED' && s.date.startsWith(selectedPayrollMonth));
                    const salesRev = uSales.reduce((acc, s) => acc + s.totalTjs, 0);
                    const baseSal = u.baseSalaryTjs || 0;
                    const commPct = u.salesCommissionPercent || 0;
                    const commAmt = Math.round(salesRev * (commPct / 100));
                    const grossAccrued = baseSal + commAmt;

                    const uExpenses = expenses.filter(e => (e.employeeId === u.id || (e.isEmployeeAdvance && e.employeeName === u.name)) && e.date.startsWith(selectedPayrollMonth));
                    const advances = uExpenses.filter(e => e.category === 'EMPLOYEE_ADVANCE' || e.isEmployeeAdvance).reduce((acc, e) => acc + (e.amountTjs || 0), 0);
                    const paidSalary = uExpenses.filter(e => e.category === 'SALARY').reduce((acc, e) => acc + (e.amountTjs || 0), 0);
                    const netPayable = Math.max(0, grossAccrued - advances - paidSalary);

                    return (
                      <tr
                        key={u.id}
                        onClick={() => {
                          setIsPayrollReportModalOpen(false);
                          setSelectedHistoryMonth(selectedPayrollMonth);
                          setFinancialHistoryUser(u);
                        }}
                        className="hover:bg-slate-800/60 cursor-pointer transition-colors"
                        title="Нажмите, чтобы открыть подробные операции за этот месяц"
                      >
                        <td className="p-2.5 font-bold text-slate-100">{u.name}</td>
                        <td className="p-2.5 text-slate-400">{u.storeName || 'Все точки'}</td>
                        <td className="p-2.5 text-right">{baseSal.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-semibold text-slate-200">{salesRev.toLocaleString()}</td>
                        <td className="p-2.5 text-right text-amber-300">{commAmt.toLocaleString()} ({commPct}%)</td>
                        <td className="p-2.5 text-right font-bold text-slate-100">{grossAccrued.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-amber-400">-{advances.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-sky-400">{paidSalary.toLocaleString()}</td>
                        <td className="p-2.5 text-right font-bold text-emerald-400">{netPayable.toLocaleString()} TJS</td>
                        <td className="p-2.5 text-center">
                          <span className="px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 font-bold hover:bg-sky-500/30 text-[10px]">
                            📜 Операции {selectedPayrollMonth}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center pt-2 border-t border-slate-800">


              <button
                type="button"
                onClick={() => setIsPayrollReportModalOpen(false)}
                className="py-2.5 px-4 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-xs font-bold uppercase text-slate-950"
              >
                ЗАКРЫТЬ
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

