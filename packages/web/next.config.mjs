import path from 'node:path';
import { fileURLToPath } from 'node:url';

const isDev = process.env.NODE_ENV !== 'production';

// Token images come from attacker-chosen hosts, so they load in the viewer's browser
// with no referrer. They never pass through the server: the image optimizer stays
// off, which also removes it as a way to make this server fetch arbitrary URLs.
const contentSecurityPolicy = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' https: data:",
    "font-src 'self'",
    `connect-src 'self'${isDev ? ' ws:' : ''}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ['upgrade-insecure-requests'])
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    poweredByHeader: false,
    images: { unoptimized: true },
    serverExternalPackages: ['pg'],
    turbopack: { root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..') },
    async headers() {
        return [{
            source: '/:path*',
            headers: [
                { key: 'Content-Security-Policy', value: contentSecurityPolicy },
                { key: 'Referrer-Policy', value: 'no-referrer' },
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
                { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }
            ]
        }];
    }
};

export default nextConfig;
