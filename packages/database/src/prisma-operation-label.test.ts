import { describe, expect, it } from 'vitest';
import { prismaOperationLabel } from './index.js';

describe('prismaOperationLabel', () => {
  it('bounds model.operation labels for metrics cardinality', () => {
    expect(prismaOperationLabel('Document', 'findMany')).toBe('Document.findMany');
    expect(prismaOperationLabel(undefined, '$queryRaw')).toBe('queryRaw');
    expect(prismaOperationLabel('Doc<script>', 'find-many!')).toBe('Docscript.findmany');
  });
});
