import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC_ROOT = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = [
  /from\s+['"]express['"]/,
  /from\s+['"]express\//,
  /from\s+['"]next['"]/,
  /from\s+['"]next\//,
  /from\s+['"]@prisma\/client['"]/,
  /from\s+['"]@prisma\//,
  /from\s+['"]@esign\/database['"]/,
  /from\s+['"]@esign\/config['"]/,
  /from\s+['"]pdf-lib['"]/,
  /from\s+['"]@aws-sdk/,
  /from\s+['"]@azure\//,
  /from\s+['"]aws-sdk['"]/,
  /process\.env/,
];

function collectTsFiles(dir: string): string[] {
  const entries = readdirSync(dir);
  const files: string[] = [];
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectTsFiles(full));
      continue;
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.test.ts')) {
      files.push(full);
    }
  }
  return files;
}

describe('domain architecture boundaries', () => {
  it('does not import frameworks, Prisma, cloud SDKs, or process.env', () => {
    const files = collectTsFiles(SRC_ROOT);
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${relative(SRC_ROOT, file)} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
