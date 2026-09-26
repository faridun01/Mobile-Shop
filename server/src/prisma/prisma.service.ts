import { PrismaClient, Prisma } from '@prisma/client';
import { executeOperation } from '../common/request-operation';

function createClient() {
  const client = new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'info', 'warn', 'error'] : ['error'],
  });
  const transaction = client.$transaction.bind(client);
  client.$transaction = ((action: any, options?: any) => typeof action === 'function'
    ? transaction((tx) => executeOperation(tx, action), options)
    : transaction(action, options)) as typeof client.$transaction;
  return client;
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

// Money stays Decimal throughout database reads and transactions.
export type TransactionClient = Prisma.TransactionClient;
