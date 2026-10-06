# 서버 설정 요약 (AI에게 시킬 것)

환경: OCI 1 vCPU / 1GB RAM, Ubuntu, git·node·pm2 설치, GitHub self-hosted runner 연결, 도메인 `dostervibes.kro.kr`

## 1. 코드 작업 (AI에게 그대로 요청)

```
Next.js로 간단한 테스트 페이지를 만들고 main 병합 시 자동 배포되게 해줘.
- 서버 RAM이 1GB라 빌드는 GitHub 호스티드 러너(ubuntu-latest)에서 하고,
  self-hosted runner는 빌드 결과(standalone 번들)만 받아 PM2로 실행
- deploy 단계에 RUNNER_TRACKING_ID: "" 설정 (잡 종료 시 PM2가 죽지 않게)
- 앱은 127.0.0.1:3000에만 바인딩, /api/health 헬스 체크
- Caddy로 dostervibes.kro.kr HTTPS 리버스 프록시 (Caddyfile을 저장소에 포함)
- Caddyfile 전역 옵션에 email 넣어서 Let's Encrypt 한도 초과 시 ZeroSSL로 넘어가게
- main에 병합해
```

## 2. 서버에서 직접 할 것 (AI가 명령어 알려줌)

```
서버에서 실행할 명령어 알려줘:
- 2GB 스왑 추가
- 러너 서비스 등록(svc.sh), pm2 startup
- 80/443 포트 열기 (OCI Security List + iptables)
- 80 포트 쓰는 nginx 끄기
- Caddy 설치, 배포된 Caddyfile을 /etc/caddy에 복사, systemctl enable --now caddy
```

## 3. 막히면 로그 붙여서 물어보기

| 증상 | 원인 |
| --- | --- |
| `caddy.service is not active, cannot reload` | Caddy 꺼짐 → `restart` |
| `bind: address already in use` | nginx가 80 사용 중 → nginx 끄기 |
| `429 too many certificates ... "kro.kr"` | kro.kr 공유 한도 초과 → 기다리거나 email 설정(ZeroSSL) |
| `Timeout during connect (likely firewall problem)` | 외부에서 80 포트 막힘 → OCI/iptables 확인 |

로그 확인: `sudo journalctl -u caddy -n 30 --no-pager -l`, `pm2 logs chatting --lines 50 --nostream`
