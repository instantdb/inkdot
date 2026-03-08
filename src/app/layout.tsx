import type { Metadata } from 'next';
import { Archivo, Kanit } from 'next/font/google';
import { getUnverifiedUserFromInstantCookie } from '@instantdb/react/nextjs';
import { InstantProvider } from './InstantProvider';
import { ThemeProvider } from './ThemeProvider';
import Script from 'next/script';
import './globals.css';

const fArchivo = Archivo({ variable: '--font-archivo', subsets: ['latin'] });
const fKanit = Kanit({
  variable: '--font-kanit',
  subsets: ['latin'],
  weight: ['700'],
});

const allFontVars = [fArchivo, fKanit].map((f) => f.variable).join(' ');

export const metadata: Metadata = {
  title: 'InkDot',
  description: 'Draw, stream, and replay tiny sketches. Powered by InstantDB.',
  openGraph: {
    title: 'InkDot',
    description:
      'Draw, stream, and replay tiny sketches. Powered by InstantDB.',
    siteName: 'InkDot',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'InkDot',
    description:
      'Draw, stream, and replay tiny sketches. Powered by InstantDB.',
  },
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
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script src="/theme-init.js" strategy="beforeInteractive" />
      </head>
      <body className={`${allFontVars} antialiased`}>
        <InstantProvider user={user ?? undefined}>
          <ThemeProvider>{children}</ThemeProvider>
        </InstantProvider>
      </body>
    </html>
  );
}
