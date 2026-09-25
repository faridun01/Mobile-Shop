import { PrismaClient, Prisma } from '@prisma/client';

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });
}

class PrismaService {
  private static instance: ReturnType<typeof createClient>;

  public static getInstance() {
    if (!PrismaService.instance) {
      PrismaService.instance = createClient();
    }
    return PrismaService.instance;
  }
}

export const prisma = PrismaService.getInstance();
export type { PrismaClient };

// Money stays Decimal throughout database reads and transactions.
export type TransactionClient = Prisma.TransactionClient;
