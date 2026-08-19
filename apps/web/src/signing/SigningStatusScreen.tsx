'use client';

import { useEffect, useRef } from 'react';
import type { SigningScreen } from './status';

type StatusScreenProps = {
  readonly screen: SigningScreen;
  readonly correlationId?: string;
  readonly onRetry?: () => void;
};

export function SigningStatusScreen({ screen, correlationId, onRetry }: StatusScreenProps) {
  const headingRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, [screen]);

  const copy = copyFor(screen);

  return (
    <main id="main-content" className="mx-auto flex max-w-xl flex-col gap-4 px-4 py-12">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
        {copy.title}
      </h1>
      <p role="status" className="text-slate-700">
        {copy.body}
      </p>
      {correlationId !== undefined ? (
        <p className="text-sm text-slate-500">Reference {correlationId}</p>
      ) : null}
      {screen === 'network_error' && onRetry !== undefined ? (
        <p>
          <button
            type="button"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
            onClick={onRetry}
          >
            Try again
          </button>
        </p>
      ) : null}
      {screen === 'error' && onRetry !== undefined ? (
        <p>
          <button
            type="button"
            className="rounded bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
            onClick={onRetry}
          >
            Try again
          </button>
        </p>
      ) : null}
    </main>
  );
}

function copyFor(screen: SigningScreen): { title: string; body: string } {
  switch (screen) {
    case 'bootstrapping':
      return {
        title: 'Opening signing session',
        body: 'Loading the document and signature fields.',
      };
    case 'unavailable':
      return {
        title: 'This signing session is not available',
        body: 'The link may be invalid, expired, or revoked. Request a new invitation if you still need to sign.',
      };
    case 'expired':
      return {
        title: 'This signing session has ended',
        body: 'The signing window is no longer open. Request a new invitation if you still need to sign.',
      };
    case 'revoked':
      return {
        title: 'This signing session is no longer available',
        body: 'The session cannot be used. Request a new invitation if you still need to sign.',
      };
    case 'declined':
      return {
        title: 'You declined to sign',
        body: 'This document will not be signed with your signature.',
      };
    case 'completed':
      return {
        title: 'Signing complete',
        body: 'Your signature was submitted. You can close this page.',
      };
    case 'submitting':
      return {
        title: 'Submitting your signature',
        body: 'Finalization is in progress. Do not close this page or submit again.',
      };
    case 'network_error':
      return {
        title: 'Connection interrupted',
        body: 'The signing session could not be reached. Your signature was not stored on this device. You can retry safely.',
      };
    case 'error':
      return {
        title: 'Something went wrong',
        body: 'The signing session could not continue. You can retry. If the problem persists, request a new invitation.',
      };
    default:
      return {
        title: 'Sign document',
        body: 'Continue signing.',
      };
  }
}
