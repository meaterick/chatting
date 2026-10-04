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
healthy=false
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    healthy=true
    break
  fi
  sleep 1
done

if [ "$healthy" != true ]; then
  echo "헬스 체크 실패" >&2
  pm2 logs "$APP_NAME" --lines 50 --nostream || true
  exit 1
fi
echo "배포 성공: $GIT_COMMIT (port $PORT)"

# Caddyfile 이 바뀌었으면 반영 (러너 사용자에게 비밀번호 없는 sudo 가 있을 때만)
CADDYFILE_SRC="$APP_DIR/current/Caddyfile"
CADDYFILE_DST="/etc/caddy/Caddyfile"
if [ -f "$CADDYFILE_SRC" ] && command -v caddy >/dev/null 2>&1; then
  if cmp -s "$CADDYFILE_SRC" "$CADDYFILE_DST"; then
    echo "Caddyfile 변경 없음"
  elif sudo -n true 2>/dev/null; then
    caddy validate --config "$CADDYFILE_SRC" --adapter caddyfile
    sudo cp "$CADDYFILE_SRC" "$CADDYFILE_DST"
    sudo systemctl reload-or-restart caddy
    echo "Caddyfile 적용 완료"
  else
    echo "::warning::Caddyfile 이 변경됐지만 sudo 권한이 없어 적용하지 못했습니다. 서버에서 직접 복사 후 'sudo systemctl reload caddy' 하세요."
  fi
fi

# 인증서 발급 재시도 서비스 설치/갱신 (Let's Encrypt 한도 해제 시각에 맞춰 Caddy 재시작, 발급되면 자동 종료)
CERT_RETRY_SH="$APP_DIR/current/caddy-cert-retry.sh"
CERT_RETRY_UNIT="$APP_DIR/current/caddy-cert-retry.service"
if [ -f "$CERT_RETRY_SH" ] && command -v caddy >/dev/null 2>&1 && sudo -n true 2>/dev/null; then
  if ! cmp -s "$CERT_RETRY_SH" /usr/local/bin/caddy-cert-retry.sh \
     || ! cmp -s "$CERT_RETRY_UNIT" /etc/systemd/system/caddy-cert-retry.service; then
    sudo install -m 755 "$CERT_RETRY_SH" /usr/local/bin/caddy-cert-retry.sh
    sudo install -m 644 "$CERT_RETRY_UNIT" /etc/systemd/system/caddy-cert-retry.service
    sudo systemctl daemon-reload
    sudo systemctl enable caddy-cert-retry >/dev/null 2>&1
    sudo systemctl restart caddy-cert-retry
    echo "인증서 재시도 서비스 설치/갱신 완료"
  fi
  systemctl is-active --quiet caddy-cert-retry && echo "인증서 재시도 서비스: 실행 중 (발급 대기)" \
    || echo "인증서 재시도 서비스: 종료됨 (인증서 발급 완료 상태)"
fi
