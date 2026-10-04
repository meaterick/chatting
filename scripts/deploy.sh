#!/usr/bin/env bash
# 빌드된 Next.js standalone 결과물을 배포 디렉터리로 옮기고 PM2로 (재)시작한다.
# `npm run build` 이후 저장소 루트에서 실행한다.
set -euo pipefail

APP_NAME="chatting"
APP_DIR="${APP_DIR:-$HOME/apps/$APP_NAME}"
PORT="${PORT:-3000}"
export PORT
GIT_COMMIT="${GIT_COMMIT:-$(git rev-parse --short HEAD 2>/dev/null || echo unknown)}"
export GIT_COMMIT="${GIT_COMMIT:0:7}"
export DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ ! -f .next/standalone/server.js ]; then
  echo "standalone 빌드 결과물이 없습니다. 먼저 npm run build 를 실행하세요." >&2
  exit 1
fi

mkdir -p "$APP_DIR"
STAGING="$APP_DIR/.staging"
rm -rf "$STAGING"
mkdir -p "$STAGING"

# standalone 서버 + 정적 파일 + public + pm2 설정을 한 디렉터리에 모은다
cp -a .next/standalone/. "$STAGING/"
mkdir -p "$STAGING/.next"
cp -a .next/static "$STAGING/.next/static"
cp -a public "$STAGING/public"
cp ecosystem.config.js "$STAGING/"

# 디렉터리 교체 (이전 버전은 previous 로 하나만 보관)
rm -rf "$APP_DIR/previous"
if [ -d "$APP_DIR/current" ]; then
  mv "$APP_DIR/current" "$APP_DIR/previous"
fi
mv "$STAGING" "$APP_DIR/current"

cd "$APP_DIR/current"
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  # cwd 가 바뀌었을 수 있으므로 delete 후 start 로 경로/환경변수를 확실히 갱신
  pm2 delete "$APP_NAME"
fi
pm2 start ecosystem.config.js
pm2 save

# 헬스 체크
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    echo "배포 성공: $GIT_COMMIT (port $PORT)"
    exit 0
  fi
  sleep 1
done

echo "헬스 체크 실패" >&2
pm2 logs "$APP_NAME" --lines 50 --nostream || true
exit 1
