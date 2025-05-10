import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  
  // 指定 electron 目录为 Vite 根目录
  root: resolve(__dirname, 'electron'),
  
  // 静态资源目录
  publicDir: resolve(__dirname, 'electron/public'),
  
  build: {
    // 构建输出到 electron/build 目录
    outDir: resolve(__dirname, 'electron/build'),
    emptyOutDir: true,
  },
  
  server: {
    port: 3000
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'electron/src/renderer'),
      '@main': resolve(__dirname, 'electron/src/main')
    }
  }
});