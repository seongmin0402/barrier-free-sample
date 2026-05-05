/** Load Naver Maps JavaScript API v3 */
export function loadNaverMapScript(clientId: string): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  const w = window as Window & { naver?: unknown };
  if (w.naver && typeof (w.naver as { maps?: unknown }).maps !== 'undefined')
    return Promise.resolve();

  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-naver-map="1"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Naver map script failed')));
      return;
    }
    const s = document.createElement('script');
    s.dataset.naverMap = '1';
    s.async = true;
    // 신규 발급 키는 ncpKeyId + oapi 도메인 사용 (구형 ncpClientId/openapi 조합은 일부 환경에서 차단될 수 있음)
    s.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${encodeURIComponent(clientId)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Naver Maps script'));
    document.head.appendChild(s);
  });
}
