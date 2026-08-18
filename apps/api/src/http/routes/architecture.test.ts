import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const ROUTES_ROOT = dirname(fileURLToPath(import.meta.url));

const FORBIDDEN = [
  /from\s+['"]@esign\/database['"]/,
  /from\s+['"]@prisma\/client['"]/,
  /from\s+['"]pdf-lib['"]/,
  /from\s+['"]@aws-sdk/,
  /from\s+['"]@azure\//,
];

function collectTsFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
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

describe('API route architecture', () => {
  it('keeps route handlers free of Prisma, storage SDKs, and pdf-lib', () => {
    const files = collectTsFiles(ROUTES_ROOT);
    expect(files.length).toBeGreaterThan(0);
    const violations: string[] = [];
    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      for (const pattern of FORBIDDEN) {
        if (pattern.test(source)) {
          violations.push(`${relative(ROUTES_ROOT, file)} matches ${pattern}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });
});
