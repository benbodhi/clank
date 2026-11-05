import Link from 'next/link';
import { ThemeToggle } from './ThemeToggle';

export function Header() {
    return (
        <header className="mb-6 flex items-center justify-between gap-4">
            <Link href="/" className="flex items-center gap-3 rounded-md">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/icon.svg" alt="" width={36} height={36} className="h-9 w-9" />
                <span>
                    <span className="block text-xl font-bold leading-tight tracking-tight">Clank</span>
                    <span className="block text-xs text-muted-foreground">Clanker launches on Base, live</span>
                </span>
            </Link>
            <ThemeToggle />
        </header>
    );
}
