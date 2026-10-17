/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        paper: '#EDF0F5',
        plate: '#FFFFFF',
        ink: '#0A0F1E',
        ink2: '#3A4256',
        ink3: '#69728A',
        steel: '#C7CEDA',
        steel2: '#E0E5EE',
        rope: '#2A3BFF',
        'rope-deep': '#1B28C9',
        'rope-wash': '#E5E8FF',
        tension: '#FF5A1F',
        'tension-wash': '#FFE8DD',
        slack: '#0B8F63',
        'slack-wash': '#D9F3E8',
        stop: '#D12B20',
        'stop-wash': '#FDE3E1',
      },
      fontFamily: {
        display: ['Archivo Variable', 'Archivo', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        body: ['Instrument Sans Variable', 'Instrument Sans', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        mono: ['IBM Plex Mono', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'Consolas', 'monospace'],
      },
      fontStretch: {
        '112': '112%',
        '118': '118%',
        '125': '125%',
      },
    },
  },
  plugins: [],
}

