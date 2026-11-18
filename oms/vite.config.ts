import { createRequire } from 'node:module';
import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const require = createRequire(import.meta.url);
const { devServerSupabaseOverride } = require('../scripts/supabaseProject.cjs');

const reactRoot = fileURLToPath(new URL('./node_modules/react', import.meta.url));
const reactDomRoot = fileURLToPath(new URL('./node_modules/react-dom', import.meta.url));
const repoRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig(({ mode, command }) => {
  // Reuse root Pulse .env (EXPO_PUBLIC_*) — no separate oms/.env required in dev.
  const env = loadEnv(mode, repoRoot, '');
  // `.env` may still name production. The dev server follows .pulse-supabase-target.
  const devSupabase =
    command === 'serve' ? devServerSupabaseOverride(repoRoot, process.env) : null;

  return {
    plugins: [react(), tailwindcss()],
    server: {
      fs: { allow: ['..'] },
      host: env.OMS_DEV_HOST || '127.0.0.1',
      port: Number(env.OMS_DEV_PORT || 3004),
      strictPort: true,
    },
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
        '@pulse-assets': fileURLToPath(new URL('../assets', import.meta.url)),
        '@pulse-suite': fileURLToPath(new URL('../lib/suite', import.meta.url)),
        '@pulse-platform': fileURLToPath(new URL('../lib/platform', import.meta.url)),
        react: reactRoot,
        'react-dom': reactDomRoot,
      },
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      include: ['react', 'react-dom', 'lottie-react'],
    },
    base: '/oms/',
    build: {
      chunkSizeWarningLimit: 3000,
    },
    envDir: repoRoot,
    envPrefix: ['VITE_', 'EXPO_PUBLIC_'],
    define: devSupabase
      ? {
          'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(devSupabase.url),
          'import.meta.env.EXPO_PUBLIC_SUPABASE_URL': JSON.stringify(devSupabase.url),
          'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(devSupabase.anonKey),
          'import.meta.env.EXPO_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(devSupabase.anonKey),
        }
      : undefined,
  };
});
