import { defineConfig } from 'vitest/config';

export default defineConfig({
  // 静态站点：用相对路径，方便直接丢到任意子目录/文件服务器
  base: './',
  // 端口固定：`scripts/selftest-*.mjs` 都按这个地址访问，自动 +1 会让自测打到空端口
  server: { port: 5171, strictPort: true },
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
