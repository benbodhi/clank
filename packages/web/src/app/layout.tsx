import type { Metadata, Viewport } from 'next';
import { Providers } from './providers';
import './globals.css';

export const metadata: Metadata = {
    title: 'Clank',
    description: 'Clanker token launches on Base as they happen, with who is behind them and quick ways to vet and trade.',
    referrer: 'no-referrer',
    openGraph: {
        title: 'Clank',
        description: 'Clanker token launches on Base as they happen.'
    }
};

export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: [
        { media: '(prefers-color-scheme: light)', color: '#f9f8f5' },
        { media: '(prefers-color-scheme: dark)', color: '#0f1115' }
    ]
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <body className="font-sans">
                <Providers>{children}</Providers>
            </body>
        </html>
    );
}
