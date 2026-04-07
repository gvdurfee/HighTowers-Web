/** @type {import('tailwindcss').Config} */
// CAP ultramarine: CAPR 900-2 uses “OE” for the first byte; standard hex is #0E2B8D.
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cap: {
          ultramarine: '#0E2B8D',
          silver: '#ABABAB',
          pimento: '#DB0029',
          yellow: '#FFD911',
        },
      },
    },
  },
  plugins: [],
}
