/** 네이버 클라우드 Maps Directions · driving (차량 도로) upstream 호출 */

export const NCP_DRIVING_ENDPOINT =
  'https://naveropenapi.apigw.ntruss.com/map-direction/v1/driving';

export type NcpDrivingCredentials = {
  keyId: string;
  keySecret: string;
};

export function validateDrivingParams(start: string, goal: string): string | null {
  if (!start?.trim() || !goal?.trim()) return 'start와 goal 파라미터가 필요합니다.';
  return null;
}

export async function fetchDrivingFromNcp(params: {
  start: string;
  goal: string;
  option?: string;
  credentials: NcpDrivingCredentials;
}): Promise<Response> {
  const u = new URL(NCP_DRIVING_ENDPOINT);
  u.searchParams.set('start', params.start);
  u.searchParams.set('goal', params.goal);
  if (params.option?.trim()) u.searchParams.set('option', params.option.trim());

  return fetch(u.toString(), {
    headers: {
      'X-NCP-APIGW-API-KEY-ID': params.credentials.keyId,
      'X-NCP-APIGW-API-KEY': params.credentials.keySecret,
    },
  });
}
