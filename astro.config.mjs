import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import gitCms from '@malihub/git-headless-cms-astro';

export default defineConfig({
  output: 'hybrid',
  adapter: node({
    mode: 'standalone'
  }),
  integrations: [tailwind(), gitCms()],
  vite: {
    envDir: '../'
  }
});

