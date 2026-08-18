import type { AuditWriter, JobPublisher } from './services.js';
import type { TenantRepositories } from './repositories.js';

export type TransactionScope = TenantRepositories & {
  readonly audit: AuditWriter;
  readonly jobs: JobPublisher;
};

export type UnitOfWork = {
  run: <T>(work: (scope: TransactionScope) => Promise<T>) => Promise<T>;
};
