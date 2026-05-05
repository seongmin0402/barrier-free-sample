import {
  fetchDrivingFromNcp,
  validateDrivingParams,
} from '../lib/ncp-driving';

/** Vercel Node Serverless — `@vercel/node` 타입 없이 동작 */
export default async function handler(req: {
  method?: string;
  query: Record<string, string | string[] | undefined>;
}, res: {
  status: (n: number) => typeof res;
  json: (o: unknown) => void;
  setHeader: (k: string, v: string) => void;
  send: (b: string) => void;
}): Promise<void> {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'GET only' });
    return;
  }

  const keyId = process.env.NCP_MAP_CLIENT_ID;
  const keySecret = process.env.NCP_MAP_CLIENT_SECRET;

  if (!keyId || !keySecret) {
    res.status(501).json({
      error:
        '서버에 NCP_MAP_CLIENT_ID / NCP_MAP_CLIENT_SECRET 이 설정되지 않았습니다.',
    });
    return;
  }

  const start = typeof req.query.start === 'string' ? req.query.start : '';
  const goal = typeof req.query.goal === 'string' ? req.query.goal : '';
  const option =
    typeof req.query.option === 'string' ? req.query.option : undefined;

  const bad = validateDrivingParams(start, goal);
  if (bad) {
    res.status(400).json({ error: bad });
    return;
  }

  try {
    const upstream = await fetchDrivingFromNcp({
      start,
      goal,
      option,
      credentials: { keyId, keySecret },
    });
    const text = await upstream.text();
    const ct =
      upstream.headers.get('content-type') || 'application/json; charset=utf-8';
    res.status(upstream.status).setHeader('Content-Type', ct).send(text);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
}
