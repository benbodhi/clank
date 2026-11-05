import Link from 'next/link';

export default function NotFound() {
    return (
        <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-3 px-4 text-center">
            <h1 className="text-xl font-semibold">Token not found</h1>
            <p className="text-sm text-muted-foreground">
                Clank only knows launches recorded since it started tracking.
            </p>
            <Link href="/" className="text-sm font-medium text-primary underline underline-offset-4">Back to the feed</Link>
        </main>
    );
}
