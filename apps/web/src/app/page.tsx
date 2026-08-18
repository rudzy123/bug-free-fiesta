import Link from 'next/link';

export default function HomePage() {
  return (
    <main id="main-content" className="mx-auto flex max-w-2xl flex-col gap-6 px-6 py-16">
      <h1 className="text-3xl font-semibold">Electronic signature platform</h1>
      <p className="text-lg text-slate-700">
        This application is a presentation shell. Signing workflows are not implemented yet.
      </p>
      <p>
        <Link
          href="/health"
          className="inline-flex rounded-md bg-slate-900 px-4 py-2 text-white hover:bg-slate-800"
        >
          View service health
        </Link>
      </p>
    </main>
  );
}
