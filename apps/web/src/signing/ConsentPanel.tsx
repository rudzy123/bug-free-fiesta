'use client';

import type { SignerConsentResponse } from './signing-api';

type ConsentPanelProps = {
  readonly consent: SignerConsentResponse;
  readonly busy: boolean;
  readonly onAccept: () => void;
};

export function ConsentPanel({ consent, busy, onAccept }: ConsentPanelProps) {
  return (
    <section aria-labelledby="consent-heading" className="flex flex-col gap-3">
      <h2 id="consent-heading" className="text-lg font-semibold">
        {consent.title}
      </h2>
      <p data-testid="consent-version" className="text-sm font-medium text-slate-700">
        Consent version {consent.version}
      </p>
      <div className="max-h-48 overflow-auto rounded border border-slate-200 bg-white p-3 text-sm whitespace-pre-wrap">
        {consent.text}
      </div>
      {consent.accepted ? (
        <p role="status">You accepted this disclosure.</p>
      ) : (
        <button
          type="button"
          className="w-fit rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={busy}
          onClick={onAccept}
        >
          I agree to this disclosure
        </button>
      )}
    </section>
  );
}
