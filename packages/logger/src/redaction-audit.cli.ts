import { runRedactionAudit } from './redaction-audit.js';

/**
 * Runnable redaction audit: feeds representative sensitive payloads through the
 * logger and fails (non-zero exit) if any prohibited field leaks. Invoke with
 * `pnpm --filter @esign/logger audit:redaction`.
 */
function main(): void {
  const result = runRedactionAudit();

  if (result.leaked.length > 0) {
    process.stderr.write(
      `Redaction audit FAILED. ${result.leaked.length} prohibited value(s) leaked: ${result.leaked.join(', ')}\n`,
    );
    process.exit(1);
  }

  if (!result.correlationIdPresent) {
    process.stderr.write(
      'Redaction audit FAILED: the benign correlation id was unexpectedly removed.\n',
    );
    process.exit(1);
  }

  process.stdout.write('Redaction audit PASSED: no prohibited fields appeared in log output.\n');
}

main();
