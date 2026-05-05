# 베리어프리 캠퍼스 샘플 지도

네이버 지도 위에 건물 편의 정보를 표시하고, GeoJSON 보행 네트워크의 **경사 가중 비용**으로 길찾기·음성 안내를 제공하는 정적 웹입니다.

## 준비물

- Node.js 20 이상
- [네이버 클라우드 플랫폼](https://www.ncloud.com/)에서 발급한 **Maps JavaScript API**용 클라이언트 ID  
  - 애플리케이션 웹 서비스 URL에 로컬(`http://localhost:5173`)과 GitHub Pages URL을 등록합니다.

## 로컬 실행

```bash
npm install
cp .env.example .env
# .env 에 VITE_NAVER_MAP_CLIENT_ID 를 채웁니다.

npm run dev
```

브라우저에서 지도가 보이면 성공입니다.

## 원본 데이터로 다시 생성하기

저장소에는 데모용으로 최소 `public/data/*.json` 과 짧은 `network.geojson` 이 포함되어 있습니다. 본인 PC의 CSV·GeoJSON 경로로 덮어쓰려면:

```bash
# 기본 경로는 스크립트 내 Windows 경로(사용자 seongmin)입니다.
# 다른 위치면 환경 변수로 지정합니다.

set BARRIER_CSV=C:\path\to\barrier_free_data.csv
set ENTRANCES_CSV=C:\path\to\entrances_template.csv
set EV_CSV=C:\path\to\EV.csv
npm run data:buildings

set GEO_4=C:\path\to\4.geojson
set GEO_WEP=C:\path\to\wep.geojson
set GEO_BOKANG=C:\path\to\bokang.geojson
npm run data:merge

npm run dev
```

PowerShell에서는 `set` 대신 `$env:BARRIER_CSV="..."` 형식을 사용합니다.

한 번에 실행: `npm run data:all`

## GitHub Pages로 실제 배포

단계별 안내는 **[DEPLOY.md](./DEPLOY.md)** 를 보세요.

요약:

1. GitHub에 저장소를 만들고 이 프로젝트를 푸시합니다.  
2. 저장소 **Secrets**에 `VITE_NAVER_MAP_CLIENT_ID` 를 등록합니다 (로컬 `.env`는 Git에 안 올라감).  
3. **Settings → Pages → Source: GitHub Actions** 로 설정합니다.  
4. 네이버 클라우드 웹 URL에 **`https://본인아이디.github.io/저장소이름/`** 형태로 배포 주소를 추가합니다.  
5. 워크플로가 저장소 종류에 맞춰 `VITE_BASE_URL` 을 자동 설정합니다  
   (일반 저장소: `/<이름>/`, `USERNAME.github.io` 저장소: `/`).

## 사용 방법

- **건물**: 파란 원형 `i` 마커를 클릭하면 상세 패널이 열립니다. (`npm run data:buildings` 로 만든 데이터에는 Supabase 이미지 URL이 포함될 수 있습니다.)
- **길찾기**: 「출발 찍기」→ 지도 클릭, 「도착 찍기」→ 지도 클릭. 보행 네트워크에서 일정 거리 안에 스냅됩니다.  
- **계단·고페널티 구간 제외**: 체크 시 `steps` 및 `road_penalty >= 9999` 세그먼트를 그래프에서 제외합니다.  
- **보행 네트워크** 체크 시 세그먼트가 옅게 표시됩니다 (데이터가 클수록 느려질 수 있음).  
- **음성 안내**: 경로가 잡힌 뒤 「음성 안내 시작」을 누릅니다 (브라우저 TTS, 한국어).

## 라이선스

이 샘플 프로젝트의 코드는 MIT 로 두어도 되고, 지도·데이터 이용은 각 서비스 약관을 따릅니다.
