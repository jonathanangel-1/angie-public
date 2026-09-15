import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Angie — Public Demo',
  description: 'Personal styling and learning with entirely fictional profile and purchase records.',
  icons: { icon: '/favicon.svg' },
  openGraph: {
    title: 'Angie — Public Demo',
    description: 'Explore recommendation, fit evidence, and feedback with synthetic data.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Angie — Public Demo',
    description: 'Explore recommendation, fit evidence, and feedback with synthetic data.',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body><div style={{ padding: "10px 20px", background: "#e8eee9", color: "#20352a", fontSize: 13 }}>Public edition · All profile, purchase, and catalog data is fictional.</div>{children}</body>
    </html>
  );
}
