import { prisma } from '../../prisma/prisma.service';
import type { TransactionClient } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { resolveActor } from '../../common/actor';
import { RealtimeSyncGateway } from '../../websocket/websocket.gateway';

const MIN_PASSWORD_LENGTH = 6;

function requireValidPassword(password: unknown): string {
  if (typeof password !== 'string' || password.trim().length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Пароль должен содержать не менее ${MIN_PASSWORD_LENGTH} символов`);
  }
  return password;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label}: укажите непустое значение`);
  return value.trim();
}

function requireRole(value: unknown): 'ADMIN' | 'PARTNER' | 'SELLER' {
  if (value !== 'ADMIN' && value !== 'PARTNER' && value !== 'SELLER') throw new Error('Некорректная роль сотрудника');
  return value;
}

function requireCompensation(value: unknown, label: string, max = Infinity): number | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${label}: укажите число от 0${Number.isFinite(max) ? ` до ${max}` : ' и выше'}`);
  }
  return value;
}

async function validateStore(tx: TransactionClient, role: string, value: unknown): Promise<string | null> {
  const storeId = value === undefined || value === null || value === '' ? null : requireText(value, 'Магазин');
  if (!storeId) {
    if (role === 'SELLER') throw new Error('Для роли Продавец обязательна привязка к магазину');
    return null;
  }
  const store = await tx.store.findUnique({ where: { id: storeId } });
  if (!store) throw new Error('Магазин не найден');
  if (role === 'SELLER' && (!store.active || store.isMainWarehouse)) {
    throw new Error('Продавца можно привязать только к активному торговому магазину');
  }
  return storeId;
}

const SAFE_SELECT = {
  id: true,
  login: true,
  name: true,
  role: true,
  active: true,
  storeId: true,
  baseSalaryTjs: true,
  salesCommissionPercent: true,
  createdAt: true,
  updatedAt: true,
} as const;

const PUBLIC_SELECT = {
  id: true,
  login: true,
  name: true,
  role: true,
  active: true,
  storeId: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class UsersService {
  public static async list(includeFinancialFields: boolean = false) {
    if (includeFinancialFields) {
      return prisma.user.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
    }
    return prisma.user.findMany({ select: PUBLIC_SELECT, orderBy: { createdAt: 'asc' } });
  }

  public static async create(input: {
    login: string;
    password: string;
    name: string;
    role: 'ADMIN' | 'PARTNER' | 'SELLER';
    storeId?: string;
    baseSalaryTjs?: number;
    salesCommissionPercent?: number;
    createdByUserId: string;
  }) {
    const login = requireText(input.login, 'Логин');
    const name = requireText(input.name, 'Имя');
    const role = requireRole(input.role);
    const password = requireValidPassword(input.password);
    const baseSalaryTjs = requireCompensation(input.baseSalaryTjs, 'Оклад');
    const salesCommissionPercent = requireCompensation(input.salesCommissionPercent, 'Комиссия', 100);
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const existing = await tx.user.findUnique({ where: { login } });
      if (existing) throw new Error('Пользователь с таким логином уже существует');

      const storeId = await validateStore(tx, role, input.storeId);
      const hashed = await AuthService.hashPassword(password);
      const user = await tx.user.create({
        data: {
          login,
          password: hashed,
          name,
          role,
          storeId,
          baseSalaryTjs,
          salesCommissionPercent,
        },
        select: SAFE_SELECT,
      });

      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_CREATE', details: `Создан сотрудник: ${user.name} (${user.role})`, targetId: user.id },
      });
      return user;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async update(
    userId: string,
    input: {
      login?: string;
      password?: string;
      name?: string;
      role?: 'ADMIN' | 'PARTNER' | 'SELLER';
      storeId?: string | null;
      baseSalaryTjs?: number;
      salesCommissionPercent?: number;
    },
    updatedByUserId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, updatedByUserId);
      const targetUser = await tx.user.findUnique({ where: { id: userId } });
      if (!targetUser) throw new Error('Пользователь не найден');

      const data: any = {};
      if (input.login !== undefined) {
        const newLogin = requireText(input.login, 'Логин');
        const existing = await tx.user.findUnique({ where: { login: newLogin } });
        if (existing && existing.id !== userId) {
          throw new Error('Пользователь с таким логином уже существует');
        }
        data.login = newLogin;
      }
      if (input.name !== undefined) data.name = requireText(input.name, 'Имя');
      if (input.role !== undefined) data.role = requireRole(input.role);
      if (input.baseSalaryTjs !== undefined) data.baseSalaryTjs = requireCompensation(input.baseSalaryTjs, 'Оклад');
      if (input.salesCommissionPercent !== undefined) data.salesCommissionPercent = requireCompensation(input.salesCommissionPercent, 'Комиссия', 100);

      const effectiveRole = data.role || targetUser.role;
      const effectiveStoreId = input.storeId !== undefined ? input.storeId : targetUser.storeId;
      data.storeId = await validateStore(tx, effectiveRole, effectiveStoreId);

      if (input.password !== undefined && input.password !== '') {
        data.password = await AuthService.hashPassword(requireValidPassword(input.password));
      }

      const user = await tx.user.update({ where: { id: userId }, data, select: SAFE_SELECT });

      // Keep a linked Owner's display name in sync — it must never drift from the
      // actual account it represents (a partner is a real person, not a free-text label).
      if (data.name) {
        await tx.owner.updateMany({ where: { userId }, data: { name: data.name } });
      }

      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_UPDATE', details: `Обновлены данные сотрудника: ${user.name} (${user.role})${input.password ? ' (пароль изменен)' : ''}`, targetId: user.id },
      });
      return user;
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async resetPassword(userId: string, newPassword: string, actingUserId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new Error('Сотрудник не найден');
      const hashed = await AuthService.hashPassword(requireValidPassword(newPassword));
      await tx.user.update({ where: { id: userId }, data: { password: hashed } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'PASSWORD_RESET', details: `Сброшен пароль сотрудника: ${target.name}`, targetId: userId },
      });
    }, { maxWait: 10000, timeout: 25000 });
  }

  public static async setActive(userId: string, active: boolean, actingUserId: string) {
    const user = await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const user = await tx.user.update({ where: { id: userId }, data: { active }, select: SAFE_SELECT });
      await tx.auditLog.create({
        data: {
          userId: actor.id,
          userName: actor.name,
          userRole: actor.role,
          action: 'USER_STATUS_CHANGE',
          details: `Сотрудник ${user.name} ${active ? 'активирован' : 'деактивирован'}`,
          targetId: userId,
        },
      });
      return user;
    }, { maxWait: 10000, timeout: 25000 });
    if (!active) RealtimeSyncGateway.disconnectUser(userId);
    return user;
  }

  public static async remove(userId: string, actingUserId: string) {
    if (userId === actingUserId) {
      throw new Error('Нельзя удалить собственный профиль во время активной сессии');
    }
    await prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new Error('Сотрудник не найден');
      await tx.user.delete({ where: { id: userId } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_DELETE', details: `Удален сотрудник: ${target.name} (${target.role})` },
      });
    }, { maxWait: 10000, timeout: 25000 });
    RealtimeSyncGateway.disconnectUser(userId);
  }
}
