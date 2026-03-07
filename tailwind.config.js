/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0a0a0a',
        card: '#141414',
        border: '#2a2a2a',
        accent: '#e10600',
        text: '#e5e5e5',
        muted: '#9ca3af',
        hover: '#1f1f1f',
      },
    },
  },
  plugins: [],
}
