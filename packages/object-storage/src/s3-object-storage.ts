import { createHash } from 'node:crypto';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  type S3ClientConfig,
} from '@aws-sdk/client-s3';
import {
  ExternalServiceError,
  IntegrityError,
  ValidationError,
  assertTenantObjectKey,
  tenantObjectKey,
  type ObjectStorage,
  type StoredObjectMetadata,
} from '@esign/domain';

const META_DIGEST = 'sha256-digest';

export type S3ObjectStorageOptions = {
  readonly endpoint: string;
  readonly region: string;
  readonly bucket: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly forcePathStyle: boolean;
  /** Optional injection for unit tests. */
  readonly client?: S3Client;
};

/**
 * S3-compatible object storage (AWS S3, MinIO, and other S3 API providers).
 * Lives outside `@esign/application` so the AWS SDK never enters domain/application.
 */
export function createS3ObjectStorage(options: S3ObjectStorageOptions): ObjectStorage {
  const client =
    options.client ??
    new S3Client({
      endpoint: options.endpoint,
      region: options.region,
      forcePathStyle: options.forcePathStyle,
      credentials: {
        accessKeyId: options.accessKeyId,
        secretAccessKey: options.secretAccessKey,
      },
    } satisfies S3ClientConfig);
  const bucket = options.bucket;

  return {
    async putObject(input) {
      if (input.maxBytes !== undefined && input.body.byteLength > input.maxBytes) {
        throw new ValidationError({ reason: 'payload_too_large' });
      }
      const key = tenantObjectKey(input.organizationId, input.key);
      const sha256Digest = sha256Hex(input.body);
      if (input.expectedSha256Digest !== undefined && input.expectedSha256Digest !== sha256Digest) {
        throw new IntegrityError({
          reason: 'object_digest_mismatch',
          code: 'FINAL_OBJECT_INTEGRITY_FAILURE',
        });
      }

      const existingDigest = await headDigest(client, bucket, key);
      if (existingDigest !== null && existingDigest !== sha256Digest) {
        throw new IntegrityError({ reason: 'immutable_key_conflict' });
      }

      if (existingDigest === null) {
        try {
          await client.send(
            new PutObjectCommand({
              Bucket: bucket,
              Key: key,
              Body: Buffer.from(input.body),
              ContentType: input.contentType,
              Metadata: { [META_DIGEST]: sha256Digest },
            }),
          );
        } catch (error: unknown) {
          throw mapS3Error(error, 'putObject');
        }
      }

      return {
        key,
        contentType: input.contentType,
        sizeBytes: input.body.byteLength,
        sha256Digest,
      } satisfies StoredObjectMetadata;
    },

    async getObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      try {
        const response = await client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
        if (response.Body === undefined) {
          return null;
        }
        const body = await streamToUint8Array(response.Body);
        const metaDigest = response.Metadata?.[META_DIGEST];
        const digest = sha256Hex(body);
        if (metaDigest !== undefined && metaDigest !== digest) {
          throw new IntegrityError({
            reason: 'object_digest_mismatch',
            code: 'FINAL_OBJECT_INTEGRITY_FAILURE',
          });
        }
        return {
          body,
          contentType: response.ContentType ?? 'application/octet-stream',
          sha256Digest: metaDigest ?? digest,
          sizeBytes: body.byteLength,
        };
      } catch (error: unknown) {
        if (isNotFound(error)) {
          return null;
        }
        throw mapS3Error(error, 'getObject');
      }
    },

    async deleteObject(input) {
      const key = assertTenantObjectKey(input.organizationId, input.key);
      if (!key.startsWith(`org/${input.organizationId}/`)) {
        throw new IntegrityError({ reason: 'object_key_tenant_mismatch' });
      }
      try {
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );
      } catch (error: unknown) {
        throw mapS3Error(error, 'deleteObject');
      }
    },

    async listKeys(input) {
      const prefix = tenantObjectKey(input.organizationId, input.prefix);
      const keys: string[] = [];
      let continuationToken: string | undefined;
      do {
        let response;
        try {
          response = await client.send(
            new ListObjectsV2Command({
              Bucket: bucket,
              Prefix: prefix,
              ContinuationToken: continuationToken,
            }),
          );
        } catch (error: unknown) {
          throw mapS3Error(error, 'listKeys');
        }
        for (const item of response.Contents ?? []) {
          if (item.Key === undefined || item.LastModified === undefined) {
            continue;
          }
          if (item.LastModified.getTime() <= input.olderThan.getTime()) {
            keys.push(item.Key);
          }
        }
        continuationToken =
          response.IsTruncated === true ? response.NextContinuationToken : undefined;
      } while (continuationToken !== undefined);
      return keys;
    },
  };
}

async function headDigest(client: S3Client, bucket: string, key: string): Promise<string | null> {
  try {
    const head = await client.send(
      new HeadObjectCommand({
        Bucket: bucket,
        Key: key,
      }),
    );
    return head.Metadata?.[META_DIGEST] ?? null;
  } catch (error: unknown) {
    if (isNotFound(error)) {
      return null;
    }
    throw mapS3Error(error, 'headObject');
  }
}

function sha256Hex(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

function isNotFound(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }
  const name = 'name' in error ? String(error.name) : '';
  const status =
    '$metadata' in error &&
    typeof error.$metadata === 'object' &&
    error.$metadata !== null &&
    'httpStatusCode' in error.$metadata
      ? Number(error.$metadata.httpStatusCode)
      : undefined;
  return name === 'NotFound' || name === 'NoSuchKey' || status === 404;
}

function mapS3Error(error: unknown, operation: string): never {
  if (error instanceof IntegrityError || error instanceof ValidationError) {
    throw error;
  }
  throw new ExternalServiceError({
    service: 'object-storage',
    reason: 's3_operation_failed',
    operation,
    cause: error instanceof Error ? error.name : 'unknown',
  });
}

async function streamToUint8Array(body: unknown): Promise<Uint8Array> {
  if (
    typeof body === 'object' &&
    body !== null &&
    'transformToByteArray' in body &&
    typeof (body as { transformToByteArray: unknown }).transformToByteArray === 'function'
  ) {
    return (body as { transformToByteArray: () => Promise<Uint8Array> }).transformToByteArray();
  }
  if (body instanceof Uint8Array) {
    return body;
  }
  if (typeof body === 'object' && body !== null && Symbol.asyncIterator in body) {
    const chunks: Uint8Array[] = [];
    let total = 0;
    for await (const chunk of body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
      total += chunk.byteLength;
    }
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  }
  throw new ExternalServiceError({
    service: 'object-storage',
    reason: 's3_unexpected_body',
  });
}
