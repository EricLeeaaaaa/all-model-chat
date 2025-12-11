
import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
    // Load environment variables from .env files
    const env = loadEnv(mode, '.', '');

    return {
      plugins: [react()],
      define: {
        // Expose environment variables to the client
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_BASE_URL': JSON.stringify(env.GEMINI_API_BASE_URL),
      },
      resolve: {
        alias: {
          '@': path.resolve(process.cwd(), '.'),
        }
      }
    };
});
