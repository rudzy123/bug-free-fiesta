import { describe, expect, it } from 'vitest';
import { loadWorkerConfig } from '@esign/config';
import { workerEnv } from '@esign/test-utils';

const runInfraTests = process.env.RUN_INFRA_TESTS === 'true';

describe.skipIf(!runInfraTests)('minio infrastructure', () => {
  it('responds on the liveness endpoint', async () => {
    const config = loadWorkerConfig(workerEnv());
    const response = await fetch(`${config.OBJECT_STORAGE_ENDPOINT}/minio/health/live`);
    expect(response.ok).toBe(true);
  });
});
