import { loadWebConfig } from '@esign/config';

export default function HealthPage() {
  const config = loadWebConfig();

  return (
    <main id="main-content" className="mx-auto flex max-w-2xl flex-col gap-4 px-6 py-16">
      <h1 className="text-3xl font-semibold">Web health</h1>
      <p role="status" aria-live="polite" className="text-lg">
        The web application is running.
      </p>
      <p className="text-slate-700">
        API base URL is configured. The browser is not the source of truth for document state.
      </p>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="font-medium">Service</dt>
          <dd>web</dd>
        </div>
        <div>
          <dt className="font-medium">API base URL</dt>
          <dd>{config.NEXT_PUBLIC_API_BASE_URL}</dd>
        </div>
      </dl>
    </main>
  );
}
