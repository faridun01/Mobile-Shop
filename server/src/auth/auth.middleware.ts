import { Request, Response, NextFunction } from 'express';
import { AuthService, JwtPayload } from './auth.service';
import { prisma } from '../prisma/prisma.service';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Middleware to verify JWT token from Authorization header or cookie
export async function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ message: 'Требуется авторизация: токен доступа отсутствует' });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: 'Сессия недействительна или истекла, войдите снова' });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { login: true, role: true, storeId: true, active: true },
    });
    if (!user || !user.active) {
      return res.status(401).json({ message: 'Учётная запись деактивирована, обратитесь к администратору' });
    }
    req.user = { userId: payload.userId, login: user.login, role: user.role, storeId: user.storeId };
    next();
  } catch (error) {
    next(error);
  }
}

// Middleware for Role-Based Access Control (RBAC)
export function requireRoles(...allowedRoles: Array<'ADMIN' | 'PARTNER' | 'SELLER'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ message: 'Требуется авторизация' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ message: 'Недостаточно прав для этого действия' });
    }

    next();
  };
}

// Store Scope Injector: Ensures SELLERs can only access their assigned store_id.
// ADMIN and PARTNER oversee every store (owners/managers, not tied to one location).
export function enforceStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  if (req.user.role !== 'SELLER') {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
  }

  req.query.storeId = req.user.storeId;
  next();
}

// Store Scope Injector for write bodies: Ensures SELLERs can only create records
// for their own assigned store, regardless of what storeId the client sent in the body.
// ADMIN and PARTNER may write to any store.
export function enforceBodyStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ message: 'Требуется авторизация' });
  }

  if (req.user.role !== 'SELLER') {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ message: 'Пользователь не привязан ни к одному магазину' });
  }

  req.body = { ...req.body, storeId: req.user.storeId };
  next();
}
