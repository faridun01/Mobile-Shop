import { AsyncLocalStorage } from 'node:async_hooks';
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import type { Prisma } from '@prisma/client';
import { moneyJson } from './decimal';

const operations = new AsyncLocalStorage<{ request: Request; key: string; fingerprint: string }>();

export function operationContext(req: Request, res: Response, next: NextFunction) {
  const key = req.header('Idempotency-Key');
  if (!key || !['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method) || req.path.startsWith('/api/auth/')) return next();
  if (!/^[\w:.-]{1,128}$/.test(key)) { res.status(400).json({ message: 'Некорректный Idempotency-Key' }); return; }
  const fingerprint = createHash('sha256').update(JSON.stringify([req.method, req.originalUrl, req.body ?? null])).digest('hex');
  operations.run({ request: req, key, fingerprint }, next);
}

/** The response and the business writes commit together, including across server restarts. */
export async function executeOperation<T>(tx: Prisma.TransactionClient, action: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  const context = operations.getStore();
  const actorId = (context?.request as Request & { user?: { userId: string } } | undefined)?.user?.userId;
  if (!context || !actorId) return action(tx);
  const scopedKey = `${actorId}:${context.key}`;
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${scopedKey}, 0))::text`;
  const rows = await tx.$queryRaw<Array<{ fingerprint: string; result: T }>>`SELECT fingerprint, result FROM operation_requests WHERE key = ${scopedKey}`;
  if (rows.length) {
    if (rows[0].fingerprint !== context.fingerprint) throw Object.assign(new Error('Ключ операции уже использован с другими данными'), { statusCode: 409 });
    return rows[0].result;
  }
  const result = await action(tx);
  const encoded = JSON.stringify(moneyJson(result ?? null));
  await tx.$executeRaw`INSERT INTO operation_requests (key, fingerprint, result) VALUES (${scopedKey}, ${context.fingerprint}, ${encoded}::jsonb)`;
  return result;
}
