import type { SigningTokenLookup } from '@esign/domain';
import type { PrismaClientOrTx } from './prisma-client.js';
import { toDomainSigningSession } from './prisma-mappers.js';

export function createPrismaSigningTokenLookup(prisma: PrismaClientOrTx): SigningTokenLookup {
  return {
    async findByTokenHash(tokenHash: string) {
      const row = await prisma.signingSession.findUnique({
        where: { tokenHash },
      });
      return row ? toDomainSigningSession(row) : null;
    },
  };
}
