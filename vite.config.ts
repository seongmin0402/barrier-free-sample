import { defineConfig, loadEnv } from 'vite';
import { fetchDrivingFromNcp, validateDrivingParams } from './lib/ncp-driving';

/** GitHub Project Pages: .env 에 VITE_BASE_URL=/repository-name/ */
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const raw = env.VITE_BASE_URL || '/';
  const base = raw === '/' ? '/' : raw.endsWith('/') ? raw : `${raw}/`;
  return {
    base,
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? '';
        if (!url.startsWith('/api/driving')) {
          next();
          return;
        }
        if (req.method !== 'GET') {
          res.statusCode = 405;
          res.end(JSON.stringify({ error: 'GET only' }));
          return;
        }
        const id = env.NCP_MAP_CLIENT_ID;
        const secret = env.NCP_MAP_CLIENT_SECRET;
        if (!id || !secret) {
          res.statusCode = 501;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(
            JSON.stringify({
              error:
                '로컬 .env에 NCP_MAP_CLIENT_ID, NCP_MAP_CLIENT_SECRET을 넣으세요. (VITE_ 접두사 없음)',
            }),
          );
          return;
        }
        const q = new URL(url, 'http://local');
        const start = q.searchParams.get('start') ?? '';
        const goal = q.searchParams.get('goal') ?? '';
        const option = q.searchParams.get('option') ?? undefined;
        const bad = validateDrivingParams(start, goal);
        if (bad) {
          res.statusCode = 400;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: bad }));
          return;
        }
        try {
          const upstream = await fetchDrivingFromNcp({
            start,
            goal,
            option: option ?? undefined,
            credentials: { keyId: id, keySecret: secret },
          });
          const text = await upstream.text();
          res.statusCode = upstream.status;
          res.setHeader(
            'Content-Type',
            upstream.headers.get('content-type') || 'application/json; charset=utf-8',
          );
          res.end(text);
        } catch (e) {
          res.statusCode = 502;
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.end(JSON.stringify({ error: String(e) }));
        }
      });
    },
  };
});
