#!/usr/bin/env bash
# `npm run build` 결과(standalone)를 서버에서 바로 실행 가능한 tar.gz 하나로 묶는다.
# 사용법: bash scripts/package.sh <출력파일.tar.gz>
set -euo pipefail

OUT="${1:-bundle.tar.gz}"

if [ ! -f .next/standalone/server.js ]; then
  echo "standalone 빌드 결과물이 없습니다. 먼저 npm run build 를 실행하세요." >&2
  exit 1
fi

STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

# standalone 서버 + 정적 파일 + public + pm2 설정 + 배포 스크립트
cp -a .next/standalone/. "$STAGE/"
mkdir -p "$STAGE/.next"
cp -a .next/static "$STAGE/.next/static"
cp -a public "$STAGE/public"
# 이미지 주소에 내용 해시(?v=)를 붙여, 같은 파일명으로 교체해도 30일 캐시된 옛 사진이 남지 않게 한다
node scripts/version-assets.mjs "$STAGE/public"
cp ecosystem.config.js scripts/deploy.sh deploy/Caddyfile \
  deploy/caddy-cert-retry.sh deploy/caddy-cert-retry.service "$STAGE/"

tar -czf "$OUT" -C "$STAGE" .
echo "패키징 완료: $OUT ($(du -h "$OUT" | cut -f1))"
