'use client';

type DocumentPreviewProps = {
  readonly title: string;
  readonly blobUrl: string | undefined;
  readonly onRetry: () => void;
  readonly previewFailed: boolean;
};

export function DocumentPreview({ title, blobUrl, onRetry, previewFailed }: DocumentPreviewProps) {
  return (
    <section aria-labelledby="preview-heading" className="flex flex-col gap-2">
      <h2 id="preview-heading" className="text-lg font-semibold">
        Document preview
      </h2>
      <p className="text-sm text-slate-600">
        This preview is read-only. The server owns final placement of signature fields.
      </p>
      {previewFailed ? (
        <div className="rounded border border-amber-300 bg-amber-50 p-4">
          <p role="alert">The document preview could not be loaded.</p>
          <button
            type="button"
            className="mt-2 rounded bg-slate-900 px-3 py-1 text-sm text-white"
            onClick={onRetry}
          >
            Retry preview
          </button>
        </div>
      ) : null}
      {blobUrl !== undefined ? (
        <iframe
          title={`${title} preview`}
          src={blobUrl}
          referrerPolicy="no-referrer"
          className="h-[50vh] min-h-64 w-full rounded border border-slate-300 bg-white md:h-[60vh]"
        />
      ) : !previewFailed ? (
        <p role="status">Preparing a secure preview.</p>
      ) : null}
    </section>
  );
}
