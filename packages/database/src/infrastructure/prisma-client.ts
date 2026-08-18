import type { Prisma, PrismaClient } from '../generated/client/index.js';

export type PrismaClientOrTx = PrismaClient | Prisma.TransactionClient;
