import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { repoRoot } from './env';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), 'redact-artifacts.py');

function run(command: string, args: readonly string[]): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], { stdio: 'inherit' });
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

export default async function globalTeardown(): Promise<void> {
  const roots = [
    join(repoRoot, 'apps/web/test-results'),
    join(repoRoot, 'apps/web/playwright-report'),
  ];
  const code = await run('python3', [scriptPath, ...roots]).catch(() => 1);
  if (code !== 0) {
    process.stderr.write('token redaction skipped (python3 unavailable or failed)\n');
  }
}
