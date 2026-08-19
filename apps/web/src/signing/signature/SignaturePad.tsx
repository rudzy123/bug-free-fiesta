'use client';

import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type Ref,
} from 'react';
import { cappedDevicePixelRatio } from './bounds';
import {
  addKeyboardPoint,
  clearSignatureState,
  endKeyboardStroke,
  reducePointer,
  type PadPointerEvent,
  type SignaturePadState,
} from './pointer';

type SignaturePadProps = {
  readonly label: string;
  readonly describedBy?: string;
  readonly value: SignaturePadState;
  readonly onChange: (next: SignaturePadState) => void;
  readonly disabled?: boolean;
  readonly canvasRef?: Ref<HTMLCanvasElement | null>;
};

export function SignaturePad({
  label,
  describedBy,
  value,
  onChange,
  disabled = false,
  canvasRef: canvasRefFromParent,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const labelId = useId();
  const helpId = useId();
  const [cursor, setCursor] = useState({ x: 0.5, y: 0.5 });
  const stateRef = useRef(value);
  stateRef.current = value;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas === null) {
      return;
    }
    const redraw = (): void => {
      syncCanvasSize(canvas);
      paintSignature(canvas, value, cursor);
    };
    redraw();
    window.addEventListener('resize', redraw);
    return () => window.removeEventListener('resize', redraw);
  }, [value, cursor]);

  function dispatch(event: PointerEvent<HTMLCanvasElement>, kind: PadPointerEvent['kind']): void {
    if (disabled) {
      return;
    }
    event.preventDefault();
    const canvas = event.currentTarget;
    const pointerId = Number.isFinite(event.pointerId) ? event.pointerId : 1;
    if (kind === 'down') {
      try {
        canvas.setPointerCapture(pointerId);
      } catch {
        // Synthetic or already-released pointers still record ink.
      }
    }
    if (kind === 'up' || kind === 'cancel') {
      try {
        canvas.releasePointerCapture(pointerId);
      } catch {
        // Capture may already have been released by the browser.
      }
    }
    const rect = canvas.getBoundingClientRect();
    const next = reducePointer(stateRef.current, {
      kind,
      pointerId,
      clientX: Number.isFinite(event.clientX) ? event.clientX : 0,
      clientY: Number.isFinite(event.clientY) ? event.clientY : 0,
      pressure: event.pressure,
      timeStamp: event.timeStamp,
      rect: { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
    });
    stateRef.current = next;
    onChange(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLCanvasElement>): void {
    if (disabled) {
      return;
    }
    const step = 0.03;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      setCursor((current) => ({ ...current, x: clampCursor(current.x - step) }));
      return;
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      setCursor((current) => ({ ...current, x: clampCursor(current.x + step) }));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => ({ ...current, y: clampCursor(current.y - step) }));
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => ({ ...current, y: clampCursor(current.y + step) }));
      return;
    }
    if (event.key === ' ' || event.key === 'Spacebar') {
      event.preventDefault();
      const next = addKeyboardPoint(stateRef.current, cursor, event.timeStamp);
      stateRef.current = next;
      onChange(next);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const next = endKeyboardStroke(stateRef.current);
      stateRef.current = next;
      onChange(next);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      const next = endKeyboardStroke(stateRef.current);
      stateRef.current = next;
      onChange(next);
    }
  }

  const descriptionId = describedBy === undefined ? helpId : `${helpId} ${describedBy}`;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label id={labelId} className="text-sm font-medium" htmlFor={labelId + '-canvas'}>
          {label}
        </label>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1 text-sm hover:bg-slate-100 focus-visible:outline"
          disabled={disabled}
          onClick={() => {
            const next = clearSignatureState();
            stateRef.current = next;
            onChange(next);
          }}
        >
          Clear {label.toLowerCase()}
        </button>
      </div>
      <canvas
        ref={(node) => {
          canvasRef.current = node;
          if (typeof canvasRefFromParent === 'function') {
            canvasRefFromParent(node);
          } else if (canvasRefFromParent != null) {
            canvasRefFromParent.current = node;
          }
        }}
        id={labelId + '-canvas'}
        role="application"
        tabIndex={disabled ? -1 : 0}
        aria-labelledby={labelId}
        aria-describedby={descriptionId}
        className="h-40 w-full touch-none rounded border border-slate-400 bg-transparent md:h-48"
        style={{ touchAction: 'none' }}
        onPointerDown={(event) => dispatch(event, 'down')}
        onPointerMove={(event) => dispatch(event, 'move')}
        onPointerUp={(event) => dispatch(event, 'up')}
        onPointerCancel={(event) => dispatch(event, 'cancel')}
        onKeyDown={onKeyDown}
      />
      <p id={helpId} className="text-sm text-slate-600">
        Draw with a mouse, pen, or touch. Keyboard: arrow keys move the cursor, Space adds a point,
        Enter ends a stroke.
      </p>
    </div>
  );
}

function clampCursor(value: number): number {
  if (value < 0) {
    return 0;
  }
  if (value > 1) {
    return 1;
  }
  return value;
}

function syncCanvasSize(canvas: HTMLCanvasElement): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = cappedDevicePixelRatio(window.devicePixelRatio);
  const width = Math.max(1, Math.round(rect.width * dpr));
  const height = Math.max(1, Math.round(rect.height * dpr));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

function paintSignature(
  canvas: HTMLCanvasElement,
  state: SignaturePadState,
  cursor: { x: number; y: number },
): void {
  const context = canvas.getContext('2d');
  if (context === null) {
    return;
  }
  const dpr = cappedDevicePixelRatio(window.devicePixelRatio);
  const width = canvas.width / dpr;
  const height = canvas.height / dpr;
  context.setTransform(dpr, 0, 0, dpr, 0, 0);
  context.clearRect(0, 0, width, height);
  context.lineCap = 'round';
  context.lineJoin = 'round';
  context.strokeStyle = '#0f172a';
  const strokes = state.active === null ? state.strokes : [...state.strokes, state.active];
  for (const stroke of strokes) {
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
  context.beginPath();
  context.strokeStyle = '#64748b';
  context.lineWidth = 1;
  context.moveTo(cursor.x * width - 4, cursor.y * height);
  context.lineTo(cursor.x * width + 4, cursor.y * height);
  context.moveTo(cursor.x * width, cursor.y * height - 4);
  context.lineTo(cursor.x * width, cursor.y * height + 4);
  context.stroke();
}
