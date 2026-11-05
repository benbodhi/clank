import type { Config } from 'tailwindcss';

const token = (name: string) => `hsl(var(--${name}) / <alpha-value>)`;

const config: Config = {
    darkMode: ['class'],
    content: ['./src/**/*.{ts,tsx}'],
    theme: {
        extend: {
            colors: {
                border: token('border'),
                background: token('background'),
                foreground: token('foreground'),
                card: token('card'),
                muted: { DEFAULT: token('muted'), foreground: token('muted-foreground') },
                primary: { DEFAULT: token('primary'), foreground: token('primary-foreground') },
                proven: token('proven'),
                caution: token('caution'),
                danger: token('danger')
            },
            borderRadius: { lg: '0.625rem', md: '0.5rem', sm: '0.375rem' },
            keyframes: {
                'launch-in': {
                    from: { opacity: '0', transform: 'translateY(-6px)' },
                    to: { opacity: '1', transform: 'translateY(0)' }
                }
            },
            animation: { 'launch-in': 'launch-in 240ms ease-out' }
        }
    }
};

export default config;
