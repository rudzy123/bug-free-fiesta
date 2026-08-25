import { describe, expect, it, vi } from 'vitest';
import {
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { IntegrityError, ValidationError } from '@esign/domain';
import { createS3ObjectStorage } from './s3-object-storage.js';
import { resolveObjectStorage } from './resolve-object-storage.js';

const ORG = '11111111-1111-4111-8111-111111111111';
const KEY = `org/${ORG}/revisions/${'a'.repeat(64)}`;

describe('createS3ObjectStorage (SEC-001)', () => {
  it('puts and gets an object with digest metadata', async () => {
    const body = new TextEncoder().encode('%PDF-1.4');
    const store = new Map<string, { body: Uint8Array; contentType: string; digest: string }>();
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        const err = new Error('NotFound');
        err.name = 'NotFound';
        (err as { $metadata?: { httpStatusCode: number } }).$metadata = { httpStatusCode: 404 };
        throw err;
      }
      if (command instanceof PutObjectCommand) {
        const key = command.input.Key ?? '';
        store.set(key, {
          body: Uint8Array.from(command.input.Body as Buffer),
          contentType: command.input.ContentType ?? 'application/octet-stream',
          digest: command.input.Metadata?.['sha256-digest'] ?? '',
        });
        return {};
      }
      if (command instanceof GetObjectCommand) {
        const key = command.input.Key ?? '';
        const row = store.get(key);
        if (!row) {
          const err = new Error('NoSuchKey');
          err.name = 'NoSuchKey';
          throw err;
        }
        return {
          Body: {
            transformToByteArray: async () => row.body,
          },
          ContentType: row.contentType,
          Metadata: { 'sha256-digest': row.digest },
        };
      }
      throw new Error('unexpected command');
    });
    const client = { send } as unknown as S3Client;

    const storage = createS3ObjectStorage({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'esign-documents',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
      client,
    });

    const meta = await storage.putObject({
      organizationId: ORG,
      key: KEY,
      body,
      contentType: 'application/pdf',
    });
    const read = await storage.getObject({ organizationId: ORG, key: KEY });
    expect(read?.sha256Digest).toBe(meta.sha256Digest);
    expect(new TextDecoder().decode(read?.body)).toBe('%PDF-1.4');
  });

  it('rejects immutable key conflicts', async () => {
    const send = vi.fn(async (command: unknown) => {
      if (command instanceof HeadObjectCommand) {
        return { Metadata: { 'sha256-digest': 'b'.repeat(64) } };
      }
      throw new Error('should not put');
    });
    const storage = createS3ObjectStorage({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'esign-documents',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
      client: { send } as unknown as S3Client,
    });
    await expect(
      storage.putObject({
        organizationId: ORG,
        key: KEY,
        body: new TextEncoder().encode('other'),
        contentType: 'application/pdf',
      }),
    ).rejects.toBeInstanceOf(IntegrityError);
  });

  it('enforces maxBytes', async () => {
    const storage = createS3ObjectStorage({
      endpoint: 'http://localhost:9000',
      region: 'us-east-1',
      bucket: 'esign-documents',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      forcePathStyle: true,
      client: {
        send: async () => {
          throw new Error('unused');
        },
      } as unknown as S3Client,
    });
    await expect(
      storage.putObject({
        organizationId: ORG,
        key: KEY,
        body: new Uint8Array(10),
        contentType: 'application/pdf',
        maxBytes: 4,
      }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('resolveObjectStorage (SEC-001)', () => {
  it('selects the S3 adapter when driver is s3', () => {
    const createDevDriver = vi.fn();
    const storage = resolveObjectStorage({
      driver: 's3',
      s3: {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        bucket: 'esign-documents',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        forcePathStyle: true,
        client: {
          send: async () => ({}),
        } as unknown as S3Client,
      },
      createDevDriver,
    });
    expect(storage).toBeDefined();
    expect(createDevDriver).not.toHaveBeenCalled();
  });

  it('delegates memory/filesystem to the composition-root factory', () => {
    const fake = { name: 'dev' } as unknown as ReturnType<typeof resolveObjectStorage>;
    const createDevDriver = vi.fn(() => fake);
    const storage = resolveObjectStorage({
      driver: 'memory',
      s3: {
        endpoint: 'http://localhost:9000',
        region: 'us-east-1',
        bucket: 'esign-documents',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        forcePathStyle: true,
      },
      createDevDriver,
    });
    expect(storage).toBe(fake);
    expect(createDevDriver).toHaveBeenCalledWith({ driver: 'memory', fsRoot: undefined });
  });
});
