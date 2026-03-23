/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cap: {
          ultramarine: '#001489',
          silver: '#9EA2A2',
          scarlet: '#BA0C2F',
          yellow: '#FFCD00',
        },
      },
    },
  },
  plugins: [],
}
