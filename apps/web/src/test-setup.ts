import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace(href: string) {
      window.history.replaceState(null, '', href);
    },
  }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}));

afterEach(() => {
  cleanup();
});

const mockContext = {
  scale(): void {},
  clearRect(): void {},
  beginPath(): void {},
  moveTo(): void {},
  lineTo(): void {},
  stroke(): void {},
  drawImage(): void {},
  setTransform(): void {},
  set lineWidth(_value: number) {},
  set lineCap(_value: string) {},
  set lineJoin(_value: string) {},
  set strokeStyle(_value: string) {},
};

HTMLCanvasElement.prototype.getContext = function getContext() {
  return mockContext as unknown as CanvasRenderingContext2D;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

HTMLCanvasElement.prototype.toBlob = function toBlob(
  callback: BlobCallback,
  _type?: string,
  _quality?: number,
): void {
  callback(new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' }));
};

HTMLCanvasElement.prototype.setPointerCapture = function setPointerCapture(): void {};
HTMLCanvasElement.prototype.releasePointerCapture = function releasePointerCapture(): void {};
HTMLCanvasElement.prototype.hasPointerCapture = function hasPointerCapture(): boolean {
  return false;
};

URL.createObjectURL = () => 'blob:signing-test';
URL.revokeObjectURL = () => {};
