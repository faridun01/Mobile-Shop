import { prisma } from '../../prisma/prisma.service';

export interface RetentionCleanupResult {
  deletedSessions: number;
  deletedOperations: number;
}

export class RetentionService {
  /**
   * Purges old idempotency operation requests (> 3 days) and expired/revoked auth sessions (> 7 days).
   */
  public static async cleanupOldRecords(): Promise<RetentionCleanupResult> {
    try {
      const sessionCutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const operationCutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);

      const [sessionsResult, operationsResult] = await Promise.all([
        prisma.authSession.deleteMany({
          where: {
            OR: [
              { expiresAt: { lt: sessionCutoff } },
              { revokedAt: { lt: sessionCutoff } },
            ],
          },
        }),
        prisma.operationRequest.deleteMany({
          where: {
            createdAt: { lt: operationCutoff },
          },
        }),
      ]);

      const result = {
        deletedSessions: sessionsResult.count,
        deletedOperations: operationsResult.count,
      };

      if (result.deletedSessions > 0 || result.deletedOperations > 0) {
        console.log(
          `[Retention] Cleaned up ${result.deletedSessions} expired sessions and ${result.deletedOperations} old operation requests`
        );
      }

      return result;
    } catch (err: any) {
      console.warn('[Retention] cleanup error:', err?.message || err);
      return { deletedSessions: 0, deletedOperations: 0 };
    }
  }
}
