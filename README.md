# chatting

정적 사이트(**DOSTER — Photographs, Films & Code**) + `main` 브랜치 자동 배포
(GitHub Actions self-hosted runner + PM2).

## 로컬 개발

```bash
npm install
npm run dev   # http://localhost:3000
```

## 코드 구조

```
public/                    사이트 본체 — index.html, style.css, script.js, images/
app/api/health/route.js    배포 헬스 체크
next.config.mjs            `/` 를 public/index.html 로 연결
```

## 자동 배포 흐름

`main`에 push(PR 병합 포함)되면 `.github/workflows/deploy.yml`이 실행됩니다.
서버 RAM이 1GB라서 **빌드는 GitHub 호스티드 러너에서** 하고, 서버는 결과물을 받아 실행만 합니다.

1. **build** (`ubuntu-latest`): `npm ci` → `npm run build` → `scripts/package.sh`로 standalone 결과물을 `bundle.tar.gz`로 묶어 artifact 업로드
2. **deploy** (`self-hosted`): artifact 다운로드·압축 해제 → `deploy.sh`가 `~/apps/chatting/current`로 교체 (직전 버전은 `~/apps/chatting/previous`)
3. PM2로 `chatting` 프로세스 재시작 후 `pm2 save`
4. `http://127.0.0.1:3000/api/health` 헬스 체크, 실패 시 워크플로 실패 처리

Actions 탭에서 `Deploy` 워크플로를 수동 실행(`workflow_dispatch`)할 수도 있습니다.

> 빌드는 x86_64 Linux에서 되므로 서버도 x86_64(E2.1.Micro 등)여야 합니다. ARM(Ampere A1)이면 `build` 잡을 `ubuntu-24.04-arm`으로 바꾸세요.

## 서버 설정

서버 설정 요약은
[docs/SERVER_SETUP.md](docs/SERVER_SETUP.md)를 참고하세요.
