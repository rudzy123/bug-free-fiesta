import { mkdir } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { e2eApiEnv, objectStorageRoot, repoRoot } from './env';

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: repoRoot,
      stdio: 'inherit',
      env: process.env,
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} exited ${code ?? 'null'}`));
    });
  });
}

export default async function globalSetup(): Promise<void> {
  const apiEnv = e2eApiEnv();
  process.env['DATABASE_URL'] = apiEnv.DATABASE_URL;
  process.env['LOG_LEVEL'] = apiEnv.LOG_LEVEL;
  await mkdir(objectStorageRoot, { recursive: true });
  await run('pnpm', ['infrastructure:up']);
  await run('pnpm', ['db:migrate:deploy']);
  await run('pnpm', ['db:seed']);
}
