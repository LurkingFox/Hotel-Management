import type { Config } from 'tailwindcss'

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        accent: 'var(--color-text-accent)',
        brass: 'var(--brand-brass-500)',
        copper: 'var(--brand-copper-500)',
        ink: 'var(--color-text-primary)',
        inkSoft: 'var(--color-text-secondary)',
        line: {
          strong: 'var(--color-border-strong)',
          subtle: 'var(--color-border-subtle)'
        },
        page: 'var(--color-page-bg)',
        parchment: 'var(--brand-parchment-50)',
        pine: 'var(--brand-pine-700)',
        shell: {
          bg: 'var(--color-shell-bg)',
          elevated: 'var(--color-shell-elevated)'
        },
        status: {
          info: 'var(--color-status-info)',
          'info-soft': 'var(--color-status-info-soft)',
          neutral: 'var(--color-status-neutral)',
          'neutral-soft': 'var(--color-status-neutral-soft)',
          success: 'var(--color-status-success)',
          'success-soft': 'var(--color-status-success-soft)',
          urgent: 'var(--color-status-urgent)',
          'urgent-soft': 'var(--color-status-urgent-soft)',
          warning: 'var(--color-status-warning)',
          'warning-soft': 'var(--color-status-warning-soft)'
        },
        surface: {
          base: 'var(--color-surface-base)',
          raised: 'var(--color-surface-raised)',
          strong: 'var(--color-surface-strong)',
          sunken: 'var(--color-surface-sunken)'
        },
        terracotta: 'var(--brand-copper-500)',
        text: {
          inverse: 'var(--color-text-inverse)',
          muted: 'var(--color-text-muted)',
          secondary: 'var(--color-text-secondary)'
        }
      },
      borderRadius: {
        card: '1.5rem',
        control: '1rem',
        hero: '2rem'
      },
      boxShadow: {
        card: 'var(--shadow-card)',
        'card-strong': 'var(--shadow-card-strong)',
        shell: 'var(--shadow-shell)'
      },
      backgroundImage: {
        'shell-panel': 'radial-gradient(circle at top, rgba(123,200,164,0.28), transparent 38%), linear-gradient(180deg, rgba(15,61,46,0.98) 0%, rgba(21,93,69,1) 100%)',
        'warm-page': 'radial-gradient(circle at top, rgba(123,200,164,0.14), transparent 30%), linear-gradient(180deg, rgba(249,255,252,0.98) 0%, rgba(231,246,238,0.96) 100%)'
      },
      transitionDuration: {
        fast: '140ms',
        standard: '220ms',
        emphasis: '320ms'
      }
    }
  },
  plugins: []
}

export default config