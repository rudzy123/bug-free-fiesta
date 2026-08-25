import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { e2eApiEnv, mergeProcessEnv, objectStorageRoot, repoRoot } from './env';

function run(command: string, args: readonly string[], env: Record<string, string>): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: repoRoot,
      stdio: 'inherit',
      env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited ${code ?? 'null'} (cwd=${repoRoot})`));
    });
  });
}

export default async function globalSetup(): Promise<void> {
  const apiEnv = e2eApiEnv();
  const env = mergeProcessEnv(apiEnv);
  const databaseUrl = apiEnv['DATABASE_URL'];
  const storageRoot = apiEnv['OBJECT_STORAGE_FS_ROOT'];
  const notificationDir = apiEnv['NOTIFICATION_PREVIEW_DIR'];
  if (databaseUrl === undefined || storageRoot === undefined || notificationDir === undefined) {
    throw new Error('e2eApiEnv is missing required storage or database keys');
  }

  process.env['DATABASE_URL'] = databaseUrl;
  process.env['LOG_LEVEL'] = apiEnv['LOG_LEVEL'] ?? 'silent';
  process.env['OBJECT_STORAGE_DRIVER'] = 'filesystem';
  process.env['OBJECT_STORAGE_FS_ROOT'] = storageRoot;

  await mkdir(objectStorageRoot, { recursive: true });
  await mkdir(notificationDir, { recursive: true });

  // Idempotent when CI already started Compose in a prior step.
  await run('pnpm', ['infrastructure:up'], env);
  await run('pnpm', ['db:migrate:deploy'], env);
  await run('pnpm', ['db:seed'], env);
}
