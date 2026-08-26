import { prisma } from '../../prisma/prisma.service';
import { AuthService } from '../../auth/auth.service';
import { resolveActor } from '../../common/actor';

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

export class UsersService {
  public static async list() {
    return prisma.user.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
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
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, input.createdByUserId);
      const existing = await tx.user.findUnique({ where: { login: input.login } });
      if (existing) throw new Error('Пользователь с таким логином уже существует');

      const hashed = await AuthService.hashPassword(input.password);
      const user = await tx.user.create({
        data: {
          login: input.login,
          password: hashed,
          name: input.name,
          role: input.role,
          storeId: input.storeId,
          baseSalaryTjs: input.baseSalaryTjs,
          salesCommissionPercent: input.salesCommissionPercent,
        },
        select: SAFE_SELECT,
      });

      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_CREATE', details: `Создан сотрудник: ${user.name} (${user.role})`, targetId: user.id },
      });
      return user;
    });
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
      const data: any = {};
      if (input.login && input.login.trim()) data.login = input.login.trim();
      if (input.name && input.name.trim()) data.name = input.name.trim();
      if (input.role) data.role = input.role;
      if (input.storeId !== undefined) data.storeId = input.storeId;
      if (input.baseSalaryTjs !== undefined) data.baseSalaryTjs = input.baseSalaryTjs;
      if (input.salesCommissionPercent !== undefined) data.salesCommissionPercent = input.salesCommissionPercent;

      if (input.password && input.password.trim().length > 0) {
        data.password = await AuthService.hashPassword(input.password.trim());
      }

      const user = await tx.user.update({ where: { id: userId }, data, select: SAFE_SELECT });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_UPDATE', details: `Обновлены данные сотрудника: ${user.name} (${user.role})${input.password ? ' (пароль изменен)' : ''}`, targetId: user.id },
      });
      return user;
    });
  }

  public static async resetPassword(userId: string, newPassword: string, actingUserId: string) {
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new Error('Сотрудник не найден');
      const hashed = await AuthService.hashPassword(newPassword);
      await tx.user.update({ where: { id: userId }, data: { password: hashed } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'PASSWORD_RESET', details: `Сброшен пароль сотрудника: ${target.name}`, targetId: userId },
      });
    });
  }

  public static async setActive(userId: string, active: boolean, actingUserId: string) {
    return prisma.$transaction(async (tx) => {
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
    });
  }

  public static async remove(userId: string, actingUserId: string) {
    if (userId === actingUserId) {
      throw new Error('Нельзя удалить собственный профиль во время активной сессии');
    }
    return prisma.$transaction(async (tx) => {
      const actor = await resolveActor(tx, actingUserId);
      const target = await tx.user.findUnique({ where: { id: userId } });
      if (!target) throw new Error('Сотрудник не найден');
      await tx.user.delete({ where: { id: userId } });
      await tx.auditLog.create({
        data: { userId: actor.id, userName: actor.name, userRole: actor.role, action: 'USER_DELETE', details: `Удален сотрудник: ${target.name} (${target.role})` },
      });
    });
  }
}
