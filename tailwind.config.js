/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './index.html',
    './src/**/*.{js,ts,jsx,tsx}',
    './public/preview.html',
    './public/preview.css'
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        sakura: {
          50: '#fdf2f8',
          100: '#fce7f3',
          200: '#fbcfe8',
          300: '#f9a8d4',
          400: '#f472b6',
          500: '#ec4899',
          600: '#db2777',
          700: '#be185d',
          800: '#9d174d',
          900: '#831843',
        },
        // Bolt.new Dark Theme Colors
        bolt: {
          'bg-primary': '#0d1117',
          'bg-secondary': '#161b22',
          'bg-tertiary': '#21262d',
          'bg-elevated': '#1c2128',
          'border': '#30363d',
          'border-subtle': '#21262d',
          'border-hover': '#484f58',
          'text-primary': '#e6edf3',
          'text-secondary': '#7d8590',
          'text-tertiary': '#636e7b',
          'text-muted': '#484f58',
          'accent-blue': '#1f6feb',
          'accent-blue-hover': '#388bfd',
          'success': '#3fb950',
          'warning': '#d29922',
          'error': '#f85149',
          'info': '#58a6ff',
        },
      },
      typography: {
        DEFAULT: {
          css: {
            maxWidth: 'none',
            color: 'inherit',
            a: {
              color: 'inherit',
              textDecoration: 'underline',
              '&:hover': {
                color: 'inherit',
                opacity: 0.8,
              },
            },
            code: {
              color: 'inherit',
              padding: '0.2em 0.4em',
              borderRadius: '0.25rem',
            },
            'code::before': {
              content: '""',
            },
            'code::after': {
              content: '""',
            },
          },
        },
      },
      keyframes: {
        'fade-out': {
          '0%': { opacity: '1' },
          '75%': { opacity: '1' },
          '100%': { opacity: '0' }
        },
        glow: {
          '0%, 100%': {
            boxShadow: '0 0 10px rgba(244, 114, 182, 0.5), 0 0 20px rgba(244, 114, 182, 0.3), 0 0 30px rgba(244, 114, 182, 0.2)'
          },
          '50%': {
            boxShadow: '0 0 15px rgba(244, 114, 182, 0.7), 0 0 25px rgba(244, 114, 182, 0.5), 0 0 35px rgba(244, 114, 182, 0.3)'
          }
        },
        'bounce-gentle': {
          '0%, 100%': { transform: 'translateY(-5%)' },
          '50%': { transform: 'translateY(5%)' },
        },
        shimmer: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(100%)' }
        },
        'bolt-fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'bolt-slide-in-up': {
          from: {
            transform: 'translateY(10px)',
            opacity: '0',
          },
          to: {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
        'bolt-slide-in-down': {
          from: {
            transform: 'translateY(-10px)',
            opacity: '0',
          },
          to: {
            transform: 'translateY(0)',
            opacity: '1',
          },
        },
      },
      animation: {
        'fade-out': 'fade-out 3s ease-out forwards',
        'glow': 'glow 2s ease-in-out infinite',
        'bounce-gentle': 'bounce-gentle 2s ease-in-out infinite',
        'shimmer': 'shimmer 2s ease-in-out infinite',
        'bolt-fade-in': 'bolt-fade-in 0.2s ease-out',
        'bolt-slide-up': 'bolt-slide-in-up 0.3s ease-out',
        'bolt-slide-down': 'bolt-slide-in-down 0.3s ease-out',
      },
      fontFamily: {
        sans: ['Quicksand', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [
    require('@tailwindcss/typography'),
  ],
};