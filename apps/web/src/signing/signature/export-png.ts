import { SIGNATURE_BOUNDS } from './bounds';
import { committedStrokes, type SignaturePadState } from './pointer';

export class SignatureImageTooLargeError extends Error {
  public constructor() {
    super('Signature image exceeds the allowed size.');
    this.name = 'SignatureImageTooLargeError';
  }
}

export function renderInkToCanvas(state: SignaturePadState): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  const width = 600;
  const height = 240;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context === null) {
    return canvas;
  }
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#0f172a';
  for (const stroke of committedStrokes(state)) {
    const first = stroke.points[0];
    if (first === undefined) {
      continue;
    }
    context.beginPath();
    context.moveTo(first.x * width, first.y * height);
    for (let index = 1; index < stroke.points.length; index += 1) {
      const point = stroke.points[index];
      if (point === undefined) {
        continue;
      }
      context.lineWidth = 1.5 + point.p * 2.5;
      context.lineTo(point.x * width, point.y * height);
    }
    if (stroke.points.length === 1) {
      context.lineWidth = 2;
      context.lineTo(first.x * width + 0.01, first.y * height);
    }
    context.stroke();
  }
  return canvas;
}

export async function exportInkPng(state: SignaturePadState): Promise<Blob> {
  return canvasToPngBlob(renderInkToCanvas(state));
}

export async function canvasToPngBlob(
  canvas: HTMLCanvasElement,
  maxBytes: number = SIGNATURE_BOUNDS.maxPngBytes,
): Promise<Blob> {
  const original = await toPngBlob(canvas);
  if (original.size <= maxBytes) {
    return original;
  }

  let width = Math.max(1, Math.floor(canvas.width * 0.75));
  let height = Math.max(1, Math.floor(canvas.height * 0.75));
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const scaled = document.createElement('canvas');
    scaled.width = width;
    scaled.height = height;
    const context = scaled.getContext('2d');
    if (context === null) {
      break;
    }
    context.drawImage(canvas, 0, 0, width, height);
    const blob = await toPngBlob(scaled);
    if (blob.size <= maxBytes) {
      return blob;
    }
    width = Math.max(1, Math.floor(width * 0.75));
    height = Math.max(1, Math.floor(height * 0.75));
  }

  throw new SignatureImageTooLargeError();
}

export async function blobToBase64(blob: Blob): Promise<string> {
  const buffer = await blobBytes(blob);
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const slice = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
}

async function blobBytes(blob: Blob): Promise<ArrayBuffer> {
  if (typeof blob.arrayBuffer === 'function') {
    return blob.arrayBuffer();
  }
  return new Response(blob).arrayBuffer();
}

function toPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob === null) {
        reject(new Error('Signature image could not be created.'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}
