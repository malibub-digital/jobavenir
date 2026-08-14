/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    '../packages/core/src/**/*.{astro,html,js,jsx,md,mdx,svelte,ts,tsx,vue}',
    './node_modules/@malihub/sites-core/src/**/*.{astro,html,js,ts}'
  ],
  theme: {
    extend: {
      colors: {
        mali: {
          green: '#0F8A3A',
          gold: '#F5C518',
          red: '#CE2029'
        }
      }
    },
  },
  plugins: [],
};
