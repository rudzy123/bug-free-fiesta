import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';

export type Clock = {
  nowUtc: () => Date;
};

export function frozenClock(isoUtc: string): Clock {
  const instant = new Date(isoUtc);
  if (Number.isNaN(instant.getTime())) {
    throw new Error(`frozenClock requires a valid UTC instant, received: ${isoUtc}`);
  }
  return {
    nowUtc: () => new Date(instant.getTime()),
  };
}

export function systemClock(): Clock {
  return {
    nowUtc: () => new Date(),
  };
}

export function newOpaqueId(): string {
  return crypto.randomUUID();
}

/** SHA-256 hex of a synthetic label. Never a digest of a customer PDF. */
export function syntheticSha256(label: string): string {
  return createHash('sha256').update(`esign-synthetic:${label}`).digest('hex');
}

export function organizationAttrs(overrides: { id?: string; name?: string } = {}): {
  id: string;
  name: string;
} {
  return {
    id: overrides.id ?? newOpaqueId(),
    name: overrides.name ?? 'Example Organization',
  };
}

export function apiEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    API_HOST: '127.0.0.1',
    API_PORT: '4000',
    CORS_ORIGINS: 'http://localhost:3000',
    JSON_BODY_LIMIT: '1mb',
    CORRELATION_ID_HEADER: 'x-correlation-id',
    SHUTDOWN_TIMEOUT_MS: '1000',
    DATABASE_URL: 'postgresql://esign:esign_dev_password@localhost:5432/esign',
    AUTH_PROVIDER: 'local',
    AUTH_LOCAL_SHARED_SECRET: 'local-dev-only-shared-secret',
    AUTH_COOKIE_SECURE: 'false',
    ...overrides,
  };
}

export function workerEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: 'postgresql://esign:esign_dev_password@localhost:5432/esign',
    WORKER_HEALTH_HOST: '127.0.0.1',
    WORKER_HEALTH_PORT: '4100',
    WORKER_POLL_INTERVAL_MS: '250',
    SHUTDOWN_TIMEOUT_MS: '1000',
    OBJECT_STORAGE_ENDPOINT: 'http://localhost:9000',
    OBJECT_STORAGE_REGION: 'us-east-1',
    OBJECT_STORAGE_BUCKET: 'esign-documents',
    OBJECT_STORAGE_ACCESS_KEY: 'esignminio',
    OBJECT_STORAGE_SECRET_KEY: 'esignminio_dev_password',
    OBJECT_STORAGE_FORCE_PATH_STYLE: 'true',
    ...overrides,
  };
}

export function webEnv(overrides: Record<string, string | undefined> = {}): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
    NEXT_PUBLIC_API_BASE_URL: 'http://localhost:4000',
    ...overrides,
  };
}

const PNG_MAGIC = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export function createTestPng(
  options: { width?: number; height?: number; red?: number; green?: number; blue?: number } = {},
): Uint8Array {
  const width = options.width ?? 32;
  const height = options.height ?? 16;
  const red = options.red ?? 20;
  const green = options.green ?? 80;
  const blue = options.blue ?? 160;
  const scanline = new Uint8Array(1 + width * 3);
  for (let column = 0; column < width; column += 1) {
    const offset = 1 + column * 3;
    scanline[offset] = red;
    scanline[offset + 1] = green;
    scanline[offset + 2] = blue;
  }
  const raw = new Uint8Array(scanline.byteLength * height);
  for (let row = 0; row < height; row += 1) {
    raw.set(scanline, row * scanline.byteLength);
  }
  const ihdr = new Uint8Array(13);
  writeUint32(ihdr, 0, width);
  writeUint32(ihdr, 4, height);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const chunks = [
    PNG_MAGIC,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', new Uint8Array()),
  ];
  let size = 0;
  for (const chunk of chunks) {
    size += chunk.byteLength;
  }
  const png = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    png.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return png;
}

export async function createTestPdf(
  options: { pageCount?: number; width?: number; height?: number } = {},
): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const occurredAt = new Date('2026-01-01T00:00:00.000Z');
  document.setCreationDate(occurredAt);
  document.setModificationDate(occurredAt);
  document.setProducer('esign-test');
  document.setCreator('esign-test');
  const pageCount = options.pageCount ?? 1;
  for (let index = 0; index < pageCount; index += 1) {
    document.addPage([options.width ?? 612, options.height ?? 792]);
  }
  const bytes = await document.save({ useObjectStreams: false });
  return Uint8Array.from(bytes);
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const chunk = new Uint8Array(12 + data.byteLength);
  writeUint32(chunk, 0, data.byteLength);
  for (let index = 0; index < 4; index += 1) {
    chunk[4 + index] = type.charCodeAt(index);
  }
  chunk.set(data, 8);
  const crcInput = chunk.subarray(4, 8 + data.byteLength);
  writeUint32(chunk, 8 + data.byteLength, crc32(crcInput));
  return chunk;
}

function writeUint32(target: Uint8Array, offset: number, value: number): void {
  target[offset] = (value >>> 24) & 0xff;
  target[offset + 1] = (value >>> 16) & 0xff;
  target[offset + 2] = (value >>> 8) & 0xff;
  target[offset + 3] = value & 0xff;
}

function crc32(body: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of body) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
