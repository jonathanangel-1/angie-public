import tailwindcss from '@tailwindcss/postcss';
import vinext from 'vinext';
import { defineConfig } from 'vite';

const PLACEHOLDER_DATABASE_ID = '00000000-0000-4000-8000-000000000000';

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === 'seatbelt';
const publicDemo = (process.env.PUBLIC_DEMO || '1') === '1';
const localVars: Record<string, string> = { PUBLIC_DEMO: publicDemo ? '1' : '0' };
// A demo run must never inherit real access codes.
if (!publicDemo) {
  for (const name of ['ANGIE_ACCESS_CODE', 'EXTRA_ACCESS_CODES', 'GARMENT_SERVICE_URL', 'SERPAPI_API_KEY', 'SHOPIFY_CATALOG_URL']) {
    if (process.env[name]) localVars[name] = process.env[name]!;
  }
}

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local (and gitignored).
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  process.env.MINIFLARE_REGISTRY_PATH ??= '.wrangler/registry';
  const { cloudflare } = await import('@cloudflare/vite-plugin');

  return {
    css: { postcss: { plugins: [tailwindcss()] } },
    server: {
      host: '127.0.0.1',
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: 'rsc', childEnvironments: ['ssr'] },
        // Tests point this at a throwaway directory so they never touch your local data.
        persistState: process.env.ANGIE_STATE_DIR ? { path: process.env.ANGIE_STATE_DIR } : true,
        config: {
          main: 'vinext/server/app-router-entry',
          compatibility_flags: ['nodejs_compat'],
          vars: localVars,
          d1_databases: [{ binding: 'DB', database_name: 'site-creator-d1', database_id: PLACEHOLDER_DATABASE_ID }],
        },
      }),
    ],
  };
});
