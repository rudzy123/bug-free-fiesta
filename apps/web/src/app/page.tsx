import Link from 'next/link';

export default function HomePage() {
  return (
    <main id="main-content" className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">Electronic signature platform</h1>
      <p className="text-lg text-slate-700">
        Account and signer interfaces for the electronic-signature service. The browser collects
        intent; the API is the source of document truth.
      </p>
      <p className="flex flex-wrap gap-3">
        <Link
          href="/signing"
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          Open signing
        </Link>
        <Link
          href="/health"
          className="inline-flex rounded-md border border-slate-300 bg-white px-4 py-2 hover:bg-slate-100"
        >
          View service health
        </Link>
      </p>
    </main>
  );
}
