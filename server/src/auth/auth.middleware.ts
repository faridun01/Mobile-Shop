import { Request, Response, NextFunction } from 'express';
import { AuthService, JwtPayload } from './auth.service';

export interface AuthenticatedRequest extends Request {
  user?: JwtPayload;
}

// Middleware to verify JWT token from Authorization header or cookie
export function authenticateJwt(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.substring(7) : req.cookies?.access_token;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Access token missing' });
  }

  const payload = AuthService.verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
  }

  req.user = payload;
  next();
}

// Middleware for Role-Based Access Control (RBAC)
export function requireRoles(...allowedRoles: Array<'ADMIN' | 'PARTNER' | 'SELLER'>) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden: Insufficient privileges for this role' });
    }

    next();
  };
}

// Store Scope Injector: Ensures SELLERs can only access their assigned store_id.
// ADMIN and PARTNER oversee every store (owners/managers, not tied to one location).
export function enforceStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== 'SELLER') {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ error: 'Forbidden: User is not assigned to any store' });
  }

  req.query.storeId = req.user.storeId;
  next();
}

// Store Scope Injector for write bodies: Ensures SELLERs can only create records
// for their own assigned store, regardless of what storeId the client sent in the body.
// ADMIN and PARTNER may write to any store.
export function enforceBodyStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.user.role !== 'SELLER') {
    return next();
  }

  if (!req.user.storeId) {
    return res.status(403).json({ error: 'Forbidden: User is not assigned to any store' });
  }

  req.body = { ...req.body, storeId: req.user.storeId };
  next();
}
