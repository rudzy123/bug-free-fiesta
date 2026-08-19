import type { PreviewGrantLookup, UploadSessionLookup } from '@esign/domain';
import { UploadSessionStatus } from '../generated/client/index.js';
import type { PrismaClientOrTx } from './prisma-client.js';
import { toDomainPreviewGrant, toDomainUploadSession } from './prisma-mappers.js';

export function createPrismaUploadSessionLookup(prisma: PrismaClientOrTx): UploadSessionLookup {
  return {
    async findByTokenHash(tokenHash: string) {
      const row = await prisma.uploadSession.findUnique({ where: { tokenHash } });
      return row ? toDomainUploadSession(row) : null;
    },
    async listExpiredIssued(input) {
      const rows = await prisma.uploadSession.findMany({
        where: {
          status: UploadSessionStatus.issued,
          expiresAt: { lte: input.now },
        },
        orderBy: { expiresAt: 'asc' },
        take: input.limit,
      });
      return rows.map(toDomainUploadSession);
    },
  };
}

export function createPrismaPreviewGrantLookup(prisma: PrismaClientOrTx): PreviewGrantLookup {
  return {
    async findByTokenHash(tokenHash: string) {
      const row = await prisma.previewGrant.findUnique({ where: { tokenHash } });
      return row ? toDomainPreviewGrant(row) : null;
    },
  };
}
