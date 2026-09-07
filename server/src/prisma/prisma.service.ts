import { PrismaClient } from '@prisma/client';
import { decimalExtension } from './decimal-extension';

function createClient() {
  return new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  }).$extends(decimalExtension);
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

// The `tx` parameter inside prisma.$transaction(async (tx) => ...) carries the same
// Decimal->number result extension as `prisma` itself — but only when its type is derived
// from the EXTENDED client. The base `Prisma.TransactionClient` type from '@prisma/client'
// does not know about the extension and would type every money field as `Decimal` again,
// even though the value at runtime is a plain number. Use this type for every exported
// function that takes a transaction client, instead of `Prisma.TransactionClient`.
export type TransactionClient = Omit<typeof prisma, '$connect' | '$disconnect' | '$on' | '$transaction' | '$extends'>;
