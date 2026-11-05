'use client';

import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
    const { resolvedTheme, setTheme } = useTheme();
    return (
        <button
            type="button"
            aria-label="Toggle light or dark theme"
            onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
            className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border bg-card text-muted-foreground hover:text-foreground"
        >
            <Sun className="h-4 w-4 dark:hidden" aria-hidden />
            <Moon className="hidden h-4 w-4 dark:block" aria-hidden />
        </button>
    );
}
