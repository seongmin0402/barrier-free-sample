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
    s.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpClientId=${encodeURIComponent(clientId)}`;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Naver Maps script'));
    document.head.appendChild(s);
  });
}
