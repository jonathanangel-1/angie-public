import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Angie',
  description: 'Find clothes that look like your inspiration and fit you, with a size per item that learns from what you keep and return.',
  icons: { icon: '/favicon.svg' },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
