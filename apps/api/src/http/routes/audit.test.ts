import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { loadApiConfig } from '@esign/config';
import { createLogger } from '@esign/logger';
import { apiEnv } from '@esign/test-utils';
import { AuthenticationError } from '@esign/domain';
import { createHealthService } from '../../application/health-service.js';
import { createApiApp } from '../../create-app.js';
import { createAuditVerificationRouter } from './audit.js';

describe('audit verification admin endpoint', () => {
  it('rejects unauthenticated verification', async () => {
    const config = loadApiConfig(apiEnv());
    const logger = createLogger({ name: 'api-test', level: 'silent' });
    const health = createHealthService({
      ping: async () => {
        return;
      },
    });
    const router = createAuditVerificationRouter({
      config,
      resolveSession: async () => {
        throw new AuthenticationError({ reason: 'missing_session' });
      },
      resolveActor: async () => {
        throw new AuthenticationError({ reason: 'missing_session' });
      },
      hasher: { hash: (value) => value },
      assertAction: () => {
        return;
      },
      verifyDocument: async () => {
        throw new Error('should not verify');
      },
      verifyOrganization: async () => {
        throw new Error('should not verify');
      },
    });
    const app = createApiApp({
      config,
      logger,
      health,
      extraRoutes: (expressApp) => {
        expressApp.use(router);
      },
    });
    const response = await request(app)
      .post(
        '/organizations/11111111-1111-4111-8111-111111111111/documents/44444444-4444-4444-8444-444444444444/audit/verify',
      )
      .set('Origin', 'http://localhost:3000');
    expect(response.status).toBe(401);
  });
});
