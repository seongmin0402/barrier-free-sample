import { defineConfig, loadEnv } from 'vite';

/** GitHub Project Pages: .env 에 VITE_BASE_URL=/repository-name/ */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = env.VITE_BASE_URL || '/';
  const base = raw === '/' ? '/' : raw.endsWith('/') ? raw : `${raw}/`;
  return { base };
});
