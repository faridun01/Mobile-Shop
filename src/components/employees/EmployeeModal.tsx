import React, { useState, useEffect } from 'react';
import { User, Store, Role } from '../../types';
import { Users, Eye, EyeOff } from 'lucide-react';
import { Dialog } from '../ui/Dialog';
import { Button } from '../ui/Button';
import { formatStoreDisplayTitle } from '../../utils/storeContext';

interface EmployeeModalProps {
  open: boolean;
  editingUser: User | null;
  stores: Store[];
  onClose: () => void;
  onSubmit: (data: {
    name: string;
    login: string;
    password?: string;
    role: Role;
    storeId?: string;
    isActive: boolean;
    baseSalaryTjs: number;
    salesCommissionPercent: number;
  }) => Promise<{ success: boolean; message?: string }>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export const EmployeeModal: React.FC<EmployeeModalProps> = ({
  open,
  editingUser,
  stores,
  onClose,
  onSubmit,
  onSuccess,
  onError,
}) => {
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<Role>('SELLER');
  const [storeId, setStoreId] = useState<string>('');
  const [isActive, setIsActive] = useState(true);
  const [baseSalaryTjs, setBaseSalaryTjs] = useState<string>('');
  const [salesCommissionPercent, setSalesCommissionPercent] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (editingUser) {
      setName(editingUser.name);
      setLogin(editingUser.login);
      setPassword('');
      setShowPassword(false);
      setRole(editingUser.role);
      setStoreId(editingUser.storeId || stores[0]?.id || '');
      setIsActive(editingUser.isActive ?? editingUser.active);
      setBaseSalaryTjs(editingUser.baseSalaryTjs?.toString() || '');
      setSalesCommissionPercent(editingUser.salesCommissionPercent?.toString() || '');
    } else {
      setName('');
      setLogin('');
      setPassword('');
      setShowPassword(false);
      setRole('SELLER');
      setStoreId(stores[0]?.id || '');
      setIsActive(true);
      setBaseSalaryTjs('');
      setSalesCommissionPercent('');
    }
  }, [editingUser, stores, open]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    if (!name.trim() || !login.trim()) {
      onError('Заполните имя и логин');
      return;
    }

    if (!editingUser && !password.trim()) {
      onError('Укажите пароль для входа нового сотрудника');
      return;
    }

    if ((role === 'SELLER' || role === 'PARTNER') && (!storeId || !storeId.trim())) {
      onError(
        role === 'PARTNER'
          ? 'Для создания партнера обязательно выберите магазин филиала (*)'
          : 'Для продавца привязка к магазину обязательна (*)'
      );
      return;
    }

    const baseSal = role === 'SELLER' ? parseFloat(baseSalaryTjs) || 0 : 0;
    const commPct = role === 'SELLER' ? parseFloat(salesCommissionPercent) || 0 : 0;

    setIsSubmitting(true);
    try {
      const res = await onSubmit({
        name: name.trim(),
        login: login.trim(),
        password: password.trim() || undefined,
        role,
        storeId: (role === 'SELLER' || role === 'PARTNER') ? (storeId || undefined) : undefined,
        isActive,
        baseSalaryTjs: baseSal,
        salesCommissionPercent: commPct,
      });

      if (res.success) {
        onSuccess(editingUser ? `Данные сотрудника ${name} обновлены` : `Сотрудник ${name} успешно добавлен`);
        onClose();
      } else {
        onError(res.message || (editingUser ? 'Ошибка обновления' : 'Ошибка создания'));
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={editingUser ? 'РЕДАКТИРОВАНИЕ СОТРУДНИКА' : 'НОВЫЙ СОТРУДНИК'}
      icon={Users}
      compact
      maxWidth="md"
      footer={
        <div className="grid grid-cols-2 gap-2 w-full">
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
            className="w-full !h-8 text-xs font-semibold"
          >
            Отмена
          </Button>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            form="employee-form"
            loading={isSubmitting}
            className="w-full !h-8 text-xs font-bold"
          >
            {editingUser ? 'Сохранить' : 'Создать'}
          </Button>
        </div>
      }
    >
      <form id="employee-form" onSubmit={handleSubmit} className="space-y-2">
        {/* Row 1: ФИО сотрудника (полная ширина) */}
        <div>
          <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">
            ФИО сотрудника <span className="text-danger">*</span>
          </label>
          <input
            type="text"
            required
            value={name ?? ''}
            onChange={(e) => setName(e.target.value)}
            placeholder="Саид Каримов"
            className="w-full h-8 rounded-lg bg-surface-raised border border-border px-2.5 text-xs text-fg focus:border-accent focus:outline-none transition-colors"
          />
        </div>

        {/* Row 2: Логин + Пароль в 2 колонки */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">
              Логин для входа <span className="text-danger">*</span>
            </label>
            <input
              type="text"
              required
              value={login ?? ''}
              onChange={(e) => setLogin(e.target.value)}
              placeholder="seller3"
              className="w-full h-8 rounded-lg bg-surface-raised border border-border px-2.5 text-xs text-fg font-mono focus:border-accent focus:outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5 truncate">
              {editingUser ? 'Новый пароль' : 'Пароль для входа'}{' '}
              <span className={editingUser ? 'text-fg-subtle font-normal' : 'text-danger'}>
                {editingUser ? '(не менять)' : '*'}
              </span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                required={!editingUser}
                value={password ?? ''}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={editingUser ? 'Не менять пароль' : 'Пароль'}
                className="w-full h-8 rounded-lg bg-surface-raised border border-border pl-2.5 pr-8 text-xs text-fg font-mono focus:border-accent focus:outline-none transition-colors"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 flex items-center pr-2 text-fg-subtle hover:text-fg transition-colors cursor-pointer"
                title={showPassword ? 'Скрыть пароль' : 'Показать пароль'}
              >
                {showPassword ? <EyeOff className="w-3.5 h-3.5 text-accent" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>

        {/* Row 3: Роль + Магазин в 2 колонки */}
        <div className="grid grid-cols-2 gap-2">
          <div className={role === 'ADMIN' ? 'col-span-2' : ''}>
            <label className="block text-[11px] font-semibold text-fg-subtle mb-0.5">
              Роль доступа
            </label>
            <select
              value={role ?? 'SELLER'}
              onChange={(e) => setRole(e.target.value as Role)}
              className="w-full h-8 rounded-lg bg-surface-raised border border-border px-2 text-xs text-fg font-medium focus:border-accent focus:outline-none cursor-pointer transition-colors"
            >
              <option value="SELLER">Продавец (касса/склад)</option>
              <option value="PARTNER">Партнер филиала</option>
              <option value="ADMIN">Администратор (полный)</option>
            </select>
          </div>

          {(role === 'SELLER' || role === 'PARTNER') && (
            <div>
              <label className="block text-[11px] font-semibold text-warning mb-0.5 truncate">
                Привязка к магазину <span className="text-danger">*</span>
              </label>
              <select
                required
                value={storeId ?? ''}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full h-8 rounded-lg bg-surface-raised border border-warning/50 px-2 text-xs text-fg font-semibold focus:border-warning focus:outline-none cursor-pointer transition-colors"
              >
                <option value="">-- Выберите магазин --</option>
                {stores.filter((s) => !s.isMainWarehouse).map((s) => (
                  <option key={s.id} value={s.id}>{formatStoreDisplayTitle(s)}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* Row 4: Оклад и Комиссия для продавца (SELLER) */}
        {role === 'SELLER' && (
          <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-surface-raised border border-border">
            <div>
              <label className="block text-accent text-[10px] font-bold uppercase tracking-wider mb-0.5">
                Оклад (TJS/мес)
              </label>
              <input
                step="0.01"
                type="number"
                min="0"
                value={baseSalaryTjs}
                onChange={(e) => setBaseSalaryTjs(e.target.value)}
                placeholder="1500"
                className="w-full h-7.5 rounded-md bg-surface border border-border px-2 text-xs text-fg font-mono focus:border-accent focus:outline-none transition-colors"
              />
            </div>
            <div>
              <label className="block text-accent text-[10px] font-bold uppercase tracking-wider mb-0.5">
                Комиссия продаж (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.0001"
                value={salesCommissionPercent}
                onChange={(e) => setSalesCommissionPercent(e.target.value)}
                placeholder="2.5"
                className="w-full h-7.5 rounded-md bg-surface border border-border px-2 text-xs text-fg font-mono focus:border-accent focus:outline-none transition-colors"
              />
            </div>
          </div>
        )}

        {/* Row 5: Статус учетной записи при редактировании */}
        {editingUser && (
          <div className="pt-0.5">
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-fg font-medium select-none">
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="w-3.5 h-3.5 rounded border-border text-accent focus:ring-0 cursor-pointer accent-accent"
              />
              <span>Активная учетная запись</span>
            </label>
          </div>
        )}
      </form>
    </Dialog>
  );
};
