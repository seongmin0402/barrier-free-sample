# 실제 웹에 배포하기 (GitHub Pages)

## 1. GitHub에 저장소 만들기

1. [GitHub](https://github.com/new)에서 **New repository**
2. 이름 예: `barrier-free-sample` (프로젝트 사이트는 `https://아이디.github.io/barrier-free-sample/` 형태)
3. 로컬 프로젝트와 연결:

```bash
cd 최종전연습
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/본인아이디/저장소이름.git
git push -u origin main
```

> `.env`는 `.gitignore`에 있어서 커밋되지 않습니다. **비밀키는 GitHub Secrets로만 넣습니다.**

## 2. 네이버 지도 클라이언트 ID → GitHub Secrets

1. 저장소 **Settings → Secrets and variables → Actions → New repository secret**
2. Name: `VITE_NAVER_MAP_CLIENT_ID`
3. Value: 네이버 클라우드에서 발급한 클라이언트 ID

워크플로 빌드 시 이 값이 주입됩니다.

## 3. Pages 설정

1. 저장소 **Settings → Pages**
2. **Build and deployment → Source**: **GitHub Actions** 선택  
   (브랜치 `gh-pages`가 아니라 Actions로 배포)

## 4. 네이버 클라우드에 배포 URL 등록

배포 후 주소가 예를 들면 다음과 같습니다.

- 프로젝트 저장소: `https://본인아이디.github.io/저장소이름/`

네이버 클라우드 콘솔 → Maps 애플리케이션 → **웹 서비스 URL**에 위 주소를 **정확히** 추가합니다.  
(끝에 `/` 유무는 콘솔 안내에 맞춤)

로컬 테스트용 `http://localhost:5173`도 함께 두면 개발에 편합니다.

## 5. 배포 실행

`main` 또는 `master`에 푸시할 때마다 자동 빌드·배포됩니다.

수동으로 다시 올리려면: 저장소 **Actions** 탭 → **Build and deploy to GitHub Pages** → **Run workflow**.

## 6. USERNAME.github.io 저장소인 경우

저장소 이름이 **`본인아이디.github.io`** 이면 사이트 주소는 `https://본인아이디.github.io/` 이고,  
워크플로가 자동으로 `VITE_BASE_URL=/` 로 빌드합니다 (루트 경로).

## 문제 해결

| 증상 | 확인 |
|------|------|
| 빈 화면·지도 안 됨 | Secrets 이름이 정확히 `VITE_NAVER_MAP_CLIENT_ID` 인지, 네이버 URL에 **배포된 https 주소**가 등록됐는지 |
| JS·이미지 404 | 저장소 이름과 맞는지. 일반 프로젝트는 base가 `/<저장소이름>/` 여야 함 (워크플로가 설정) |
| Actions 실패 | Actions 탭에서 로그 확인, `npm run build`가 로컬에서 되는지 (`npm install` 후 `npm run build`) |
