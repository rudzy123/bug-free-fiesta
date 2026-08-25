#!/usr/bin/env node
/**
 * Conventional Commits validation (no external commitlint package).
 * Usage:
 *   echo 'feat: foo' | node scripts/release-checks/commitlint.mjs
 *   node scripts/release-checks/commitlint.mjs --from origin/main --to HEAD
 */
import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const TYPES = new Set([
  'feat',
  'fix',
  'docs',
  'refactor',
  'test',
  'chore',
  'ci',
  'perf',
  'revert',
  'style',
  'build',
]);

/** type(scope)!: subject — scope optional; breaking ! optional */
const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9/-]+)\))?(?<breaking>!)?: (?<subject>.+)$/;

function validateMessage(message) {
  const lines = message.replace(/\r\n/g, '\n').trimEnd().split('\n');
  const header = lines[0] ?? '';
  if (!header.trim()) {
    return 'empty commit message';
  }
  if (header.startsWith('Merge ') || header.startsWith('Revert ')) {
    return null;
  }
  const match = HEADER.exec(header);
  if (!match?.groups) {
    return `header must match Conventional Commits (got: ${JSON.stringify(header)})`;
  }
  if (!TYPES.has(match.groups.type)) {
    return `unknown type "${match.groups.type}"; expected one of ${[...TYPES].join(', ')}`;
  }
  if (match.groups.subject.trim().length === 0) {
    return 'subject must not be empty';
  }
  if (header.length > 100) {
    return `header longer than 100 characters (${header.length})`;
  }
  return null;
}

function parseArgs(argv) {
  const out = { from: null, to: 'HEAD', verbose: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--from') {
      out.from = argv[++i] ?? null;
    } else if (arg === '--to') {
      out.to = argv[++i] ?? 'HEAD';
    } else if (arg === '--verbose') {
      out.verbose = true;
    } else if (arg === '--help' || arg === '-h') {
      out.help = true;
    }
  }
  return out;
}

function gitLogMessages(from, to) {
  const range = from ? `${from}..${to}` : to;
  const result = spawnSync('git', ['log', '--format=%B%x1e', range], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.stdout || 'git log failed');
  }
  return result.stdout
    .split('\x1e')
    .map((m) => m.trim())
    .filter(Boolean);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  echo 'feat: subject' | node scripts/release-checks/commitlint.mjs
  node scripts/release-checks/commitlint.mjs --from <ref> --to <ref> [--verbose]`);
    process.exit(0);
  }

  let messages;
  if (args.from) {
    messages = gitLogMessages(args.from, args.to);
    if (args.verbose) {
      console.error(`commitlint: checking ${messages.length} commit(s) ${args.from}..${args.to}`);
    }
  } else if (!process.stdin.isTTY) {
    messages = [readFileSync(0, 'utf8')];
  } else {
    console.error('commitlint: provide --from/--to or pipe a message on stdin');
    process.exit(2);
  }

  let failed = 0;
  for (const message of messages) {
    const error = validateMessage(message);
    if (error) {
      failed += 1;
      const firstLine = message.split('\n')[0];
      console.error(`✖ ${firstLine}`);
      console.error(`  ${error}`);
    } else if (args.verbose) {
      console.error(`✔ ${message.split('\n')[0]}`);
    }
  }

  if (failed > 0) {
    console.error(`commitlint: ${failed} invalid commit message(s)`);
    process.exit(1);
  }
  if (args.verbose || args.from) {
    console.error('commitlint: ok');
  }
}

main();
