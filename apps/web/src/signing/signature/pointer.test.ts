import { describe, expect, it } from 'vitest';
import { SIGNATURE_BOUNDS } from './bounds';
import {
  clamp01,
  clearSignatureState,
  committedStrokes,
  emptySignaturePadState,
  isSignatureValid,
  reducePointer,
  signatureDurationMs,
  type PadPointerEvent,
  type SignaturePadState,
} from './pointer';

const rect = { left: 10, top: 20, width: 100, height: 50 };

function event(
  kind: PadPointerEvent['kind'],
  overrides: Partial<PadPointerEvent> = {},
): PadPointerEvent {
  return {
    kind,
    pointerId: 1,
    clientX: 60,
    clientY: 45,
    pressure: 0.8,
    timeStamp: 0,
    rect,
    ...overrides,
  };
}

function stroke(
  points: number,
  start: SignaturePadState = emptySignaturePadState,
  pointerId = 1,
): SignaturePadState {
  let state = reducePointer(
    start,
    event('down', { pointerId, clientX: 20, clientY: 30, timeStamp: 0 }),
  );
  for (let index = 1; index < points; index += 1) {
    state = reducePointer(
      state,
      event('move', {
        pointerId,
        clientX: 20 + index,
        clientY: 30,
        pressure: 0.25,
        timeStamp: index * 5,
      }),
    );
  }
  return reducePointer(
    state,
    event('up', { pointerId, clientX: 20 + points, clientY: 30, timeStamp: points * 5 }),
  );
}

describe('pointer signature capture', () => {
  it('normalizes coordinates, elapsed time, and pressure into strokes', () => {
    let state = reducePointer(
      emptySignaturePadState,
      event('down', { clientX: 10, clientY: 20, pressure: 0.9, timeStamp: 1000 }),
    );
    state = reducePointer(
      state,
      event('move', { clientX: 60, clientY: 45, pressure: 0.9, timeStamp: 1040 }),
    );
    state = reducePointer(
      state,
      event('up', { clientX: 110, clientY: 70, pressure: 0.9, timeStamp: 1080 }),
    );

    const committed = committedStrokes(state);
    expect(committed).toHaveLength(1);
    const points = committed[0]?.points ?? [];
    expect(points[0]).toMatchObject({ x: 0, y: 0, t: 0, p: 0.9 });
    expect(points[1]).toMatchObject({ x: 0.5, y: 0.5, t: 40, p: 0.9 });
    expect(points[2]).toMatchObject({ x: 1, y: 1, t: 80, p: 0.9 });
    expect(signatureDurationMs(state)).toBe(80);
    expect(isSignatureValid(state)).toBe(false);
  });

  it('rounds elapsed duration to an integer for API payloads', () => {
    let state = reducePointer(emptySignaturePadState, event('down', { timeStamp: 0.4 }));
    state = reducePointer(state, event('move', { clientX: 40, timeStamp: 12.6 }));
    state = reducePointer(state, event('up', { clientX: 50, timeStamp: 20.4 }));
    expect(Number.isInteger(signatureDurationMs(state))).toBe(true);
  });

  it('uses a default pressure when the pointer reports none', () => {
    const state = reducePointer(emptySignaturePadState, event('down', { pressure: 0 }));
    expect(state.active?.points[0]?.p).toBe(0.5);
  });

  it('discards the in-progress stroke on pointer cancellation', () => {
    let state = reducePointer(emptySignaturePadState, event('down', { timeStamp: 1 }));
    state = reducePointer(state, event('move', { clientX: 40, timeStamp: 2 }));
    state = reducePointer(state, event('cancel', { timeStamp: 3 }));
    expect(state.active).toBeNull();
    expect(state.strokes).toHaveLength(0);
  });

  it('ignores additional pointers while a stroke is active', () => {
    const state = reducePointer(emptySignaturePadState, event('down', { pointerId: 7 }));
    const blocked = reducePointer(state, event('down', { pointerId: 8, clientX: 90 }));
    expect(blocked).toBe(state);
  });

  it('caps point count, stroke count, and duration', () => {
    let manyPoints = emptySignaturePadState;
    manyPoints = reducePointer(manyPoints, event('down', { timeStamp: 0 }));
    for (let index = 1; index <= SIGNATURE_BOUNDS.maxPoints; index += 1) {
      manyPoints = reducePointer(
        manyPoints,
        event('move', { clientX: 20 + (index % 50), timeStamp: index }),
      );
    }
    expect(manyPoints.capped).toBe(true);
    expect(manyPoints.pointCount).toBeLessThanOrEqual(SIGNATURE_BOUNDS.maxPoints);

    let manyStrokes = emptySignaturePadState;
    for (let index = 0; index < SIGNATURE_BOUNDS.maxStrokes + 2; index += 1) {
      manyStrokes = stroke(2, manyStrokes, index + 1);
    }
    expect(manyStrokes.strokes.length).toBeLessThanOrEqual(SIGNATURE_BOUNDS.maxStrokes);
    expect(manyStrokes.capped).toBe(true);

    let timed = reducePointer(emptySignaturePadState, event('down', { timeStamp: 0 }));
    timed = reducePointer(timed, event('move', { timeStamp: SIGNATURE_BOUNDS.maxDurationMs + 1 }));
    expect(timed.capped).toBe(true);
    expect(timed.active).toBeNull();
  });

  it('treats non-finite values as empty rather than NaN', () => {
    expect(clamp01(Number.NaN)).toBe(0);
    expect(clamp01(Number.POSITIVE_INFINITY)).toBe(0);
    const cleared = clearSignatureState();
    expect(cleared.strokes).toEqual([]);
    expect(cleared.pointCount).toBe(0);
  });
});
