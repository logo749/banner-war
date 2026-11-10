import { defineConfig } from 'vite';

// GitHub Pages 部署在 /<repo>/ 子路径下，用相对路径即可，不必写死仓库名。
export default defineConfig({
  base: './',
  build: {
    target: 'es2020',
    assetsInlineLimit: 0
  }
});
