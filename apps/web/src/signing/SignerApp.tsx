'use client';

import { useEffect, useRef, useState } from 'react';
import { ConsentPanel } from './ConsentPanel';
import { DocumentPreview } from './DocumentPreview';
import { FieldNavigator } from './FieldNavigator';
import { SigningStatusScreen } from './SigningStatusScreen';
import {
  createBrowserSigningApi,
  SigningRequestError,
  type SignerConsentResponse,
  type SignerDocumentResponse,
  type SignerField,
  type SignerSessionResponse,
  type SigningApi,
} from './signing-api';
import { SignaturePad } from './signature/SignaturePad';
import { blobToBase64, exportInkPng } from './signature/export-png';
import {
  clearSignatureState,
  emptySignaturePadState,
  type SignaturePadState,
} from './signature/pointer';
import { screenFromFailure, screenFromSession, type SigningScreen } from './status';
import {
  buildCompleteRequest,
  needsInk,
  submitReadiness,
  type InkCapture,
} from './submit-readiness';

type SignerAppProps = {
  readonly api?: SigningApi;
  readonly now?: () => string;
};

export function SignerApp({ api, now }: SignerAppProps) {
  const [resolvedApi] = useState(() => api ?? createBrowserSigningApi());
  const [nowFn] = useState(() => now ?? (() => new Date().toISOString()));
  const [screen, setScreen] = useState<SigningScreen>('bootstrapping');
  const [session, setSession] = useState<SignerSessionResponse | undefined>();
  const [signingDocument, setSigningDocument] = useState<SignerDocumentResponse | undefined>();
  const [fields, setFields] = useState<readonly SignerField[]>([]);
  const [consent, setConsent] = useState<SignerConsentResponse | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();
  const [previewFailed, setPreviewFailed] = useState(false);
  const [signature, setSignature] = useState<SignaturePadState>(emptySignaturePadState);
  const [initials, setInitials] = useState<SignaturePadState>(emptySignaturePadState);
  const [intentToSign, setIntentToSign] = useState(false);
  const [currentFieldIndex, setCurrentFieldIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const [correlationId, setCorrelationId] = useState<string | undefined>();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [declineReason, setDeclineReason] = useState('');
  const [signaturePreview, setSignaturePreview] = useState<string | undefined>();
  const headingRef = useRef<HTMLHeadingElement | null>(null);
  const pendingTokenRef = useRef<string | undefined>(undefined);
  const hadSessionRef = useRef(false);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const signaturePreviewRef = useRef<string | undefined>(undefined);
  const idempotencyKeyRef = useRef<string | undefined>(undefined);
  const cancelledRef = useRef(false);
  const retrySubmitRef = useRef(false);
  const signatureCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const initialsCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const signatureCaptureRef = useRef<InkCapture | undefined>(undefined);
  const initialsCaptureRef = useRef<InkCapture | undefined>(undefined);

  useEffect(() => {
    cancelledRef.current = false;
    void bootstrap();
    return () => {
      cancelledRef.current = true;
      wipeSensitiveState();
    };
  }, []);

  useEffect(() => {
    if (screen === 'ready' || screen === 'review') {
      headingRef.current?.focus();
    }
  }, [screen]);

  useEffect(() => {
    if (session === undefined) {
      return;
    }
    const remaining = Date.parse(session.expiresAt) - Date.now();
    if (remaining <= 0) {
      setScreen('expired');
      wipeSensitiveState();
      return;
    }
    const timeout = window.setTimeout(
      () => {
        setScreen('expired');
        wipeSensitiveState();
      },
      Math.min(remaining, 2_147_000_000),
    );
    return () => window.clearTimeout(timeout);
  }, [session]);

  async function bootstrap(): Promise<void> {
    setScreen('bootstrapping');
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      if (token !== null && token !== '') {
        pendingTokenRef.current = token;
        window.history.replaceState(null, '', window.location.pathname);
        await resolvedApi.exchange(token);
        pendingTokenRef.current = undefined;
      }
      await loadWorkspace();
    } catch (error) {
      handleFailure(error);
    }
  }

  async function loadWorkspace(): Promise<void> {
    const nextSession = await resolvedApi.getSession();
    if (cancelledRef.current) {
      return;
    }
    hadSessionRef.current = true;
    setSession(nextSession);
    const mapped = screenFromSession(nextSession, nowFn());
    if (mapped !== 'workspace') {
      setScreen(mapped);
      return;
    }
    const [nextDocument, nextFields, nextConsent] = await Promise.all([
      resolvedApi.getDocument(),
      resolvedApi.getFields(),
      resolvedApi.getConsent(),
    ]);
    if (cancelledRef.current) {
      return;
    }
    setSigningDocument(nextDocument);
    setFields(nextFields.fields);
    setConsent(nextConsent);
    setScreen('ready');
    void resolvedApi.recordViewed().catch(() => undefined);
    await loadPreview();
  }

  async function loadPreview(): Promise<void> {
    try {
      const grant = await resolvedApi.issuePreview();
      const blob = await resolvedApi.fetchPreviewBlob(grant);
      if (cancelledRef.current) {
        return;
      }
      if (previewUrlRef.current !== undefined) {
        URL.revokeObjectURL(previewUrlRef.current);
      }
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPreviewFailed(false);
    } catch {
      if (!cancelledRef.current) {
        setPreviewFailed(true);
      }
    }
  }

  function handleFailure(error: unknown): void {
    const requestError = error instanceof SigningRequestError ? error : undefined;
    setCorrelationId(requestError?.correlationId);
    setScreen(
      screenFromFailure({
        authentication: requestError?.authentication === true,
        network: requestError?.network === true,
        hadSession: hadSessionRef.current,
      }),
    );
  }

  function wipeSensitiveState(): void {
    pendingTokenRef.current = undefined;
    idempotencyKeyRef.current = undefined;
    signatureCaptureRef.current = undefined;
    initialsCaptureRef.current = undefined;
    if (previewUrlRef.current !== undefined) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = undefined;
    }
    if (signaturePreviewRef.current !== undefined) {
      URL.revokeObjectURL(signaturePreviewRef.current);
      signaturePreviewRef.current = undefined;
    }
    if (cancelledRef.current) {
      return;
    }
    setPreviewUrl(undefined);
    setSignaturePreview(undefined);
    setSignature(clearSignatureState());
    setInitials(clearSignatureState());
  }

  async function acceptConsent(): Promise<void> {
    if (consent === undefined) {
      return;
    }
    setBusy(true);
    try {
      await resolvedApi.recordConsent(consent.copyId);
      setConsent({ ...consent, accepted: true });
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(false);
    }
  }

  async function goToReview(): Promise<void> {
    try {
      if (needsInk(fields, 'signature')) {
        signatureCaptureRef.current = await captureInk(signature);
        if (signaturePreviewRef.current !== undefined) {
          URL.revokeObjectURL(signaturePreviewRef.current);
        }
        const preview = await exportInkPng(signature);
        const url = URL.createObjectURL(preview);
        signaturePreviewRef.current = url;
        setSignaturePreview(url);
      }
      if (needsInk(fields, 'initials')) {
        initialsCaptureRef.current = await captureInk(initials);
      }
      setScreen('review');
    } catch (error) {
      handleFailure(error);
    }
  }

  async function submit(): Promise<void> {
    if (consent === undefined || session === undefined) {
      return;
    }
    const readiness = submitReadiness({
      consented: consent.accepted,
      intentToSign,
      submitting: screen === 'submitting',
      fields,
      signature,
      initials,
    });
    if (!readiness.canSubmit) {
      return;
    }
    setScreen('submitting');
    setBusy(true);
    retrySubmitRef.current = true;
    if (idempotencyKeyRef.current === undefined) {
      idempotencyKeyRef.current = crypto.randomUUID();
    }
    try {
      const request = buildCompleteRequest({
        consentCopyId: consent.copyId,
        fields,
        signature: signatureCaptureRef.current,
        initials: initialsCaptureRef.current,
      });
      const result = await resolvedApi.complete(request, idempotencyKeyRef.current);
      if (result.status === 'pending') {
        await waitForCompletion();
      }
      retrySubmitRef.current = false;
      wipeSensitiveState();
      setScreen('completed');
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(false);
    }
  }

  async function waitForCompletion(): Promise<void> {
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const next = await resolvedApi.getSession();
      if (next.signerStatus === 'signed') {
        return;
      }
      await new Promise((resolve) => window.setTimeout(resolve, 250));
    }
  }

  async function captureInk(state: SignaturePadState): Promise<InkCapture> {
    const blob = await exportInkPng(state);
    return {
      pngBase64: await blobToBase64(blob),
      state,
    };
  }

  async function confirmDecline(): Promise<void> {
    setBusy(true);
    try {
      await resolvedApi.decline(declineReason.trim() === '' ? undefined : declineReason);
      wipeSensitiveState();
      setScreen('declined');
    } catch (error) {
      handleFailure(error);
    } finally {
      setBusy(false);
      setDeclineOpen(false);
    }
  }

  async function retry(): Promise<void> {
    setCorrelationId(undefined);
    if (retrySubmitRef.current) {
      setScreen('review');
      await submit();
      return;
    }
    if (pendingTokenRef.current !== undefined) {
      try {
        await resolvedApi.exchange(pendingTokenRef.current);
        pendingTokenRef.current = undefined;
        await loadWorkspace();
        return;
      } catch (error) {
        handleFailure(error);
        return;
      }
    }
    await bootstrap();
  }

  if (
    screen === 'bootstrapping' ||
    screen === 'unavailable' ||
    screen === 'expired' ||
    screen === 'revoked' ||
    screen === 'declined' ||
    screen === 'completed' ||
    screen === 'error' ||
    screen === 'network_error' ||
    screen === 'submitting'
  ) {
    return (
      <SigningStatusScreen
        screen={screen}
        correlationId={correlationId}
        onRetry={screen === 'network_error' || screen === 'error' ? () => void retry() : undefined}
      />
    );
  }

  if (signingDocument === undefined || consent === undefined) {
    return <SigningStatusScreen screen="bootstrapping" />;
  }

  const readiness = submitReadiness({
    consented: consent.accepted,
    intentToSign,
    submitting: busy,
    fields,
    signature,
    initials,
  });

  return (
    <main id="main-content" className="mx-auto flex max-w-4xl flex-col gap-8 px-4 py-8">
      <h1 ref={headingRef} tabIndex={-1} className="text-2xl font-semibold">
        {screen === 'review' ? 'Review before submitting' : 'Sign document'}
      </h1>
      <p className="text-slate-700">
        {signingDocument.title} — {signingDocument.signerDisplayName}
      </p>

      {screen === 'review' ? (
        <section aria-labelledby="review-heading" className="flex flex-col gap-4">
          <h2 id="review-heading" className="text-lg font-semibold">
            Review
          </h2>
          <p>
            Consent version {consent.version} will be recorded. Field placement is taken from the
            server, not from this page.
          </p>
          {signaturePreview !== undefined ? (
            <p>
              <img src={signaturePreview} alt="Signature preview" className="max-h-32 border" />
            </p>
          ) : null}
          <ul className="list-disc pl-5">
            {fields.map((field) => (
              <li key={field.fieldId}>
                {field.type} on page {field.pageNumber}
              </li>
            ))}
          </ul>
          {!readiness.canSubmit ? <p role="alert">{readiness.reasons[0]}</p> : null}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-4 py-2"
              onClick={() => setScreen('ready')}
            >
              Back
            </button>
            <button
              type="button"
              className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              disabled={!readiness.canSubmit}
              onClick={() => void submit()}
            >
              Submit signature
            </button>
          </div>
        </section>
      ) : (
        <>
          <DocumentPreview
            title={signingDocument.title}
            blobUrl={previewUrl}
            previewFailed={previewFailed}
            onRetry={() => void loadPreview()}
          />
          <FieldNavigator
            fields={fields}
            currentIndex={currentFieldIndex}
            onCurrentIndexChange={setCurrentFieldIndex}
          />
          {needsInk(fields, 'signature') ? (
            <SignaturePad
              label="Signature"
              value={signature}
              onChange={setSignature}
              canvasRef={signatureCanvasRef}
            />
          ) : null}
          {needsInk(fields, 'initials') ? (
            <SignaturePad
              label="Initials"
              value={initials}
              onChange={setInitials}
              canvasRef={initialsCanvasRef}
            />
          ) : null}
          <ConsentPanel consent={consent} busy={busy} onAccept={() => void acceptConsent()} />
          <div>
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={intentToSign}
                onChange={(event) => setIntentToSign(event.target.checked)}
              />
              <span>I intend to sign this document.</span>
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
              disabled={!readiness.canSubmit}
              onClick={() => void goToReview()}
            >
              Review and submit
            </button>
            <button
              type="button"
              className="rounded border border-slate-300 bg-white px-4 py-2"
              onClick={() => setDeclineOpen(true)}
            >
              Decline to sign
            </button>
          </div>
        </>
      )}

      {declineOpen ? (
        <div
          role="dialog"
          aria-labelledby="decline-title"
          className="rounded border border-slate-300 bg-white p-4"
        >
          <h2 id="decline-title" className="text-lg font-semibold">
            Decline to sign
          </h2>
          <label htmlFor="decline-reason" className="mt-2 block text-sm">
            Optional reason
          </label>
          <textarea
            id="decline-reason"
            className="mt-1 w-full rounded border border-slate-300 p-2"
            maxLength={500}
            value={declineReason}
            onChange={(event) => setDeclineReason(event.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="rounded bg-slate-900 px-4 py-2 text-white"
              disabled={busy}
              onClick={() => void confirmDecline()}
            >
              Confirm decline
            </button>
            <button
              type="button"
              className="rounded border px-4 py-2"
              onClick={() => setDeclineOpen(false)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}
    </main>
  );
}
