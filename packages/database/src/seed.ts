/**
 * Scaffold seed: no tenant, document, or signer data.
 * Future seeds must use opaque ids and must not write real personal data.
 */
async function seed(): Promise<void> {
  process.stdout.write('No seed data in the scaffold. Database schema only.\n');
}

void seed();
