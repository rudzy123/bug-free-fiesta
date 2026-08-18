import {
  ConflictError,
  type AuthorizationPolicy,
  type Clock,
  type ConsentDisclosureCatalog,
  type ConsentRecordRepository,
  type DocumentRevisionRepository,
  type IdGenerator,
  type PreviewGrantRepository,
  type SignatureFieldRepository,
  type SigningTokenGenerator,
  type SigningTokenHasher,
} from '@esign/domain';
import { PDF_CONTENT_TYPE } from '../documents/pdf.js';
import type { LoadSignerSession } from './load-signer-session.js';

export type SignerSessionView = {
  readonly documentId: string;
  readonly signerId: string;
  readonly sessionId: string;
  readonly sessionStatus: 'issued' | 'active';
  readonly title: string;
  readonly signingMode: 'ordered' | 'parallel';
  readonly expiresAt: string;
  readonly signerDisplayName: string;
  readonly signerStatus: string;
  readonly consentRequired: boolean;
  readonly consented: boolean;
};

export type SignerDocumentView = {
  readonly documentId: string;
  readonly title: string;
  readonly signingMode: 'ordered' | 'parallel';
  readonly pageCount: number | null;
  readonly signerDisplayName: string;
};

export type SignerFieldView = {
  readonly fieldId: string;
  readonly type: string;
  readonly pageNumber: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly required: boolean;
};

export type SignerPreviewView = {
  readonly url: string;
  readonly expiresAt: string;
  readonly tokenHeader: string;
  readonly token: string;
  readonly contentType: string;
};

export function createGetSignerSession(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  consent: ConsentRecordRepository;
  catalog: ConsentDisclosureCatalog;
}) {
  return async function getSignerSession(input: {
    rawToken: string;
    accountUserId?: string | null;
  }): Promise<SignerSessionView> {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });
    const existing = await deps.consent.findBySession({
      organizationId: loaded.actor.organizationId,
      sessionId: loaded.session.id,
    });
    return {
      documentId: loaded.document.id,
      signerId: loaded.signer.id,
      sessionId: loaded.session.id,
      sessionStatus: loaded.session.status === 'active' ? 'active' : 'issued',
      title: loaded.document.title,
      signingMode: loaded.document.signingMode,
      expiresAt: loaded.session.expiresAt.toISOString(),
      signerDisplayName: loaded.signer.displayName,
      signerStatus: loaded.signer.status,
      consentRequired: true,
      consented: existing !== null,
    };
  };
}

export type GetSignerSession = ReturnType<typeof createGetSignerSession>;

export function createGetSignerDocument(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  revisions: DocumentRevisionRepository;
}) {
  return async function getSignerDocument(input: {
    rawToken: string;
    accountUserId?: string | null;
  }): Promise<SignerDocumentView> {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });
    const revisionId = loaded.document.signingRevisionId ?? loaded.document.currentRevisionId;
    const revision =
      revisionId === null
        ? null
        : await deps.revisions.findById({
            organizationId: loaded.actor.organizationId,
            revisionId,
          });
    return {
      documentId: loaded.document.id,
      title: loaded.document.title,
      signingMode: loaded.document.signingMode,
      pageCount: revision?.pageCount ?? null,
      signerDisplayName: loaded.signer.displayName,
    };
  };
}

export type GetSignerDocument = ReturnType<typeof createGetSignerDocument>;

export function createGetSignerFields(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  fields: SignatureFieldRepository;
}) {
  return async function getSignerFields(input: {
    rawToken: string;
    accountUserId?: string | null;
  }): Promise<readonly SignerFieldView[]> {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });
    const fields = await deps.fields.listByDocument({
      organizationId: loaded.actor.organizationId,
      documentId: loaded.document.id,
    });
    return fields
      .filter((field) => field.signerId === loaded.signer.id)
      .map((field) => ({
        fieldId: field.id,
        type: field.type,
        pageNumber: field.pageNumber,
        x: field.x,
        y: field.y,
        width: field.width,
        height: field.height,
        required: field.required,
      }));
  };
}

export type GetSignerFields = ReturnType<typeof createGetSignerFields>;

export function createGetSignerConsent(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  catalog: ConsentDisclosureCatalog;
  consent: ConsentRecordRepository;
}) {
  return async function getSignerConsent(input: {
    rawToken: string;
    accountUserId?: string | null;
  }) {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });
    const disclosure = deps.catalog.current();
    const existing = await deps.consent.findBySession({
      organizationId: loaded.actor.organizationId,
      sessionId: loaded.session.id,
    });
    return {
      copyId: disclosure.copyId,
      version: disclosure.version,
      title: disclosure.title,
      text: disclosure.text,
      required: true,
      accepted: existing !== null,
    };
  };
}

export type GetSignerConsent = ReturnType<typeof createGetSignerConsent>;

export function createIssueSignerPreview(deps: {
  loadSession: LoadSignerSession;
  authorization: AuthorizationPolicy;
  revisions: DocumentRevisionRepository;
  previewGrants: PreviewGrantRepository;
  tokens: SigningTokenGenerator;
  hasher: SigningTokenHasher;
  ids: IdGenerator;
  clock: Clock;
  previewTtlMs: number;
  previewTokenHeader: string;
}) {
  return async function issueSignerPreview(input: {
    rawToken: string;
    accountUserId?: string | null;
  }): Promise<SignerPreviewView> {
    const loaded = await deps.loadSession({
      rawToken: input.rawToken,
      requireExchanged: true,
      accountUserId: input.accountUserId,
    });
    deps.authorization.assertAllowed(loaded.actor, 'signing.session.act', {
      organizationId: loaded.actor.organizationId,
      documentId: loaded.actor.documentId,
      signerId: loaded.actor.signerId,
    });
    const revisionId = loaded.document.signingRevisionId ?? loaded.document.currentRevisionId;
    if (revisionId === null) {
      throw new ConflictError({ reason: 'missing_revision' });
    }
    const revision = await deps.revisions.findById({
      organizationId: loaded.actor.organizationId,
      revisionId,
    });
    if (!revision) {
      throw new ConflictError({ reason: 'missing_revision' });
    }
    const now = deps.clock.nowUtc();
    const rawPreviewToken = deps.tokens.generateRawToken();
    const grant = await deps.previewGrants.create({
      organizationId: loaded.actor.organizationId,
      grant: {
        id: deps.ids.next(),
        organizationId: loaded.actor.organizationId,
        documentId: loaded.document.id,
        revisionId: revision.id,
        tokenHash: deps.hasher.hash(rawPreviewToken),
        expiresAt: new Date(now.getTime() + deps.previewTtlMs),
        createdAt: now,
      },
    });
    return {
      url: `/document-previews/${grant.id}`,
      expiresAt: grant.expiresAt.toISOString(),
      tokenHeader: deps.previewTokenHeader,
      token: rawPreviewToken,
      contentType: PDF_CONTENT_TYPE,
    };
  };
}

export type IssueSignerPreview = ReturnType<typeof createIssueSignerPreview>;
