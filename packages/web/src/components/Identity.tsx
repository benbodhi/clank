import { AlertTriangle, BadgeCheck, UserRound } from 'lucide-react';
import { compactNumber } from '@/lib/format';
import { farcasterUrl, xUrl } from '@/lib/links';
import type { Launch } from '@/lib/types';

function Followers({ count }: { count: number | null }) {
    if (count === null) return null;
    return <span className="text-muted-foreground">· {compactNumber(count)} followers</span>;
}

const linkClass = 'truncate font-medium underline-offset-2 hover:underline';

/** One line saying who's behind a launch, and how much that claim can be trusted. */
export function Identity({ launch }: { launch: Launch }) {
    const { identityKind: kind, identityVerified: verified, fid, farcasterUsername, followerCount, xHandle } = launch;

    if (kind === 'farcaster' && verified && fid) {
        return (
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-proven">
                <BadgeCheck className="h-4 w-4 shrink-0" aria-label="Proven" />
                <a href={farcasterUrl(fid)} target="_blank" rel="noopener noreferrer" className={linkClass}>
                    {farcasterUsername ? `@${farcasterUsername}` : `FID ${fid}`}
                </a>
                <span className="text-muted-foreground">· FID {fid.toLocaleString('en-US')}</span>
                <Followers count={followerCount} />
            </p>
        );
    }
    if (kind === 'x' && xHandle) {
        const Icon = verified ? BadgeCheck : AlertTriangle;
        return (
            <p className={`flex min-w-0 items-center gap-1.5 text-sm ${verified ? 'text-proven' : 'text-caution'}`}>
                <Icon className="h-4 w-4 shrink-0" aria-label={verified ? 'Vetted' : 'Unverified'} />
                <a href={xUrl(xHandle)} target="_blank" rel="noopener noreferrer" className={linkClass}>@{xHandle} on X</a>
                {!verified && <span>· unverified</span>}
            </p>
        );
    }
    if (kind === 'linked' && fid) {
        return (
            <p className="flex min-w-0 flex-wrap items-center gap-x-1.5 text-sm text-caution">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-label="Unproven" />
                <span>
                    {launch.linkedRole} is{' '}
                    <a href={farcasterUrl(fid)} target="_blank" rel="noopener noreferrer" className="font-medium underline underline-offset-2">
                        {farcasterUsername ? `@${farcasterUsername}` : `FID ${fid}`}
                    </a>
                    , not the deployer
                </span>
            </p>
        );
    }
    if (kind === 'farcaster' && fid) {
        return (
            <p className="flex items-center gap-1.5 text-sm text-caution">
                <AlertTriangle className="h-4 w-4 shrink-0" aria-label="Unverified" />
                Claims FID {fid.toLocaleString('en-US')} · unverified
            </p>
        );
    }
    return (
        <p className="flex min-w-0 items-center gap-1.5 text-sm text-muted-foreground">
            <UserRound className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{launch.deployerName ?? 'Anonymous deployer'}</span>
        </p>
    );
}
