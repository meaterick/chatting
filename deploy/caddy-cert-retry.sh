#!/usr/bin/env bash
# Let's Encrypt 발급 한도(429)에 걸렸을 때, 로그의 "retry after" 시각에 맞춰 Caddy를 재시작해
# 한도가 풀리는 즉시 인증서 발급을 다시 시도한다. 인증서가 발급되면 종료한다.
# 사용법 (root): caddy-cert-retry.sh <도메인>
set -uo pipefail

DOMAIN="${1:?도메인을 지정하세요}"
CERT_DIR="${CERT_DIR:-/var/lib/caddy/.local/share/caddy/certificates}"
handled=""

log() { echo "[$(date '+%F %T')] $*"; }

has_cert() {
  [ -n "$(find "$CERT_DIR" -path '*staging*' -prune -o -name "$DOMAIN.crt" -print 2>/dev/null | head -1)" ]
}

while true; do
  if has_cert; then
    log "인증서 발급 완료: $DOMAIN"
    exit 0
  fi

  # 가장 최근 로그의 retry after 시각 (예: 2026-10-04 22:17:19 UTC)
  ra="$(journalctl -u caddy --since "-6h" -o cat 2>/dev/null \
        | grep -oE 'retry after [0-9]{4}-[0-9]{2}-[0-9]{2} [0-9:]+ UTC' | tail -1 | cut -d' ' -f3-)"

  if [ -z "$ra" ] || [ "$ra" = "$handled" ]; then
    # 새 retry after 가 아직 없음 → Caddy 의 다음 시도 결과를 기다림
    sleep 60
    continue
  fi

  target=$(( $(date -d "$ra" +%s) + 1 ))
  now=$(date +%s)
  if [ "$target" -gt "$now" ]; then
    log "다음 시도: $ra ($(( target - now ))초 후)"
    sleep $(( target - now ))
  fi

  log "한도 해제 시각 도달 → Caddy 재시작해서 즉시 재시도"
  systemctl restart caddy
  handled="$ra"
  sleep 30
done
