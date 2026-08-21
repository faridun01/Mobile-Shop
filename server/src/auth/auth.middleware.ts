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
export function requireRoles(...allowedRoles: Array<'ADMIN' | 'MANAGER' | 'SELLER'>) {
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

// Store Scope Injector: Ensures non-Admins can only access their assigned store_id
export function enforceStoreScope(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Admin can query any store or specify storeId query param
  if (req.user.role === 'ADMIN') {
    return next();
  }

  // Non-Admins are strictly forced to their assigned storeId
  if (!req.user.storeId) {
    return res.status(403).json({ error: 'Forbidden: User is not assigned to any store' });
  }

  req.query.storeId = req.user.storeId;
  next();
}
