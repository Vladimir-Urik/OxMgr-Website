import typography from '@tailwindcss/typography';

/** @type {import('tailwindcss').Config} */
export default {
	content: ['./src/**/*.{html,js,svelte,ts}'],
	theme: {
		extend: {
			colors: {
				rust: {
					DEFAULT: '#E8572A',
					dim: '#c94820',
					glow: 'rgba(232,87,42,0.15)'
				},
				forest: '#1a3d2b'
			},
			fontFamily: {
				mono: ['"Space Mono"', 'ui-monospace', 'monospace'],
				display: ['"Space Grotesk"', 'sans-serif'],
				sans: ['"Figtree"', 'system-ui', 'sans-serif']
			},
			animation: {
				'fade-in': 'fadeIn 0.4s ease forwards',
				blink: 'blink 1.06s step-end infinite',
				'reveal-up': 'revealUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) both',
				'count-in': 'countIn 0.6s cubic-bezier(0.16, 1, 0.3, 1) both'
			},
			keyframes: {
				fadeIn: {
					from: { opacity: '0', transform: 'translateY(6px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				blink: {
					'0%, 100%': { opacity: '1' },
					'50%': { opacity: '0' }
				},
				revealUp: {
					from: { opacity: '0', transform: 'translateY(12px)' },
					to: { opacity: '1', transform: 'translateY(0)' }
				},
				countIn: {
					from: { opacity: '0', transform: 'translateY(8px) scale(0.95)' },
					to: { opacity: '1', transform: 'translateY(0) scale(1)' }
				}
			}
		}
	},
	plugins: [typography]
};
