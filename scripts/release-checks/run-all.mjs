#!/usr/bin/env node
/**
 * Release engineering checks. Run from repo root: node scripts/release-checks/run-all.mjs
 * Env:
 *   RELEASE_CHECK_BASE — git ref to compare against (default: origin/main or merge-base)
 *   GITHUB_BASE_REF / GITHUB_EVENT_PATH — used in Actions when present
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../..');

function fail(message) {
  console.error(`release-check: ${message}`);
  process.exitCode = 1;
}

function info(message) {
  console.log(`release-check: ${message}`);
}

function git(args, options = {}) {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    ...options,
  });
  if (result.status !== 0 && !options.allowFail) {
    fail(`git ${args.join(' ')} failed: ${result.stderr || result.stdout}`);
  }
  return result;
}

function resolveBaseRef() {
  if (process.env.RELEASE_CHECK_BASE) {
    return process.env.RELEASE_CHECK_BASE;
  }
  if (process.env.GITHUB_BASE_REF) {
    return `origin/${process.env.GITHUB_BASE_REF}`;
  }
  const mergeBase = git(['merge-base', 'HEAD', 'origin/main'], { allowFail: true });
  if (mergeBase.status === 0 && mergeBase.stdout.trim()) {
    return mergeBase.stdout.trim();
  }
  const rev = git(['rev-parse', 'HEAD~1'], { allowFail: true });
  if (rev.status === 0) {
    return rev.stdout.trim();
  }
  return null;
}

function changedFiles(base) {
  if (!base) {
    return new Set();
  }
  const result = git(['diff', '--name-only', `${base}...HEAD`], { allowFail: true });
  if (result.status !== 0) {
    return new Set();
  }
  return new Set(
    result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean),
  );
}

function checkMigrationImmutability(base) {
  info('checking migration immutability');
  if (!base) {
    info('skip migration immutability (no base ref)');
    return;
  }
  const diff = git(
    ['diff', '--name-status', `${base}...HEAD`, '--', 'packages/database/prisma/migrations'],
    {
      allowFail: true,
    },
  );
  if (diff.status !== 0) {
    fail('could not diff migrations');
    return;
  }
  for (const line of diff.stdout.split('\n')) {
    if (!line.trim()) continue;
    const [status, ...pathParts] = line.split(/\s+/);
    const path = pathParts.join(' ');
    if (!path.endsWith('migration.sql') && !path.endsWith('migration_lock.toml')) {
      continue;
    }
    if (
      status.startsWith('M') ||
      status.startsWith('D') ||
      status.startsWith('R') ||
      status.startsWith('T')
    ) {
      if (path.endsWith('migration_lock.toml') && status.startsWith('M')) {
        // lock provider change is rare but allowed only with intentional review — still flag
        fail(`migration_lock.toml was modified (${status} ${path}); confirm intentional`);
        continue;
      }
      if (path.endsWith('migration.sql')) {
        fail(
          `existing migration must not be edited or deleted (${status} ${path}). Add a new migration instead.`,
        );
      }
    }
  }
}

function checkSchemaMigrationPairing(files) {
  info('checking schema/migration pairing');
  const schemaChanged = [...files].some((f) => f === 'packages/database/prisma/schema.prisma');
  const migrationChanged = [...files].some(
    (f) => f.startsWith('packages/database/prisma/migrations/') && f.endsWith('migration.sql'),
  );
  if (schemaChanged && !migrationChanged) {
    fail('packages/database/prisma/schema.prisma changed without a new migration.sql');
  }
}

function checkPrismaGenerate() {
  info('running prisma generate + database typecheck');
  const gen = spawnSync('pnpm', ['db:generate'], { cwd: ROOT, encoding: 'utf8', shell: true });
  if (gen.status !== 0) {
    fail(`db:generate failed:\n${gen.stderr || gen.stdout}`);
    return;
  }
  const tc = spawnSync('pnpm', ['--filter', '@esign/database', 'typecheck'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if (tc.status !== 0) {
    fail(`@esign/database typecheck failed:\n${tc.stderr || tc.stdout}`);
  }
}

function checkContractsBuild() {
  info('building @esign/contracts');
  const build = spawnSync('pnpm', ['--filter', '@esign/contracts', 'build'], {
    cwd: ROOT,
    encoding: 'utf8',
    shell: true,
  });
  if (build.status !== 0) {
    fail(`@esign/contracts build failed:\n${build.stderr || build.stdout}`);
  }
}

function listOpenApiOperations(yamlText) {
  const ops = new Set();
  let inPaths = false;
  let currentPath = null;
  for (const line of yamlText.split('\n')) {
    if (/^paths:\s*$/.test(line)) {
      inPaths = true;
      currentPath = null;
      continue;
    }
    if (inPaths && /^[a-zA-Z]/.test(line)) {
      inPaths = false;
      currentPath = null;
      continue;
    }
    if (!inPaths) {
      continue;
    }
    const pathMatch = /^ {2}(\/[^:]+):\s*$/.exec(line);
    if (pathMatch) {
      currentPath = pathMatch[1];
      continue;
    }
    if (currentPath) {
      const methodMatch = /^ {4}(get|post|put|patch|delete|options|head):\s*$/i.exec(line);
      if (methodMatch) {
        ops.add(`${methodMatch[1].toUpperCase()} ${currentPath}`);
      }
    }
  }
  return ops;
}

function checkOpenApi(base, files) {
  info('checking OpenAPI drift / breaking heuristics');
  const openApiPath = 'docs/api/openapi.yaml';
  const contractsChanged = [...files].some((f) => f.startsWith('packages/contracts/'));
  const openApiChanged = files.has(openApiPath);
  if (contractsChanged && !openApiChanged) {
    fail('packages/contracts changed without updating docs/api/openapi.yaml');
  }

  if (!base || !existsSync(join(ROOT, openApiPath))) {
    return;
  }

  const headYaml = readFileSync(join(ROOT, openApiPath), 'utf8');
  const baseShow = git(['show', `${base}:${openApiPath}`], { allowFail: true });
  if (baseShow.status !== 0) {
    info('base OpenAPI missing; skip breaking comparison');
    return;
  }
  const baseOps = listOpenApiOperations(baseShow.stdout);
  const headOps = listOpenApiOperations(headYaml);
  const removed = [...baseOps].filter((op) => !headOps.has(op));
  if (removed.length > 0) {
    fail(
      `likely breaking OpenAPI change — removed operation(s):\n  - ${removed.join('\n  - ')}\nDocument a major/deprecation plan or restore the operation.`,
    );
  } else if (openApiChanged) {
    info('OpenAPI changed; no removed path/method operations detected');
  }
}

function fingerprintCanonical(source) {
  return createHash('sha256')
    .update(
      source.replace(
        /export const AUDIT_CHAIN_SCHEMA_VERSION = \d+;/,
        'export const AUDIT_CHAIN_SCHEMA_VERSION = __VERSION__;',
      ),
    )
    .digest('hex');
}

function checkAuditSchemaLock() {
  info('checking audit schema version lock');
  const sourcePath = join(ROOT, 'packages/domain/src/audit/canonical.ts');
  const lockPath = join(ROOT, 'packages/domain/src/audit/schema-version.lock.json');
  if (!existsSync(sourcePath) || !existsSync(lockPath)) {
    fail('audit canonical source or schema-version.lock.json missing');
    return;
  }
  const source = readFileSync(sourcePath, 'utf8');
  const lock = JSON.parse(readFileSync(lockPath, 'utf8'));
  const versionMatch = source.match(/export const AUDIT_CHAIN_SCHEMA_VERSION = (\d+);/);
  if (!versionMatch) {
    fail('AUDIT_CHAIN_SCHEMA_VERSION not found in canonical.ts');
    return;
  }
  const version = Number(versionMatch[1]);
  if (version !== lock.schemaVersion) {
    fail(
      `AUDIT_CHAIN_SCHEMA_VERSION (${version}) does not match lock schemaVersion (${lock.schemaVersion}). Update the lock in the same change when bumping.`,
    );
  }
  const fingerprint = fingerprintCanonical(source);
  if (fingerprint !== lock.fingerprint) {
    fail(
      `audit canonical fingerprint changed for schemaVersion ${version} without a version bump. Bump AUDIT_CHAIN_SCHEMA_VERSION and update schema-version.lock.json together.`,
    );
  }
}

function main() {
  const base = resolveBaseRef();
  info(`base ref: ${base ?? '(none)'}`);
  const files = changedFiles(base);
  checkMigrationImmutability(base);
  checkSchemaMigrationPairing(files);
  checkAuditSchemaLock();
  checkOpenApi(base, files);
  checkPrismaGenerate();
  checkContractsBuild();
  if (process.exitCode) {
    fail('one or more checks failed');
    process.exit(process.exitCode);
  }
  info('all release checks passed');
}

main();
