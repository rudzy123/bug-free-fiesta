#!/usr/bin/env node
/**
 * Dry-run Conventional Changelog since the previous tag (or RELEASE_CHANGELOG_FROM).
 * Writes CHANGELOG.dry-run.md and prints to stdout. Does not tag or publish.
 * Zero external deps — parses Conventional Commits from git log.
 */
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

const HEADER = /^(?<type>[a-z]+)(?:\((?<scope>[a-z0-9/-]+)\))?(?<breaking>!)?: (?<subject>.+)$/;

function git(args) {
  const result = spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });
  if (result.status !== 0) {
    return { ok: false, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
  }
  return { ok: true, stdout: result.stdout.trim(), stderr: result.stderr.trim() };
}

function resolveFrom() {
  if (process.env.RELEASE_CHANGELOG_FROM) {
    return process.env.RELEASE_CHANGELOG_FROM;
  }
  const tags = git(['describe', '--tags', '--abbrev=0']);
  if (tags.ok) {
    return tags.stdout;
  }
  return null;
}

function classify(message) {
  const header = message.split('\n')[0] ?? '';
  if (header.startsWith('Merge ')) {
    return null;
  }
  const match = HEADER.exec(header);
  if (!match?.groups) {
    return { section: 'Other', line: `* ${header}` };
  }
  const { type, scope, breaking, subject } = match.groups;
  const scoped = scope ? `**${scope}:** ${subject}` : subject;
  const isBreaking =
    Boolean(breaking) || /^BREAKING CHANGE:/m.test(message) || /^BREAKING-CHANGE:/m.test(message);
  if (isBreaking) {
    return { section: 'Breaking Changes', line: `* ${scoped}` };
  }
  if (type === 'feat') {
    return { section: 'Features', line: `* ${scoped}` };
  }
  if (type === 'fix') {
    return { section: 'Bug Fixes', line: `* ${scoped}` };
  }
  if (type === 'perf') {
    return { section: 'Performance', line: `* ${scoped}` };
  }
  return { section: 'Other', line: `* ${type}: ${scoped}` };
}

const from = resolveFrom();
const range = from ? `${from}..HEAD` : 'HEAD';
console.error(`changelog:dry-run range ${range}${from ? '' : ' (no previous tag)'}`);

const log = git(['log', '--format=%B%x1e', range]);
if (!log.ok) {
  console.error(log.stderr || log.stdout || 'git log failed');
  process.exit(1);
}

const sections = new Map([
  ['Breaking Changes', []],
  ['Features', []],
  ['Bug Fixes', []],
  ['Performance', []],
  ['Other', []],
]);

for (const message of log.stdout
  .split('\x1e')
  .map((m) => m.trim())
  .filter(Boolean)) {
  const entry = classify(message);
  if (!entry) continue;
  sections.get(entry.section)?.push(entry.line);
}

const parts = [`## Unreleased`];
for (const [title, lines] of sections) {
  if (lines.length === 0) continue;
  parts.push('', `### ${title}`, '', ...lines);
}

if (parts.length === 1) {
  parts.push('', '_No conventional commits found for this range._');
}

const header = `# Changelog (dry-run)\n\nGenerated at ${new Date().toISOString()}. **Not published.**\n\n`;
const body = `${parts.join('\n')}\n`;
const out = `${header}${body}`;
const outPath = resolve(ROOT, 'CHANGELOG.dry-run.md');
writeFileSync(outPath, out, 'utf8');
process.stdout.write(out);
console.error(`Wrote ${outPath}`);
