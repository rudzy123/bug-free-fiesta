import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export const metadata: Metadata = {
  title: 'Sign document',
  referrer: 'no-referrer',
  robots: { index: false, follow: false },
};

type SigningLayoutProps = {
  children: ReactNode;
};

export default function SigningLayout({ children }: SigningLayoutProps) {
  return children;
}
