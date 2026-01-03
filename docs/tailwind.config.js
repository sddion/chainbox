/** @type {import('tailwindcss').Config} */
module.exports = {
    content: ["./index.html"],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Inter', 'sans-serif'],
                mono: ['JetBrains Mono', 'monospace'],
            },
            colors: {
                bg: '#0f1115',
                'bg-alt': '#16181d',
                brand: {
                    light: '#60a5fa',
                    DEFAULT: '#3b82f6',
                    dark: '#2563eb',
                }
            },
            backgroundImage: {
                'hero-gradient': 'linear-gradient(135deg, #1e293b 0%, #0f1115 100%)',
                'mesh': 'radial-gradient(circle at 50% 50%, rgba(59, 130, 246, 0.1) 0%, transparent 50%)',
            }
        },
    },
    plugins: [],
}
