import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Header } from '@/components/Header';
import { TokenDetail } from '@/components/TokenDetail';
import { chainByKey } from '@/lib/chains';
import { getLaunch } from '@/lib/launches';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ chain: string; address: string }> };

async function load(params: Props['params']) {
    const { chain: key, address } = await params;
    const chain = chainByKey(key);
    return chain ? getLaunch(chain.id, address) : null;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
    const launch = await load(params).catch(() => null);
    return { title: launch ? `${launch.name} ($${launch.symbol}) · Clank` : 'Token · Clank' };
}

export default async function TokenPage({ params }: Props) {
    const launch = await load(params);
    if (!launch) notFound();

    return (
        <main className="mx-auto max-w-3xl px-4 pb-16 pt-6">
            <Header />
            <Link href="/" className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
                <ArrowLeft className="h-4 w-4" aria-hidden /> All launches
            </Link>
            <TokenDetail launch={launch} />
        </main>
    );
}
