import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],
  base: './',
  
  // 指定 electron/renderer 目录为 Vite 根目录
  root: resolve(__dirname, 'electron/renderer'),
  
  // 静态资源目录
  publicDir: resolve(__dirname, 'electron/renderer/public'),
  
  build: {
    // 构建输出到 electron/build 目录
    outDir: resolve(__dirname, 'electron/build'),
    emptyOutDir: true,
    // 添加优化
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
  },
  
  server: {
    port: 3000
  },
  
  resolve: {
    alias: {
      '@': resolve(__dirname, 'electron/renderer'),
      '@main': resolve(__dirname, 'electron/main')
    }
  }
});