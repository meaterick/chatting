#!/usr/bin/env bash
# scripts/package.sh 로 만든 번들을 배포 디렉터리로 옮기고 PM2로 (재)시작한다.
# 사용법: bash deploy.sh <압축 해제된 번들 디렉터리>
set -euo pipefail

BUNDLE="${1:?번들 디렉터리를 지정하세요}"
APP_NAME="chatting"
APP_DIR="${APP_DIR:-$HOME/apps/$APP_NAME}"
PORT="${PORT:-3000}"
export PORT
GIT_COMMIT="${GIT_COMMIT:-unknown}"
export GIT_COMMIT="${GIT_COMMIT:0:7}"
export DEPLOYED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

if [ ! -f "$BUNDLE/server.js" ]; then
  echo "$BUNDLE/server.js 가 없습니다. 올바른 번들인지 확인하세요." >&2
  exit 1
fi

mkdir -p "$APP_DIR"
STAGING="$APP_DIR/.staging"
rm -rf "$STAGING"
cp -a "$BUNDLE" "$STAGING"

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
