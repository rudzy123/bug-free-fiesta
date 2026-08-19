'use client';

import type { SignerField } from './signing-api';

type FieldNavigatorProps = {
  readonly fields: readonly SignerField[];
  readonly currentIndex: number;
  readonly onCurrentIndexChange: (index: number) => void;
};

export function FieldNavigator({
  fields,
  currentIndex,
  onCurrentIndexChange,
}: FieldNavigatorProps) {
  const current = fields[currentIndex];
  const pages = [...new Set(fields.map((field) => field.pageNumber))].sort((a, b) => a - b);
  const page = current?.pageNumber ?? pages[0] ?? 1;

  return (
    <section aria-labelledby="fields-heading" className="flex flex-col gap-3">
      <h2 id="fields-heading" className="text-lg font-semibold">
        Required fields
      </h2>
      {current === undefined ? (
        <p>No fields are assigned to you.</p>
      ) : (
        <p>
          Field {currentIndex + 1} of {fields.length}: {fieldLabel(current)} on page{' '}
          {current.pageNumber}.
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1 text-sm"
          disabled={currentIndex <= 0}
          onClick={() => onCurrentIndexChange(Math.max(0, currentIndex - 1))}
        >
          Previous field
        </button>
        <button
          type="button"
          className="rounded border border-slate-300 bg-white px-3 py-1 text-sm"
          disabled={currentIndex >= fields.length - 1}
          onClick={() => onCurrentIndexChange(Math.min(fields.length - 1, currentIndex + 1))}
        >
          Next field
        </button>
      </div>
      <div
        className="relative aspect-[8.5/11] w-full max-w-md rounded border border-slate-200 bg-white"
        aria-hidden={fields.length === 0}
      >
        <p className="sr-only">Page {page} field map for orientation only.</p>
        {fields
          .filter((field) => field.pageNumber === page)
          .map((field) => {
            const selected = field.fieldId === current?.fieldId;
            return (
              <button
                key={field.fieldId}
                type="button"
                className={`absolute rounded border text-left text-xs ${
                  selected ? 'border-slate-900 bg-slate-900/10' : 'border-slate-400 bg-slate-100/80'
                }`}
                style={{
                  left: `${field.x * 100}%`,
                  top: `${field.y * 100}%`,
                  width: `${field.width * 100}%`,
                  height: `${field.height * 100}%`,
                }}
                aria-current={selected ? 'true' : undefined}
                aria-label={`${fieldLabel(field)} on page ${field.pageNumber}`}
                onClick={() => {
                  const index = fields.findIndex(
                    (candidate) => candidate.fieldId === field.fieldId,
                  );
                  if (index >= 0) {
                    onCurrentIndexChange(index);
                  }
                }}
              >
                <span className="block truncate px-1 py-0.5">{fieldLabel(field)}</span>
              </button>
            );
          })}
      </div>
      <ol className="list-decimal pl-5 text-sm">
        {fields.map((field, index) => (
          <li key={field.fieldId}>
            <button type="button" className="underline" onClick={() => onCurrentIndexChange(index)}>
              {fieldLabel(field)} (page {field.pageNumber})
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function fieldLabel(field: SignerField): string {
  switch (field.type) {
    case 'signature':
      return 'Signature';
    case 'initials':
      return 'Initials';
    case 'date_signed':
      return 'Date signed';
    case 'signer_name':
      return 'Name';
    default:
      return 'Field';
  }
}
