import { Suspense } from 'react';
import { SignerApp } from '../../signing/SignerApp';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function SigningPage() {
  return (
    <Suspense
      fallback={
        <main id="main-content" className="mx-auto max-w-3xl px-4 py-10">
          <p role="status">Loading the signing session.</p>
        </main>
      }
    >
      <SignerApp />
    </Suspense>
  );
}
