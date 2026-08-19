import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { SignaturePad } from './SignaturePad';
import { emptySignaturePadState, isSignatureValid, type SignaturePadState } from './pointer';

function Harness() {
  const [value, setValue] = useState<SignaturePadState>(emptySignaturePadState);
  return <SignaturePad label="Signature" value={value} onChange={setValue} />;
}

function stubRect(canvas: HTMLElement): void {
  canvas.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      width: 200,
      height: 80,
      right: 200,
      bottom: 80,
      x: 0,
      y: 0,
      toJSON() {},
    }) as DOMRect;
}

function draw(canvas: HTMLElement, pointerType: 'mouse' | 'pen' | 'touch'): void {
  stubRect(canvas);
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    pointerType,
    clientX: 16,
    clientY: 16,
    pressure: 0.7,
    timeStamp: 1,
  });
  for (let index = 1; index <= 8; index += 1) {
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType,
      clientX: 16 + index * 8,
      clientY: 18,
      pressure: 0.7,
      timeStamp: 1 + index,
    });
  }
  fireEvent.pointerUp(canvas, {
    pointerId: 1,
    pointerType,
    clientX: 80,
    clientY: 18,
    pressure: 0.7,
    timeStamp: 20,
  });
}

describe('SignaturePad', () => {
  it('exposes an accessible name, keyboard help, and a clear action', () => {
    render(<Harness />);
    const canvas = screen.getByRole('application', { name: 'Signature' });
    expect(canvas).toHaveAttribute('tabindex', '0');
    expect(canvas).toHaveAttribute('aria-describedby');
    expect(canvas.style.touchAction).toBe('none');
    expect(
      screen.getByText(/Keyboard: arrow keys move the cursor, Space adds a point/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Clear signature' })).toBeEnabled();
  });

  it('captures mouse, pen, and touch pointer strokes and can clear them', () => {
    function InkHarness() {
      const [value, setValue] = useState<SignaturePadState>(emptySignaturePadState);
      return (
        <>
          <SignaturePad label="Signature" value={value} onChange={setValue} />
          <p>{isSignatureValid(value) ? 'ink-ready' : 'ink-empty'}</p>
        </>
      );
    }
    render(<InkHarness />);
    const canvas = screen.getByRole('application', { name: 'Signature' });
    const capture = vi.spyOn(canvas, 'setPointerCapture');

    draw(canvas, 'mouse');
    expect(capture).toHaveBeenCalled();
    expect(screen.getByText('ink-ready')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Clear signature' }));
    expect(screen.getByText('ink-empty')).toBeInTheDocument();

    draw(canvas, 'pen');
    expect(screen.getByText('ink-ready')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Clear signature' }));

    draw(canvas, 'touch');
    expect(screen.getByText('ink-ready')).toBeInTheDocument();
  });

  it('plots points from the keyboard and ends a stroke on Enter', () => {
    function KeyboardHarness() {
      const [value, setValue] = useState<SignaturePadState>(emptySignaturePadState);
      return (
        <>
          <SignaturePad label="Signature" value={value} onChange={setValue} />
          <p>{isSignatureValid(value) ? 'ink-ready' : 'ink-empty'}</p>
        </>
      );
    }
    render(<KeyboardHarness />);
    const canvas = screen.getByRole('application', { name: 'Signature' });
    canvas.focus();
    for (let index = 0; index < 8; index += 1) {
      fireEvent.keyDown(canvas, { key: 'ArrowRight' });
      fireEvent.keyDown(canvas, { key: ' ' });
    }
    fireEvent.keyDown(canvas, { key: 'Enter' });
    expect(screen.getByText('ink-ready')).toBeInTheDocument();
  });

  it('releases capture when the pointer is cancelled', () => {
    render(<Harness />);
    const canvas = screen.getByRole('application', { name: 'Signature' });
    stubRect(canvas);
    const release = vi.spyOn(canvas, 'releasePointerCapture');
    fireEvent.pointerDown(canvas, {
      pointerId: 9,
      pointerType: 'pen',
      clientX: 10,
      clientY: 10,
      pressure: 0.4,
      timeStamp: 1,
    });
    fireEvent.pointerCancel(canvas, {
      pointerId: 9,
      pointerType: 'pen',
      clientX: 12,
      clientY: 12,
      pressure: 0,
      timeStamp: 2,
    });
    expect(release).toHaveBeenCalled();
  });
});
