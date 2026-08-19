export function parseVerifyAuditArgs(argv: readonly string[]): {
  organizationId: string;
  documentId?: string;
} {
  const organizationId = readArg('organization-id', argv);
  const documentId = readArg('document-id', argv);
  if (organizationId === undefined || organizationId.length === 0) {
    throw new Error('Missing --organization-id <uuid>');
  }
  return documentId === undefined || documentId.length === 0
    ? { organizationId }
    : { organizationId, documentId };
}

function readArg(name: string, argv: readonly string[]): string | undefined {
  const prefix = `--${name}=`;
  const inline = argv.find((value) => value.startsWith(prefix));
  if (inline) {
    return inline.slice(prefix.length);
  }
  const index = argv.indexOf(`--${name}`);
  if (index >= 0) {
    return argv[index + 1];
  }
  return undefined;
}
