import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import { getUnverifiedUserFromInstantCookie } from '@instantdb/react/nextjs';
import { InstantProvider } from './InstantProvider';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'InkDot',
  description: 'Draw, stream, and replay tiny sketches.',
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const user = await getUnverifiedUserFromInstantCookie(
    process.env.NEXT_PUBLIC_INSTANT_APP_ID!,
  );

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <InstantProvider user={user ?? undefined}>{children}</InstantProvider>
      </body>
    </html>
  );
}
