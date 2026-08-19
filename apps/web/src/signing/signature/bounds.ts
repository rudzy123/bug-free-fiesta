export const SIGNATURE_BOUNDS = {
  maxPoints: 4_000,
  maxStrokes: 32,
  maxDurationMs: 90_000,
  maxPngBytes: 220_000,
  minPoints: 6,
  minStrokes: 1,
  maxDevicePixelRatio: 2,
} as const;

export function cappedDevicePixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio) || devicePixelRatio < 1) {
    return 1;
  }
  return Math.min(devicePixelRatio, SIGNATURE_BOUNDS.maxDevicePixelRatio);
}
