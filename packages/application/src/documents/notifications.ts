import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { ExternalServiceError, type Notifier, type SigningInvitation } from '@esign/domain';

export type MemoryNotifier = Notifier & { sent: SigningInvitation[] };

export function createMemoryNotifier(): MemoryNotifier {
  const sent: SigningInvitation[] = [];
  return {
    sent,
    async sendSigningInvitation(message) {
      sent.push(message);
    },
  };
}

export function createFailClosedNotifier(): Notifier {
  return {
    async sendSigningInvitation() {
      throw new ExternalServiceError({
        service: 'notification',
        reason: 'notifier_unconfigured',
      });
    },
  };
}

/**
 * NON-PRODUCTION preview writer. In production mode the raw token is never written.
 */
export function createLocalDevelopmentNotifier(input: {
  directory: string;
  nodeEnv: string;
}): Notifier {
  return {
    async sendSigningInvitation(message) {
      await mkdir(input.directory, { recursive: true });
      const includeToken = input.nodeEnv !== 'production' && message.rawToken !== undefined;
      const preview = {
        organizationId: message.organizationId,
        documentId: message.documentId,
        signerId: message.signerId,
        sessionId: message.sessionId,
        to: message.to,
        expiresAt: message.expiresAt.toISOString(),
        tokenHeader: 'authorization',
        token: includeToken ? message.rawToken : null,
        note:
          input.nodeEnv === 'production'
            ? 'Raw signing tokens are omitted in production mode.'
            : 'Local-development preview only. Not a production mailer.',
      };
      const fileName = `${message.sessionId}.json`;
      await writeFile(join(input.directory, fileName), `${JSON.stringify(preview, null, 2)}\n`);
    },
  };
}

export function createNotifier(input: {
  name: 'local' | 'fail_closed' | 'memory';
  nodeEnv: string;
  directory: string;
}): Notifier {
  if (input.name === 'fail_closed') {
    return createFailClosedNotifier();
  }
  if (input.name === 'memory') {
    return createMemoryNotifier();
  }
  return createLocalDevelopmentNotifier({
    directory: input.directory,
    nodeEnv: input.nodeEnv,
  });
}
