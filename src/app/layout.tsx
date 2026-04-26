import type { Metadata, Viewport } from 'next';
import { Instrument_Serif, Space_Mono, IBM_Plex_Mono, Inter } from 'next/font/google';
import DevProdBanner from '@/app/components/DevProdBanner';
import DevUserSwitcher from '@/app/components/DevUserSwitcher';
import UpdateBanner from '@/app/components/UpdateBanner';
import Grain from '@/app/components/Grain';
import ThemeHydrator from '@/app/components/ThemeHydrator';
import NativeStatusBar from '@/app/components/NativeStatusBar';

import './global.css';
import './animations.css';

// Fonts loaded here are referenced by the theme system in src/lib/themes/.
// Inter + IBM Plex Mono → guava (default). Instrument Serif + Space Mono →
// dragonfruit. next/font/google self-hosts at build time, so no Google Fonts
// <link> is needed at runtime.
const instrumentSerif = Instrument_Serif({
  weight: '400',
  variable: '--font-instrument-serif',
  subsets: ['latin'],
});
const spaceMono = Space_Mono({
  weight: ['400', '700'],
  variable: '--font-space-mono',
  subsets: ['latin'],
});
const ibmPlexMono = IBM_Plex_Mono({
  weight: ['200', '300', '400', '500', '600', '700'],
  variable: '--font-ibm-plex-mono',
  subsets: ['latin'],
});
const inter = Inter({
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  subsets: ['latin'],
});

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover' as const,
};

export const metadata: Metadata = {
  title: 'downto',
  description: "Save events. See who's going.",
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'downto',
  },
  openGraph: {
    title: 'downto',
    description: "Save events. See who's going.",
    siteName: 'downto.xyz',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${spaceMono.variable} ${ibmPlexMono.variable} ${inter.variable}`}
    >
      <head>
        <meta name="theme-color" content="#FCFFE2" />
        <link rel="apple-touch-icon" href="/icons/icon-192.png" />
        <style>{`
          input, textarea, select { font-size: 16px !important; }
        `}</style>
      </head>
      <body className="flex min-h-screen justify-center bg-bg font-mono text-[#6B6B5A] antialiased">
        <ThemeHydrator />
        <NativeStatusBar />
        <Grain />
        <DevProdBanner />
        <UpdateBanner />
        <div className="mx-auto flex w-full max-w-105 flex-col">
          {children}
        </div>
        {process.env.NODE_ENV === 'development' && <DevUserSwitcher />}
      </body>
    </html>
  );
}
