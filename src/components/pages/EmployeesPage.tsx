import React, { useState } from 'react';
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
  UserX
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
    createUser,
    updateUser,
    deleteUser
  } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [deletingUserConfirm, setDeletingUserConfirm] = useState<User | null>(null);

  // Form fields
  const [name, setName] = useState('');
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState<Role>('SELLER');
  const [storeId, setStoreId] = useState<string>(stores[0]?.id || 'store-1');
  const [isActive, setIsActive] = useState(true);
  const [showPasswordMap, setShowPasswordMap] = useState<Record<string, boolean>>({});

  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleDeleteUserClick = (u: User) => {
    if (currentUser?.id === u.id) {
      setStatusMessage({ type: 'error', text: 'Вы не можете удалить собственный текущий профиль.' });
      return;
    }
    setDeletingUserConfirm(u);
  };

  const handleConfirmDeleteUser = () => {
    if (!deletingUserConfirm) return;
    const targetName = deletingUserConfirm.name;
    const res = deleteUser(deletingUserConfirm.id);
    setDeletingUserConfirm(null);

    if (res.success) {
      setStatusMessage({ type: 'success', text: `Сотрудник ${targetName} успешно удален из системы.` });
    } else {
      setStatusMessage({ type: 'error', text: res.message || 'Ошибка удаления сотрудника' });
    }
  };

  if (currentUser?.role === 'SELLER') {
    return (
      <div className="p-8 text-center text-slate-500 font-mono text-xs">
        <p className="font-bold text-slate-400">ДОСТУП ОГРАНИЧЕН</p>
        <p className="mt-1">Раздел управления персоналом доступен только Администратору</p>
      </div>
    );
  }

  const handleOpenAdd = () => {
    setEditingUser(null);
    setName('');
    setLogin('');
    setPassword('');
    setPin('');
    setRole('SELLER');
    setStoreId(stores[0]?.id || 'store-1');
    setIsActive(true);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (u: User) => {
    setEditingUser(u);
    setName(u.name);
    setLogin(u.login);
    setPassword('');
    setPin(u.pin || '');
    setRole(u.role);
    setStoreId(u.storeId || stores[0]?.id || 'store-1');
    setIsActive(u.isActive);
    setIsModalOpen(true);
  };

  const togglePasswordShow = (userId: string) => {
    setShowPasswordMap(prev => ({ ...prev, [userId]: !prev[userId] }));
  };

  const handleSubmit = (e: React.FormEvent) => {
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

    if (editingUser) {
      const res = updateUser({
        ...editingUser,
        name: name.trim(),
        login: login.trim(),
        passwordHash: password.trim() ? password.trim() : editingUser.passwordHash,
        pin: pin.trim() || undefined,
        role,
        storeId: role === 'SELLER' ? storeId : undefined,
        isActive
      });

      if (res.success) {
        setIsModalOpen(false);
        setStatusMessage({ type: 'success', text: `Данные сотрудника ${name} обновлены` });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка обновления' });
      }
    } else {
      const res = createUser({
        name: name.trim(),
        login: login.trim(),
        passwordHash: password.trim(),
        pin: pin.trim() || undefined,
        role,
        storeId: role === 'SELLER' ? storeId : undefined,
        active: true
      });

      if (res.success) {
        setIsModalOpen(false);
        setStatusMessage({ type: 'success', text: `Сотрудник ${name} успешно добавлен` });
      } else {
        setStatusMessage({ type: 'error', text: res.message || 'Ошибка создания' });
      }
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden bg-[#0B0E14] text-slate-300 font-mono">
      {/* Header Bar */}
      <div className="p-3.5 border-b border-slate-800 bg-[#0F1219] flex items-center justify-between shrink-0">
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-slate-100 flex items-center space-x-2 uppercase">
            <Users className="w-4 h-4 text-emerald-400" />
            <span>Сотрудники и роли доступа</span>
          </h3>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Управление персоналом, кассирами, ПИН-кодами и привязкой к торговым точкам
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="px-3.5 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-xs font-mono font-bold text-slate-950 uppercase tracking-wider flex items-center space-x-1.5 transition-colors shadow-[0_0_12px_rgba(16,185,129,0.3)] shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden sm:inline">ДОБАВИТЬ СОТРУДНИКА</span>
        </button>
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
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 bg-[#0B0E14] grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-4 items-start">
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
                  <div className="flex items-center space-x-1.5 font-mono">
                    <strong className="text-slate-200 text-xs">
                      {showPasswordMap[u.id] ? (u.passwordHash || '••••••••') : '••••••••'}
                    </strong>
                    <button
                      type="button"
                      onClick={() => togglePasswordShow(u.id)}
                      className="text-[9px] text-emerald-400 hover:underline ml-1 font-bold"
                    >
                      {showPasswordMap[u.id] ? 'Скрыть' : 'Показать'}
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase">ПИН-КОД:</span>
                  {u.pin ? (
                    <strong className="text-emerald-400 font-mono font-bold px-1.5 py-0.2 rounded bg-emerald-500/10 border border-emerald-500/20">{u.pin}</strong>
                  ) : (
                    <span className="text-slate-600 font-mono text-[11px]">—</span>
                  )}
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-slate-500 uppercase">ТОЧКА ПРОДАЖИ:</span>
                  <span className="text-slate-300 font-mono text-[11px] truncate max-w-[140px] text-right">
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

              {/* Card Bottom Quick Action Buttons */}
              <div className="flex space-x-2">
                <button
                  onClick={() => handleOpenEdit(u)}
                  className="flex-1 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-mono text-slate-300 hover:text-white flex items-center justify-center space-x-1.5 transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>ИЗМЕНИТЬ</span>
                </button>
                {currentUser?.id !== u.id && (
                  <button
                    onClick={() => handleDeleteUserClick(u)}
                    className="py-1.5 px-3 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-xs font-mono text-rose-400 hover:text-rose-300 flex items-center justify-center space-x-1 transition-colors"
                    title="Удалить сотрудника"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
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
                <label className="block text-slate-400 text-[10px] uppercase mb-1">
                  {editingUser ? 'НОВЫЙ ПАРОЛЬ (Оставьте пустым, если не меняется)' : 'ПАРОЛЬ ДЛЯ ВХОДА *'}
                </label>
                <input
                  type="password"
                  required={!editingUser}
                  value={password ?? ''}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={editingUser ? '••••••••' : 'Пароль для входа в систему'}
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">ПИН-КОД БЫСТРОГО ДОСТУПА (4-6 ЦИФР)</label>
                <input
                  type="password"
                  maxLength={6}
                  value={pin ?? ''}
                  onChange={(e) => setPin(e.target.value)}
                  placeholder="3333"
                  className="w-full rounded-lg bg-[#0B0E14] border border-slate-800 px-3 py-2 text-slate-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-slate-400 text-[10px] uppercase mb-1">РОЛЬ ДОСТУПА</label>
                {editingUser && (editingUser.id === 'user-admin' || editingUser.name.includes('Шариф') || editingUser.name.includes('Владелец 1') || editingUser.login === 'admin') ? (
                  <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-mono font-bold flex items-center justify-between">
                    <span>АДМИНИСТРАТОР (ВЛАДЕЛЕЦ 1)</span>
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
    </div>
  );
};

