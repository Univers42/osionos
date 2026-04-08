import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const root = __dirname;

  const env = loadEnv(mode, root, '');
  return {
    root,
    plugins: [
      react(),
      tailwindcss(),
    ],
    define: {
      'import.meta.env.VITE_API_URL': JSON.stringify(
        env.VITE_API_URL || 'http://localhost:4000',
      ),
    },
    resolve: {
      alias: {
        '@': path.resolve(root, 'src'),
      },
    },
    build: {
      outDir: path.resolve(root, 'build'),
    },
    server: {
      port: 3001,
      host: '0.0.0.0',
      watch: {
        usePolling: true,
      },
    },
  };
});
