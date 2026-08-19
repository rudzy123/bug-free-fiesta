import { SIGNATURE_BOUNDS } from './bounds';

export type SignaturePoint = {
  readonly x: number;
  readonly y: number;
  readonly t: number;
  readonly p: number;
};

export type SignatureStroke = {
  readonly pointerId: number;
  readonly points: readonly SignaturePoint[];
};

export type SignaturePadState = {
  readonly strokes: readonly SignatureStroke[];
  readonly active: SignatureStroke | null;
  readonly startedAt: number | null;
  readonly pointCount: number;
  readonly capped: boolean;
};

export type PadRect = {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
};

export type PadPointerEvent = {
  readonly kind: 'down' | 'move' | 'up' | 'cancel';
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pressure: number;
  readonly timeStamp: number;
  readonly rect: PadRect;
};

export const emptySignaturePadState: SignaturePadState = {
  strokes: [],
  active: null,
  startedAt: null,
  pointCount: 0,
  capped: false,
};

export function clamp01(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

export function normalizePoint(
  clientX: number,
  clientY: number,
  rect: PadRect,
): {
  x: number;
  y: number;
} {
  if (rect.width <= 0 || rect.height <= 0) {
    return { x: 0, y: 0 };
  }
  return {
    x: clamp01((clientX - rect.left) / rect.width),
    y: clamp01((clientY - rect.top) / rect.height),
  };
}

export function pressureOf(value: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0.5;
  }
  return clamp01(value);
}

export function reducePointer(state: SignaturePadState, event: PadPointerEvent): SignaturePadState {
  const elapsed = state.startedAt === null ? 0 : Math.max(0, event.timeStamp - state.startedAt);
  if (elapsed > SIGNATURE_BOUNDS.maxDurationMs) {
    return endActiveStroke({ ...state, capped: true });
  }

  if (event.kind === 'down') {
    if (state.active !== null) {
      return state;
    }
    if (wouldExceed(state, 1, 1)) {
      return { ...state, capped: true };
    }
    const point = createPoint(event, state.startedAt ?? event.timeStamp);
    return {
      strokes: state.strokes,
      active: { pointerId: event.pointerId, points: [point] },
      startedAt: state.startedAt ?? event.timeStamp,
      pointCount: state.pointCount + 1,
      capped: state.capped,
    };
  }

  if (state.active === null || state.active.pointerId !== event.pointerId) {
    return state;
  }

  if (event.kind === 'move') {
    if (wouldExceed(state, 1, 0)) {
      return { ...state, capped: true };
    }
    const point = createPoint(event, state.startedAt ?? event.timeStamp);
    return {
      ...state,
      active: { ...state.active, points: [...state.active.points, point] },
      pointCount: state.pointCount + 1,
    };
  }

  if (event.kind === 'cancel') {
    return { ...state, active: null };
  }

  if (event.kind === 'up') {
    let next = state;
    if (!wouldExceed(state, 1, 0)) {
      const point = createPoint(event, state.startedAt ?? event.timeStamp);
      next = {
        ...state,
        active: { ...state.active, points: [...state.active.points, point] },
        pointCount: state.pointCount + 1,
      };
    }
    return endActiveStroke(next);
  }

  return state;
}

export function addKeyboardPoint(
  state: SignaturePadState,
  cursor: { x: number; y: number },
  timeStamp: number,
): SignaturePadState {
  const synthetic: PadPointerEvent = {
    kind: state.active === null ? 'down' : 'move',
    pointerId: -1,
    clientX: cursor.x,
    clientY: cursor.y,
    pressure: 0.5,
    timeStamp,
    rect: { left: 0, top: 0, width: 1, height: 1 },
  };
  return reducePointer(state, synthetic);
}

export function endKeyboardStroke(state: SignaturePadState): SignaturePadState {
  if (state.active === null || state.active.pointerId !== -1) {
    return state;
  }
  return endActiveStroke(state);
}

export function committedStrokes(state: SignaturePadState): readonly SignatureStroke[] {
  if (state.active === null || state.active.points.length === 0) {
    return state.strokes;
  }
  return [...state.strokes, state.active];
}

export function isSignatureValid(state: SignaturePadState): boolean {
  const strokes = committedStrokes(state);
  return (
    strokes.length >= SIGNATURE_BOUNDS.minStrokes && state.pointCount >= SIGNATURE_BOUNDS.minPoints
  );
}

export function signatureDurationMs(state: SignaturePadState): number {
  let maxElapsed = 0;
  for (const stroke of committedStrokes(state)) {
    for (const point of stroke.points) {
      if (point.t > maxElapsed) {
        maxElapsed = point.t;
      }
    }
  }
  return Math.min(SIGNATURE_BOUNDS.maxDurationMs, Math.max(0, Math.round(maxElapsed)));
}

export function clearSignatureState(): SignaturePadState {
  return emptySignaturePadState;
}

function createPoint(event: PadPointerEvent, startedAt: number): SignaturePoint {
  const normalized = normalizePoint(event.clientX, event.clientY, event.rect);
  return {
    x: normalized.x,
    y: normalized.y,
    t: Math.max(0, event.timeStamp - startedAt),
    p: pressureOf(event.pressure),
  };
}

function wouldExceed(state: SignaturePadState, extraPoints: number, extraStrokes: number): boolean {
  const strokeCount = state.strokes.length + (state.active === null ? 0 : 1) + extraStrokes;
  return (
    state.pointCount + extraPoints > SIGNATURE_BOUNDS.maxPoints ||
    strokeCount > SIGNATURE_BOUNDS.maxStrokes
  );
}

function endActiveStroke(state: SignaturePadState): SignaturePadState {
  if (state.active === null) {
    return state;
  }
  if (state.active.points.length === 0) {
    return { ...state, active: null };
  }
  return {
    ...state,
    strokes: [...state.strokes, state.active],
    active: null,
  };
}
