import { defineConfig } from 'vite';

// GitHub Pages는 /astraea-vale/ 하위 경로로 서비스되므로 상대 경로로 빌드한다.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
