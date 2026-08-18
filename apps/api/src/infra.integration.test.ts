import { describe, expect, it } from 'vitest';
import { loadApiConfig } from '@esign/config';
import { createPrismaClient, createPrismaPinger } from '@esign/database';
import { apiEnv } from '@esign/test-utils';

const runInfraTests = process.env.RUN_INFRA_TESTS === 'true';

describe.skipIf(!runInfraTests)('postgres infrastructure', () => {
  it('pings the configured database', async () => {
    const config = loadApiConfig(apiEnv());
    const client = createPrismaClient(config.DATABASE_URL);
    try {
      await expect(createPrismaPinger(client).ping()).resolves.toBeUndefined();
    } finally {
      await client.$disconnect();
    }
  });
});
