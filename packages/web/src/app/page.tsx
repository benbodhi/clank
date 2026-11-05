import { Feed } from '@/components/Feed';
import { Header } from '@/components/Header';
import { listLaunches } from '@/lib/launches';
import type { LaunchPage } from '@/lib/types';

export const dynamic = 'force-dynamic';

async function loadFirstPage(): Promise<LaunchPage | null> {
    try {
        return await listLaunches({ filter: 'identified', limit: 30 });
    } catch (error) {
        console.error(`First page failed: ${(error as NodeJS.ErrnoException).code ?? 'unknown'}`);
        return null;
    }
}

export default async function HomePage() {
    const initial = await loadFirstPage();
    return (
        <main className="mx-auto max-w-6xl px-4 pb-16 pt-6">
            <Header />
            <Feed initial={initial} />
        </main>
    );
}
