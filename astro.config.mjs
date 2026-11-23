const site = "https://malijob.ml";

import { defineConfig } from 'astro/config';
import tailwind from '@astrojs/tailwind';
import node from '@astrojs/node';
import gitCms from '@malihub/git-headless-cms-astro';

export default defineConfig({
  site: site,
  output: 'hybrid',
  adapter: node({
    mode: 'standalone'
  }),
  integrations: [tailwind(), gitCms()],
  vite: {
    envDir: '../',
    server: {
      watch: {
        ignored: ['**/inspiration/**', '**/.git/**', '**/dist/**']
      }
    }
  }
});