import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 静态站点：用相对路径，方便直接丢到任意子目录/文件服务器
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsDir: 'assets',
    sourcemap: false,
  },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
