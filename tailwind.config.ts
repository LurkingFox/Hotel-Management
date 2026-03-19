import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        brass: '#a97c50',
        ink: '#11202f',
        parchment: '#f7f1e8',
        pine: '#29443a',
        terracotta: '#bb6d4a'
      },
      boxShadow: {
        card: '0 22px 50px -24px rgba(17, 32, 47, 0.45)'
      }
    }
  },
  plugins: []
}

export default config