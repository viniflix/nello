// tailwind.config.js
const { fontFamily } = require('tailwindcss/defaultTheme')
const colors = require('tailwindcss/colors')

/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: ['class'],
  content: [
    './pages/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
    './app/**/*.{js,jsx}',
    './src/**/*.{js,jsx}',
  ],
  prefix: '',
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: {
        '2xl': '1400px',
      },
    },
    extend: {
      colors: {
        // --- NOSSAS NOVAS CORES ---

        // Cor Neutra (para "CLEAN" e "calmo")
        neutral: colors.stone,

        // Cor Primária (Verde "Clínico" e "Saúde")
        primary: {
          50: '#F0F6EE',
          100: '#E1EDDD',
          200: '#C3DBBB',
          300: '#A4C999',
          400: '#86B777',
          500: '#68A555',
          DEFAULT: '#528540', // Nosso Verde Principal
          600: '#528540',
          700: '#416A33',
          800: '#314F26',
          900: '#20351A',
          foreground: colors.white, // Texto para botões com fundo primary
        },

        // Cor Secundária (Laranja "Energético" e "Humano")
        secondary: {
          50: '#FEF4EC',
          100: '#FDE9D9',
          200: '#FBD2B2',
          300: '#F9BB8B',
          400: '#F7A464',
          500: '#F48D3D',
          DEFAULT: '#F27507', // Nosso Laranja Principal
          600: '#F27507',
          700: '#C25E06',
          800: '#914604',
          900: '#612F03',
          foreground: colors.white, // Texto para botões com fundo secondary
        },

        // Cores Semânticas
        destructive: {
          DEFAULT: colors.red[600],
          foreground: colors.white,
        },
        success: {
          DEFAULT: colors.green[600],
          foreground: colors.white,
        },
        warning: {
          DEFAULT: colors.amber[500],
          foreground: colors.black,
        },

        // --- Variáveis CSS (Shadcn) ---
        // Estas agora apontam para nossas variáveis em index.css
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      fontFamily: {
        sans: ['Inter', ...fontFamily.sans],
        heading: ['ClashDisplay', ...fontFamily.sans],
      },
      boxShadow: {
        // Sombra LEVE para cards brancos
        card: '0px 2px 8px -1px rgba(0, 0, 0, 0.05), 0px 4px 12px -4px rgba(0, 0, 0, 0.05)',
        // Sombra ESCURA para cards coloridos
        'card-dark': '0px 4px 6px -1px rgba(0, 0, 0, 0.15), 0px 8px 16px -4px rgba(0, 0, 0, 0.2)',
        input: '0px 1px 2px 0px rgba(0, 0, 0, 0.05)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [require('tailwindcss-animate')],
}
