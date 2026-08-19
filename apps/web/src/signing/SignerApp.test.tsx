import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SignerApp } from './SignerApp';
import { SigningRequestError, type SigningApi } from './signing-api';

const SESSION = {
  documentId: '11111111-1111-4111-8111-111111111111',
  signerId: '22222222-2222-4222-8222-222222222222',
  sessionId: '33333333-3333-4333-8333-333333333333',
  sessionStatus: 'active' as const,
  title: 'Offer letter',
  signingMode: 'ordered' as const,
  expiresAt: '2026-12-01T00:00:00.000Z',
  signerDisplayName: 'Alex Signer',
  signerStatus: 'pending' as const,
  consentRequired: true,
  consented: false,
};

const DOCUMENT = {
  documentId: SESSION.documentId,
  title: 'Offer letter',
  signingMode: 'ordered' as const,
  pageCount: 1,
  signerDisplayName: 'Alex Signer',
};

const FIELD = {
  fieldId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  type: 'signature' as const,
  pageNumber: 1,
  x: 0.1,
  y: 0.2,
  width: 0.4,
  height: 0.15,
  required: true,
};

const CONSENT = {
  copyId: 'esign-consent-v3',
  version: '3.2.1',
  title: 'Electronic signature consent',
  text: 'Exact disclosure text from the API.',
  required: true as const,
  accepted: false,
};

function createMockApi(overrides: Partial<SigningApi> = {}): SigningApi {
  return {
    exchange: vi.fn(async () => ({
      sessionId: SESSION.sessionId,
      expiresAt: SESSION.expiresAt,
    })),
    getSession: vi.fn(async () => SESSION),
    getDocument: vi.fn(async () => DOCUMENT),
    getFields: vi.fn(async () => ({ fields: [FIELD] })),
    getConsent: vi.fn(async () => CONSENT),
    issuePreview: vi.fn(async () => ({
      url: '/document-previews/bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      tokenHeader: 'x-preview-token',
      token: 'preview-token',
      contentType: 'application/pdf',
    })),
    fetchPreviewBlob: vi.fn(
      async () => new Blob([new Uint8Array([37, 80, 68, 70])], { type: 'application/pdf' }),
    ),
    recordViewed: vi.fn(async () => undefined),
    recordConsent: vi.fn(async () => undefined),
    decline: vi.fn(async () => undefined),
    complete: vi.fn(async () => ({ status: 'accepted' as const })),
    ...overrides,
  };
}

function drawSignature(): void {
  const canvas = screen.getByRole('application', { name: 'Signature' });
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
  fireEvent.pointerDown(canvas, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 12,
    clientY: 12,
    pressure: 0.5,
    timeStamp: 1,
  });
  for (let index = 1; index <= 8; index += 1) {
    fireEvent.pointerMove(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      clientX: 12 + index * 8,
      clientY: 14 + index,
      pressure: 0.5,
      timeStamp: 1 + index,
    });
  }
  fireEvent.pointerUp(canvas, {
    pointerId: 1,
    pointerType: 'mouse',
    clientX: 80,
    clientY: 22,
    pressure: 0.5,
    timeStamp: 20,
  });
}

afterEach(() => {
  window.history.replaceState(null, '', '/');
});

describe('SignerApp', () => {
  it('exchanges a URL token, strips it, and shows the API consent version', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const api = createMockApi();
    window.history.replaceState(null, '', '/signing?token=raw-url-token');
    render(<SignerApp api={api} now={() => '2026-08-18T00:00:00.000Z'} />);

    await waitFor(() => expect(api.exchange).toHaveBeenCalledWith('raw-url-token'));
    expect(window.location.search).not.toContain('raw-url-token');
    expect(await screen.findByText('Consent version 3.2.1')).toBeInTheDocument();
    expect(screen.getByText('Exact disclosure text from the API.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Review and submit' })).toBeDisabled();
    expect(setItem).not.toHaveBeenCalled();
    setItem.mockRestore();
  });

  it('enables review after signature, consent, and intent, then submits without placement coordinates', async () => {
    const api = createMockApi();
    render(<SignerApp api={api} now={() => '2026-08-18T00:00:00.000Z'} />);
    await screen.findByRole('heading', { name: 'Sign document' });

    drawSignature();
    fireEvent.click(screen.getByRole('button', { name: 'I agree to this disclosure' }));
    await waitFor(() => expect(api.recordConsent).toHaveBeenCalledWith('esign-consent-v3'));
    fireEvent.click(screen.getByRole('checkbox', { name: 'I intend to sign this document.' }));

    const review = screen.getByRole('button', { name: 'Review and submit' });
    expect(review).toBeEnabled();
    fireEvent.click(review);
    expect(
      await screen.findByRole('heading', { name: 'Review before submitting' }),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Submit signature' }));
    expect(await screen.findByRole('heading', { name: 'Signing complete' })).toBeInTheDocument();
    expect(api.complete).toHaveBeenCalled();
    const payload = vi.mocked(api.complete).mock.calls[0]?.[0];
    expect(payload).toBeDefined();
    expect(JSON.stringify(payload)).not.toContain('organizationId');
    expect(JSON.stringify(payload)).not.toContain('"pageNumber"');
  });

  it('shows expired, declined, completed, unavailable, and retryable network states', async () => {
    const expired = createMockApi({
      getSession: vi.fn(async () => ({ ...SESSION, expiresAt: '2026-01-01T00:00:00.000Z' })),
    });
    const expiredView = render(<SignerApp api={expired} now={() => '2026-08-18T00:00:00.000Z'} />);
    expect(
      await screen.findByRole('heading', { name: 'This signing session has ended' }),
    ).toBeVisible();
    expiredView.unmount();

    const declined = createMockApi({
      getSession: vi.fn(async () => ({ ...SESSION, signerStatus: 'declined' as const })),
    });
    const declinedView = render(
      <SignerApp api={declined} now={() => '2026-08-18T00:00:00.000Z'} />,
    );
    expect(await screen.findByRole('heading', { name: 'You declined to sign' })).toBeVisible();
    declinedView.unmount();

    const completed = createMockApi({
      getSession: vi.fn(async () => ({ ...SESSION, signerStatus: 'signed' as const })),
    });
    const completedView = render(
      <SignerApp api={completed} now={() => '2026-08-18T00:00:00.000Z'} />,
    );
    expect(await screen.findByRole('heading', { name: 'Signing complete' })).toBeVisible();
    completedView.unmount();

    const unavailable = createMockApi({
      getSession: vi.fn(async () => {
        throw new SigningRequestError(true, false, false, 'cid-1');
      }),
    });
    const unavailableView = render(
      <SignerApp api={unavailable} now={() => '2026-08-18T00:00:00.000Z'} />,
    );
    expect(
      await screen.findByRole('heading', { name: 'This signing session is not available' }),
    ).toBeVisible();
    unavailableView.unmount();

    const network = createMockApi({
      getSession: vi.fn(async () => {
        throw new SigningRequestError(false, true, false, undefined);
      }),
    });
    render(<SignerApp api={network} now={() => '2026-08-18T00:00:00.000Z'} />);
    expect(await screen.findByRole('heading', { name: 'Connection interrupted' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  it('navigates required fields and keeps the canvas keyboard focusable', async () => {
    const api = createMockApi({
      getFields: vi.fn(async () => ({
        fields: [
          FIELD,
          {
            ...FIELD,
            fieldId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
            type: 'date_signed' as const,
          },
        ],
      })),
    });
    render(<SignerApp api={api} now={() => '2026-08-18T00:00:00.000Z'} />);
    await screen.findByRole('heading', { name: 'Required fields' });
    fireEvent.click(screen.getByRole('button', { name: 'Next field' }));
    expect(screen.getByText(/Field 2 of 2: Date signed/)).toBeInTheDocument();
    expect(screen.getByRole('application', { name: 'Signature' })).toHaveAttribute('tabindex', '0');
  });
});
